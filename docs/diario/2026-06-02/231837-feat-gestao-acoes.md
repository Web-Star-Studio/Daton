---
hora: "23:18"
autor: João Pedro
branch: feat/gestao-acoes
modulo: Gestão de Ações
titulo: Dashboards executivo, operacional, auditoria e eficácia
---

- **O que:** Dashboards do módulo em abas: **Executivo** (taxa de eficácia, prazo médio de conclusão, GUT médio, distribuição por origem e por tipo, ações por ODS, evolução da eficácia em 6 meses), **Operacional** (distribuição GUT por relevância, distribuição por prioridade e painel de alertas/escalonamentos clicáveis), **Auditoria** (cobertura de requisitos normativos e rastreabilidade do tratamento) e **Eficácia** (painel eficaz/não eficaz/aguardando, evolução e critérios determinísticos de verificação). Endpoint server-side de agregados.
- **Por quê:** Dar visão executiva e operacional do tratamento, como no protótipo, sempre a partir de dados reais — sem IA, por regras auditáveis.
- **Impacto/área:** `artifacts/web/src/pages/app/planos-acao/_components` (action-tabs, lista-screen, painel-executivo, painel-operacional, auditoria-screen, eficacia-screen, mini-charts) e o serviço de summary no `artifacts/api-server`.
- **Status:** concluído.
- **Validação:** `pnpm typecheck`/`pnpm build` verdes; testado no navegador (Playwright) — as 4 abas renderizando com dados reais (screenshots).
