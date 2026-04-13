"""
Annotates screenshots with spotlight + callout effects for the PDF guide.
Strategy:
  - Dim the repeated parts (sidebar, plan list, plan header)
  - Keep the tab bar + tab content at full brightness
  - Draw orange border around the whole tab content
  - Draw a red callout border around the specific key element
"""
from PIL import Image, ImageDraw, ImageFilter
import os

IMGS_DIR = "/home/jp/daton/Daton-ciclo-d/docs/pdfs/imgs-planejamento-operacional"
ORANGE = (249, 115, 22, 255)
RED    = (220, 38,  38, 255)

# ── Layout constants (px, 1280×900) — measured via Playwright ─────────────────
# Measured:
#   "Planos operacionais" text:  x=354, y=266
#   first tab bar tab:           x=713, y=551
#   section headings (tab content): x=738, y=631
#   first checklist item row:    y=702, h=24
#   Crítico badge:               x=957, y=703
#   blocking alert:              x=792, y=831, h=40
#   mudanças heading:            y=631

LEFT_END   = 695   # right edge of left plan list — right panel starts here
TAB_Y      = 548   # top of tab bar
CONTENT_Y  = 586   # top of tab content (below tab bar)
BOTTOM     = 876   # bottom of content area
RIGHT_END  = 1262  # right edge of content


def dim_rect(overlay_draw, box, alpha=110):
    """Paint a dark transparent rectangle onto the overlay."""
    x1, y1, x2, y2 = box
    overlay_draw.rectangle([x1, y1, x2, y2], fill=(0, 0, 0, alpha))


def orange_border(draw, box, width=3, color=ORANGE):
    """Draw a solid rounded-ish border by stacking rectangles."""
    x1, y1, x2, y2 = box
    for i in range(width):
        draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)


def annotate(name, dim_boxes, callout_box=None, content_box=None):
    """
    dim_boxes   – list of (x1,y1,x2,y2) regions to darken
    content_box – (x1,y1,x2,y2) region to keep bright + add orange border
    callout_box – (x1,y1,x2,y2) specific key element to add red callout
    """
    src = f"{IMGS_DIR}/{name}.png"
    dst = f"{IMGS_DIR}/{name}-annotated.png"
    img = Image.open(src).convert("RGBA")

    # Build dim overlay
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for box in dim_boxes:
        dim_rect(od, box)

    # Composite dim overlay onto image
    result = Image.alpha_composite(img, overlay)
    draw = ImageDraw.Draw(result)

    # Orange border around the spotlighted content area
    if content_box:
        orange_border(draw, content_box, width=3)

    # Red callout border around the specific key element
    if callout_box:
        # Semi-transparent orange fill
        cx1, cy1, cx2, cy2 = callout_box
        highlight = Image.new("RGBA", img.size, (0, 0, 0, 0))
        hd = ImageDraw.Draw(highlight)
        hd.rectangle([cx1, cy1, cx2, cy2], fill=(249, 115, 22, 40))
        result = Image.alpha_composite(result, highlight)
        draw = ImageDraw.Draw(result)
        orange_border(draw, callout_box, width=3, color=RED)

    result.convert("RGB").save(dst)
    print(f"✓ {name}-annotated.png")


# ── Regions to dim ────────────────────────────────────────────────────────────
DIM_LEFT_PANEL  = (0,        0, LEFT_END,  BOTTOM)          # nav + plan list
DIM_RH_HEADER   = (LEFT_END, 0, RIGHT_END, TAB_Y - 4)       # right panel header (above tabs)

# Spotlight: tab bar + tab content
CONTENT = (LEFT_END, TAB_Y - 4, RIGHT_END, BOTTOM)

# ── Per-screenshot annotations ────────────────────────────────────────────────

# 1 — Visão geral: spotlight the tab content (Controles planejados)
annotate(
    "01-visao-geral",
    dim_boxes=[DIM_LEFT_PANEL, DIM_RH_HEADER],
    content_box=CONTENT,
    callout_box=None,
)

# 2 — Checklist: callout on the first item row (Equipamentos calibrados + Crítico badge)
#     measured: item row y≈702, height≈24
annotate(
    "02-checklist",
    dim_boxes=[DIM_LEFT_PANEL, DIM_RH_HEADER],
    content_box=CONTENT,
    callout_box=(LEFT_END + 10, 692, RIGHT_END - 10, 730),
)

# 3 — Ciclos: callout on the blocking alert row
#     measured: alert y≈831, height≈40
annotate(
    "03-ciclos",
    dim_boxes=[DIM_LEFT_PANEL, DIM_RH_HEADER],
    content_box=CONTENT,
    callout_box=(LEFT_END + 10, 822, RIGHT_END - 10, 876),
)

# 4 — Mudanças: spotlight only (empty state clearly shows the difference)
annotate(
    "04-mudancas",
    dim_boxes=[DIM_LEFT_PANEL, DIM_RH_HEADER],
    content_box=CONTENT,
    callout_box=None,
)

print("\nDone. Check the -annotated.png files.")
