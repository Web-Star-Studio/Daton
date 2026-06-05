---
hora: "09:46"
autor: João Pedro
branch: kpi-lancamento-grafico
modulo: KPI
titulo: Gráfico de gestão à vista no lançamento — homologado e mergeado (PR #85)
---

## Gráfico de gestão à vista no lançamento (KPI) — homologado e mergeado

Continuação da entrada anterior do mesmo dia. Após validação manual do cliente na aba *Lançar*:

- **Correções aplicadas na homologação:** (1) o eixo X passou a exibir os **12 meses** — o recharts estava ocultando rótulos na coluna estreita (`interval={0}`); (2) a **linha de tolerância** ficou sempre visível — o domínio do eixo Y foi fixado para incluí-la (base em 0), pois o domínio automático a recortava quando a meta caía fora da faixa dos valores lançados.
- **Merge:** PR #85 → `main` (squash), commit `6ac5b25`. Check obrigatório `pnpm typecheck` verde na CI (CodeQL e cubic também passaram). Branch atualizada com a `main` (incorporando o #84) antes do merge.
- **Status:** entregue em produção (`main`). Sem alterações de backend ou de schema.
