---
hora: "21:45"
autor: João Pedro
branch: kpi-lancamento-grafico
modulo: KPI
titulo: Gráfico de gestão à vista no lançamento de indicador
---

## Gráfico de gestão à vista no lançamento de indicador (KPI)

**O que foi feito:** adicionado um gráfico de evolução mensal — linha de **Resultado** (colorida pelo semáforo) versus linha tracejada de **Tolerância** — dentro do painel "Histórico" da aba *Lançar* de um indicador. Agora é possível acompanhar a tendência e fazer gestão à vista durante o próprio lançamento, sem precisar abrir o dashboard. O ponto do mês selecionado na grade de meses é destacado no gráfico, ligando a tabela ao gráfico.

**Por quê:** atendimento a pedido da cliente — visão imediata do comportamento do indicador frente à tolerância no momento de lançar o valor.

**Como:** criado componente reutilizável `MonthlyTrendChart` (`artifacts/web/src/pages/app/kpi/_components/monthly-trend-chart.tsx`), baseado no gráfico já existente do painel "Evolução dos indicadores em destaque". O `EvolutionPanel` (dashboard) foi refatorado para consumir o mesmo componente, eliminando ~100 linhas de configuração de recharts duplicada e mantendo o visual idêntico entre dashboard e tela de lançamento. No histórico da tela de lançamento, o mini-sparkline anterior foi substituído pelo gráfico completo (eixos Jan–Dez, valores cientes da unidade — %, KG, R$ —, tooltip por mês e legenda). O componente `Sparkline` permanece em uso nos cards de indicador.

**Impacto/área:** módulo KPI (frontend). Arquivos: `lancar-screen.tsx` (aba Lançar), `evolution-panel.tsx` (dashboard) e novo `monthly-trend-chart.tsx`. Sem alterações de backend ou de schema.

**Status / validações:** implementado e validado com `pnpm exec tsc --noEmit` no `@workspace/web` (sem erros). Pendente de teste manual pela cliente e posterior merge.
