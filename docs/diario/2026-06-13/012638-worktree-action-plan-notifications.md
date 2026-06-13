---
hora: "01:26"
autor: Aimlock
branch: worktree-action-plan-notifications
modulo: Gestão de Ações
titulo: Notificações de atribuição (responsável + avaliador) e trava de veredito de eficácia
---

## Gestão de Ações — Notificações de atribuição e governança da verificação de eficácia (PR #95)

**O que foi feito**
- **Responsável**: ao atribuir (ou reatribuir) uma ação, o responsável passa a receber notificação no app e e-mail, com link direto para a ação. Antes só havia aviso quando a ação vencia. Adicionado o filtro "Atribuídas a mim" na lista de ações.
- **Avaliador de eficácia**: notificação (in-app + e-mail) ao ser designado; novo escalonamento automático cobra o avaliador quando o prazo de verificação vence sem veredito (apenas em ações concluídas/`completed` sem parecer).
- **Segregação de funções (ISO 9001 10.2)**: a designação do avaliador passou a ser ato exclusivo do SGI (admin); o avaliador deve ser diferente do responsável; e analistas (somente leitura) não podem ser avaliadores.
- **Trava de veredito**: somente o avaliador designado (ou um admin) pode emitir, alterar ou limpar o veredito Eficaz/Não eficaz. O frontend oculta os botões e desabilita o seletor de avaliador para quem não tem permissão.

**Por quê**
- Dúvida da cliente: como o responsável recebe a pendência e como funciona o avaliador. Identificou-se que não havia aviso na atribuição e que o controle de eficácia podia ser autoaprovado por qualquer usuário com escrita.

**Impacto/área**
- Backend (`routes/action-plans.ts`, `services/action-plans/notify-assignment.ts`, `escalation.ts`, `serializers.ts`, `governance-scheduler.ts`) e frontend (ficha da ação, painel de eficácia, lista). Sem migração de banco e sem regeneração de API.

**Status e validações**
- Mergeado no `main` (commit squash `#95`). `pnpm typecheck` e testes unitários de action-plans/notifications verdes. CI do PR verde (typecheck, CodeQL, cubic). Seis apontamentos P2 do Codex endereçados durante a revisão.
