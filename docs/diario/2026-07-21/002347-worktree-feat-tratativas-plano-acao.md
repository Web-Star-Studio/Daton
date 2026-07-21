---
hora: "00:23"
autor: João Pedro
branch: worktree-feat-tratativas-plano-acao
modulo: Planos de Ação
titulo: Tratativas estruturadas + ações rastreáveis (PR #184)
---

## Tratativas estruturadas + ações rastreáveis no Plano de Ação (PR #184, mergeado)

**O que foi feito.** Entregue e publicado na `main` (PR #184) o desdobramento do Plano de Ação em: (1) **8 métodos de análise de causa** ("tratativas") estruturados e configuráveis por empresa — 5 Porquês, Ishikawa, A3, FMEA, Árvore de Falhas, Kepner-Tregoe, RCA Apollo e Análise de Barreiras, cada um com editor próprio e vocabulário fechado onde cabe; e (2) **N ações rastreáveis por plano** ("+ Incluir ação"), cada uma um 5W2H com responsável (usuário do sistema) e prazo (data), entrando em "Suas Pendências" e vencendo sozinha.

**Por quê.** A cliente apontou que analisar o problema só por "causa raiz" (5 Porquês) era pouco, e que um plano precisa comportar várias ações — não uma só.

**Reconciliação.** O ramo foi conciliado com entregas paralelas que chegaram à `main` durante o desenvolvimento (origem na criação #154, `effectiveness_method_id` #156, ponto focal + co-responsáveis #158, além de correções de Aprendizagem #181/#185/#186). Conflitos resolvidos preservando ambos os lados (as ações-item e os co-responsáveis coexistem).

**Segurança.** A revisão de IA encontrou uma escalada de privilégio introduzida por uma correção intermediária: quem executava uma única ação ganhava escrita no plano inteiro. Refeito com **menor privilégio** — o responsável de ação lê a ficha e conclui apenas a ação dele; editar/excluir o plano e as ações de terceiros permanece restrito. Coberto por teste de integração.

**Banco / deploy.** DDL aditivo (novo enum, tabelas `action_plan_analysis_methods` e `action_plan_actions`, coluna `analyses`, 3 valores de enum de atividade) aplicado à produção **antes** do merge, em versão guardada e idempotente. Após o merge, executado o **backfill** idempotente que converte os blocos legados (`root_cause_whys` → tratativa "5 Porquês"; `plan_5w2h` → primeira ação), preservando o "quem/quando" de texto livre nas observações. Campos legados mantidos como rede de rollback.

**Validações.** `pnpm typecheck` e `pnpm build` limpos; testes de integração de acesso, ações e pendências no verde; consistência da produção conferida após o backfill.

**Follow-up.** Registrados na issue #187 os ~30 apontamentos P2/P3 remanescentes dos revisores (edge cases, acessibilidade, cache e correções de robustez de autosave) — nenhum de segurança.
