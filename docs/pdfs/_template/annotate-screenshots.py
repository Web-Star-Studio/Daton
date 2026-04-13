"""
Anota screenshots com spotlight + callout para o guia PDF.
Estratégia:
  - Escurece partes repetidas (sidebar, cabeçalho da página, painel de lista)
  - Mantém a área de conteúdo principal com brilho total + borda laranja
  - Adiciona borda vermelha ao elemento-chave específico

Uso:
    cd docs/pdfs/[modulo]
    python annotate-screenshots.py

Dependências: pip install Pillow

Como medir coordenadas:
    - Abra a imagem num editor que mostre posição do cursor (ex: GIMP, Preview)
    - Ou use o script Playwright para logar as bounding boxes:
        const box = await page.locator("selector").boundingBox()
        console.log(box)  # { x, y, width, height }
"""
import os
from PIL import Image, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")

ORANGE = (249, 115, 22, 255)
RED    = (220, 38,  38, 255)

# ── Constantes de layout (px, 1280×900) ───────────────────────────────────────
# Meça nas screenshots e preencha os valores abaixo.
LEFT_END  = 0    # TODO: borda direita do painel esquerdo (sidebar + lista)
TAB_Y     = 0    # TODO: topo da barra de tabs (ou área de conteúdo)
BOTTOM    = 900  # TODO: base da área de conteúdo (geralmente 876 ou 900)
RIGHT_END = 1280 # TODO: borda direita do conteúdo (geralmente 1262 ou 1280)


def _dim_rect(draw, box, alpha=110):
    x1, y1, x2, y2 = box
    draw.rectangle([x1, y1, x2, y2], fill=(0, 0, 0, alpha))


def _border(draw, box, width=3, color=ORANGE):
    x1, y1, x2, y2 = box
    for i in range(width):
        draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)


def annotate(name, dim_boxes, content_box=None, callout_box=None):
    """
    name        – nome do arquivo sem extensão (ex: "01-visao-geral")
    dim_boxes   – lista de (x1,y1,x2,y2) a escurecer
    content_box – (x1,y1,x2,y2) mantida brilhante + borda laranja
    callout_box – (x1,y1,x2,y2) elemento-chave + borda vermelha
                  (sem fill para não cobrir texto)
    """
    src = os.path.join(IMGS_DIR, f"{name}.png")
    dst = os.path.join(IMGS_DIR, f"{name}-annotated.png")
    img = Image.open(src).convert("RGBA")

    # Overlay de escurecimento
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for box in dim_boxes:
        _dim_rect(od, box)
    result = Image.alpha_composite(img, overlay)
    draw   = ImageDraw.Draw(result)

    # Borda laranja na área de conteúdo em destaque
    if content_box:
        _border(draw, content_box, width=3, color=ORANGE)

    # Callout vermelho no elemento-chave
    if callout_box:
        _border(draw, callout_box, width=3, color=RED)

    result.convert("RGB").save(dst)
    print(f"✓ {name}-annotated.png")


# ── Regiões comuns ─────────────────────────────────────────────────────────────
DIM_LEFT_PANEL = (0,        0, LEFT_END,  BOTTOM)
DIM_RH_HEADER  = (LEFT_END, 0, RIGHT_END, TAB_Y - 4)
CONTENT        = (LEFT_END, TAB_Y - 4, RIGHT_END, BOTTOM)

# ── Anotações por screenshot ───────────────────────────────────────────────────
# TODO: substitua pelos seus screenshots. Um bloco por imagem.

annotate(
    "01-screenshot",
    dim_boxes=[DIM_LEFT_PANEL, DIM_RH_HEADER],
    content_box=CONTENT,
    callout_box=None,
)

# annotate(
#     "02-screenshot",
#     dim_boxes=[DIM_LEFT_PANEL, DIM_RH_HEADER],
#     content_box=CONTENT,
#     callout_box=(LEFT_END + 10, 000, RIGHT_END - 10, 000),
# )

print("\nDone. Verifique os arquivos -annotated.png.")
