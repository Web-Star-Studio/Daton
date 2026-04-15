"""
Guia do Módulo de Planejamento Operacional de Serviços
Daton Platform — ISO 9001:2015, cláusula 8.1

Uso:
    cd docs/pdfs/planejamento-operacional
    python build.py
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _base import *

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")
OUTPUT     = os.path.join(SCRIPT_DIR, "guia-planejamento-operacional.pdf")


def build():
    doc   = new_doc(OUTPUT)
    story = []

    # ── CAPA ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))
    story.append(HLine(C_PRIMARY, 3))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Planejamento Operacional", ST_COVER_TITLE))
    story.append(Paragraph("de Serviços — Guia do Módulo", ST_COVER_SUBTITLE))

    meta_data = [
        [Paragraph("Módulo",       ST_META_LABEL), Paragraph("Planejamento Operacional de Serviços",                          ST_META_VALUE)],
        [Paragraph("Público-alvo", ST_META_LABEL), Paragraph("Gestores operacionais e responsáveis de serviço",               ST_META_VALUE)],
        [Paragraph("Norma",        ST_META_LABEL), Paragraph("ISO 9001:2015, cláusula 8.1 — Planejamento operacional e controle", ST_META_VALUE)],
        [Paragraph("Versão",       ST_META_LABEL), Paragraph("Abril 2026",                                                    ST_META_VALUE)],
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
    story.append(overview_grid([
        ("Visão Geral",  "Controles planejados,\ndocumentos e riscos vinculados"),
        ("Checklist",    "Itens de prontidão críticos\ne não-críticos do plano"),
        ("Ciclos",       "Registro de evidências\ne execução de prontidão"),
        ("Mudanças",     "Controle de alterações\noperacionais com aprovação"),
    ]))
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
