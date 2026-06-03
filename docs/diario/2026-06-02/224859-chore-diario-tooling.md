---
hora: "22:48"
autor: João Pedro
branch: chore/diario-tooling
modulo: Diário de bordo
titulo: Modelo de fragmentos (branch dedicado)
---

- **O que:** Novo modelo do diário de bordo **à prova de conflito** — branch dedicado `diario` (orphan) com **um fragmento por entrada** (`docs/diario/<dia>/<HHMMSS>-<branch>.md`), em vez de um único arquivo editável por dia. Scripts `diario-add.py` (grava o fragmento no branch `diario` via worktree temporário + commit + push com rebase-retry, de qualquer branch de trabalho) e `diario-build.py` (concatena o dia em MD/PDF). Convenção em `docs/diario/README.md`; regra atualizada no `CLAUDE.md`.
- **Por quê:** Múltiplas sessões em branches diferentes alimentavam o mesmo arquivo do dia → conflito de merge e coordenação manual. Com um arquivo por entrada, não há colisão; e cada entrada fica versionada (autor/branch/hora) — melhor trilha de auditoria.
- **Impacto/área:** Processo/tooling de diário. `scripts/diario-add.py`, `scripts/diario-build.py`, `scripts/gen-diario-pdf.py`, `docs/diario/README.md`, `CLAUDE.md`.
- **Status:** concluído (PR de tooling, branch `chore/diario-tooling`). Esta é a primeira entrada registrada pelo próprio sistema.
- **Validação:** `diario-add` testado (`--no-push` e push real criando o branch `diario`); `diario-build` gera o consolidado do dia.
