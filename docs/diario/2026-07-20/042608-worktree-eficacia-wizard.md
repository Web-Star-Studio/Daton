---
hora: "04:26"
autor: João Pedro
branch: worktree-eficacia-wizard
modulo: Aprendizagem
titulo: Avaliação de eficácia: wizard do início ao fim e rascunho salvo
---

Reconstrução do fluxo de **Avaliação de Eficácia** de treinamentos (módulo Aprendizagem), em duas frentes: o fluxo, que estava interrompido, e a apresentação, que estava aquém do protótipo aprovado.

**Problema.** Ao acionar "Iniciar avaliação", o registro apenas mudava para a coluna "Em avaliação" e devolvia o avaliador ao quadro — o formulário nunca era aberto. Era necessário localizar o registro na coluna intermediária e acionar um segundo botão para avaliar de fato. Não havia salvamento parcial: fechar a janela descartava todo o preenchimento. Além disso, as notas individuais por critério nunca eram gravadas — somente a média derivada —, de modo que uma avaliação registrada não permitia identificar qual critério recebeu qual nota, lacuna relevante para rastreabilidade de auditoria.

**O que foi entregue.**
- Os dois diálogos desconexos foram unificados em um wizard de três passos (Contexto → Critérios → Resultado). Concluir o primeiro passo grava papel do avaliador e prazo e segue diretamente para os critérios. Registros já atribuídos abrem direto no passo de critérios.
- Introduzido salvamento de rascunho no servidor: fechar o wizard no meio preserva o preenchimento e reabrir retoma de onde parou. O rascunho não conclui a avaliação — não entra em "Concluídas", não gera nota e não concede competência ao colaborador. A coluna "Em avaliação" passa a indicar preenchimento efetivamente em andamento.
- As notas por critério passaram a ser persistidas, corrigindo a lacuna de rastreabilidade.
- Apresentação alinhada ao protótipo: indicador de etapas, critérios agrupados por nível Kirkpatrick e escala rotulada por critério (o critério de resultado passa a medir direção da mudança, e não frequência).

**Impacto.** Módulo Aprendizagem — tela de Avaliação de eficácia, rotas de treinamentos e tabela `training_effectiveness_reviews`.

**Status.** PR #176 aberto em rascunho, não mergeado. Requer DDL de produção (duas colunas aditivas e um índice), ainda pendente de autorização; a alteração é não destrutiva e preserva o significado de todos os registros existentes.

**Validações.** `pnpm typecheck` aprovado. Vinte e nove testes de integração de eficácia aprovados, incluindo quatro novos cobrindo o rascunho, verificados por falseamento. Testes unitários da página e da camada de servidor aprovados. Três falhas remanescentes da suíte de integração foram verificadas como pré-existentes na base, sem relação com esta entrega.
