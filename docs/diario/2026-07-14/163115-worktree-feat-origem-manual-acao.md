---
hora: "16:31"
autor: João Pedro
branch: worktree-feat-origem-manual-acao
modulo: Gestão de Ações
titulo: Escolha da origem ao criar ação dentro do módulo
---

## Escolha da origem ao criar ação dentro do módulo de Gestão de Ações

**O que foi feito.** Ações criadas dentro do próprio módulo (botão "Nova ação" do hub) nasciam sempre com a origem genérica `manual`, sem que o usuário pudesse declarar o que motivou a ação. Agora o diálogo de criação exibe um campo **Origem**, obrigatório, com três opções: **Melhoria de Processo** (padrão), **Corretiva** e **Não atendimento a requisito da norma**. A origem escolhida sugere automaticamente o **Tipo** da ação (que segue editável), o que também acerta o prefixo do código gerado (`AM-` para melhoria, `AC-` para corretiva).

**Por quê.** Nem todo plano de ação nasce de uma entidade do sistema (indicador, fator SWOT, não conformidade). Sem a escolha de origem, todas as ações criadas no módulo ficavam agrupadas sob um rótulo genérico, inutilizando o filtro por origem e o painel de distribuição por origem para esse conjunto.

**Impacto / área afetada.**
- Módulo Gestão de Ações: diálogo de criação, listagem (badge e filtro "Origem"), ficha do plano e painel executivo (barras por origem, cada uma com cor própria) — os três últimos passaram a exibir as origens novas sem código adicional, por serem dirigidos pelo mesmo enum.
- Criação de ações a partir dos demais módulos (indicadores, SWOT, não conformidade, auditoria, riscos, ambiental/LAIA, treinamento, análise crítica, segurança viária): **sem alteração de comportamento**.
- A origem `manual` foi mantida como valor legado (segue rotulada e filtrável, apenas deixou de ser oferecida na criação). Nenhum dado foi migrado.

**Correções colaterais identificadas em revisão.**
- Ordem do enum de origem ajustada para respeitar o padrão *append-only*: com os valores novos inseridos no meio da lista, um `drizzle-kit push` futuro dropava e recriava o tipo no banco (com bloqueio exclusivo da tabela) apenas para reordenar. Comprovado em banco de teste e corrigido.
- A validação de origem passou a ter checagem de exaustividade: antes, uma origem futura sem tratamento explícito seria aceita **sem validar a entidade vinculada** — inclusive apontando para entidade de outra organização — sem quebrar a compilação. Agora o build falha, forçando o tratamento.
- Infraestrutura de testes: o comando oficial de testes unitários não carrega arquivo de ambiente, de modo que qualquer teste que importasse a camada de banco falhava já na importação. Corrigido com um valor padrão local de `DATABASE_URL`, o que também restaurou um teste que já estava quebrado na branch principal.

**Status.** Entregue em pull request (draft) para revisão. DDL do enum já aplicada no banco de produção (operação aditiva: nenhuma linha reescrita, nenhum bloqueio de tabela), pois é pré-requisito do deploy da API. Ordem de deploy documentada no PR: banco → API → front.

**Validações.** `pnpm typecheck` sem erros. Testes unitários do backend: 177/177. Testes do front referentes à feature: 12/12. Teste de integração ponta a ponta (criação com origem nova, rótulo de contexto na ficha e filtro da listagem): 3/3. Feature verificada manualmente na interface, com a aplicação da branch executada localmente.

**Decisão de escopo.** A lista de origens permanece **fixa** no sistema, e não como catálogo gerenciável por empresa: avaliado e descartado nesta entrega. Novas origens, se necessárias, serão acrescentadas pontualmente.
