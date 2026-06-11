---
hora: "17:09"
autor: João Pedro
branch: fix/lista-acoes-prazo-alinhamento
modulo: Gestão de Ações
titulo: Alinhamento da coluna Prazo na lista de ações (algarismos de largura fixa)
---

Correção visual na **lista de planos de ação**, apontada pela cliente: as datas da coluna **Prazo** apareciam com tamanhos/larguras ligeiramente diferentes e desalinhadas entre as linhas. Entregue via PR #93 (squash em `main`).

**O que foi feito**
- A coluna **Prazo** passou a usar **algarismos de largura fixa** (tabular numbers). Antes, a fonte usava dígitos de largura proporcional (o "1" é mais estreito que os demais), então datas como 30/06/2026 e 31/12/2026 tinham larguras diferentes e os números não se alinhavam de uma linha para a outra. Agora toda data ocupa exatamente o mesmo espaço e fica alinhada — mesmo recurso já usado na coluna GUT. Aplicado também à data da lista de "Ações da Governança", por consistência.

**Por quê:** pedido direto da cliente ("não estão no mesmo tamanho").

**Impacto/área:** módulo Gestão de Ações — apenas frontend (ajuste de estilo, 2 linhas).

**Status:** concluído e integrado ao `main` (PR #93 mergeado).

**Validações:** `pnpm typecheck` (libs + api-server + web + e2e) verde; CI verde (typecheck + CodeQL); revisor automático (cubic) sem apontamentos ("No issues found").
