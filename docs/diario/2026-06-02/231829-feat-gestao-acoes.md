---
hora: "23:18"
autor: João Pedro
branch: feat/gestao-acoes
modulo: Gestão de Ações
titulo: Fundação de dados do hub (schema + API)
---

- **O que:** Reestruturação do modelo de dados do módulo de Planos de Ação para transformá-lo no hub central de tratamento ("Gestão de Ações"). Novas colunas em `action_plans` (código sequencial AC-AAAA-NNN, tipo da ação, priorização GUT G·U·T, plano 5W2H, causa-raiz/5 porquês, bloco de avaliação de eficácia, vínculos a ODS e normas, indicadores/riscos relacionados) e duas tabelas-filhas novas: comentários e log de auditoria (append-only, com snapshot do autor). Novos endpoints (resumo/summary, comentários, log de atividade) e contrato OpenAPI atualizado com regeneração dos clientes.
- **Por quê:** O módulo era um CRUD enxuto; o cliente pediu uma versão robusta e auditável (pronta para ISO), puxando o máximo de dados do sistema para reduzir digitação.
- **Impacto/área:** `lib/db` (schema action-plans), `lib/api-spec` (OpenAPI) + clientes gerados (api-zod, api-client-react), `artifacts/api-server` (rotas e serviços de action-plans: source-context, serializers, derivation, code, summary, activity).
- **Status:** concluído (implementação). Pendente: push do schema para a base de produção — alterações aditivas, já validadas como seguras em Postgres local.
- **Validação:** `pnpm typecheck` (todos os pacotes) e `pnpm build` verdes; testes unitários dos helpers (GUT, diff de auditoria); migração aplicada com sucesso em Postgres real (drizzle push) e endpoints exercitados via API.
