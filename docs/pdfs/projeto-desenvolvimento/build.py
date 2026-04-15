"""
Guia do Módulo de Projeto e Desenvolvimento
Daton Platform — ISO 9001:2015, cláusula 8.3

Uso:
    cd docs/pdfs/projeto-desenvolvimento
    python build.py

Dependências: pip install reportlab Pillow
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _base import *

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")
OUTPUT     = os.path.join(SCRIPT_DIR, "guia-projeto-desenvolvimento.pdf")


def build():
    doc   = new_doc(OUTPUT)
    story = []

    # ── CAPA ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))
    story.append(HLine(C_PRIMARY, 3))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Projeto e Desenvolvimento", ST_COVER_TITLE))
    story.append(Paragraph("Controle do item 8.3 — Guia do Módulo", ST_COVER_SUBTITLE))

    meta_data = [
        [Paragraph("Módulo",       ST_META_LABEL), Paragraph("Projeto e Desenvolvimento",                                        ST_META_VALUE)],
        [Paragraph("Público-alvo", ST_META_LABEL), Paragraph("Administradores SGQ e responsáveis técnicos",                      ST_META_VALUE)],
        [Paragraph("Norma",        ST_META_LABEL), Paragraph("ISO 9001:2015, cláusula 8.3 — Projeto e desenvolvimento de produtos e serviços", ST_META_VALUE)],
        [Paragraph("Versão",       ST_META_LABEL), Paragraph("Abril 2026",                                                        ST_META_VALUE)],
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
        "Este guia apresenta o módulo de Projeto e Desenvolvimento da plataforma Daton. "
        "O módulo permite registrar formalmente se o requisito 8.3 da ISO 9001:2015 é aplicável à "
        "organização e, quando aplicável, controlar todo o ciclo de vida dos projetos: entradas, "
        "etapas, saídas, revisões, verificações, validações e mudanças. "
        "Cada decisão e ação fica registrada de forma auditável, garantindo evidência de conformidade.",
        ST_BODY))

    story.append(Spacer(1, 6*mm))
    story.append(overview_grid([
        ("Aplicabilidade",  "Decisão formal sobre o\nrequisito 8.3 por organização"),
        ("Projetos",        "Controle de projetos com\nescopo, objetivo e responsável"),
        ("Entradas/Etapas", "Requisitos de entrada e\nfases do desenvolvimento"),
        ("Saídas",          "Entregas do projeto com\ntipo e status de aprovação"),
        ("Revisões",        "Revisão, verificação e\nvalidação técnica formal"),
        ("Mudanças",        "Controle de alterações\ncom motivo e decisão"),
    ]))
    story.append(Spacer(1, 30*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    story.append(PageBreak())

    # ── SEÇÃO 1 — APLICABILIDADE DO REQUISITO 8.3 ─────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Aplicabilidade do Requisito 8.3"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Antes de ativar o workflow de projetos, o administrador SGQ precisa registrar uma decisão "
        "formal sobre se o item 8.3 da ISO 9001:2015 é aplicável ao escopo da organização. "
        "A decisão exige justificativa, responsável e vigência — e precisa ser aprovada por um "
        "org_admin para produzir efeito. Todas as decisões ficam no histórico auditável, mesmo "
        "quando substituídas por decisões posteriores.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/01-aplicabilidade-annotated.png", max_height=78*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Aba Aplicabilidade: formulário de registro (esquerda) e histórico auditável (direita). "
        "Em destaque, o card de status superior com a decisão vigente e o contador de projetos.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como registrar uma decisão"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Governança → Projeto e Desenvolvimento</b> no menu lateral.",
        "Na aba <b>Aplicabilidade</b>, selecione se o requisito 8.3 é <b>Aplicável</b> ou <b>Não aplicável</b>.",
        "Informe o responsável pela decisão e preencha a <b>Justificativa</b> (campo obrigatório).",
        "Opcionalmente, descreva o escopo avaliado e defina a vigência (válido de / até).",
        "Clique em <b>Registrar decisão</b>. A decisão é criada com status <b>Pendente</b>.",
        "Para ativar o workflow, clique em <b>Aprovar</b> no histórico. Apenas org_admin pode aprovar.",
        "Se marcada como <b>Não aplicável</b>, o workflow de projetos permanece bloqueado.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Histórico completo de todas as decisões, inclusive as supersedidas",
        "Indicação visual da decisão vigente com badge de status",
        "Campos de vigência (válido de / válido até) para controle temporal",
        "Aprovação separada do registro — dois olhos na decisão",
        "Bloqueio automático do workflow enquanto não houver aprovação como aplicável",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 8.3.1 — A organização deve estabelecer, implementar e manter um "
        "processo de projeto e desenvolvimento adequado para assegurar a posterior provisão de "
        "produtos e serviços. A cláusula permite exclusão documentada quando P&D não é aplicável ao escopo."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 2 — PROJETOS DE DESENVOLVIMENTO ────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Projetos de Desenvolvimento"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Com o requisito 8.3 marcado como aplicável e aprovado, a aba Projetos se torna acessível. "
        "Cada projeto possui código, título, escopo, objetivo, responsável e datas planejadas. "
        "O status do projeto evolui de Rascunho → Ativo → Em revisão → Concluído, permitindo "
        "rastrear em qual fase cada iniciativa se encontra.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/02-projetos-lista-annotated.png", max_height=78*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Aba Projetos: lista de projetos (esquerda) com badge de status e formulário de detalhes "
        "(direita). Em destaque, o formulário com campos de código, status, título, escopo e datas.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como criar um projeto"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Na aba <b>Projetos</b>, clique em <b>+ Novo projeto</b> no cabeçalho da página.",
        "Preencha o <b>Título</b> e o <b>Escopo</b> (campos obrigatórios).",
        "Informe o código do projeto (ex: PD-2025-001), objetivo e responsável.",
        "Defina as datas de início e fim planejados e o status inicial (<b>Rascunho</b>).",
        "Clique em <b>Criar projeto</b>. O projeto aparece na lista e suas sub-seções são habilitadas.",
        "Para editar, selecione o projeto na lista — o formulário é carregado automaticamente.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Código único por projeto para identificação em relatórios de conformidade",
        "Cinco status de ciclo de vida: Rascunho, Ativo, Em revisão, Concluído, Cancelado",
        "Campos de data planejada e data real de conclusão para análise de desempenho",
        "Vinculação automática à decisão de aplicabilidade vigente",
        "Seleção de responsável a partir dos colaboradores cadastrados na organização",
    ]))

    story.append(PageBreak())

    # ── SEÇÃO 3 — ENTRADAS E ETAPAS ───────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Entradas e Etapas do Projeto"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "As entradas registram os requisitos, normas, contratos e informações que alimentam o projeto "
        "— evidenciando a rastreabilidade dos insumos conforme 8.3.3. "
        "As etapas estruturam o desenvolvimento em fases com responsável, prazo e nota de evidência, "
        "permitindo controle de progresso e identificação de bloqueios.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/03-entradas-etapas-annotated.png", max_height=78*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Seções de Entradas e Etapas dentro de um projeto. Em destaque, o botão Adicionar "
        "no cabeçalho de cada seção que expande o formulário inline.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como adicionar entradas"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Dentro do projeto, localize a seção <b>Entradas</b>.",
        "Clique em <b>Adicionar</b> no cabeçalho da seção.",
        "Preencha o título, a fonte (ex: contrato, norma) e a descrição detalhada.",
        "Clique em <b>Adicionar</b> para salvar. O formulário fecha automaticamente.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Como adicionar etapas"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Dentro do projeto, localize a seção <b>Etapas</b> e clique em <b>Adicionar</b>.",
        "Defina o título, responsável, status (Planejada / Em andamento / Concluída / Bloqueada) e prazo.",
        "Use o campo <b>Evidência</b> para registrar a nota comprobatória da etapa.",
        "Clique em <b>Adicionar</b>. A etapa aparece na lista com badge de status colorido.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 8.3.3 — As entradas de projeto e desenvolvimento devem incluir: "
        "requisitos funcionais e de desempenho, requisitos legais e regulamentares aplicáveis, "
        "normas ou códigos de prática e informações derivadas de projetos anteriores."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 4 — SAÍDAS, REVISÕES E VALIDAÇÕES ───────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Saídas, Revisões e Validações"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "As saídas registram os artefatos produzidos — especificações, relatórios, planos, protótipos "
        "e certificados — com status de aprovação. As revisões cobrem os três tipos exigidos pela norma: "
        "Revisão (gate de projeto), Verificação (outputs atendem às entradas?) e Validação "
        "(produto atende ao uso pretendido?). Cada registro inclui responsável, data e resultado.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/04-saidas-revisoes-annotated.png", max_height=78*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Seções de Saídas (superior) e Revisões/Verificações/Validações (inferior). "
        "Em destaque, os badges de tipo de revisão e os resultados (Aprovada, Exige ajustes, Rejeitada).",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como registrar uma revisão / verificação / validação"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Na seção <b>Revisões, verificações e validações</b>, clique em <b>Registrar</b>.",
        "Selecione o <b>Tipo</b>: Revisão, Verificação ou Validação.",
        "Preencha o título e o campo <b>Observações</b> com os critérios avaliados e conclusões.",
        "Informe o responsável e a data em que ocorreu a análise.",
        "Selecione o <b>Resultado</b>: Pendente, Aprovada, Exige ajustes ou Rejeitada.",
        "Clique em <b>Registrar</b>. O registro fica no histórico do projeto.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Três tipos de revisão conforme 8.3.4 / 8.3.5 / 8.3.6 da ISO 9001:2015",
        "Resultado com quatro opções: Pendente, Aprovada, Exige ajustes, Rejeitada",
        "Histórico completo de todas as revisões do projeto em ordem cronológica",
        "Seis tipos de saída controlados: Especificação, Relatório, Plano, Protótipo, Certificado, Outro",
        "Status de saída: Rascunho → Aprovada → Liberada",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusulas 8.3.4 / 8.3.5 / 8.3.6 — O projeto deve ser submetido a: "
        "<b>revisões</b> para avaliar a capacidade de atender aos requisitos; "
        "<b>verificações</b> para assegurar que as saídas atendem às entradas; e "
        "<b>validações</b> para assegurar que o produto resultante é capaz de atender ao uso pretendido."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 5 — MUDANÇAS DE PROJETO ─────────────────────────────────────────
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("Mudanças de Projeto"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Qualquer alteração no projeto após sua aprovação inicial deve ser registrada como mudança. "
        "Cada mudança documenta a descrição da alteração, o motivo, o impacto estimado e a decisão "
        "de aprovação — garantindo rastreabilidade conforme 8.3.6. O histórico de mudanças fica "
        "vinculado ao projeto e disponível para auditoria.",
        ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/05-mudancas-annotated.png", max_height=75*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Seção Mudanças de projeto com formulário expandido (superior) e lista de mudanças "
        "registradas (inferior), exibindo título, badge de status e campos de descrição e motivo.",
        ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como registrar uma mudança"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Na seção <b>Mudanças de projeto</b>, clique em <b>Registrar</b>.",
        "Preencha o <b>Título</b>, a <b>Descrição</b> da alteração e o <b>Motivo</b> (todos obrigatórios).",
        "Opcionalmente, descreva o <b>Impacto</b> em cronograma, custo ou qualidade.",
        "Selecione o <b>Status</b>: Pendente, Aprovada, Rejeitada ou Implementada.",
        "Clique em <b>Registrar</b>. A mudança aparece no histórico com data e autor.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Campos obrigatórios de título, descrição e motivo para rastreabilidade completa",
        "Campo de impacto para documentar consequências em prazo, custo e qualidade",
        "Quatro status: Pendente, Aprovada, Rejeitada, Implementada",
        "Histórico com autor e data de registro de cada mudança",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box(
        "ISO 9001:2015, cláusula 8.3.6 — Mudanças feitas durante ou após o projeto e desenvolvimento "
        "de produtos e serviços devem ser identificadas, analisadas criticamente e controladas para "
        "assegurar que não haja impacto adverso na conformidade com os requisitos."
    ))

    # ── RODAPÉ FINAL ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 8*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build()
