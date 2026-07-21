---
hora: "12:45"
autor: João Pedro
branch: worktree-multi-vincular-competencia
modulo: Aprendizagem
titulo: Vincular múltiplas competências ao cargo de uma vez
---

## Aprendizagem — Vincular múltiplas competências ao cargo de uma vez

**O que foi feito:** No módulo Aprendizagem, aba "Cargos e competências", o fluxo de "Vincular competência" passou a permitir selecionar **várias competências de uma só vez**. O seletor agora é de múltipla escolha (com busca e criação de competência nova na hora), mantém-se aberto para seleção contínua e mostra as escolhidas como etiquetas removíveis. Define-se um único nível para todo o lote e vincula-se tudo em uma ação; o nível pode ser ajustado por competência depois.

**Por quê:** Pedido da cliente para agilizar o cadastro da matriz de competências por cargo — antes era necessário vincular uma competência por vez.

**Detalhes/decisões:**
- O tipo (CHA) continua sendo atributo da competência (catálogo): competências já existentes mantêm o tipo do catálogo; o seletor de tipo só aparece quando o lote inclui competências novas a criar. O lote compartilha apenas o **nível**.
- Competências já vinculadas ao cargo ficam fora do seletor; quando o usuário tenta vincular algo já existente, o sistema dá um aviso claro em vez de simplesmente não fazer nada.
- Componente reutilizável novo de múltipla seleção, com testes unitários da normalização (deduplicação e exclusão das já vinculadas) e do comportamento do formulário.

**Área afetada:** Frontend (Aprendizagem → Cargos e competências). Sem alteração de banco de dados.

**Status:** Concluído e integrado à main (PR #190, merge squash). Revisão automática endereçada (ajuste de feedback ao vincular competência já existente).

**Validações:** `pnpm typecheck` (raiz) verde; testes unitários afetados passando; verificação end-to-end em ambiente local isolado (login → cargo → aba Competências → vínculo em lote confirmado na tela e no banco), sem tocar em produção.
