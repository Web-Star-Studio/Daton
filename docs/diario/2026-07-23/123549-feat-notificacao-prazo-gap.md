---
hora: "12:35"
autor: João Pedro
branch: feat/notificacao-prazo-gap
modulo: Aprendizagem
titulo: Escalonamento de prazo de gap vencido — notificação ao admin (Fase 2)
---

## Escalonamento de prazo de gap vencido — notificação ao admin (Fase 2)

**O que foi feito:** entrega da Fase 2 do pedido de acompanhamento de gap — quando o prazo de regularização de um gap (escolaridade ou competência do cargo) vence sem o requisito ter sido atendido, os administradores da organização passam a receber uma notificação in-app (sino) e um e-mail avisando.

**Por quê:** fecha o terceiro ponto do pedido original da cliente ("o perfil do adm precisa receber que este funcionário continua com gap"), que havia ficado deliberadamente fora da Fase 1 (PR #201) para manter aquela entrega revisável.

**Mecanismo:** reaproveita o mesmo job diário (cron) já existente para avisar sobre planos de ação vencidos — mesma arquitetura, mesmo canal de notificação (sino + e-mail via Resend), horário deslocado 30 minutos para não competir com o job de planos de ação. Um envio por colaborador/administrador/dia (não por requisito individual), para não inundar o admin quando um colaborador acumula vários gaps vencidos ao mesmo tempo.

**Cuidado técnico relevante:** a resolução automática de prazos (self-healing) da Fase 1 só roda quando alguém abre a ficha do colaborador. A escalação recalcula a situação real do colaborador no momento do envio antes de decidir notificar — evita avisar sobre algo que já foi corrigido só porque ninguém revisitou a ficha, e nunca notifica (nem resolve) quando há ambiguidade nos dados (por exemplo, um cargo renomeado que deixou de casar com o texto livre do colaborador).

**Impacto/área afetada:** módulo Aprendizagem. Sem alteração de banco de dados (reaproveita a tabela de notificações e a tabela de prazos já existentes). Sem mudança visual nova além do roteamento do sino de notificações, que já existe.

**Status:** concluído. PR #202 aberto em modo draft (`feat/notificacao-prazo-gap`), baseado direto em `main` (as Fases 1 já estão mergeadas). Aguardando revisão/aprovação.

**Validações:**
- `pnpm typecheck` (raiz — libs + web + api-server + e2e) sem erros.
- 6 testes de integração novos cobrindo: notificação com proteção contra duplicidade no mesmo dia; múltiplos gaps do mesmo colaborador consolidados em uma única notificação; autocura antecipada (gap já resolvido mas ainda não refletido no banco); cargo renomeado (nem notifica nem resolve por ambiguidade); múltiplos administradores recebendo cada um sua notificação; prazo ainda dentro do prazo não é escalado.
- Sem regressão: suíte completa de colaboradores/competências (Fase 1) e a suíte de escalonamento de planos de ação (mecanismo espelhado) continuam passando.
