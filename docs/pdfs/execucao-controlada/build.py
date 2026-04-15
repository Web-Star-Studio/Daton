"""
Execução Controlada — Guia do Módulo
Daton Platform

Uso:
    cd docs/pdfs/execucao-controlada
    python3 build.py

Dependências: pip install reportlab Pillow
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _base import *

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")
OUTPUT     = os.path.join(SCRIPT_DIR, "guia-execucao-controlada.pdf")


def build():
    doc   = new_doc(OUTPUT)
    story = []

    # ── CAPA ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))
    story.append(HLine(C_PRIMARY, 3))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("Execução Controlada", ST_COVER_TITLE))
    story.append(Paragraph(
        "Controle e rastreabilidade da prestação de serviços — ISO 9001:2015, cláusulas 8.5–8.7",
        ST_COVER_SUBTITLE,
    ))

    meta_data = [
        [Paragraph("Módulo",       ST_META_LABEL), Paragraph("Governança › Execução Controlada",       ST_META_VALUE)],
        [Paragraph("Público-alvo", ST_META_LABEL), Paragraph("Operadores de serviço, Gestores da qualidade", ST_META_VALUE)],
        [Paragraph("Norma",        ST_META_LABEL), Paragraph("ISO 9001:2015 — cláusulas 8.5.1, 8.5.4, 8.5.5, 8.6, 8.7", ST_META_VALUE)],
        [Paragraph("Versão",       ST_META_LABEL), Paragraph("Abril 2026",                             ST_META_VALUE)],
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
        "O módulo de Execução Controlada implementa a cláusula 8.5 da ISO 9001:2015, "
        "garantindo que cada entrega de serviço seja planejada, rastreada por checkpoints "
        "de qualidade e formalmente liberada antes de chegar ao cliente. "
        "Modelos reutilizáveis padronizam o fluxo; ciclos registram evidências em tempo real.",
        ST_BODY,
    ))

    story.append(Spacer(1, 6*mm))
    story.append(overview_grid([
        ("Modelos", "Templates reutilizáveis com checkpoints\ne documentos padrão"),
        ("Ciclos", "Execuções individuais por ordem\nde serviço ou lote"),
        ("Checkpoints", "Controles obrigatórios com\nevidências e critérios"),
        ("Saídas NC", "Registro e disposição de\nnão conformidades operacionais"),
        ("Liberação", "Porta de saída: libera apenas\nquando todos os controles passam"),
    ]))
    story.append(Spacer(1, 24*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    story.append(PageBreak())

    # ── SEÇÃO 1 — MODELOS DE EXECUÇÃO ─────────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Modelos de Execução", "ISO 8.5.1"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Modelos são <b>templates reutilizáveis</b> que definem o fluxo padrão de uma categoria de serviço: "
        "processo SGQ vinculado, unidade responsável, documentos de referência e lista de checkpoints. "
        "Ao criar um ciclo, o operador seleciona o modelo adequado e todos os controles são pré-carregados "
        "automaticamente — garantindo consistência entre execuções.",
        ST_BODY,
    ))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/01-modelos-annotated.png", max_height=68*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Lista de modelos (esquerda) e formulário de configuração do modelo selecionado (destaque laranja). "
        "O campo em vermelho identifica o nome e status do modelo.",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como criar um modelo"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>Governança › Execução Controlada</b>.",
        "No painel <b>Modelos</b>, clique em <b>Novo</b>.",
        "Defina o <b>nome do modelo</b>, <b>Processo SGQ</b>, <b>Unidade</b> e documentos vinculados.",
        "Ative <b>Exige validação especial</b> se o processo exige revalidação periódica.",
        "Adicione os <b>checkpoints</b> — tipo, critério de aceitação e se exige evidência.",
        "Salve. O modelo estará disponível para todos os ciclos dessa categoria.",
    ]))

    story.append(PageBreak())

    # — continuação: checkpoints ———————————————————————————————————————————————
    story.append(Spacer(1, 2*mm))
    story.append(SubSectionHeader("Checkpoints do modelo"))
    story.append(Spacer(1, 2*mm))
    story.append(img_flowable(f"{IMGS_DIR}/01b-checkpoints-modelo-annotated.png", max_height=65*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Configuração de checkpoints do modelo. Cada item define tipo, ordem, critério de aceitação "
        "e orientação para o executor.",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Checkpoints do tipo <b>Checkpoint</b> (evidência documental) ou <b>Controle preventivo</b> (inspeção física)",
        "Marcação de item como <b>Obrigatório</b> — bloqueia a liberação se não atendido",
        "Campo <b>Critério de aceitação</b> e <b>Orientação</b> para guiar o executor",
        "Opção <b>Exige evidência</b> — operador deve anexar comprovante para concluir",
        "Validação especial do processo: define critérios e periodicidade de revalidação",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(note_box(
        "<b>ISO 9001:2015, 8.5.1 —</b> A organização deve implementar a produção e provisão de serviço "
        "sob condições controladas, incluindo disponibilidade de documentos de informação, "
        "critérios de aceitação e uso de equipamentos adequados."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 2 — CICLOS DE EXECUÇÃO ──────────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Ciclos de Execução", "ISO 8.5.1"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Um <b>ciclo</b> representa uma execução individual do serviço — uma ordem de serviço, lote de fabricação "
        "ou entrega específica para um cliente. Cada ciclo nasce de um modelo, herda seus checkpoints "
        "e percorre quatro estados: <b>Em execução → Aguardando liberação → Liberado</b> "
        "(ou <b>Bloqueado</b> se houver não conformidades impeditivas).",
        ST_BODY,
    ))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/02-ciclos-visao-geral-annotated.png", max_height=70*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Lista de ciclos do modelo selecionado (esquerda) e detalhes do ciclo ativo (direita). "
        "O card em vermelho indica o ciclo <b>Aguardando liberação</b>.",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como abrir um ciclo"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Selecione o <b>Modelo</b> no painel esquerdo.",
        "Clique em <b>Novo ciclo</b>.",
        "Preencha: <b>Título</b>, <b>Ordem / referência</b>, <b>Identificador da saída</b>, <b>Cliente</b> e <b>Unidade</b>.",
        "Vincule os <b>documentos aplicáveis</b> (procedimentos, instruções de trabalho).",
        "Clique em <b>Salvar ciclo</b>. O ciclo inicia em estado <b>Em execução</b>.",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Estados do ciclo"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "<b>Em execução</b> — checkpoints sendo registrados pelo operador",
        "<b>Aguardando liberação</b> — todos os checkpoints atendidos; aguarda aprovação formal",
        "<b>Bloqueado</b> — saída não conforme em aberto impede a liberação",
        "<b>Liberado</b> — liberação formal registrada; ciclo encerrado",
    ]))

    story.append(PageBreak())

    # ── SEÇÃO 3 — CHECKPOINTS E EVIDÊNCIAS ────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Checkpoints e Evidências", "ISO 8.5.1"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Checkpoints são os <b>controles de qualidade em tempo real</b> do ciclo. "
        "Para cada item, o operador informa o status (Atendido, Reprovado ou Pendente), "
        "registra observações e, se exigido pelo modelo, anexa evidências documentais ou fotográficas. "
        "Itens obrigatórios sem evidência bloqueiam a liberação da saída.",
        ST_BODY,
    ))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/03-checkpoints-execucao-annotated.png", max_height=70*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Cards de checkpoints em execução. O primeiro item (em vermelho) mostra <b>Conferência de documentação "
        "técnica</b> com status <b>Atendido</b> e campo de observações.",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como registrar um checkpoint"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "No ciclo aberto, role até a seção <b>Checkpoints do ciclo</b>.",
        "Localize o checkpoint e selecione o <b>status</b>: Atendido, Reprovado ou Pendente.",
        "Preencha o campo <b>Observações</b> se necessário.",
        "Se o item exige evidência, clique em <b>Adicionar anexo</b> e faça o upload.",
        "O progresso é salvo automaticamente a cada interação.",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Critério de aceitação exibido diretamente no card para consulta rápida",
        "Orientação de execução contextual ao item",
        "Upload de múltiplos anexos por checkpoint (documentos, fotos, laudos)",
        "Contador de pendências visível no card do ciclo na lista",
    ]))

    story.append(PageBreak())

    # ── SEÇÃO 4 — SAÍDAS NÃO CONFORMES ───────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Saídas Não Conformes", "ISO 8.7"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Quando o serviço produz uma saída que não atende aos requisitos, "
        "o operador registra uma <b>Saída Não Conforme (NC)</b> dentro do ciclo. "
        "Cada NC recebe título, descrição, impacto, responsável, <b>disposição</b> "
        "(retrabalho, descarte, concessão pelo cliente etc.) e pode ser vinculada a uma "
        "não conformidade sistêmica para ação corretiva formal.",
        ST_BODY,
    ))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/04-nc-outputs-annotated.png", max_height=70*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Seção <b>Saídas não conformes</b> com item registrado (card vermelho: "
        "Desvio dimensional — Flanges DN150, em tratamento) e painel de detalhe.",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como registrar uma saída NC"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "No ciclo, role até <b>Saídas não conformes</b> e clique em <b>Nova ocorrência</b>.",
        "Preencha <b>Título</b>, <b>Descrição</b> da não conformidade e <b>Impacto</b> operacional.",
        "Selecione o <b>Status</b>: Em aberto, Em tratamento ou Resolvido.",
        "Informe a <b>Disposição adotada</b>: retrabalho, descarte, aceite com concessão etc.",
        "Opcionalmente, vincule a uma <b>NC sistêmica</b> existente no módulo de qualidade.",
        "Adicione evidências e clique em <b>Salvar</b>.",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Disposições: Retrabalho, Reparo, Descarte, Aceite com concessão, Uso alternativo",
        "Vínculo com NC sistêmica para rastreabilidade e ação corretiva integrada",
        "Campo de notas de disposição para descrever o tratamento aplicado",
        "NC em aberto aparece no resumo do card e bloqueia a liberação da saída",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(note_box(
        "<b>ISO 9001:2015, 8.7 —</b> A organização deve assegurar que saídas não conformes "
        "com os requisitos sejam identificadas e controladas para prevenir uso ou entrega não intencional. "
        "As ações devem ser registradas com a natureza da não conformidade e as ações tomadas."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 5 — PRESERVAÇÃO, ENTREGA E PÓS-SERVIÇO ─────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Preservação, Entrega e Pós-Serviço", "ISO 8.5.4 / 8.5.5"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Antes de liberar a saída, o operador documenta como o produto/serviço foi <b>preservado e entregue</b> "
        "— método de preservação, embalagem, destinatário, responsável e data. "
        "Após a entrega, eventos de <b>pós-serviço</b> (manutenção, reclamações, assistências) "
        "são registrados para rastreabilidade contínua.",
        ST_BODY,
    ))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/05-preservacao-entrega-annotated.png", max_height=62*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Formulário <b>Preservação e entrega</b> com dados de método, embalagem e entrega preenchidos "
        "(campo em vermelho: informações de entrega ao cliente).",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como registrar preservação e entrega"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "No ciclo, role até <b>Preservação e entrega</b>.",
        "Informe o <b>Método de preservação</b>, data, notas e tipo de acondicionamento.",
        "Preencha o <b>Método de entrega</b>, destinatário, responsável e data.",
        "Adicione evidências de preservação (fotos, laudos) se necessário.",
        "Salve — o registro é exigido para habilitar a liberação da saída.",
    ]))

    story.append(PageBreak())

    story.append(Spacer(1, 2*mm))
    story.append(SubSectionHeader("Pós-serviço"))
    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como registrar evento pós-serviço"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Role até <b>Pós-serviço</b> e clique em <b>Novo evento</b>.",
        "Selecione o <b>Tipo</b>: Reclamação, Assistência técnica, Monitoramento ou Outro.",
        "Defina o <b>Status</b> e preencha a descrição e responsável.",
        "Salve para manter o histórico rastreável no ciclo.",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/06-pos-servico-annotated.png", max_height=60*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Seção <b>Pós-serviço</b> com evento de monitoramento registrado (card vermelho). "
        "Cada evento tem tipo, status e responsável pelo acompanhamento.",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(note_box(
        "<b>ISO 9001:2015, 8.5.4 —</b> A organização deve preservar as saídas durante a produção e "
        "provisão de serviço para assegurar a conformidade com os requisitos. "
        "<b>8.5.5 —</b> A organização deve atender a requisitos para atividades pós-entrega."
    ))

    story.append(PageBreak())

    # ── SEÇÃO 6 — LIBERAÇÃO DA SAÍDA ──────────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(SectionHeader("Liberação da Saída", "ISO 8.6"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "A <b>Liberação da saída</b> é a porta final do ciclo — o ponto em que a organização "
        "autoriza formalmente a entrega ao cliente. O sistema verifica automaticamente se todos os "
        "controles foram satisfeitos: checkpoints obrigatórios com evidência, ausência de NCs em aberto "
        "e preservação/entrega registrada. Qualquer pendência é exibida como bloqueio impeditivo.",
        ST_BODY,
    ))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/07-liberacao-annotated.png", max_height=62*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Seção <b>Liberação da saída</b> com lista de <b>Pendências impeditivas</b> em destaque vermelho. "
        "Enquanto houver bloqueios, o sistema exige resolução antes de permitir a liberação.",
        ST_CAPTION,
    ))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Como registrar a liberação"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Certifique-se de que todos os checkpoints obrigatórios estão atendidos com evidências.",
        "Resolva todas as Saídas Não Conformes abertas.",
        "Preencha o registro de <b>Preservação e entrega</b>.",
        "Role até <b>Liberação da saída</b>. Se não houver pendências, o campo de decisão estará ativo.",
        "Selecione a <b>Decisão</b> (Liberar saída) e preencha a <b>Justificativa</b>.",
        "Adicione pelo menos um <b>anexo</b> como evidência da liberação.",
        "Clique em <b>Registrar liberação</b>. O ciclo muda para estado <b>Liberado</b>.",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(label_tag("Bloqueios impeditivos verificados automaticamente"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Checkpoints obrigatórios sem evidência anexada",
        "Checkpoints com status <b>Reprovado</b>",
        "Saídas não conformes com status <b>Em aberto</b>",
        "Registro de preservação e entrega ainda não preenchido",
    ]))

    story.append(Spacer(1, 2*mm))
    story.append(note_box(
        "<b>ISO 9001:2015, 8.6 —</b> A organização deve implementar arranjos planejados em estágios "
        "apropriados para verificar que os requisitos de produtos e serviços tenham sido atendidos. "
        "A liberação ao cliente não deve ocorrer antes que todos os arranjos planejados tenham sido "
        "satisfatoriamente concluídos. Devem ser retidas informações documentadas sobre a liberação."
    ))

    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build()
