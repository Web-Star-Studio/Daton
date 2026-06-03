# Diário de Bordo — Daton

Registro diário de tudo que é feito no projeto, para **auditoria** e para **envio aos superiores**.

## Como funciona (modelo de fragmentos — à prova de conflito)

O diário vive num **branch dedicado `diario`** (orphan: só contém `docs/diario/`, sem código).
Cada entrada é um **arquivo próprio** — nunca se edita o arquivo de outra sessão:

```
docs/diario/
  2026-06-01/                          ← pasta do dia (no branch `diario`)
    143052-feat-swot.md                ← <HHMMSS>-<branch>.md  (1 fragmento por entrada)
    163210-feat-kpi.md
```

Como cada sessão grava um **arquivo distinto**, **múltiplas sessões em branches diferentes
podem alimentar o mesmo dia sem conflito de merge** — e sem coordenação manual. O fragmento
é versionado (autor/branch/hora no histórico do git), o que reforça a trilha de auditoria.

O **consolidado do dia** (MD/PDF) é um **artefato gerado** a partir dos fragmentos — não
precisa ser versionado.

## Registrar uma entrada

Use o script (grava o fragmento no branch `diario`, de qualquer branch de trabalho):

```bash
# conteúdo via arquivo
python3 scripts/diario-add.py --modulo SWOT --titulo "Importação FPLAN" --file entrada.md
# ou via stdin
printf '%s' "$(cat <<'TXT'
- **O que:** ...
- **Por quê:** ...
- **Impacto/área:** ...
- **Status:** concluído
- **Validação:** pnpm typecheck OK
TXT
)" | python3 scripts/diario-add.py --modulo SWOT --titulo "Importação FPLAN"
```

- `--no-push` grava o commit no worktree local sem publicar (para teste).
- O branch `diario` é criado automaticamente na primeira entrada.

## Gerar o consolidado do dia (MD/PDF)

```bash
python3 scripts/diario-build.py --day 2026-06-01           # gera docs/diario/2026-06-01.md
python3 scripts/diario-build.py --day 2026-06-01 --pdf     # + PDF (gen-diario-pdf.py)
```

## Regras de escrita

- **Idioma:** PT-BR, profissional e objetivo (o conteúdo vai para superiores).
- **Fidelidade:** registrar o que foi de fato concluído, o que ficou pendente e o que falhou — sem inflar nem omitir.
- Cada entrada deixa claro: **o que** foi feito, **por quê**, **impacto/área** afetada, **status** e **validações** (typecheck/build/testes).

## Conteúdo de um fragmento

```markdown
---
hora: "14:30"
autor: João Pedro
branch: feat/swot-objective-sources
modulo: SWOT
titulo: Importação FPLAN
---

- **O que:** <descrição objetiva>
- **Por quê:** <motivação / problema resolvido>
- **Impacto/área:** <telas, módulos, arquivos principais>
- **Status:** concluído | em andamento | bloqueado
- **Validação:** <ex.: pnpm typecheck OK, pnpm build OK, testado no app>
```

## Versão executiva (friendly)

Para superiores/não-técnicos, gerar uma versão em linguagem de **negócio** (sem código,
caminhos de arquivo ou nomes de biblioteca), focada em **valor/resultado** — **sem omitir
nenhuma entrega significativa** (migrações de dados, lançamento/refatoração de módulos,
correções em produção e integrações devem aparecer, traduzidas para o impacto).

## Histórico

Dias anteriores ao modelo de fragmentos podem permanecer como `docs/diario/AAAA-MM-DD.md`
consolidados (legado) na `main`; o modelo de fragmentos vale a partir da sua adoção.
