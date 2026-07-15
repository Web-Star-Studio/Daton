---
hora: "15:21"
autor: João Pedro
branch: worktree-feat-origem-manual-acao
modulo: Gestão de Ações
titulo: Filtros da listagem + atalhos dos painéis
---

## Filtros da listagem de Gestão de Ações + atalhos dos painéis

**O que foi feito.** A aba Lista do hub de Gestão de Ações filtrava apenas por busca textual, status, origem e responsável. Ganhou quatro filtros novos: **Tipo** (corretiva/preventiva/melhoria), **Prioridade**, **Eficácia** (Eficaz / Não eficaz / Aguardando verificação) e **Prazo** (Vencidas / Vencendo em 7 dias). A barra também passou a exibir um **contador de resultados** e um botão **"Limpar filtros"** (na barra e no estado vazio), alinhando-a ao padrão já usado em Indicadores e Documentos.

Além disso, os números que antes eram becos sem saída viraram **atalhos**: clicar nos cards "Vencidas"/"Vencendo" da Lista, ou nos indicadores "Eficazes"/"Não eficazes"/"Aguardando" da aba Eficácia, leva o usuário direto à listagem já filtrada pelo critério correspondente.

**Por quê.** Vários campos que o usuário precisa cruzar já apareciam como coluna ou como número em painel, mas sem caminho para a lista. O caso mais crítico era a eficácia: o painel mostrava "N ações aguardando verificação" sem nenhuma forma de descobrir quais eram.

**Impacto / área afetada.** Módulo Gestão de Ações — aba Lista (filtros, contador, atalhos) e aba Eficácia (tiles clicáveis). As abas Executivo, Operacional e Auditoria não foram alteradas. A criação de ações e as demais telas do sistema não são afetadas.

**Decisão técnica.** Os filtros novos são aplicados no servidor (não em memória), reutilizando exatamente o mesmo critério de data e de estado que já alimenta os cards do topo. Isso garante, por construção, que o número exibido no card e a quantidade de linhas da lista nunca divirjam — evitando o clássico "o card diz 12, a lista mostra 11".

**Ajuste de consistência (revisão).** O filtro "Aguardando verificação" foi alinhado ao critério canônico já usado no restante do sistema (ação concluída ainda sem veredito, considerando os dois estados equivalentes de "sem veredito"), de modo que o tile do painel e a lista filtrada contem sempre o mesmo conjunto. O bloco de ações da Governança (somente leitura) passa a se ocultar sob filtros que não se aplicam a ele, e a busca textual é limpa ao usar um atalho de card, evitando divergências visuais.

**Status.** Entregue na mesma branch/PR (draft) da funcionalidade de origem das ações, empilhada sobre ela. Sem mudança de banco de dados: usa apenas parâmetros novos de consulta.

**Validações.** `pnpm typecheck` sem erros. Teste de integração dos filtros (tipo, eficácia com os dois estados de "aguardando", prazo vencidas/vencendo, exclusão de concluídas/canceladas do "vencidas", combinação com AND): 6/6. Testes de unidade do front (helpers de filtro e atalhos dos tiles): 7/7. Revisão de código independente do diff completo aprovou a entrega, com os apontamentos menores já corrigidos.
