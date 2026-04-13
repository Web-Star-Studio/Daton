"""
Guia do Módulo de Planejamento Operacional de Serviços
Daton Platform — ISO 9001:2015, cláusula 8.1
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
IMGS_DIR = "/home/jp/daton/Daton-ciclo-d/docs/pdfs/imgs-planejamento-operacional"
OUTPUT = "/home/jp/daton/Daton-ciclo-d/docs/pdfs/guia-planejamento-operacional.pdf"
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
ST_OVERVIEW_TITLE = style("overview_title", fontName="Helvetica-Bold", fontSize=9,  leading=13, textColor=C_DARK,    alignment=TA_CENTER)
ST_OVERVIEW_DESC  = style("overview_desc",  fontName="Helvetica",      fontSize=8,  leading=12, textColor=C_MUTED,   alignment=TA_CENTER)

# ── Componentes ───────────────────────────────────────────────────────────────

class SectionHeader(Flowable):
    """Cabeçalho principal de seção com barra laranja."""
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
    """Cabeçalho de sub-seção."""
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
    """4 cards de aba em linha."""
    tabs = [
        ("Visão Geral",   "Controles planejados,\ndocumentos e riscos vinculados"),
        ("Checklist",     "Itens de prontidão críticos\ne não-críticos do plano"),
        ("Ciclos",        "Registro de evidências\ne execução de prontidão"),
        ("Mudanças",      "Controle de alterações\noperacionais com aprovação"),
    ]
    col_w = CONTENT_WIDTH / 4

    cells = []
    for label, desc in tabs:
        lbl_p  = Paragraph(label, ST_OVERVIEW_TITLE)
        desc_p = Paragraph(desc.replace("\n", "<br/>"), ST_OVERVIEW_DESC)
        cell   = Table([[lbl_p], [desc_p]], colWidths=[col_w - 6*mm])
        cell.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ]))
        cells.append(cell)

    row = Table([cells], colWidths=[col_w, col_w, col_w, col_w])
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
    story.append(Paragraph("Planejamento Operacional", ST_COVER_TITLE))
    story.append(Paragraph("de Serviços — Guia do Módulo", ST_COVER_SUBTITLE))

    meta_data = [
        [Paragraph("Módulo",       ST_META_LABEL), Paragraph("Planejamento Operacional de Serviços", ST_META_VALUE)],
        [Paragraph("Público-alvo", ST_META_LABEL), Paragraph("Gestores operacionais e responsáveis de serviço", ST_META_VALUE)],
        [Paragraph("Norma",        ST_META_LABEL), Paragraph("ISO 9001:2015, cláusula 8.1 — Planejamento operacional e controle", ST_META_VALUE)],
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
        "Este guia apresenta o módulo de Planejamento Operacional de Serviços da plataforma Daton. "
        "O módulo permite planejar, controlar e registrar evidências de cada execução de serviço, "
        "garantindo rastreabilidade e conformidade com a ISO 9001:2015. "
        "Cada plano opera em quatro áreas integradas: definição de controles, checklist de prontidão, "
        "ciclos de evidência e gestão de mudanças.",
        ST_BODY))

    story.append(Spacer(1, 6*mm))
    story.append(modules_overview())
    story.append(Spacer(1, 30*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    story.append(PageBreak())

    # ── SEÇÃO 1 — PLANOS OPERACIONAIS ─────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Planos Operacionais"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Um plano operacional descreve como um serviço será executado, quais recursos são necessários, "
        "quais documentos e riscos estão vinculados e como a prontidão da equipe deve ser verificada. "
        "Cada plano possui código único, processo e unidade responsável, tipo de serviço e controle de "
        "revisões — garantindo auditabilidade ao longo do ciclo de vida do serviço.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/01-visao-geral-annotated.png", max_height=75*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Painel principal: lista de planos (esquerda) e painel de detalhes com a aba Visão geral ativa "
        "(controles planejados, documentos e riscos vinculados).",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como criar um plano"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Governança → Planejamento Operacional</b> no menu lateral.",
        "Clique em <b>+ Novo plano operacional</b> no cabeçalho da página.",
        "Preencha o título, código (ex: OP-001), processo SGQ, unidade, responsável e tipo de serviço.",
        "Defina o escopo operacional, a sequência de execução e os critérios de aceite.",
        "Informe recursos necessários, entradas, saídas e considerações ESG/SGI.",
        "Ative <b>Bloqueio de prontidão</b> para impedir o avanço de ciclos com itens críticos pendentes.",
        "Vincule documentos de referência e riscos/oportunidades do módulo de Governança.",
        "Salve. O plano aparece na lista e recebe automaticamente a Revisão 1.",
    ]))

    story.append(Spacer(1, 4*mm))
    story.append(img_flowable(f"{IMGS_DIR}/05-novo-plano-dialog-annotated.png", max_height=80*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Formulário de criação: em laranja, os campos de identificação (título, código, processo, "
        "unidade, responsável e status); em vermelho, os campos de planejamento de recursos "
        "(entradas, saídas e recursos necessários). O toggle de bloqueio de prontidão e os "
        "vínculos de documentos e riscos estão abaixo, no mesmo formulário.",
        ST_CAPTION))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Código único por plano para identificação nos ciclos e relatórios",
        "Vinculação com processos do SGQ, unidades organizacionais e responsáveis",
        "Controle de revisões com histórico de alterações e autor",
        "Documentos de referência vinculados com status de aprovação",
        "Riscos e oportunidades do módulo de Governança vinculados ao plano",
        "Bloqueio configurável de prontidão para itens críticos do checklist",
        "Status do plano: rascunho, ativo ou inativo",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 8.1 — A organização deve planejar, implementar, controlar, "
        "monitorar e analisar os processos necessários para atender aos requisitos de provisão "
        "de produtos e serviços, e implementar as ações determinadas na cláusula 6."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 2 — CHECKLIST DE PRONTIDÃO ──────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Checklist de Prontidão"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "O checklist de prontidão define quais verificações precisam ser concluídas antes de cada "
        "execução de serviço. Itens marcados como <b>críticos</b> bloqueiam o avanço do ciclo quando "
        "o plano tem o controle de prontidão ativado — garantindo que nenhum serviço prossiga "
        "sem as condições mínimas de segurança e qualidade confirmadas.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/02-checklist-annotated.png", max_height=70*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Aba Checklist: itens de prontidão com indicador de criticidade e instrução de execução.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como gerenciar o checklist"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Selecione o plano na lista e clique na aba <b>Checklist</b>.",
        "Clique em <b>+ Novo item</b> para adicionar uma verificação.",
        "Informe o título do item e, opcionalmente, uma instrução detalhada para o executor.",
        "Marque o item como <b>Crítico</b> se a sua ausência impede a execução do serviço.",
        "Os itens podem ser reordenados e editados a qualquer momento.",
        "Para remover um item, clique no ícone de lixeira — a remoção reflete em novos ciclos.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Itens com título e instrução de execução opcional",
        "Marcação de criticidade: itens críticos bloqueiam o ciclo se pendentes",
        "Ordem configurável dos itens dentro do checklist",
        "Visualização do status de cada item em cada ciclo (ok, pendente, não aplicável)",
        "Contadores de pendências e pendências críticas visíveis no card do ciclo",
    ]))

    story.append(PageBreak())

    # ── SEÇÃO 3 — CICLOS E EVIDÊNCIAS ─────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Ciclos e Evidências"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Cada vez que o serviço é executado, um ciclo é aberto. O ciclo reúne as evidências da "
        "execução — resumo, referência externa (ex: OS ou número do ERP) e anexos — e o registro "
        "de prontidão, onde cada item do checklist é verificado individualmente antes do início. "
        "O sistema bloqueia automaticamente o avanço do ciclo enquanto houver itens críticos pendentes.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/03-ciclos-annotated.png", max_height=75*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Aba Ciclos: ciclo em status 'planejado' com alerta de bloqueio por item crítico pendente "
        "e contadores de prontidão (total, pendentes, críticos pendentes).",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como registrar um ciclo"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Selecione o plano e clique na aba <b>Ciclos</b>.",
        "Clique em <b>+ Novo ciclo</b> e informe a data de execução e a referência externa (opcional).",
        "O ciclo é criado com status <b>planejado</b> e todos os itens do checklist aparecem como pendentes.",
        "Para cada item, clique em <b>Registrar</b> e informe o status (ok, pendente ou não aplicável), "
        "a observação de evidência e anexos, se houver.",
        "Quando todos os itens críticos estiverem com status <b>ok</b>, o alerta de bloqueio desaparece.",
        "Atualize o status do ciclo para <b>em andamento</b>, <b>concluído</b> ou <b>cancelado</b> conforme a execução.",
        "Adicione o resumo de evidências e os anexos finais antes de encerrar o ciclo.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Ciclo com data, referência externa (ERP/OS) e resumo de evidências",
        "Execução individual de cada item do checklist por ciclo",
        "Status por item: ok, pendente ou não aplicável",
        "Observação de evidência e anexos por item de prontidão",
        "Alerta visual quando itens críticos estão pendentes",
        "Bloqueio de avanço quando prontidão bloqueante está ativa e há críticos pendentes",
        "Contadores de total, pendentes e críticos pendentes no card do ciclo",
        "Status do ciclo: planejado, em andamento, pronto, concluído ou cancelado",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "Dica: ative o <b>Bloqueio de prontidão</b> no cadastro do plano para garantir que nenhum "
        "ciclo avance para 'em andamento' enquanto houver itens críticos do checklist sem confirmação."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 4 — MUDANÇAS OPERACIONAIS ───────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Mudanças Operacionais"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Durante a execução de um serviço, desvios ou alterações de escopo podem ocorrer. "
        "A aba Mudanças permite registrar cada alteração com seu nível de impacto, descrição, "
        "ação de mitigação e decisão final (aprovada ou rejeitada). Mudanças de impacto alto ou "
        "crítico exigem o preenchimento da ação de mitigação antes de serem salvas. "
        "Os riscos associados à mudança podem ser vinculados diretamente a partir do módulo de Governança.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/04-mudancas-annotated.png", max_height=70*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Aba Mudanças: painel de mudanças operacionais com botão para registrar nova alteração.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como registrar uma mudança"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Selecione o plano e clique na aba <b>Mudanças</b>.",
        "Clique em <b>+ Nova mudança</b> para abrir o formulário.",
        "Informe o título da mudança e o motivo que gerou a alteração.",
        "Selecione o nível de impacto: <b>baixo</b>, <b>médio</b>, <b>alto</b> ou <b>crítico</b>.",
        "Para impacto <b>alto</b> ou <b>crítico</b>, preencha obrigatoriamente a ação de mitigação.",
        "Descreva como o impacto afeta o serviço e qual a decisão tomada (aprovada ou rejeitada).",
        "Vincule os riscos e oportunidades relacionados à mudança, se aplicável.",
        "Salve. A mudança fica registrada com data, solicitante e aprovador para fins de auditoria.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Registro de mudança com título, motivo e descrição de impacto",
        "Níveis de impacto: baixo, médio, alto e crítico",
        "Mitigação obrigatória para impactos alto e crítico",
        "Decisão registrada: aprovada ou rejeitada",
        "Vinculação com riscos e oportunidades do módulo de Governança",
        "Rastreabilidade de solicitante, aprovador e data de aprovação",
        "Vinculação opcional a um ciclo de evidência específico",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 8.1 — A organização deve controlar as mudanças planejadas e "
        "analisar as consequências de mudanças não intencionais, tomando ações para mitigar "
        "quaisquer efeitos adversos, conforme necessário."
    ))

    story.append(Spacer(1, 8*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build()
