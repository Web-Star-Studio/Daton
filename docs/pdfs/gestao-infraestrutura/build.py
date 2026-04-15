"""
Guia do Módulo de Gestão de Infraestrutura
Daton Platform
"""
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
IMGS_DIR = "/home/jp/daton/Daton/docs/pdfs/imgs"
OUTPUT = "/home/jp/daton/Daton/docs/pdfs/guia-gestao-infraestrutura.pdf"
W, H = A4

# ── Cores ─────────────────────────────────────────────────────────────────────
C_PRIMARY = HexColor("#f97316")
C_DARK    = HexColor("#1a1a1a")
C_MUTED   = HexColor("#6b6b6b")
C_LIGHT   = HexColor("#f5f5f7")
C_BORDER  = HexColor("#e0e0e0")
C_WARM    = HexColor("#fff7ed")

# ── Estilos ───────────────────────────────────────────────────────────────────
def style(name, **kw):
    return ParagraphStyle(name, **kw)

ST_COVER_TITLE    = style("cover_title",    fontName="Helvetica-Bold", fontSize=28, leading=36, textColor=C_DARK, spaceAfter=8)
ST_COVER_SUBTITLE = style("cover_subtitle", fontName="Helvetica",      fontSize=14, leading=20, textColor=C_PRIMARY, spaceAfter=32)
ST_META_LABEL     = style("meta_label",     fontName="Helvetica",      fontSize=9,  leading=13, textColor=C_MUTED)
ST_META_VALUE     = style("meta_value",     fontName="Helvetica-Bold", fontSize=9,  leading=13, textColor=C_DARK)
ST_BODY           = style("body",           fontName="Helvetica",      fontSize=10, leading=16, textColor=C_DARK, spaceAfter=8)
ST_CAPTION        = style("caption",        fontName="Helvetica",      fontSize=8.5,leading=12, textColor=C_MUTED, alignment=TA_CENTER)
ST_STEP_NUM       = style("step_num",       fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=C_PRIMARY)
ST_STEP_BODY      = style("step_body",      fontName="Helvetica",      fontSize=10, leading=15, textColor=C_DARK)
ST_NOTE           = style("note",           fontName="Helvetica",      fontSize=9,  leading=14, textColor=C_MUTED)
ST_FOOTER         = style("footer",         fontName="Helvetica",      fontSize=8,  leading=11, textColor=C_MUTED, alignment=TA_CENTER)
ST_LABEL          = style("label",          fontName="Helvetica-Bold", fontSize=8,  leading=11, textColor=C_PRIMARY)
ST_OVERVIEW_CODE  = style("overview_code",  fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=C_PRIMARY, alignment=TA_CENTER)
ST_OVERVIEW_TITLE = style("overview_title", fontName="Helvetica-Bold", fontSize=9,  leading=13, textColor=C_DARK,    alignment=TA_CENTER)
ST_OVERVIEW_DESC  = style("overview_desc",  fontName="Helvetica",      fontSize=8,  leading=12, textColor=C_MUTED,   alignment=TA_CENTER)

# ── Componentes ───────────────────────────────────────────────────────────────

class ScreenshotPlaceholder(Flowable):
    def __init__(self, label, height=52*mm):
        super().__init__()
        self.label  = label
        self._height = height
        self.hAlign = "CENTER"

    def wrap(self, avail_w, avail_h):
        self._width = avail_w
        return avail_w, self._height

    def draw(self):
        c = self.canv
        w, h = self._width, self._height
        c.setFillColor(C_WARM)
        c.setStrokeColor(C_BORDER)
        c.setLineWidth(0.8)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=1)
        cx, cy = w / 2, h / 2 + 5*mm
        c.setFillColor(C_BORDER)
        c.ellipse(cx - 10, cy - 7, cx + 10, cy + 7, fill=1, stroke=0)
        c.setFillColor(C_WARM)
        c.ellipse(cx - 6, cy - 4, cx + 6, cy + 4, fill=1, stroke=0)
        c.setFillColor(C_MUTED)
        c.setFont("Helvetica", 8)
        c.drawCentredString(w / 2, cy - 14*mm, self.label)


class SectionHeader(Flowable):
    """Cabeçalho principal de seção com círculo laranja."""
    def __init__(self, title, tag=""):
        super().__init__()
        self.title = title
        self.tag   = tag  # ex: "Ativos Críticos"

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
    """Cabeçalho de sub-seção (ex: Manutenção dentro de Ativos)."""
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


def label_tag(text):
    return Paragraph(text.upper(), ST_LABEL)


