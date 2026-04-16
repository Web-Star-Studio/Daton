"""
Notificações de Legislações por Compliance — Guia do Módulo
Daton Platform

Uso:
    cd docs/pdfs/notificacoes-legislacoes
    python build.py

Dependências: pip install reportlab Pillow
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _base import *

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")
OUTPUT     = os.path.join(SCRIPT_DIR, "guia-notificacoes-legislacoes.pdf")


def build():
    doc   = new_doc(OUTPUT)
    story = []

    # ── CAPA ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))
    story.append(HLine(C_PRIMARY, 3))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Notificações de Legislações", ST_COVER_TITLE))
    story.append(Paragraph("por Compliance — Guia do Módulo", ST_COVER_SUBTITLE))

    meta_data = [
        [Paragraph("Módulo",       ST_META_LABEL), Paragraph("Legislações e Notificações de Compliance",            ST_META_VALUE)],
        [Paragraph("Público-alvo", ST_META_LABEL), Paragraph("Analistas de compliance, gestores e administradores", ST_META_VALUE)],
        [Paragraph("Norma",        ST_META_LABEL), Paragraph("ISO 9001:2015, cláusula 9.1 — Monitoramento e análise", ST_META_VALUE)],
        [Paragraph("Versão",       ST_META_LABEL), Paragraph("Abril 2026",                                           ST_META_VALUE)],
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
        "Este guia explica como o Daton notifica automaticamente os usuários responsáveis sempre "
        "que uma nova legislação relevante é adicionada à plataforma. "
        "A relevância é determinada pelas tags de compliance geradas pelo questionário de cada unidade: "
        "quando as tags de uma legislação coincidem com as tags da unidade, os usuários com acesso "
        "ao módulo de Legislações recebem uma notificação direta no painel, com link para a legislação.",
        ST_BODY))

    story.append(Spacer(1, 6*mm))
    story.append(overview_grid([
        ("Questionário",  "Preencha o questionário\nde compliance da unidade\npara gerar suas tags"),
        ("Legislações",   "Adicione ou importe\nlegislações com tags\npara ativar notificações"),
        ("Notificações",  "Receba alertas automáticos\ncom link direto para\na legislação relevante"),
    ]))
    story.append(Spacer(1, 30*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    story.append(PageBreak())

    # ── SEÇÃO 1 — QUESTIONÁRIO DE COMPLIANCE ──────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Questionário de Compliance da Unidade"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "O questionário de compliance é o ponto de partida para as notificações. "
        "Ele é preenchido por unidade e cobre 21 temas — licenciamento, resíduos, produtos químicos, "
        "normas regulamentadoras, LGPD e outros. "
        "As respostas geram automaticamente um conjunto de <b>tags de compliance</b> para a unidade. "
        "Essas tags são usadas pelo sistema para filtrar quais legislações são aplicáveis e, "
        "consequentemente, quais notificações devem ser disparadas.",
        ST_BODY))

    story.append(Spacer(1, 2*mm))
    story.append(img_flowable(f"{IMGS_DIR}/01-questionario-annotated.png", max_height=58*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Modal do questionário de compliance: navegação por temas (esquerda) com percentual de "
        "preenchimento e perguntas com seleção múltipla ou única (direita). O sistema salva "
        "as respostas automaticamente a cada 1,5 segundos.",
        ST_CAPTION))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como preencher o questionário"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Organização → Unidades</b> no menu lateral.",
        "Selecione a unidade desejada para abrir o painel de detalhes.",
        "Clique no botão <b>Questionário de Compliance</b> no cabeçalho da unidade.",
        "Navegue pelos temas no painel esquerdo do modal e responda cada pergunta.",
        "As respostas são salvas automaticamente — não é necessário clicar em salvar a cada tema.",
        "Ao concluir todos os temas, clique em <b>Enviar questionário</b> na última etapa.",
        "O sistema gera as tags de compliance da unidade com base nas respostas enviadas.",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "21 temas de compliance: licenciamento, resíduos, NRs, LGPD e outros",
        "Questões com lógica condicional — perguntas surgem conforme as respostas anteriores",
        "Auto-save a cada 1,5 segundos para evitar perda de progresso",
        "Percentual de preenchimento por tema visível na navegação lateral",
        "Tags geradas automaticamente após o envio do questionário",
        "Questionário pode ser reenviado para atualizar as tags da unidade",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 9.1 — A organização deve monitorar, medir, analisar e avaliar "
        "os requisitos legais e regulamentares aplicáveis. O questionário de compliance define "
        "o escopo dos requisitos legais monitorados por unidade."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 2 — ADICIONANDO LEGISLAÇÕES COM TAGS ────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Adicionando Legislações com Tags"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Para que uma notificação seja disparada, a legislação precisa ter pelo menos uma tag "
        "que coincida com as tags de alguma unidade da organização. "
        "As tags podem ser atribuídas manualmente no formulário de cadastro, via importação em "
        "massa ou pelo recurso de auto-tagging com inteligência artificial. "
        "O disparo acontece automaticamente no momento da criação — tanto no cadastro individual "
        "quanto na importação bulk.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/02-legislacoes-lista-annotated.png", max_height=62*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Página de Legislações com filtro por unidade ativo: somente as legislações cujas tags "
        "coincidem com as tags de compliance da unidade selecionada são exibidas.",
        ST_CAPTION))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como adicionar uma legislação com tags"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Qualidade → Legislações</b> no menu lateral.",
        "Clique em <b>+ Nova legislação</b> no cabeçalho da página.",
        "Preencha os dados da norma: tipo, número, título, emissor e nível (federal, estadual etc.).",
        "No campo <b>Tags de compliance</b>, adicione as tags que identificam os temas da norma.",
        "Salve. O sistema verifica automaticamente se alguma unidade tem tags coincidentes.",
        "Se houver coincidência, os usuários com acesso ao módulo de Legislações são notificados.",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Outras formas de adicionar tags"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "<b>Importação bulk</b> — importe um arquivo Excel/CSV com legislações e tags; notificações são disparadas para cada lei nova com tags relevantes",
        "<b>Auto-tagging com IA</b> — selecione legislações sem tags e clique em Auto-tagging; a IA sugere as tags com base no conteúdo da norma",
        "<b>Edição manual</b> — tags podem ser adicionadas ou alteradas na página de detalhes de qualquer legislação existente",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(note_box(
        "Dica: use o filtro por unidade na lista de legislações para visualizar exatamente quais "
        "normas são aplicáveis a cada unidade com base no questionário preenchido. "
        "As tags coincidentes ficam destacadas na listagem."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 3 — NOTIFICAÇÕES DE LEGISLAÇÕES ─────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Notificações de Legislações"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Quando uma legislação com tags relevantes é adicionada, o Daton envia automaticamente "
        "uma notificação para todos os administradores da organização e para os usuários com "
        "permissão no módulo de Legislações. "
        "A notificação aparece no painel acessível pelo ícone de sino no cabeçalho e inclui "
        "um link direto para a legislação adicionada.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/03-notificacoes-annotated.png", max_height=70*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Painel de notificações com alerta de nova legislação relevante: título, descrição "
        "com o nome da norma adicionada e seta indicando navegação direta para a legislação.",
        ST_CAPTION))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como acessar as notificações"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Clique no ícone de sino no cabeçalho superior da plataforma.",
        "O painel de notificações abre exibindo as notificações mais recentes.",
        "Notificações não lidas são indicadas por um ponto azul e fundo levemente destacado.",
        "Clique na notificação de legislação para ser redirecionado diretamente à norma.",
        "Use <b>Marcar todas como lidas</b> para limpar os indicadores de não lida de uma só vez.",
        "Use <b>Limpar tudo</b> para remover todas as notificações do painel.",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Quem recebe as notificações"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "<b>Administradores da organização</b> — recebem todas as notificações automaticamente",
        "<b>Usuários com permissão no módulo Legislações</b> — recebem notificações de novas normas relevantes",
        "A notificação só é disparada se ao menos uma unidade tiver tags coincidentes com a legislação adicionada",
        "Legislações sem tags não geram notificações",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(note_box(
        "Para garantir que as notificações funcionem: (1) certifique-se de que o questionário "
        "de compliance de cada unidade está preenchido e enviado, e (2) adicione tags às "
        "legislações no cadastro ou via auto-tagging com IA."
    ))

    story.append(Spacer(1, 8*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build()
