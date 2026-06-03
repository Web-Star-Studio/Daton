#!/usr/bin/env python3
"""Gera um PDF profissional do diário de bordo (markdown → PDF) com reportlab."""
import re
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
)

SRC = sys.argv[1] if len(sys.argv) > 1 else "docs/diario/2026-05-29.md"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/diario/2026-05-29.pdf"

DEJA = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("Deja", f"{DEJA}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Deja-Bold", f"{DEJA}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Deja-Italic", f"{DEJA}/DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("Deja-Mono", f"{DEJA}/DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Deja", normal="Deja", bold="Deja-Bold", italic="Deja-Italic")

PRIMARY = colors.HexColor("#1f6f54")  # verde Daton
GREY = colors.HexColor("#555555")

styles = getSampleStyleSheet()
def mk(name, **kw):
    kw.setdefault("fontName", "Deja")
    return ParagraphStyle(name, **kw)

S_TITLE = mk("DTitle", fontSize=20, leading=24, textColor=PRIMARY, fontName="Deja-Bold", spaceAfter=2)
S_META = mk("DMeta", fontSize=9.5, leading=14, textColor=GREY)
S_H2 = mk("DH2", fontSize=14, leading=18, textColor=PRIMARY, fontName="Deja-Bold", spaceBefore=14, spaceAfter=4)
S_H3 = mk("DH3", fontSize=11.5, leading=15, textColor=colors.HexColor("#1a1a1a"), fontName="Deja-Bold", spaceBefore=10, spaceAfter=3)
S_BODY = mk("DBody", fontSize=9.5, leading=14, spaceAfter=3)
S_BULLET = mk("DBul", fontSize=9.5, leading=14, leftIndent=14, bulletIndent=4, spaceAfter=2)
S_BULLET2 = mk("DBul2", fontSize=9.5, leading=14, leftIndent=28, bulletIndent=18, spaceAfter=2)


def inline(text: str) -> str:
    text = text.replace("✅", "✓").replace("⚠️", "⚠").replace("🤖", "")
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Deja-Mono" size="8.5">\1</font>', text)
    return text


def build():
    with open(SRC, encoding="utf-8") as f:
        lines = f.read().split("\n")

    story = []
    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            story.append(Spacer(1, 4))
            continue
        if line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), S_TITLE))
            story.append(HRFlowable(width="100%", thickness=1.2, color=PRIMARY, spaceBefore=4, spaceAfter=8))
        elif line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), S_H2))
            story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#cccccc"), spaceAfter=6))
        elif line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), S_H3))
        elif re.match(r"^\s*-\s+", line):
            indent = len(line) - len(line.lstrip(" "))
            content = re.sub(r"^\s*-\s+", "", line)
            st = S_BULLET2 if indent >= 2 else S_BULLET
            story.append(Paragraph(inline(content), st, bulletText="•"))
        else:
            # metadados (Projeto/Responsável/Módulos) saem menores/cinza
            st = S_META if re.match(r"^\*\*(Projeto|Respons|M[oó]dulo)", line) else S_BODY
            story.append(Paragraph(inline(line), st))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Deja", 7.5)
        canvas.setFillColor(GREY)
        canvas.drawString(20 * mm, 12 * mm, "Daton · confidencial")
        canvas.drawRightString(190 * mm, 12 * mm, f"Página {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title="Diário de Bordo — 2026-05-29", author="João Pedro",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"OK → {OUT}")


if __name__ == "__main__":
    build()