def steps_list(items):
    data = []
    for i, item in enumerate(items, 1):
        data.append([Paragraph(str(i), ST_STEP_NUM), Paragraph(item, ST_STEP_BODY)])
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
    data = []
    for item in items:
        data.append([Paragraph("–", ST_NOTE), Paragraph(item, ST_NOTE)])
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
    """Imagem real com proporção preservada, limitada a max_height."""
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
    t = Table([[Paragraph(text, ST_NOTE)]], colWidths=[None])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_LIGHT),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    return t


def modules_overview():
    """3 cards de módulo em linha."""
    modules = [
        ("Ativos Críticos",        "Cadastro, status e\nmanutenção de ativos"),
        ("Ambiente Operacional",   "Controle de fatores\nfísicos e ambientais"),
        ("Instrumentos de Medição","Calibração e validade\nde equipamentos"),
    ]
    col_w = CONTENT_WIDTH / 3

    cells = []
    for label, desc in modules:
        lbl_p  = Paragraph(label, ST_OVERVIEW_TITLE)
        desc_p = Paragraph(desc.replace("\n", "<br/>"), ST_OVERVIEW_DESC)
        cell   = Table([[lbl_p], [desc_p]], colWidths=[col_w - 8*mm])
        cell.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ]))
        cells.append(cell)

    row = Table([cells], colWidths=[col_w, col_w, col_w])
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


# ── Documento ─────────────────────────────────────────────────────────────────

