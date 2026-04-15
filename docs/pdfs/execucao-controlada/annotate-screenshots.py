"""
Anota screenshots com spotlight + callout para o guia PDF de Execução Controlada.

Uso:
    cd docs/pdfs/execucao-controlada
    python annotate-screenshots.py

Dependências: pip install Pillow
"""
import os
from PIL import Image, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")

ORANGE = (249, 115, 22, 255)
RED    = (220, 38,  38, 255)

# ── Constantes de layout (px, 1280×900) ───────────────────────────────────────
# Medidas via Playwright:
#   container.left = 249   (sidebar → conteúdo)
#   rightHeading.left = 697  (painel de lista → painel de detalhe)
#   container.top = 67     (barra de breadcrumb → conteúdo)
#   container.bottom = 889

NAV_END       = 249   # borda direita da navegação lateral
LIST_END      = 697   # borda direita do painel de lista (modelos / ciclos)
CONTENT_TOP   = 67    # topo da área de conteúdo
BOTTOM        = 889   # base da área de conteúdo
RIGHT_END     = 1269  # borda direita do conteúdo


def _dim_rect(overlay_draw, box, alpha=110):
    x1, y1, x2, y2 = box
    overlay_draw.rectangle([x1, y1, x2, y2], fill=(0, 0, 0, alpha))


def _dim_rect_heavy(overlay_draw, box, alpha=175):
    """Dim mais forte para ocultar áreas irrelevantes/cramped (alpha ~69%)."""
    x1, y1, x2, y2 = box
    overlay_draw.rectangle([x1, y1, x2, y2], fill=(0, 0, 0, alpha))


def _border(draw, box, width=3, color=ORANGE):
    x1, y1, x2, y2 = box
    for i in range(width):
        draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)


def annotate(name, dim_boxes, content_box=None, callout_box=None, heavy_dim_boxes=None):
    """
    name            – arquivo sem extensão (ex: "01-modelos")
    dim_boxes       – lista de (x1,y1,x2,y2) a escurecer (alpha 110, ~43%)
    heavy_dim_boxes – lista de (x1,y1,x2,y2) com dim duplo (~65%) — para
                      ocultar áreas cramped sem relação com o foco da imagem
    content_box     – (x1,y1,x2,y2) em destaque + borda laranja
    callout_box     – (x1,y1,x2,y2) elemento-chave + borda vermelha (sem fill)
    """
    src = os.path.join(IMGS_DIR, f"{name}.png")
    dst = os.path.join(IMGS_DIR, f"{name}-annotated.png")
    img = Image.open(src).convert("RGBA")

    # Primeira passada de dim (normal)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for box in dim_boxes:
        _dim_rect(od, box)
    result = Image.alpha_composite(img, overlay)

    # Segunda passada de dim (heavy — alpha 175 ~69%, oculta conteúdo cramped)
    if heavy_dim_boxes:
        overlay2 = Image.new("RGBA", result.size, (0, 0, 0, 0))
        od2 = ImageDraw.Draw(overlay2)
        for box in heavy_dim_boxes:
            _dim_rect_heavy(od2, box)
        result = Image.alpha_composite(result, overlay2)

    draw   = ImageDraw.Draw(result)

    if content_box:
        _border(draw, content_box, width=3, color=ORANGE)
    if callout_box:
        _border(draw, callout_box, width=3, color=RED)

    result.convert("RGB").save(dst)
    print(f"✓ {name}-annotated.png")


# ── Regiões reutilizáveis ──────────────────────────────────────────────────────
DIM_NAV      = (0,       0,           NAV_END,  BOTTOM)  # sidebar de navegação
DIM_LIST     = (NAV_END, CONTENT_TOP, LIST_END, BOTTOM)  # painel de lista esq.
CONTENT      = (LIST_END, CONTENT_TOP, RIGHT_END, BOTTOM)  # painel de detalhe

# Largura do sub-painel de cards dentro da área de conteúdo (~220 px)
# Usado para dimmar o painel de detalhe/formulário à direita nos screenshots
# onde a lista de cards é o foco (04-nc, 06-pos-servico)
CARD_LIST_W  = 218
DIM_DETAIL   = (LIST_END + CARD_LIST_W, CONTENT_TOP, RIGHT_END, BOTTOM)  # formulário de detalhe à direita

# ── Anotações por screenshot ───────────────────────────────────────────────────

# 1 — Modelos: spotlight "Detalhes do modelo" + callout no checkbox de validação
annotate(
    "01-modelos",
    dim_boxes=[DIM_NAV, DIM_LIST],
    content_box=CONTENT,
    callout_box=(LIST_END + 6, 388, RIGHT_END - 6, 458),  # "Exige validação especial" — mais respiro
)

# 1b — Checkpoints do modelo: callout no primeiro checkpoint card
annotate(
    "01b-checkpoints-modelo",
    dim_boxes=[DIM_NAV, DIM_LIST],
    content_box=CONTENT,
    callout_box=(LIST_END + 12, 67, RIGHT_END - 12, 310),  # primeiro checkpoint card
)

# 2 — Ciclos: spotlight o painel de detalhe do ciclo selecionado
annotate(
    "02-ciclos-visao-geral",
    dim_boxes=[DIM_NAV],
    content_box=CONTENT,
    callout_box=(NAV_END + 8, 163, LIST_END - 8, 300),  # card "Aguardando liberação" na lista
)

# 3 — Checkpoints em execução: callout no primeiro card de checkpoint
annotate(
    "03-checkpoints-execucao",
    dim_boxes=[DIM_NAV, DIM_LIST],
    content_box=CONTENT,
    callout_box=(LIST_END + 12, 67, RIGHT_END - 12, 215),  # primeiro checkpoint card
)

# 4 — Saídas não conformes: callout no card NC; dim duplo no formulário de detalhe
annotate(
    "04-nc-outputs",
    dim_boxes=[DIM_NAV, DIM_LIST],
    heavy_dim_boxes=[DIM_DETAIL],
    content_box=CONTENT,
    callout_box=(LIST_END + 6, 68, LIST_END + CARD_LIST_W - 6, 185),  # card NC — respiro generoso
)

# 5 — Preservação e entrega: callout no bloco de entrega (método + destinatário)
annotate(
    "05-preservacao-entrega",
    dim_boxes=[DIM_NAV, DIM_LIST],
    content_box=CONTENT,
    callout_box=(LIST_END + 6, 225, RIGHT_END - 6, 332),  # linha de entrega — mais respiro
)

# 6 — Pós-serviço: callout no card de evento; dim duplo no formulário de detalhe
annotate(
    "06-pos-servico",
    dim_boxes=[DIM_NAV, DIM_LIST],
    heavy_dim_boxes=[DIM_DETAIL],
    content_box=CONTENT,
    callout_box=(LIST_END + 6, 62, LIST_END + CARD_LIST_W - 6, 195),  # card evento — respiro generoso
)

# 7 — Liberação da saída: callout no box de pendências impeditivas
annotate(
    "07-liberacao",
    dim_boxes=[DIM_NAV, DIM_LIST],
    content_box=CONTENT,
    callout_box=(LIST_END + 12, 88, RIGHT_END - 12, 230),  # box "Pendências impeditivas"
)

print("\nDone. Verifique os arquivos -annotated.png.")
