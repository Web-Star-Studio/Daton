---
hora: "18:04"
autor: João Pedro
branch: chore/diario-tooling
modulo: Diário de bordo
titulo: Tooling do diário mergeado (#83): consolidado sem horários e sem entradas meta
---

- **O que:** Merge do **tooling do diário de bordo** (PR #83): modelo de fragmentos (um arquivo por entrada) num branch dedicado `diario`, com os scripts `diario-add.py` / `diario-build.py` / `gen-diario-pdf.py`. O gerador do consolidado passou a **omitir o horário de registro** no cabeçalho das entradas (confundia, pois é a hora em que se registra, não a do trabalho) e a **omitir entradas "meta"** do próprio diário; novas flags `--exclude-modulo` / `--include-meta`.
- **Por quê:** À prova de conflito entre branches/sessões (várias sessões alimentam o mesmo dia sem colisão) e relatório mais limpo para os superiores.
- **Impacto/área:** Processo/tooling do diário. `scripts/`, `docs/diario/README.md`, `CLAUDE.md`, `.gitignore`.
- **Status:** concluído e **mergeado na main (#83, squash)**.
- **Validação:** CI "pnpm typecheck" verde; scripts exercitados nesta sessão (geração de MD/PDF).