def build():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
    )
    story = []

    # ── CAPA ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))
    story.append(HLine(C_PRIMARY, 3))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Gestão de Infraestrutura", ST_COVER_TITLE))
    story.append(Paragraph("Guia do Módulo", ST_COVER_SUBTITLE))

    meta_data = [
        [Paragraph("Módulo",       ST_META_LABEL), Paragraph("Gestão de Infraestrutura", ST_META_VALUE)],
        [Paragraph("Público-alvo", ST_META_LABEL), Paragraph("Gestores e responsáveis operacionais", ST_META_VALUE)],
        [Paragraph("Norma",        ST_META_LABEL), Paragraph("ISO 9001:2015, cláusulas 7.1.3, 7.1.4 e 7.1.5", ST_META_VALUE)],
        [Paragraph("Versão",       ST_META_LABEL), Paragraph("Abril 2026", ST_META_VALUE)],
    ]
    meta_t = Table(meta_data, colWidths=[35*mm, None])
    meta_t.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.5, C_BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(meta_t)
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph(
        "Este guia apresenta o módulo de Gestão de Infraestrutura da plataforma Daton. "
        "O módulo é composto por três áreas integradas — Ativos Críticos, Ambiente Operacional "
        "e Instrumentos de Medição — e cobre os requisitos de infraestrutura da ISO 9001:2015.",
        ST_BODY))

    story.append(Spacer(1, 6*mm))
    story.append(modules_overview())
    story.append(Spacer(1, 30*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    story.append(PageBreak())

    # ── SEÇÃO 1 — ATIVOS CRÍTICOS ─────────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Ativos Críticos"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Para garantir a continuidade dos processos, a organização precisa saber "
        "quais são seus equipamentos e infraestruturas críticas, onde estão e em que "
        "estado se encontram. Esta área centraliza esse controle em uma tabela única, "
        "com visibilidade de criticidade, status operacional e alertas de manutenção.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/img01.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Listagem de ativos com criticidade, status operacional e indicador de manutenção.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como usar"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Gestão de Infraestrutura → Ativos Críticos</b> no menu lateral.",
        "Clique em <b>Novo ativo</b> e preencha: nome, tipo, localização, processo impactado e responsável.",
        "Defina a <b>criticidade</b> (alta, média ou baixa) e o <b>status operacional</b> do ativo.",
        "O ativo aparece na listagem. Clique diretamente nas células para editar sem abrir formulário.",
        "Use os filtros de unidade e a busca por nome para localizar ativos rapidamente.",
        "Ativos com manutenção próxima ou vencida exibem um indicador colorido na linha — "
        "amarelo para próxima, vermelho para vencida.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Cadastro com nome, tipo, localização, processo impactado e responsável",
        "Classificação por criticidade: alta, média ou baixa",
        "Status: ativo, inativo ou em manutenção",
        "Edição inline na tabela, sem abrir formulário",
        "Filtro por unidade e busca por nome",
        "Indicador de manutenção integrado à listagem",
    ]))

    # Sub-seção: Manutenção
    story.append(Spacer(1, 5*mm))
    story.append(SubSectionHeader("Manutenção"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Cada ativo pode ter planos de manutenção associados — preventiva, corretiva "
        "ou de inspeção. O sistema registra todas as execuções, mantém o histórico "
        "completo e calcula automaticamente quando a próxima manutenção é devida, "
        "sem depender de planilhas externas.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/img02.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Painel de manutenção com planos ativos, histórico de execuções e status de cada registro.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como usar"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Na listagem de ativos, clique sobre o ativo desejado para abrir o painel de detalhes.",
        "Acesse a aba <b>Manutenção</b> e clique em <b>Novo plano</b>.",
        "Defina o tipo (preventiva, corretiva ou inspeção), a periodicidade e o responsável.",
        "Opcionalmente, adicione um <b>checklist de itens</b> a verificar em cada execução.",
        "Para registrar uma execução, clique em <b>Registrar execução</b> no plano correspondente.",
        "Informe o status (concluída, parcial ou não realizada), a data e as observações.",
        "O histórico e o indicador na listagem de ativos são atualizados automaticamente.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Planos por tipo: preventiva, corretiva ou inspeção",
        "Periodicidade configurável: diária, semanal, mensal, trimestral, semestral ou anual",
        "Checklist de itens por plano, preenchido em cada execução",
        "Registro com status, data, responsável e observações",
        "Histórico completo de execuções por ativo",
        "Data de vencimento calculada automaticamente — sem preenchimento manual",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 7.1.3 — A organização deve determinar, fornecer e "
        "manter a infraestrutura necessária para a operação de seus processos e para "
        "a conformidade de produtos e serviços."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 2 — AMBIENTE OPERACIONAL ────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Ambiente Operacional"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Fatores como temperatura, ruído, iluminação e ergonomia podem afetar diretamente "
        "a qualidade dos produtos ou serviços. Esta área permite definir quais fatores a "
        "organização monitora, com que frequência, e registrar cada verificação — inclusive "
        "a ação corretiva tomada em caso de desvio.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/img03.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Listagem de controles com resultado da última verificação, painel de alertas e indicador de vencimento.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como usar"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Gestão de Infraestrutura → Ambiente Operacional</b> no menu lateral.",
        "Clique em <b>Novo controle</b> e selecione a categoria: "
        "<b>físico</b> (temperatura, ruído, iluminação), <b>químico</b> ou <b>psicológico</b>.",
        "Defina o nome do controle, a <b>frequência de verificação</b> e o responsável.",
        "Para registrar uma verificação, clique em <b>Registrar</b> no controle correspondente.",
        "Informe o resultado (adequado, inadequado ou parcial) e, se houver desvio, "
        "registre a <b>ação corretiva</b> tomada.",
        "O painel de alertas atualiza automaticamente controles vencidos e desvios sem ação.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Categorias: físico (temperatura, ruído, iluminação), químico e psicológico",
        "Frequência: semanal, mensal, trimestral, semestral ou anual",
        "Resultado por verificação: adequado, inadequado ou parcial",
        "Campo de ação corretiva vinculado ao registro de desvio",
        "Painel de alertas: controles vencidos, desvios sem ação, sem histórico",
        "Indicador de vencimento calculado pela frequência e data da última verificação",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 7.1.4 — A organização deve determinar, fornecer e "
        "manter o ambiente necessário para a operação de seus processos e para a "
        "conformidade de produtos e serviços."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 3 — INSTRUMENTOS DE MEDIÇÃO ─────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Instrumentos de Medição"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Equipamentos usados em monitoramento e medição da qualidade precisam ter sua "
        "calibração rastreada e dentro da validade. Esta área centraliza esse controle: "
        "cada instrumento possui um histórico de calibrações com certificado, laboratório, "
        "resultado e validade — o status é atualizado automaticamente conforme o prazo.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/img04.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Listagem de instrumentos com status de calibração, validade e indicador de vencimento.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como usar"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Gestão de Infraestrutura → Instrumentos de Medição</b> no menu lateral.",
        "Clique em <b>Novo instrumento</b> e informe: nome, tipo, identificação (tag ou número de série) e responsável.",
        "Com o instrumento cadastrado, clique em <b>Nova calibração</b>.",
        "Preencha o número do certificado, o laboratório responsável, o resultado "
        "(apto, inapto ou condicional) e a <b>data de validade</b>.",
        "O status é atualizado automaticamente — <b>ativo</b> dentro do prazo, <b>vencido</b> após a expiração.",
        "Use o filtro por status para visualizar rapidamente os instrumentos que precisam de atenção.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Tipos: instrumento (paquímetro, termômetro) ou equipamento (balança, multímetro)",
        "Identificação por código patrimonial ou número de série",
        "Status automático: ativo, inativo ou vencido — baseado na última calibração",
        "Histórico completo com certificado, laboratório e resultado",
        "Indicador de vencimento: vermelho para vencido, amarelo para próximo",
        "Filtro por status para gestão rápida dos instrumentos críticos",
        "Instrumentos sem calibração registrada são sinalizados",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 7.1.5 — Quando a rastreabilidade de medição é um "
        "requisito, o recurso de medição deve ser calibrado ou verificado em intervalos "
        "especificados, e o resultado deve ser preservado como informação documentada."
    ))

    story.append(Spacer(1, 8*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build()
