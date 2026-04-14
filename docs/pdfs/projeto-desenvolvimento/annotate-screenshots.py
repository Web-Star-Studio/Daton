"""
Anota screenshots do módulo Projeto e Desenvolvimento.

Uso:
    cd docs/pdfs/projeto-desenvolvimento
    python annotate-screenshots.py

Dependências: pip install Pillow

Coordenadas (px, 1280×900) — meça após gerar as screenshots:
    LEFT_END  — borda direita do painel esquerdo (sidebar + lista de projetos)
    TAB_Y     — topo da barra de tabs (Aplicabilidade / Projetos)
    BOTTOM    — base da área de conteúdo
    RIGHT_END — borda direita do conteúdo

Para medir, adicione ao take-screenshots.js:
    const box = await page.locator('[role="tablist"]').boundingBox()
    console.log('tablist:', box)
"""
import os
from PIL import Image, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")

ORANGE = (249, 115, 22, 255)
RED    = (220, 38,  38, 255)

# ── Constantes de layout (px, 1280×900) ───────────────────────────────────────
# Medidas reais via Playwright:
#   aside:   x=10, y=10, w=228, h=880  → sidebar termina em x=238, main começa em x=248
#   main:    x=248, y=10, w=1022, h=880 → RIGHT_END=1270, BOTTOM=890
#   header:  x=249, y=11, h=56          → header termina em y=67
#   tablist: x=329, y=293               → tabs de Aplicabilidade/Projetos
LEFT_END  = 248  # borda esquerda do painel principal (após sidebar + gap)
TAB_Y     = 67   # base do cabeçalho/breadcrumb; início do conteúdo do módulo
BOTTOM    = 890  # base da área de conteúdo
RIGHT_END = 1270 # borda direita do conteúdo


def _dim_rect(draw, box, alpha=110):
    x1, y1, x2, y2 = box
    draw.rectangle([x1, y1, x2, y2], fill=(0, 0, 0, alpha))


def _border(draw, box, width=3, color=ORANGE):
    x1, y1, x2, y2 = box
    for i in range(width):
        draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)


def annotate(name, dim_boxes, content_box=None, callout_box=None):
    src = os.path.join(IMGS_DIR, f"{name}.png")
    dst = os.path.join(IMGS_DIR, f"{name}-annotated.png")
    img = Image.open(src).convert("RGBA")

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for box in dim_boxes:
        _dim_rect(od, box)
    result = Image.alpha_composite(img, overlay)
    draw   = ImageDraw.Draw(result)

    if content_box:
        _border(draw, content_box, width=3, color=ORANGE)

    if callout_box:
        _border(draw, callout_box, width=3, color=RED)

    result.convert("RGB").save(dst)
    print(f"✓ {name}-annotated.png")


# ── Regiões comuns ─────────────────────────────────────────────────────────────
DIM_SIDEBAR   = (0,        0, LEFT_END,  BOTTOM)
DIM_HEADER    = (LEFT_END, 10, RIGHT_END, TAB_Y)   # breadcrumb + botões de ação
CONTENT_FULL  = (LEFT_END, TAB_Y, RIGHT_END, BOTTOM)
CONTENT_SCROLL = (LEFT_END, 0, RIGHT_END, BOTTOM)  # para screenshots com scroll

# ── 01: Aplicabilidade ─────────────────────────────────────────────────────────
# Destaca toda a área de conteúdo (card status + formulário + histórico)
annotate(
    "01-aplicabilidade",
    dim_boxes=[DIM_SIDEBAR, DIM_HEADER],
    content_box=CONTENT_FULL,
    callout_box=None,
)

# ── 02: Projetos — lista + formulário ─────────────────────────────────────────
# Destaca toda a área: lista à esquerda + formulário à direita
annotate(
    "02-projetos-lista",
    dim_boxes=[DIM_SIDEBAR, DIM_HEADER],
    content_box=CONTENT_FULL,
    callout_box=None,
)

# ── 03: Entradas e Etapas ─────────────────────────────────────────────────────
# Página rolada para baixo — destaca área de entradas com form expandido
annotate(
    "03-entradas-etapas",
    dim_boxes=[DIM_SIDEBAR],
    content_box=CONTENT_SCROLL,
    callout_box=None,
)

# ── 04: Saídas e Revisões ─────────────────────────────────────────────────────
annotate(
    "04-saidas-revisoes",
    dim_boxes=[DIM_SIDEBAR],
    content_box=CONTENT_SCROLL,
    callout_box=None,
)

# ── 05: Mudanças ──────────────────────────────────────────────────────────────
annotate(
    "05-mudancas",
    dim_boxes=[DIM_SIDEBAR],
    content_box=CONTENT_SCROLL,
    callout_box=None,
)

print("\nDone. Verifique os arquivos -annotated.png e ajuste os callout_box.")
