"""
Anota screenshots do guia de Notificações de Legislações por Compliance.

Uso:
    cd docs/pdfs/notificacoes-legislacoes
    python annotate-screenshots.py

Dependências: pip install Pillow

Coordenadas calculadas com base nas classes CSS dos componentes (1280x900):
  - QuestionnaireModal: w-[960px], max-h-[90vh], centered → x=160..1120, y=45..855
  - NotificationsPanel: max-w-lg (512px), centered → x=384..896
  - Sidebar: ~64px de largura
  - Header global: ~56px de altura
"""
import os
from PIL import Image, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")

ORANGE = (249, 115, 22, 255)
RED    = (220, 38,  38, 255)

# ── Layout do QuestionnaireModal ───────────────────────────────────────────────
Q_LEFT   = 160
Q_TOP    = 45
Q_RIGHT  = 1120
Q_BOTTOM = 855
Q_THEMES_RIGHT = 380   # borda direita do painel de temas (≈220px do modal)

# ── Layout da página de Legislações ───────────────────────────────────────────
LEG_SIDEBAR_END = 64    # sidebar estreita
LEG_HEADER_H    = 56    # topbar global
LEG_SUBHEADER_H = 104   # topbar + breadcrumb

# ── Layout do NotificationsPanel ──────────────────────────────────────────────
N_LEFT   = 384
N_TOP    = 44
N_RIGHT  = 896
N_BOTTOM = 856
N_FIRST_NOTIF_TOP    = N_TOP + 64    # abaixo do header do painel
N_FIRST_NOTIF_BOTTOM = N_TOP + 140


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


# ── 01 — Questionário de Compliance ───────────────────────────────────────────
# Escurece o backdrop; destaca o modal; callout no painel de temas (esquerda)
annotate(
    "01-questionario",
    dim_boxes=[
        (0,       0,        Q_LEFT,   900),       # esquerda do modal
        (Q_RIGHT, 0,        1280,     900),        # direita do modal
        (0,       0,        1280,     Q_TOP),      # acima
        (0,       Q_BOTTOM, 1280,     900),        # abaixo
    ],
    content_box=(Q_LEFT, Q_TOP, Q_RIGHT, Q_BOTTOM),
    callout_box=(Q_LEFT, Q_TOP, Q_THEMES_RIGHT, Q_BOTTOM),
)

# ── 02 — Lista de Legislações ──────────────────────────────────────────────────
# Escurece sidebar e header; destaca área de conteúdo principal
annotate(
    "02-legislacoes-lista",
    dim_boxes=[
        (0,               0,              LEG_SIDEBAR_END, 900),      # sidebar
        (LEG_SIDEBAR_END, 0,              1280,            LEG_SUBHEADER_H),  # header
    ],
    content_box=(LEG_SIDEBAR_END, LEG_SUBHEADER_H, 1262, 876),
    callout_box=None,
)

# ── 03 — Painel de Notificações ────────────────────────────────────────────────
# Escurece backdrop; destaca o modal; callout na primeira notificação
annotate(
    "03-notificacoes",
    dim_boxes=[
        (0,       0,        N_LEFT,   900),
        (N_RIGHT, 0,        1280,     900),
        (0,       0,        1280,     N_TOP),
        (0,       N_BOTTOM, 1280,     900),
    ],
    content_box=(N_LEFT, N_TOP, N_RIGHT, N_BOTTOM),
    callout_box=(N_LEFT + 12, N_FIRST_NOTIF_TOP, N_RIGHT - 12, N_FIRST_NOTIF_BOTTOM),
)

print("\nDone. Verifique os arquivos -annotated.png.")
