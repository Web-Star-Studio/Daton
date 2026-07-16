---
hora: "12:20"
autor: João Pedro
branch: worktree-feat-visibilidade-por-papel-acoes
modulo: Ações
titulo: Cobertura de teste da derivação de filial (deriveActionPlanUnit)
---

## Cobertura de teste da derivação de filial em Ações (`deriveActionPlanUnit`)

**Contexto:** dentro da feature de visibilidade por papel em Ações (Task 2 do plano), a revisão
apontou que o teste de integração de `deriveActionPlanUnit` só cobria os caminhos `manual` e `swot`.
Os outros 4 caminhos que realmente derivam filial da entidade de origem — `kpi` (2 ramos:
`kpiIndicatorId` e `kpiMonthlyValueId`), `risk`, `environmental` e `training` — não tinham teste
nenhum, deixando a fundação da feature sem cobertura na maior parte dos casos de uso reais.

**O que foi feito:**
- Acrescentados 5 testes de integração (com sub-casos "com filial" e "corporativo/null" onde o custo
  era baixo) em `derive-unit.integration.test.ts`, semeando as entidades de origem reais: indicador
  KPI, year config + valor mensal, item de risco (via plano estratégico), avaliação LAIA e
  treinamento de colaborador.
- **Achado colateral:** `laia_assessments` não estava na rotina de limpeza de teste
  (`e2e/support/cleanup.ts`). Como `created_by_id`/`updated_by_id` referenciam `users` sem cascade e
  a limpeza apaga os usuários antes da organização, o primeiro teste do caminho `environmental`
  quebrava o `afterEach` com violação de FK. Corrigido com a mesma técnica já usada para
  `swot_factors` (delete explícito por `organizationId`, antes dos usuários).
- Nenhuma alteração em `derive-unit.ts` — a implementação já estava aprovada; só os testes e o
  helper de limpeza foram tocados.

**Validação:** `TEST_ENV=integration pnpm exec vitest run --project integration
artifacts/api-server/tests/services/action-plans/derive-unit.integration.test.ts` — 9/9 testes
passando, sem warnings. `pnpm typecheck` limpo em todo o monorepo.

**Status:** concluído nesta sessão (worktree `feat-visibilidade-por-papel-acoes`), commit local
`65f989bb`. DDL de produção da feature (coluna `action_plans.unit_id`) segue pendente de autorização,
como já registrado nas entradas anteriores desta feature.
