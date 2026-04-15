"""
Guia de Recuperação de Senha — Daton
Gera o PDF com placeholders para screenshots.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak, Image as RLImage
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import Flowable

IMGS_DIR = "/home/jp/daton/Daton/docs/pdfs/imgs"
CONTENT_WIDTH = 170 * mm  # A4 - margins (20mm each side)

def scaled_image(filename, max_height=85*mm):
    """Loads an image scaled to content width, capped at max_height."""
    path = f"{IMGS_DIR}/{filename}"
    img = RLImage(path)
    ratio = img.imageHeight / img.imageWidth
    w = CONTENT_WIDTH
    h = w * ratio
    if h > max_height:
        h = max_height
        w = h / ratio
    img.drawWidth = w
    img.drawHeight = h
    img.hAlign = "LEFT"
    return img

OUTPUT = "/home/jp/daton/Daton/docs/pdfs/guia-recuperacao-de-senha.pdf"
W, H = A4

# ── Cores ─────────────────────────────────────────────────────────────────────
C_PRIMARY   = HexColor("#f97316")   # laranja principal
C_DARK      = HexColor("#1a1a1a")   # texto principal
C_MUTED     = HexColor("#6b6b6b")   # texto secundário
C_LIGHT     = HexColor("#f5f5f7")   # fundo claro
C_BORDER    = HexColor("#e0e0e0")   # bordas
C_PLACEHOLDER = HexColor("#fff7ed") # fundo placeholder screenshot

# ── Estilos ───────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def style(name, **kw):
    return ParagraphStyle(name, **kw)

ST_COVER_TITLE = style("cover_title",
    fontName="Helvetica-Bold", fontSize=28, leading=36,
    textColor=C_DARK, spaceAfter=8)

ST_COVER_SUBTITLE = style("cover_subtitle",
    fontName="Helvetica", fontSize=14, leading=20,
    textColor=C_PRIMARY, spaceAfter=32)

ST_COVER_META_LABEL = style("cover_meta_label",
    fontName="Helvetica", fontSize=9, leading=13,
    textColor=C_MUTED)

ST_COVER_META_VALUE = style("cover_meta_value",
    fontName="Helvetica-Bold", fontSize=9, leading=13,
    textColor=C_DARK)

ST_SECTION_NUM = style("section_num",
    fontName="Helvetica-Bold", fontSize=11, leading=14,
    textColor=white)

ST_SECTION_TITLE = style("section_title",
    fontName="Helvetica-Bold", fontSize=16, leading=22,
    textColor=C_DARK, spaceBefore=6, spaceAfter=6)

ST_BODY = style("body",
    fontName="Helvetica", fontSize=10, leading=16,
    textColor=C_DARK, spaceAfter=8)

ST_CAPTION = style("caption",
    fontName="Helvetica", fontSize=8.5, leading=12,
    textColor=C_MUTED, alignment=TA_CENTER)

ST_STEP_NUM = style("step_num",
    fontName="Helvetica-Bold", fontSize=10, leading=13,
    textColor=C_PRIMARY)

ST_STEP_BODY = style("step_body",
    fontName="Helvetica", fontSize=10, leading=15,
    textColor=C_DARK)

ST_NOTE = style("note",
    fontName="Helvetica", fontSize=9, leading=14,
    textColor=C_MUTED)

ST_FOOTER = style("footer",
    fontName="Helvetica", fontSize=8, leading=11,
    textColor=C_MUTED, alignment=TA_CENTER)

ST_LOGO = style("logo",
    fontName="Helvetica-Bold", fontSize=18, leading=22,
    textColor=C_PRIMARY)

ST_OVERVIEW_LABEL = style("overview_label",
    fontName="Helvetica-Bold", fontSize=10, leading=14,
    textColor=C_DARK, alignment=TA_CENTER)

ST_OVERVIEW_DESC = style("overview_desc",
    fontName="Helvetica", fontSize=8.5, leading=13,
    textColor=C_MUTED, alignment=TA_CENTER)

# ── Componentes ───────────────────────────────────────────────────────────────

class ScreenshotPlaceholder(Flowable):
    """Caixa cinza-azulado para substituir por screenshot."""
    def __init__(self, label, height=55*mm):
        super().__init__()
        self.label = label
        self._height = height
        self.hAlign = "CENTER"

    def wrap(self, avail_w, avail_h):
        self._width = avail_w
        return avail_w, self._height

    def draw(self):
        c = self.canv
        w, h = self._width, self._height
        # fundo
        c.setFillColor(C_PLACEHOLDER)
        c.setStrokeColor(C_BORDER)
        c.setLineWidth(0.8)
        c.roundRect(0, 0, w, h, 6, fill=1, stroke=1)
        # ícone câmera simples
        cx, cy = w / 2, h / 2 + 5*mm
        c.setFillColor(C_BORDER)
        c.ellipse(cx - 10, cy - 7, cx + 10, cy + 7, fill=1, stroke=0)
        c.setFillColor(C_PLACEHOLDER)
        c.ellipse(cx - 6, cy - 4, cx + 6, cy + 4, fill=1, stroke=0)
        # texto label
        c.setFillColor(C_MUTED)
        c.setFont("Helvetica", 8)
        c.drawCentredString(w / 2, cy - 14*mm, self.label)

class SectionHeader(Flowable):
    """Cabeçalho de seção com número em círculo azul + título."""
    def __init__(self, num, title):
        super().__init__()
        self.num = num
        self.title = title

    def wrap(self, avail_w, avail_h):
        self._width = avail_w
        return avail_w, 28

    def draw(self):
        c = self.canv
        # círculo azul
        c.setFillColor(C_PRIMARY)
        c.circle(12, 14, 12, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(12, 10, self.num)
        # título
        c.setFillColor(C_DARK)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(30, 9, self.title)

class HLine(Flowable):
    def __init__(self, color=C_BORDER, thickness=0.5):
        super().__init__()
        self.color = color
        self.thickness = thickness

    def wrap(self, w, h):
        self._width = w
        return w, self.thickness + 4

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 2, self._width, 2)


def step_table(steps):
    """Cria tabela de passos numerados."""
    data = []
    for num, text in steps:
        data.append([
            Paragraph(f"{num}", ST_STEP_NUM),
            Paragraph(text, ST_STEP_BODY),
        ])
    t = Table(data, colWidths=[10*mm, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 4),
        ("LEFTPADDING", (1, 0), (1, -1), 0),
    ]))
    return t


def note_box(text):
    """Caixa de nota/dica com fundo cinza."""
    inner = Table(
        [[Paragraph(text, ST_NOTE)]],
        colWidths=[None],
    )
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_LIGHT),
        ("ROUNDEDCORNERS", [4]),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return inner


def overview_table():
    """Tabela de visão geral do fluxo (3 etapas)."""
    steps = [
        ("01", "Tela de login", "Acesse o link\n'Esqueci minha senha'"),
        ("02", "Solicitar link", "Informe seu e-mail\nde cadastro"),
        ("03", "Nova senha", "Abra o e-mail e\ndefina sua nova senha"),
    ]
    arrow = Paragraph("›", style("arr", fontName="Helvetica", fontSize=18,
                                  textColor=C_MUTED, alignment=TA_CENTER))
    row_labels = []
    row_descs  = []
    spacers    = []
    for i, (num, label, desc) in enumerate(steps):
        num_p = Paragraph(num, style(f"n{i}",
            fontName="Helvetica-Bold", fontSize=11, textColor=C_PRIMARY,
            alignment=TA_CENTER))
        lbl_p = Paragraph(label, ST_OVERVIEW_LABEL)
        desc_p = Paragraph(desc.replace("\n", "<br/>"), ST_OVERVIEW_DESC)
        cell = Table([[num_p], [lbl_p], [desc_p]], colWidths=[40*mm])
        cell.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        row_labels.append(cell)
        if i < len(steps) - 1:
            row_labels.append(arrow)

    outer = Table([row_labels], colWidths=[40*mm, 10*mm, 40*mm, 10*mm, 40*mm])
    outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BACKGROUND", (0, 0), (0, 0), C_LIGHT),
        ("BACKGROUND", (2, 0), (2, 0), C_LIGHT),
        ("BACKGROUND", (4, 0), (4, 0), C_LIGHT),
        ("ROUNDEDCORNERS", [4]),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return outer


# ── Documento ─────────────────────────────────────────────────────────────────

def build():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
    )

    story = []
    SP = Spacer(1, 1)

    # ── CAPA ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))
    story.append(HLine(C_PRIMARY, 3))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Recuperação de Senha", ST_COVER_TITLE))
    story.append(Paragraph(
        "Guia passo a passo para redefinir o acesso à plataforma Daton.",
        ST_COVER_SUBTITLE))

    meta_data = [
        [Paragraph("Módulo", ST_COVER_META_LABEL),        Paragraph("Autenticação", ST_COVER_META_VALUE)],
        [Paragraph("Público-alvo", ST_COVER_META_LABEL),  Paragraph("Usuários da plataforma", ST_COVER_META_VALUE)],
        [Paragraph("Versão", ST_COVER_META_LABEL),         Paragraph("Abril 2026", ST_COVER_META_VALUE)],
    ]
    meta_table = Table(meta_data, colWidths=[35*mm, None])
    meta_table.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, C_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(meta_table)

    story.append(Spacer(1, 14*mm))

    # Visão geral do fluxo na capa
    story.append(overview_table())
    story.append(Spacer(1, 60*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        "Este documento é de uso interno. daton © 2026", ST_FOOTER))

    story.append(PageBreak())

    # ── SEÇÃO 1 — TELA DE LOGIN ───────────────────────────────────────────────
    story.append(Spacer(1, 6*mm))
    story.append(SectionHeader("1", "Tela de Login"))
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph(
        "Para iniciar a recuperação, acesse a tela de login da plataforma Daton "
        "e localize o link <b>Esqueci minha senha</b>, exibido ao lado da label do campo Senha.",
        ST_BODY))

    story.append(scaled_image("img1.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Tela de login — link 'Esqueci minha senha' ao lado do campo Senha.",
        ST_CAPTION))

    story.append(Spacer(1, 6*mm))
    story.append(step_table([
        ("1", "Acesse <b>daton-web.onrender.com</b> no navegador."),
        ("2", "Na tela de login, localize o link <b>Esqueci minha senha</b> "
              "ao lado da label do campo Senha."),
        ("3", "Clique no link para ser redirecionado ao formulário de solicitação."),
    ]))

    story.append(Spacer(1, 5*mm))
    story.append(note_box(
        "Dica: o link 'Esqueci minha senha' só aparece na tela de login. "
        "Caso já esteja autenticado, faça logout antes de prosseguir."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 2 — FORMULÁRIO DE SOLICITAÇÃO ───────────────────────────────────
    story.append(Spacer(1, 6*mm))
    story.append(SectionHeader("2", "Solicitar Link de Redefinição"))
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph(
        "Após clicar no link, você será direcionado à página de solicitação. "
        "Informe o e-mail cadastrado na sua conta e envie o formulário.",
        ST_BODY))

    story.append(scaled_image("img2.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Página de solicitação — campo de e-mail e botão 'Enviar link de redefinição'.",
        ST_CAPTION))

    story.append(Spacer(1, 6*mm))
    story.append(step_table([
        ("1", "Digite o <b>e-mail de trabalho</b> cadastrado na sua conta Daton."),
        ("2", "Clique em <b>Enviar link de redefinição</b>."),
        ("3", "Uma mensagem de confirmação será exibida na tela."),
    ]))

    story.append(Spacer(1, 5*mm))
    story.append(note_box(
        "Por segurança, a plataforma exibe sempre a mesma mensagem de confirmação — "
        "independentemente de o e-mail existir ou não no sistema. "
        "Isso protege a privacidade dos usuários cadastrados."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 3 — E-MAIL RECEBIDO ─────────────────────────────────────────────
    story.append(Spacer(1, 6*mm))
    story.append(SectionHeader("3", "E-mail de Redefinição"))
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph(
        "Verifique sua caixa de entrada. Você receberá um e-mail enviado pela plataforma Daton "
        "com um botão para redefinir a senha. O link é válido por <b>1 hora</b> e pode ser "
        "usado apenas uma vez.",
        ST_BODY))

    story.append(scaled_image("img3.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "E-mail recebido — botão 'Redefinir senha' com o link de acesso direto.",
        ST_CAPTION))

    story.append(Spacer(1, 6*mm))
    story.append(step_table([
        ("1", "Abra o e-mail com o assunto <b>Redefinição de senha — Daton</b>."),
        ("2", "Clique no botão <b>Redefinir senha</b>."),
        ("3", "Você será direcionado automaticamente para a página de nova senha."),
    ]))

    story.append(Spacer(1, 5*mm))
    story.append(note_box(
        "Não encontrou o e-mail? Verifique a pasta de Spam ou Lixo eletrônico. "
        "Caso o link tenha expirado (mais de 1 hora), retorne à tela de login "
        "e solicite um novo link."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 4 — DEFINIR NOVA SENHA ──────────────────────────────────────────
    story.append(Spacer(1, 6*mm))
    story.append(SectionHeader("4", "Definir Nova Senha"))
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph(
        "Ao clicar no link do e-mail, você será direcionado à página de redefinição. "
        "Escolha uma nova senha e confirme para concluir o processo.",
        ST_BODY))

    story.append(scaled_image("img4.png"))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Página de redefinição — campos de nova senha e confirmação.",
        ST_CAPTION))

    story.append(Spacer(1, 6*mm))
    story.append(step_table([
        ("1", "Digite sua <b>nova senha</b> no primeiro campo (mínimo 6 caracteres)."),
        ("2", "Repita a senha no campo <b>Confirmar nova senha</b>."),
        ("3", "Clique em <b>Salvar nova senha</b>."),
        ("4", "Você será redirecionado para o login com uma mensagem de confirmação. "
              "Acesse normalmente com sua nova senha."),
    ]))

    story.append(Spacer(1, 5*mm))
    story.append(note_box(
        "Se o link já foi utilizado ou expirou, a página exibirá uma mensagem de erro "
        "com um botão para solicitar um novo link de redefinição."
    ))


    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build()
