---
hora: "13:55"
autor: João Pedro
branch: fix/quebra-linha-nome-competencia
modulo: Aprendizagem
titulo: Nome longo de competência quebra em várias linhas
---

## Aprendizagem — Nome longo de competência quebra em várias linhas

**O que foi feito:** Na aba "Cargos e competências", o nome de competências longas era cortado com reticências ("…"). Passou a **quebrar em várias linhas**, exibindo o texto inteiro (ex.: "CONHECIMENTO EM REDES DE COMPUTADORES, SISTEMAS OPERACIONAIS…").

**Por quê:** Pedido da cliente para leitura do nome completo na matriz de competências por cargo.

**Área afetada:** Frontend (Aprendizagem → Cargos e competências). Ajuste puramente visual (CSS), sem alteração de lógica ou banco de dados. Linhas de nome curto seguem idênticas.

**Status:** Concluído e integrado à main (PR #192, merge squash). Revisão automática sem apontamentos.

**Validações:** `pnpm typecheck` (raiz) verde; verificação visual pela cliente na base real, confirmada OK.
