---
hora: "19:07"
autor: Aimlock
branch: feat/kpi-justificativa-visivel
modulo: KPI
titulo: Justificativa resolve pendência de desvio e fica visível no mês
---

## Contexto

Feedback da cliente (Transgabardo): ao registrar uma justificativa para um indicador fora da tolerância, a tela de lançamento de KPI continuava acusando a pendência de "registre justificativa e plano de ação", como se nada tivesse sido feito. Além disso, a cliente pediu para visualizar a justificativa já registrada diretamente ao selecionar o mês, sem precisar abrir o diálogo.

## O que foi feito

- **Correção da pendência fantasma:** a caixa âmbar do formulário renderizava apenas com base no status vermelho do resultado e ignorava as contagens de justificativas/planos. Agora respeita o estado real do mês — uma justificativa OU um plano de ação já resolve a pendência (nem todo desvio exige plano de ação).
- **Justificativa visível no mês:** novo painel azul "tratativa registrada" exibe inline o texto da última justificativa, com autor e data, ao selecionar o mês.
- **Histórico:** meses com tratativa ganham marcador (ícone azul) e tooltips explicativos.
- **Microcópia ajustada:** "Requer justificativa ou plano de ação" e instrução de clicar no mês marcado.
- **Backend:** contagem de planos de ação por mês passa a excluir cancelados (plano cancelado não é tratativa; concluído continua contando).

## Por quê

A regra de negócio do SGI (ISO 9001 9.1.3 / 10.1) é que um desvio pode ser tratado por justificativa pontual OU plano de ação. A UI anterior tratava apenas o plano como tratativa válida e não dava visibilidade às justificativas registradas, gerando retrabalho e confusão para a cliente.

## Impacto / área afetada

Módulo KPI — tela de lançamento (frontend) e endpoint de dados anuais (backend). Sem migração de dados.

## Status e validações

- Concluído. PR #91 aberto para `main` (branch `feat/kpi-justificativa-visivel`).
- `pnpm typecheck` OK; testes node-unit 67/67 OK.
- Revisão multi-agente adversarial (correctness / ux-regression / data-shape): 5 achados confirmados e corrigidos, incluindo o filtro de planos cancelados.
- Validação visual em runtime pulada a pedido; cenário-alvo confirmado contra dado real no banco (indicador "Material Reciclável", Fev/2026, fora da tolerância com justificativa).
