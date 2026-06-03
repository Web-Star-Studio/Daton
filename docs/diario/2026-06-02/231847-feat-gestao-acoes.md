---
hora: "23:18"
autor: João Pedro
branch: feat/gestao-acoes
modulo: Gestão de Ações
titulo: Escalonamento automático de ações vencidas
---

- **O que:** Escalonamento automático de ações vencidas: novo "pass" diário no agendador (governance-scheduler) que varre ações com prazo vencido e ainda não concluídas/canceladas, notifica o responsável (notificação in-app + e-mail), registra o evento "escalonada" no log de auditoria da ação e é idempotente por dia. A notificação leva direto à ficha pelo sino.
- **Por quê:** Garantir o tratamento dentro do prazo e a rastreabilidade do escalonamento — exigência de um SGI auditável.
- **Impacto/área:** `artifacts/api-server/src/lib/governance-scheduler` e `services/action-plans/escalation`; `artifacts/web` (roteamento da notificação `action_plan` no painel do sino).
- **Status:** concluído.
- **Validação:** `pnpm typecheck`/`pnpm build` verdes; reaproveita o padrão já validado de alertas de documentos regulatórios (notificação + e-mail, dedupe por dia, run-lock).
