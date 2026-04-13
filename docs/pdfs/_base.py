"""
Daton PDF Guide — Base utilities
Cores, estilos, Flowables e helpers compartilhados por todos os guias de módulo.

Uso em cada build.py:
    import os, sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from _base import *
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, PageBreak, Image as RLImage,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import Flowable

CONTENT_WIDTH = 170 * mm
W, H = A4

# ── Cores ─────────────────────────────────────────────────────────────────────
C_PRIMARY = HexColor("#f97316")
C_DARK    = HexColor("#1a1a1a")
C_MUTED   = HexColor("#6b6b6b")
C_LIGHT   = HexColor("#f5f5f7")
C_BORDER  = HexColor("#e0e0e0")
C_WARM    = HexColor("#fff7ed")

# ── Estilos ───────────────────────────────────────────────────────────────────
def _style(name, **kw):
    return ParagraphStyle(name, **kw)

ST_COVER_TITLE    = _style("cover_title",    fontName="Helvetica-Bold", fontSize=28, leading=36, textColor=C_DARK, spaceAfter=8)
ST_COVER_SUBTITLE = _style("cover_subtitle", fontName="Helvetica",      fontSize=14, leading=20, textColor=C_PRIMARY, spaceAfter=32)
ST_META_LABEL     = _style("meta_label",     fontName="Helvetica",      fontSize=9,  leading=13, textColor=C_MUTED)
ST_META_VALUE     = _style("meta_value",     fontName="Helvetica-Bold", fontSize=9,  leading=13, textColor=C_DARK)
ST_BODY           = _style("body",           fontName="Helvetica",      fontSize=10, leading=16, textColor=C_DARK, spaceAfter=8)
ST_CAPTION        = _style("caption",        fontName="Helvetica",      fontSize=8.5, leading=12, textColor=C_MUTED, alignment=TA_CENTER)
ST_STEP_NUM       = _style("step_num",       fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=C_PRIMARY)
ST_STEP_BODY      = _style("step_body",      fontName="Helvetica",      fontSize=10, leading=15, textColor=C_DARK)
ST_NOTE           = _style("note",           fontName="Helvetica",      fontSize=9,  leading=14, textColor=C_MUTED)
ST_FOOTER         = _style("footer",         fontName="Helvetica",      fontSize=8,  leading=11, textColor=C_MUTED, alignment=TA_CENTER)
ST_LABEL          = _style("label",          fontName="Helvetica-Bold", fontSize=8,  leading=11, textColor=C_PRIMARY)
ST_OVERVIEW_TITLE = _style("overview_title", fontName="Helvetica-Bold", fontSize=9,  leading=13, textColor=C_DARK,  alignment=TA_CENTER)
ST_OVERVIEW_DESC  = _style("overview_desc",  fontName="Helvetica",      fontSize=8,  leading=12, textColor=C_MUTED, alignment=TA_CENTER)

# ── Flowables ─────────────────────────────────────────────────────────────────

class SectionHeader(Flowable):
    """Cabeçalho principal de seção com barra laranja à esquerda."""
    def __init__(self, title, tag=""):
        super().__init__()
        self.title = title
        self.tag   = tag

    def wrap(self, avail_w, avail_h):
        self._width = avail_w
        return avail_w, 28

    def draw(self):
        c = self.canv
        c.setFillColor(C_PRIMARY)
        c.roundRect(0, 4, 4, 20, 2, fill=1, stroke=0)
        c.setFillColor(C_DARK)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(12, 8, self.title)
        if self.tag:
            title_w = c.stringWidth(self.title, "Helvetica-Bold", 16)
            c.setFillColor(C_MUTED)
            c.setFont("Helvetica", 9)
            c.drawString(12 + title_w + 8, 10, self.tag)


class SubSectionHeader(Flowable):
    """Cabeçalho de sub-seção com fundo cinza claro."""
    def __init__(self, title):
        super().__init__()
        self.title = title

    def wrap(self, avail_w, avail_h):
        self._width = avail_w
        return avail_w, 22

    def draw(self):
        c = self.canv
        c.setFillColor(C_LIGHT)
        c.roundRect(0, 0, self._width, 20, 4, fill=1, stroke=0)
        c.setFillColor(C_PRIMARY)
        c.roundRect(0, 0, 3, 20, 1, fill=1, stroke=0)
        c.setFillColor(C_DARK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(10, 6, self.title)


class HLine(Flowable):
    """Linha horizontal divisória."""
    def __init__(self, color=C_BORDER, thickness=0.5):
        super().__init__()
        self.color     = color
        self.thickness = thickness

    def wrap(self, w, h):
        self._width = w
        return w, self.thickness + 4

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 2, self._width, 2)


# ── Helpers ───────────────────────────────────────────────────────────────────

def label_tag(text):
    """Label laranja em caixa alta para introduzir listas de passos ou recursos."""
    return Paragraph(text.upper(), ST_LABEL)


def steps_list(items):
    """Lista numerada de passos com número em laranja."""
    data = [[Paragraph(str(i), ST_STEP_NUM), Paragraph(item, ST_STEP_BODY)]
            for i, item in enumerate(items, 1)]
    t = Table(data, colWidths=[7*mm, None])
    t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (0, -1),  0),
        ("RIGHTPADDING",  (0, 0), (0, -1),  8),
        ("LEFTPADDING",   (1, 0), (1, -1),  0),
    ]))
    return t


def resources_list(items):
    """Lista com marcador em dash para recursos / funcionalidades disponíveis."""
    data = [[Paragraph("–", ST_NOTE), Paragraph(item, ST_NOTE)] for item in items]
    t = Table(data, colWidths=[5*mm, None])
    t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (0, -1),  0),
        ("RIGHTPADDING",  (0, 0), (0, -1),  6),
        ("LEFTPADDING",   (1, 0), (1, -1),  0),
    ]))
    return t


def img_flowable(path, max_height=65*mm):
    """Imagem com proporção preservada, centralizada, limitada a max_height."""
    from PIL import Image as PILImage
    pil = PILImage.open(path)
    w_px, h_px = pil.size
    ratio = h_px / w_px
    w = CONTENT_WIDTH
    h = w * ratio
    if h > max_height:
        h = max_height
        w = h / ratio
    img = RLImage(path, width=w, height=h)
    img.hAlign = "CENTER"
    return img


def note_box(text):
    """Caixa cinza clara para notas ISO ou dicas ao usuário."""
    t = Table([[Paragraph(text, ST_NOTE)]], colWidths=[None])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_LIGHT),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    return t


def overview_grid(cards):
    """
    Grade de visão geral na capa — cards lado a lado.
    cards: list of (title, description) — description pode conter \\n.
    """
    n     = len(cards)
    col_w = CONTENT_WIDTH / n
    cells = []
    for label, desc in cards:
        cell = Table(
            [[Paragraph(label, ST_OVERVIEW_TITLE)],
             [Paragraph(desc.replace("\n", "<br/>"), ST_OVERVIEW_DESC)]],
            colWidths=[col_w - 6*mm],
        )
        cell.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ]))
        cells.append(cell)

    row = Table([cells], colWidths=[col_w] * n)
    row.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_LIGHT),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("INNERGRID",     (0, 0), (-1, -1), 0.4, C_BORDER),
        ("BOX",           (0, 0), (-1, -1), 0.4, C_BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return row


def new_doc(output_path):
    """Cria um SimpleDocTemplate com as margens padrão Daton (20mm)."""
    return SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
    )
