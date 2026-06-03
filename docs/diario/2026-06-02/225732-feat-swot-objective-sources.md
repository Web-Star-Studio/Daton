---
hora: "22:57"
autor: João Pedro
branch: feat/swot-objective-sources
modulo: SWOT
titulo: SWOT v2: objetivo por fonte (KPI/SWOT) + popup + dashboard Matriz Viva
---

- **O que:** Evolução da SWOT (PR #82): (1) o **objetivo do fator** passou a vir de **fonte plugável** — KPI ou SWOT — via vínculo polimórfico (`objectiveSource` + `objectiveSourceId`); (2) **popup de exclusão estilizado** no lugar do `confirm()` nativo do navegador; (3) **dashboard "Matriz Viva"** ao abrir um quadrante: matriz 4×4 Performance×Relevância como herói clicável que cross-filtra KPIs, distribuição (por risco/perspectiva) e a lista acionável (editar / criar ação) — tudo no design system.
- **Por quê:** Pedido da cliente (Ana): reaproveitar no SWOT os objetivos já cadastrados no KPI; e a visualização anterior estava "tabela tabela" / com scroll feio — pedido de algo mais visual/BI.
- **Impacto/área:** Módulo SWOT (Organização) + Planos de Ação. Schema **aditivo** no Neon (`objective_source`/`_id`, mantendo `objective_id`), OpenAPI + codegen, frontend (página + dashboard `_components/swot-quadrant-dashboard.tsx`).
- **Status:** PR #82 aberta (não mergeada); schema aditivo já aplicado no Neon; conceito do dashboard escolhido via painel de design (3 conceitos → síntese).
- **Validação:** `pnpm typecheck` (todos os pacotes + e2e); testes da metodologia 9/9; duas revisões adversariais (achados P1/P2/P3 corrigidos).
