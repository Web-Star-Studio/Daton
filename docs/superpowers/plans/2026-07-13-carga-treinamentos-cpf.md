# Carga de treinamentos por CPF (Gabardo org 2) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carregar na produção os 65.275 treinamentos que faltam para os 1.315 colaboradores ativos da Gabardo, casando planilha↔colaborador **por CPF** (determinístico), sem apagar nenhum registro histórico.

**Architecture:** Duas frentes sequenciais. **(1)** Um PR de código que troca `workload_hours` de `integer` para `numeric(6,2)` nas três tabelas que a têm — sem isso, 4.874 treinos de menos de 30 min entram como "0 h". **(2)** Uma ferramenta de carga (scripts standalone, sem PR para a `main`) que faz parse → dry-run → apply → validate → rollback, reusando `scripts/carga-funcoes-treinamentos/` do lote anterior. Toda a lógica pura (normalização, matching, dedup) fica em módulos `.mjs` testados isoladamente; os scripts de I/O são casca fina.

**Tech Stack:** TypeScript, Drizzle ORM 0.45.1 (PostgreSQL/Neon), Express 5, React 19, OpenAPI 3.1 + Orval, Python 3 (openpyxl, só para ler o xlsx), Node `.mjs` + `pg` para a carga.

**Spec:** `docs/superpowers/specs/2026-07-13-carga-treinamentos-cpf-design.md`

## Global Constraints

- **Org alvo:** 2 (Transportes Gabardo). **Nunca** escrever na produção fora do procedimento da Parte 3.
- **Fonte:** `TREINAMENTOS GERAL _QUALITYWEB_QUALISYS (2).xlsx` (75.335 linhas, 12 colunas, com CPF).
- **R1 — histórico fora do board de eficácia:** o carregador **NÃO PODE** preencher `evaluation_method`, `target_competency_name`, `effectiveness_assigned_role` nem `effectiveness_due_date`. Qualquer um deles não-nulo/não-vazio faz o registro entrar no escopo do board (`boardNeedsEvaluationScope`, `artifacts/api-server/src/routes/employees.ts:192`) e inunda a tela dos avaliadores com 65 mil itens.
- **R2 — nada é apagado.** Nenhum `DELETE` de `employee_trainings` ou `employees` existentes, exceto os 9 fantasmas da Task 11 (que têm rollback próprio).
- **Data de realização** = coluna `Data` (100% preenchida). **Ignorar** `Data Inicial`/`Data Final` (só 47% preenchidas).
- **`Local` e `Unidade` da planilha são descartados.** A filial vem de `employees.unit_id`.
- **Não criar colaboradores.** Linha sem match vai para o bucket `revisar`.
- **🔒 O repositório é PÚBLICO. Nenhum dado pessoal pode ser versionado.** Nada de CPF real, nome real de colaborador ou export de produção em arquivo commitado — nem em documentação, nem em fixture de teste. Os exemplos deste plano e da spec usam **nomes e CPFs fictícios**; o mapeamento real vive fora do repositório (no relatório da cliente e nos artefatos de trabalho). Antes de commitar qualquer coisa da ferramenta de carga, conferir: `staging/`, `report/` e `pares.json` são **gitignored** e nunca entram no commit. Foi assim que 1.774 nomes de colaboradores vazaram para o remoto público na carga anterior (o `.gitignore` cobria `report/` mas esquecia `staging/`).
- Todo o código e as mensagens de commit em PT-BR. `pnpm typecheck` tem de passar antes de qualquer commit na Parte 1.
- **⚠️ `TEST_ENV=integration` é obrigatório em todo comando de teste de integração.** `tests/setup/env.ts` carrega o `.env` do repo quando a variável não está setada — e o `.env` aponta para a **Neon de produção**. Ou seja, `pnpm exec vitest run --project integration ...` **sem** `TEST_ENV=integration` roda os testes contra a produção. Use sempre `TEST_ENV=integration pnpm exec vitest run --project integration ...` (ou o script `pnpm test:integration`, que já seta a variável). O schema vai para o banco de teste com `pnpm test:integration:db:push` — **nunca** `pnpm db push`, que aponta para a produção.

---

# PARTE 1 — Carga horária decimal (PR para a `main`)

Branch: `feat/carga-horaria-decimal`, a partir de `main`.

**Três tabelas** têm `workload_hours` (a spec citava duas; `training_classes` também tem, e fica inconsistente se ficar de fora):

| Tabela             | Arquivo                                  |
| ------------------ | ---------------------------------------- |
| `training_catalog` | `lib/db/src/schema/learning-catalog.ts:34`  |
| `training_classes` | `lib/db/src/schema/learning-catalog.ts:162` |
| `employee_trainings` | `lib/db/src/schema/employees.ts:173`     |

### Task 1: Schema — `workload_hours` vira `numeric(6,2)`

**Files:**
- Modify: `lib/db/src/schema/learning-catalog.ts:34`, `lib/db/src/schema/learning-catalog.ts:162`
- Modify: `lib/db/src/schema/employees.ts:173`
- Test: `artifacts/api-server/tests/routes/training-catalog.integration.test.ts`
- Test: `artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts`

**Interfaces:**
- Produces: `employeeTrainingsTable.workloadHours`, `trainingCatalogTable.workloadHours`, `trainingClassesTable.workloadHours` — todos passam a ser `number | null` em JS (com `mode: "number"`, o driver devolve número, não string).

**Os dois testes desta task ficam vermelhos com a coluna `integer` e verdes depois da troca.** O segundo cobre o KPI de horas, que soma `workload_hours` em SQL: sem ele, nada prova que a soma sobrevive à troca de tipo (`sum(numeric)` volta como string do driver).

- [ ] **Step 1: Escrever os dois testes que falham**

Em `artifacts/api-server/tests/routes/training-catalog.integration.test.ts`, adicionar:

```ts
it("preserva carga horária fracionada (numeric, não integer)", async () => {
  const ctx = await createTestContext();
  const res = await request(app)
    .post(`/api/organizations/${ctx.orgId}/training-catalog`)
    .set(authHeader(ctx.token))
    .send({ title: `${ctx.prefix} Treino curto`, workloadHours: 0.33 });

  expect(res.status).toBe(201);
  expect(res.body.workloadHours).toBe(0.33);

  const get = await request(app)
    .get(`/api/organizations/${ctx.orgId}/training-catalog/${res.body.id}`)
    .set(authHeader(ctx.token));
  expect(get.body.workloadHours).toBe(0.33);
});
```

Em `artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts`, adicionar:

```ts
it("soma horas fracionadas sem perder os minutos", async () => {
  const ctx = await createTestContext();
  const emp = await createTestEmployee(ctx, { status: "active" });
  // 3 treinos de 20 min = ~1 hora, para 1 colaborador ativo
  for (const _ of [1, 2, 3]) {
    await db.insert(employeeTrainingsTable).values({
      employeeId: emp.id,
      title: `${ctx.prefix} Treino de 20 min`,
      status: "concluido",
      completionDate: "2026-03-10",
      workloadHours: 0.33,
    });
  }

  const value = await computeLmsMetric({
    orgId: ctx.orgId,
    metric: "hours_per_employee",
    year: 2026,
    month: 3,
  });

  expect(value).toBe(1); // 0.99h / 1 colaborador, arredondado a 1 casa
});
```

- [ ] **Step 2: Rodar os dois testes e ver falhar**

Run: `pnpm test:integration:up && pnpm test:integration:db:push && TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/training-catalog.integration.test.ts artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts -t "fracionad"`
Expected: **os dois FALHAM** — a coluna é `integer`, então o Postgres arredonda `0.33` para `0`: o catálogo devolve `0` em vez de `0.33`, e o KPI devolve `0` em vez de `1`.

- [ ] **Step 3: Trocar o tipo nas três colunas**

Em `lib/db/src/schema/learning-catalog.ts`, importar `numeric` de `drizzle-orm/pg-core` e trocar as linhas 34 e 162:

```ts
  workloadHours: numeric("workload_hours", {
    precision: 6,
    scale: 2,
    mode: "number",
  }),
```

Em `lib/db/src/schema/employees.ts:173`, importar `numeric` e aplicar exatamente a mesma troca.

- [ ] **Step 4: Levar o schema novo ao banco de teste e rodar**

Run: `pnpm test:integration:db:push`

Isso empurra o schema Drizzle (já com `numeric`) para o Postgres de teste. **Não** rodar `ALTER TABLE` à mão aqui, e **jamais** `pnpm db push` (aponta para a produção).

A DDL equivalente, que irá para a **produção** na Task 4:

```sql
ALTER TABLE training_catalog   ALTER COLUMN workload_hours TYPE numeric(6,2);
ALTER TABLE training_classes   ALTER COLUMN workload_hours TYPE numeric(6,2);
ALTER TABLE employee_trainings ALTER COLUMN workload_hours TYPE numeric(6,2);
```

`integer → numeric` é uma conversão alargadora: o Postgres faz in-place, sem reescrever a tabela, e os valores inteiros existentes continuam válidos.

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/training-catalog.integration.test.ts artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts -t "fracionad"`
Expected: **os dois PASSAM**.

O KPI (`services/kpi/lms-metrics.ts:333`) soma em SQL e já faz `Number(...)` no resultado (linha 358), então funciona com `numeric` sem mudança de código — o teste é o que prova isso.

- [ ] **Step 5: Typecheck e commit**

Run: `pnpm typecheck`
Expected: sem erros.

```bash
git add lib/db/src/schema/learning-catalog.ts lib/db/src/schema/employees.ts artifacts/api-server/tests/routes/training-catalog.integration.test.ts artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts
git commit -m "feat(db): carga horária vira numeric(6,2) — treinos de minutos deixam de virar 0h"
```

### Task 2: OpenAPI — `workloadHours` de `integer` para `number`

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (10 ocorrências)
- Regenerate: `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`

**Interfaces:**
- Consumes: as colunas `numeric` da Task 1.
- Produces: `workloadHours?: number` nos tipos gerados — aceita decimal na validação Zod das rotas.

- [ ] **Step 1: Trocar o tipo nos 10 schemas**

Em `lib/api-spec/openapi.yaml`, nas linhas 10583, 10643, 10683, 10972, 11072, 11109, 12745, 12840, 13560, 13660, trocar `type: integer` por `type: number` **apenas** no campo `workloadHours` (os schemas são `TrainingCatalogItem`, `CreateTrainingCatalogItemBody`, `UpdateTrainingCatalogItemBody`, `TrainingClass`, `CreateTrainingClassBody`, `UpdateTrainingClassBody`, `EmployeeTraining`, `OrganizationTraining`, `CreateTrainingBody`, `UpdateTrainingBody`).

Conferir que sobraram zero:

Run: `grep -A1 "workloadHours:" lib/api-spec/openapi.yaml | grep -c "type: integer"`
Expected: `0`

- [ ] **Step 2: Regerar o client**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: arquivos em `lib/api-zod/src/generated/` e `lib/api-client-react/src/generated/` atualizados. **Nunca editar gerado à mão.**

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api): workloadHours aceita decimal (integer -> number) + codegen"
```

### Task 3: UI — inputs aceitam decimal e a exibição é pt-BR

Os formulários já usam `Number(...)` (não `parseInt`), então o decimal atravessa. Faltam duas coisas: o `<Input type="number">` sem `step` faz o navegador **rejeitar** `0,33` (step implícito = 1), e a exibição imprime `0.33h` (ponto, em inglês) em vez de `0,33 h`.

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/catalogo/index.tsx:570-572` (input) e `:377`, `:470` (exibição)
- Modify: `artifacts/web/src/pages/app/aprendizagem/turmas/index.tsx:472-474` (input) e `:363-364` (exibição)
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx:356-358` (input)
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamento-detalhe.tsx:1052` (input)
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx:1308-1310` (input) e `:2594` (exibição)
- Test: `artifacts/web/src/pages/app/aprendizagem/tests/carga-horaria.test.tsx` (criar)

**Interfaces:**
- Consumes: `formatKpiNumber(value: number | null | undefined): string` de `@/lib/kpi-client` (`artifacts/web/src/lib/kpi-client.ts:294`) — já formata em pt-BR com casas decimais adaptativas. **Não duplicar regra de decimais** em componente.

- [ ] **Step 1: Escrever o teste que falha**

O teste tem de cobrir **a mudança desta task**, não o helper (que já existe e não é tocado aqui). Ou seja: renderizar de fato um ponto de exibição e um input, e afirmar o comportamento novo.

Criar `artifacts/web/src/pages/app/aprendizagem/tests/carga-horaria.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrainingWorkloadCell, TrainingWorkloadInput } from "../colaboradores/carga-horaria";

describe("carga horária decimal", () => {
  it("exibe 0,33h (pt-BR) e não 0.33h", () => {
    render(<TrainingWorkloadCell hours={0.33} />);
    expect(screen.getByText("0,33h")).toBeInTheDocument();
  });

  it("hora cheia continua sem casa decimal", () => {
    render(<TrainingWorkloadCell hours={8} />);
    expect(screen.getByText("8h")).toBeInTheDocument();
  });

  it("não renderiza nada quando não há carga horária", () => {
    const { container } = render(<TrainingWorkloadCell hours={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("o input aceita decimal (step permite centésimos)", () => {
    render(<TrainingWorkloadInput value={0.33} onChange={() => {}} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("step", "0.01");
    expect(input).toHaveAttribute("min", "0");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/src/pages/app/aprendizagem/tests/carga-horaria.test.tsx`
Expected: FAIL — o módulo `../colaboradores/carga-horaria` não existe.

- [ ] **Step 3: Extrair os dois componentes**

Os 5 inputs e as 4 exibições hoje são código repetido em 5 arquivos. Em vez de espalhar `step="0.01"` e `formatKpiNumber` por todos eles à mão (e deixar o próximo ponto de exibição nascer errado de novo), extrair o par e reusar.

Criar `artifacts/web/src/pages/app/aprendizagem/colaboradores/carga-horaria.tsx`:

```tsx
import { Input } from "@/components/ui/input";
import { formatKpiNumber } from "@/lib/kpi-client";

/** Exibe a carga horária em pt-BR (0,33h). Não renderiza nada se não houver valor. */
export function TrainingWorkloadCell({ hours }: { hours: number | null | undefined }) {
  if (!hours) return null;
  return <span>{formatKpiNumber(hours)}h</span>;
}

/** Input de carga horária: aceita centésimos de hora (um treino de 20 min = 0,33). */
export function TrainingWorkloadInput({
  value,
  onChange,
}: {
  value: number | string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/src/pages/app/aprendizagem/tests/carga-horaria.test.tsx`
Expected: 4/4 PASS.

- [ ] **Step 5: Trocar os 5 inputs pelo componente**

Nos 5 `<Input type="number">` listados em **Files**, usar `TrainingWorkloadInput`. Exemplo, em `catalogo/index.tsx:570-575` (o form guarda string):

```tsx
            <TrainingWorkloadInput
              value={form.workloadHours}
              onChange={(v) => setForm({ ...form, workloadHours: v })}
            />
```

Em `colaboradores/[id].tsx:1308-1312` e `colaboradores/treinamentos.tsx:356-360`, o form guarda número — converter no `onChange`, mantendo o comportamento atual (`Number(...)`):

```tsx
            <TrainingWorkloadInput
              value={form.workloadHours}
              onChange={(v) => setForm({ ...form, workloadHours: Number(v) })}
            />
```

Fazer o mesmo em `turmas/index.tsx:472-476` (string) e `colaboradores/treinamento-detalhe.tsx:1052` (número).

- [ ] **Step 6: Trocar as 4 exibições pelo componente**

`colaboradores/[id].tsx:2594`:

```tsx
                        <TrainingWorkloadCell hours={t.workloadHours} />
```

Os outros três pontos montam uma **string** (não um nó React), então usam o helper direto:

`catalogo/index.tsx:377`:

```tsx
                {[item.category, item.workloadHours ? `${formatKpiNumber(item.workloadHours)}h` : null]
```

`catalogo/index.tsx:470`:

```tsx
                value={fichaItem.workloadHours ? `${formatKpiNumber(fichaItem.workloadHours)}h` : null}
```

`turmas/index.tsx:364`:

```tsx
                          ? `${formatKpiNumber(selectedCatalogItem.workloadHours)}h`
```

Em cada arquivo, adicionar os imports que faltarem (`formatKpiNumber` de `@/lib/kpi-client`, `TrainingWorkloadCell`/`TrainingWorkloadInput` de `../colaboradores/carga-horaria` — ajustando o caminho relativo).

Conferir que não sobrou exibição crua:

Run: `grep -rn "workloadHours}h\|workloadHours}\`h" artifacts/web/src`
Expected: nenhuma linha sem `formatKpiNumber` em volta.

- [ ] **Step 7: Typecheck e commit**

Run: `pnpm typecheck && pnpm exec vitest run --project web-unit artifacts/web/src/pages/app/aprendizagem/tests/carga-horaria.test.tsx`
Expected: sem erros, 4/4 testes passam.

```bash
git add artifacts/web/src/pages/app/aprendizagem
git commit -m "feat(aprendizagem): carga horária aceita e exibe decimal (0,33h em vez de 0h)"
```

### Task 4: PR, deploy e DDL na produção

- [ ] **Step 1: Abrir o PR**

```bash
git push -u origin feat/carga-horaria-decimal
gh pr create --title "feat: carga horária decimal (treinos de minutos deixam de virar 0h)" --body "$(cat <<'EOF'
## O que muda
`workload_hours` passa de `integer` para `numeric(6,2)` em `training_catalog`, `training_classes` e `employee_trainings`.

## Por quê
A carga de treinamentos da Gabardo tem 4.874 registros de menos de 30 minutos. Com coluna inteira, todos entram como **0 h** — e aparecem assim no indicador de horas de treinamento.

## DDL a aplicar na produção após o merge
```sql
ALTER TABLE training_catalog   ALTER COLUMN workload_hours TYPE numeric(6,2);
ALTER TABLE training_classes   ALTER COLUMN workload_hours TYPE numeric(6,2);
ALTER TABLE employee_trainings ALTER COLUMN workload_hours TYPE numeric(6,2);
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Não fazer merge sem o "ok" explícito do João Pedro** (regra do projeto: um "go" por PR).

- [ ] **Step 2: Aplicar a DDL na produção (Neon), depois do deploy**

**Não** rodar `pnpm db push` — ele aponta para a produção e tem drift conhecido (tentaria dropar colunas de outras branches). DDL cirúrgica, com `--env-file` apontando para o `.env` de produção:

```bash
node --env-file=/home/jp/daton/Daton/.env -e "
import('pg').then(async ({ default: pg }) => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const t of ['training_catalog', 'training_classes', 'employee_trainings']) {
    await c.query(\`ALTER TABLE \${t} ALTER COLUMN workload_hours TYPE numeric(6,2)\`);
    console.log('ok:', t);
  }
  await c.end();
});
"
```

- [ ] **Step 3: Conferir que a coluna mudou**

```bash
node --env-file=/home/jp/daton/Daton/.env -e "
import('pg').then(async ({ default: pg }) => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(\`
    SELECT table_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
     WHERE column_name = 'workload_hours' ORDER BY table_name\`);
  console.table(rows);
  await c.end();
});
"
```

Expected: as três tabelas com `data_type = numeric`, precision 6, scale 2.

### Task 5: Backfill das horas que o arredondamento comeu

A carga de 06/07 aplicou `Math.round()` (`apply.mjs:470`): `0,5h` virou `1h` em milhares de registros. O valor real está no staging da carga anterior.

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/backfill-horas-reais.mjs` (branch `chore/carga-gabardo-cpf`)
- Reads: `scripts/carga-funcoes-treinamentos/staging/trainings.json` (campo `workloadHours`, float)

- [ ] **Step 1: Escrever o script com `--dry-run` por padrão**

Casa cada linha do staging com o registro em produção por `(employee_id, título normalizado, completion_date)` e, quando a hora real difere da armazenada, faz `UPDATE`. Grava manifesto `{id, de, para}` para rollback.

```js
// Uso: node --env-file=.env backfill-horas-reais.mjs 2 [--apply]
// Sem --apply, só relata. Manifesto em report/backfill-horas-<data>.json
```

- [ ] **Step 2: Rodar o dry-run contra a produção**

Run: `node --env-file=.env scripts/carga-funcoes-treinamentos/backfill-horas-reais.mjs 2`
Expected: relatório com quantos registros mudariam e a soma de horas antes/depois. **Revisar o número com o João Pedro antes do `--apply`.**

- [ ] **Step 3: Aplicar e commitar o manifesto**

Run: `node --env-file=.env scripts/carga-funcoes-treinamentos/backfill-horas-reais.mjs 2 --apply`

```bash
git add scripts/carga-funcoes-treinamentos/backfill-horas-reais.mjs
git commit -m "chore(carga): backfill das horas reais (desfaz o arredondamento da carga de 06/07)"
```

---

# PARTE 2 — Carregador por CPF

Branch: `chore/carga-gabardo-cpf`, a partir de `origin/chore/carga-gabardo` (onde vive a ferramenta do lote anterior). **Sem PR para a `main`** — é tooling de migração, igual ao lote `gabardo-lms-20260706`.

**Estrutura:** o parser Python só extrai (zero lógica); toda a regra de negócio vive em módulos `.mjs` puros, testados isoladamente com `node:assert`, no mesmo estilo dos `test-*.mjs` que já existem.

| Arquivo | Responsabilidade |
| ------- | ---------------- |
| `parse-qualityweb.py` | xlsx → `staging/qualityweb-raw.json` (strings cruas) |
| `lib/normalize-qualityweb.mjs` | `normalizeCpf`, `parseBrDate`, `parseHoursHHMM`, `normalizeTitle` — puras |
| `lib/match-cpf.mjs` | `buildEmployeeIndex`, `matchRow` — puras, sobre índice em memória |
| `dry-run-cpf.mjs` | relatório, zero escrita |
| `apply-cpf.mjs` | fases A (catálogo) e B (treinamentos), transacional, manifesto |
| `rollback-cpf.mjs` | desfaz um lote pelo manifesto |
| `relatorio-cliente.mjs` | xlsx com as pendências da Ana |

### Task 6: Parser do xlsx (extração crua)

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/parse-qualityweb.py`
- Produces: `scripts/carga-funcoes-treinamentos/staging/qualityweb-raw.json`

**Interfaces:**
- Produces: array de objetos com as chaves cruas, **sem normalizar nada**:
  `{ seq: number, colaborador: string, cpf: string, data: string, cargaHoraria: string, treinamento: string, objetivo: string|null, instrutor: string|null }`
  (`Unidade`, `Função`, `Local`, `Data Inicial`, `Data Final` são **descartados na extração** — decisão 2 da spec.)

- [ ] **Step 1: Escrever o parser**

```python
#!/usr/bin/env python3
"""xlsx do QualityWeb -> staging/qualityweb-raw.json (extração crua, sem regra de negócio)."""
import json, sys, openpyxl
from pathlib import Path

XLSX = sys.argv[1]
OUT = Path(__file__).parent / "staging" / "qualityweb-raw.json"

wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]
it = ws.iter_rows(values_only=True)
header = next(it)
esperado = ("Colaborador", "CPF", "Unidade", "Função", "Data", "Carga Horária",
            "Treinamento", "Objetivo", "Local", "Data Inicial", "Data Final", "Instrutor")
if tuple(h for h in header) != esperado:
    raise SystemExit(f"Layout inesperado.\n  esperado: {esperado}\n  veio:     {header}")

linhas = []
for i, r in enumerate(it, start=1):
    if not r or not r[0]:
        continue
    linhas.append({
        "seq": i,
        "colaborador": str(r[0]).strip(),
        "cpf": "" if r[1] is None else str(r[1]).strip(),
        "data": "" if r[4] is None else str(r[4]).strip(),
        "cargaHoraria": "" if r[5] is None else str(r[5]).strip(),
        "treinamento": "" if r[6] is None else str(r[6]).strip(),
        "objetivo": None if r[7] is None else str(r[7]).strip(),
        "instrutor": None if r[11] is None else str(r[11]).strip(),
    })

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(linhas, ensure_ascii=False), encoding="utf-8")
print(f"linhas extraídas: {len(linhas)} -> {OUT}")
```

- [ ] **Step 2: Rodar contra o xlsx real**

Run: `python3 scripts/carga-funcoes-treinamentos/parse-qualityweb.py "/mnt/c/Users/joaop/Downloads/TREINAMENTOS GERAL _QUALITYWEB_QUALISYS (2).xlsx"`
Expected: `linhas extraídas: 75335`

O guard do header é proposital: se a cliente mandar outro layout, o script **para** em vez de carregar lixo.

- [ ] **Step 3: Commit**

```bash
git add scripts/carga-funcoes-treinamentos/parse-qualityweb.py
git commit -m "feat(carga): parser do export QualityWeb (extração crua, guard de layout)"
```

### Task 7: Normalização (funções puras)

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/lib/normalize-qualityweb.mjs`
- Test: `scripts/carga-funcoes-treinamentos/test-normalize-qualityweb.mjs`

**Interfaces:**
- Produces:
  - `normalizeCpf(s: string): string` — só dígitos; `""` se não tiver 11.
  - `parseBrDate(s: string): string | null` — `"19/11/2025"` → `"2025-11-19"`; `null` se não casar.
  - `parseHoursHHMM(s: string): number | null` — `"02:50"` → `2.83` (2 casas); `null` se não casar.
  - `normalizeTitle(s: string): string` — maiúsculas, sem acento, espaços colapsados (chave de dedup e de catálogo).

- [ ] **Step 1: Escrever os testes que falham**

`test-normalize-qualityweb.mjs`:

```js
import assert from "node:assert/strict";
import { normalizeCpf, parseBrDate, parseHoursHHMM, normalizeTitle } from "./lib/normalize-qualityweb.mjs";

const casos = [
  ["cpf com máscara", () => assert.equal(normalizeCpf("987.654.321-00"), "98765432100")],
  ["cpf já limpo", () => assert.equal(normalizeCpf("98765432100"), "98765432100")],
  ["cpf curto vira vazio", () => assert.equal(normalizeCpf("0"), "")],
  ["cpf vazio vira vazio", () => assert.equal(normalizeCpf(""), "")],
  ["data BR vira ISO", () => assert.equal(parseBrDate("19/11/2025"), "2025-11-19")],
  ["data inválida vira null", () => assert.equal(parseBrDate("sem data"), null)],
  ["hora cheia", () => assert.equal(parseHoursHHMM("01:00"), 1)],
  ["hora quebrada arredonda a 2 casas", () => assert.equal(parseHoursHHMM("02:50"), 2.83)],
  ["20 min NÃO vira zero", () => assert.equal(parseHoursHHMM("00:20"), 0.33)],
  ["carga longa", () => assert.equal(parseHoursHHMM("120:00"), 120)],
  ["hora inválida vira null", () => assert.equal(parseHoursHHMM("abc"), null)],
  ["título normalizado", () => assert.equal(normalizeTitle(" NR 35 – Trabalho  em Altura "), "NR 35 – TRABALHO EM ALTURA")],
  ["título sem acento", () => assert.equal(normalizeTitle("Integração"), "INTEGRACAO")],
];

let ok = 0;
for (const [nome, fn] of casos) {
  try { fn(); ok++; } catch (e) { console.error(`✗ ${nome}\n  ${e.message}`); }
}
console.log(`${ok}/${casos.length} passaram`);
process.exit(ok === casos.length ? 0 : 1);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node scripts/carga-funcoes-treinamentos/test-normalize-qualityweb.mjs`
Expected: FAIL — `Cannot find module ... normalize-qualityweb.mjs`

- [ ] **Step 3: Implementar**

`lib/normalize-qualityweb.mjs`:

```js
/** Normalizações puras do export QualityWeb. Sem I/O, sem banco. */

export function normalizeCpf(s) {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length === 11 ? d : "";
}

export function parseBrDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parseHoursHHMM(s) {
  const m = /^(\d+):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  return Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100;
}

export function normalizeTitle(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node scripts/carga-funcoes-treinamentos/test-normalize-qualityweb.mjs`
Expected: `13/13 passaram`

- [ ] **Step 5: Commit**

```bash
git add scripts/carga-funcoes-treinamentos/lib/normalize-qualityweb.mjs scripts/carga-funcoes-treinamentos/test-normalize-qualityweb.mjs
git commit -m "feat(carga): normalização do QualityWeb (cpf, data, HH:MM->decimal, título)"
```

### Task 8: Matcher por CPF (funções puras)

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/lib/match-cpf.mjs`
- Test: `scripts/carga-funcoes-treinamentos/test-match-cpf.mjs`

**Interfaces:**
- Consumes: `normalizeCpf`, `normalizeTitle` da Task 7; `normalizeName` de `lib/db-load.mjs:28`.
- Produces:
  - `buildEmployeeIndex(employees): { byCpf: Map<string, Employee[]>, byName: Map<string, Employee[]> }` — `employees` = `[{ id, name, cpf, status }]`.
  - `matchRow(index, row): { status: "casado", employeeId: number } | { status: "revisar", motivo: string }`
    onde `row` = `{ colaborador, cpf }` já cru (o matcher normaliza internamente).
    Motivos possíveis: `"cpf_ambiguo_sem_desempate"`, `"sem_cpf_nome_nao_encontrado"`, `"sem_cpf_nome_ambiguo"`, `"cpf_nao_cadastrado"`.

**Regra (nesta ordem):**
1. CPF válido casando com **exatamente um** colaborador → `casado`.
2. CPF casando com **mais de um** (caso CARLOS EDUARDO/RENATO) → desempata pelo nome da linha; se o nome bater com exatamente um deles → `casado`; senão → `revisar`.
3. CPF ausente/inválido (as 6 linhas do PAULO HENRIQUE) → casa por nome exato, se único → `casado`; senão → `revisar`.
4. CPF válido sem nenhum colaborador → `revisar` (**nunca** criar colaborador).

- [ ] **Step 1: Escrever os testes que falham**

`test-match-cpf.mjs`:

```js
import assert from "node:assert/strict";
import { buildEmployeeIndex, matchRow } from "./lib/match-cpf.mjs";

const EMPS = [
  { id: 1, name: "FERNANDO GOMES DE ARAUJO", cpf: "987.654.321-00", status: "active" },
  // o caso real: um CPF, dois ativos distintos (um dos dois está errado na origem)
  { id: 156, name: "CARLOS EDUARDO LIMA", cpf: "123.456.789-09", status: "active" },
  { id: 163, name: "RENATO SOUZA MACHADO", cpf: "123.456.789-09", status: "active" },
  // ativo sem CPF cadastrado (PAULO HENRIQUE)
  { id: 983, name: "PAULO HENRIQUE ALVES", cpf: null, status: "active" },
];
const idx = buildEmployeeIndex(EMPS);

const casos = [
  ["cpf único casa", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "FERNANDO GOMES DE ARAUJO", cpf: "987.654.321-00" }),
      { status: "casado", employeeId: 1 })],

  ["cpf ambíguo desempata pelo nome", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "RENATO SOUZA MACHADO", cpf: "123.456.789-09" }),
      { status: "casado", employeeId: 163 })],

  ["cpf ambíguo, o outro nome", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "CARLOS EDUARDO LIMA", cpf: "123.456.789-09" }),
      { status: "casado", employeeId: 156 })],

  ["cpf ambíguo e nome desconhecido vai p/ revisar", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "FULANO DE TAL", cpf: "123.456.789-09" }),
      { status: "revisar", motivo: "cpf_ambiguo_sem_desempate" })],

  ["sem cpf casa por nome exato", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "PAULO HENRIQUE ALVES", cpf: "" }),
      { status: "casado", employeeId: 983 })],

  ["sem cpf e nome desconhecido vai p/ revisar", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "NINGUEM", cpf: "" }),
      { status: "revisar", motivo: "sem_cpf_nome_nao_encontrado" })],

  ["cpf não cadastrado NÃO cria colaborador", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "NOVO", cpf: "111.222.333-44" }),
      { status: "revisar", motivo: "cpf_nao_cadastrado" })],

  ["acento e caixa não atrapalham o desempate", () =>
    assert.deepEqual(matchRow(idx, { colaborador: "renato souza machado", cpf: "123.456.789-09" }),
      { status: "casado", employeeId: 163 })],
];

let ok = 0;
for (const [nome, fn] of casos) {
  try { fn(); ok++; } catch (e) { console.error(`✗ ${nome}\n  ${e.message}`); }
}
console.log(`${ok}/${casos.length} passaram`);
process.exit(ok === casos.length ? 0 : 1);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node scripts/carga-funcoes-treinamentos/test-match-cpf.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`lib/match-cpf.mjs`:

```js
/** Matching planilha->colaborador por CPF. Puro: opera sobre um índice em memória. */
import { normalizeCpf } from "./normalize-qualityweb.mjs";
import { normalizeName } from "./db-load.mjs";

export function buildEmployeeIndex(employees) {
  const byCpf = new Map();
  const byName = new Map();
  for (const e of employees) {
    const c = normalizeCpf(e.cpf);
    if (c) {
      if (!byCpf.has(c)) byCpf.set(c, []);
      byCpf.get(c).push(e);
    }
    const n = normalizeName(e.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(e);
  }
  return { byCpf, byName };
}

export function matchRow(index, row) {
  const cpf = normalizeCpf(row.cpf);
  const nome = normalizeName(row.colaborador);

  if (cpf) {
    const porCpf = index.byCpf.get(cpf) ?? [];
    if (porCpf.length === 1) return { status: "casado", employeeId: porCpf[0].id };
    if (porCpf.length > 1) {
      // CPF duplicado no cadastro: desempata pelo nome da linha.
      const desempate = porCpf.filter((e) => normalizeName(e.name) === nome);
      if (desempate.length === 1) return { status: "casado", employeeId: desempate[0].id };
      return { status: "revisar", motivo: "cpf_ambiguo_sem_desempate" };
    }
    return { status: "revisar", motivo: "cpf_nao_cadastrado" };
  }

  // Sem CPF na planilha (as 6 linhas do PAULO HENRIQUE): cai para nome exato.
  const porNome = index.byName.get(nome) ?? [];
  if (porNome.length === 1) return { status: "casado", employeeId: porNome[0].id };
  if (porNome.length > 1) return { status: "revisar", motivo: "sem_cpf_nome_ambiguo" };
  return { status: "revisar", motivo: "sem_cpf_nome_nao_encontrado" };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node scripts/carga-funcoes-treinamentos/test-match-cpf.mjs`
Expected: `8/8 passaram`

- [ ] **Step 5: Commit**

```bash
git add scripts/carga-funcoes-treinamentos/lib/match-cpf.mjs scripts/carga-funcoes-treinamentos/test-match-cpf.mjs
git commit -m "feat(carga): matcher por CPF (ambíguo desempata por nome; nunca cria colaborador)"
```

### Task 9: Dry-run contra o banco (zero escrita)

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/dry-run-cpf.mjs`
- Test: `scripts/carga-funcoes-treinamentos/test-dedup-cpf.mjs`

**Interfaces:**
- Consumes: `staging/qualityweb-raw.json` (Task 6), `normalize-qualityweb.mjs` (7), `match-cpf.mjs` (8).
- Produces em `lib/dedup.mjs`: `buildExistingKey(employeeId, title, date): string` e `partitionRows(rows, index, existingKeys): { casados, revisar, jaExiste }`.

- [ ] **Step 1: Escrever o teste de dedup que falha**

`test-dedup-cpf.mjs`:

```js
import assert from "node:assert/strict";
import { buildExistingKey, partitionRows } from "./lib/dedup.mjs";
import { buildEmployeeIndex } from "./lib/match-cpf.mjs";

const idx = buildEmployeeIndex([{ id: 1, name: "FERNANDO GOMES", cpf: "98765432100", status: "active" }]);
const linha = { colaborador: "FERNANDO GOMES", cpf: "98765432100", treinamento: "NR 35", data: "19/11/2025", cargaHoraria: "08:00", objetivo: null, instrutor: null };

const casos = [
  ["a chave ignora acento e caixa", () =>
    assert.equal(buildExistingKey(1, "Integração", "2025-11-19"), buildExistingKey(1, "INTEGRACAO", "2025-11-19"))],

  ["linha já existente é pulada", () => {
    const existentes = new Set([buildExistingKey(1, "NR 35", "2025-11-19")]);
    const r = partitionRows([linha], idx, existentes);
    assert.equal(r.jaExiste.length, 1);
    assert.equal(r.casados.length, 0);
  }],

  ["linha nova entra", () => {
    const r = partitionRows([linha], idx, new Set());
    assert.equal(r.casados.length, 1);
    assert.equal(r.casados[0].employeeId, 1);
    assert.equal(r.casados[0].workloadHours, 8);
    assert.equal(r.casados[0].completionDate, "2025-11-19");
  }],

  ["a mesma linha duas vezes na planilha entra uma vez só", () => {
    const r = partitionRows([linha, { ...linha }], idx, new Set());
    assert.equal(r.casados.length, 1);
  }],

  ["linha sem match vai p/ revisar", () => {
    const r = partitionRows([{ ...linha, cpf: "99999999999", colaborador: "X" }], idx, new Set());
    assert.equal(r.revisar.length, 1);
    assert.equal(r.revisar[0].motivo, "cpf_nao_cadastrado");
  }],
];

let ok = 0;
for (const [nome, fn] of casos) {
  try { fn(); ok++; } catch (e) { console.error(`✗ ${nome}\n  ${e.message}`); }
}
console.log(`${ok}/${casos.length} passaram`);
process.exit(ok === casos.length ? 0 : 1);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node scripts/carga-funcoes-treinamentos/test-dedup-cpf.mjs`
Expected: FAIL — `lib/dedup.mjs` não existe.

- [ ] **Step 3: Implementar `lib/dedup.mjs`**

```js
/** Dedup e particionamento das linhas. Puro. */
import { normalizeCpf, parseBrDate, parseHoursHHMM, normalizeTitle } from "./normalize-qualityweb.mjs";
import { matchRow } from "./match-cpf.mjs";

export function buildExistingKey(employeeId, title, date) {
  return `${employeeId}|${normalizeTitle(title)}|${date ?? ""}`;
}

export function partitionRows(rows, index, existingKeys) {
  const casados = [];
  const revisar = [];
  const jaExiste = [];
  const vistas = new Set(); // dedup interno da própria planilha

  for (const row of rows) {
    const m = matchRow(index, row);
    if (m.status === "revisar") {
      revisar.push({ ...row, motivo: m.motivo });
      continue;
    }
    const completionDate = parseBrDate(row.data);
    const key = buildExistingKey(m.employeeId, row.treinamento, completionDate);
    if (existingKeys.has(key) || vistas.has(key)) {
      jaExiste.push({ ...row, employeeId: m.employeeId });
      continue;
    }
    vistas.add(key);
    casados.push({
      employeeId: m.employeeId,
      title: row.treinamento,
      completionDate,
      workloadHours: parseHoursHHMM(row.cargaHoraria),
      objective: row.objetivo || null,
      institution: row.instrutor || null,
      // R1: nada de evaluationMethod / targetCompetencyName / effectiveness*
    });
  }
  return { casados, revisar, jaExiste };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node scripts/carga-funcoes-treinamentos/test-dedup-cpf.mjs`
Expected: `5/5 passaram`

- [ ] **Step 5: Escrever o `dry-run-cpf.mjs`**

Lê os colaboradores e os `employee_trainings` da org, monta o índice e o `Set` de chaves existentes, chama `partitionRows` e **imprime o relatório sem escrever nada**: total de linhas, `casados`, `jaExiste`, `revisar` (agrupado por motivo), títulos novos para o catálogo, e a soma de horas que entraria. Grava `report/dry-run-cpf-<org>.json` com os buckets completos.

- [ ] **Step 6: Rodar contra o banco local (docker) e commitar**

Run: `docker compose up -d && node --env-file=.env.local scripts/carga-funcoes-treinamentos/dry-run-cpf.mjs 2`
Expected: roda sem erro (números pequenos/zerados no banco local — o número que vale é o da produção, na Task 13).

```bash
git add scripts/carga-funcoes-treinamentos/lib/dedup.mjs scripts/carga-funcoes-treinamentos/test-dedup-cpf.mjs scripts/carga-funcoes-treinamentos/dry-run-cpf.mjs
git commit -m "feat(carga): dry-run por CPF (dedup por colaborador+título+data, zero escrita)"
```

### Task 10: Apply (fases A e B) + rollback

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/apply-cpf.mjs`
- Create: `scripts/carga-funcoes-treinamentos/rollback-cpf.mjs`
- Test: `scripts/carga-funcoes-treinamentos/test-apply-cpf.mjs` (integração, banco docker)

**Interfaces:**
- Consumes: os buckets de `partitionRows` (Task 9).
- Produces: manifesto `report/applied-cpf-<batchId>.json` com `{ batchId, orgId, appliedAt, catalog_created: number[], trainings_inserted: number[], summary }`.

**Fase A — catálogo:** insere os títulos que ainda não existem (`normalizeTitle` como chave), com `objective`, `default_instructor` e `workload_hours` da primeira ocorrência.
**Fase B — treinamentos:** insere as linhas casadas com `status = 'concluido'`, `catalog_item_id` resolvido pelo título. **Campos de eficácia ficam nulos (R1).**
Cada fase roda em **uma transação** (sem órfãos) e o manifesto é gravado ao fim de cada uma.

- [ ] **Step 1: Escrever o teste de integração que falha**

`test-apply-cpf.mjs` (contra o docker, com org descartável e prefixo único):

```js
// Casos:
// 1. apply insere N treinamentos e M itens de catálogo; contagens batem com o dry-run
// 2. rodar o apply DUAS vezes não duplica nada (idempotência via dedup)
// 3. NENHUM registro inserido entra no escopo do board de eficácia (R1):
//    SELECT count(*) FROM employee_trainings
//     WHERE id = ANY($ids)
//       AND (coalesce(evaluation_method,'') <> ''
//            OR coalesce(target_competency_name,'') <> ''
//            OR effectiveness_assigned_role IS NOT NULL
//            OR effectiveness_due_date IS NOT NULL)
//    -> DEVE SER 0
// 4. horas fracionadas sobrevivem: um treino de "00:20" fica com workload_hours = 0.33
// 5. rollback pelo manifesto restaura exatamente o estado anterior (contagens e ids)
// 6. linha do bucket 'revisar' NÃO cria colaborador (count(employees) inalterado)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --env-file=.env.local scripts/carga-funcoes-treinamentos/test-apply-cpf.mjs`
Expected: FAIL — `apply-cpf.mjs` não existe.

- [ ] **Step 3: Implementar `apply-cpf.mjs` e `rollback-cpf.mjs`**

**Ler antes de escrever:** `scripts/carga-funcoes-treinamentos/apply.mjs` (no branch `chore/carga-gabardo`) já resolve transação por fase, inserts em lote parametrizados e gravação de manifesto — a estrutura é para ser copiada, trocando só o matcher por `partitionRows`. Pontos de referência nesse arquivo: `pushTraining` (linha ~466, monta o registro — note que ele **não** preenche campos de eficácia, o que é a R1) e o `INSERT INTO employee_trainings` em lote (linha ~699).

Diferenças obrigatórias em relação ao original:

- `workload_hours` recebe o decimal de `parseHoursHHMM` — **sem `Math.round()`** (era a linha 470 do `apply.mjs`, e é justamente o bug que a Parte 1 corrige).
- Grava também `objective` e `institution` (o original não gravava).
- **Não existe caminho de criação de colaborador.** O `apply.mjs` original tinha o modo ZERO_WASTE que criava "ex" para os não-casados; aqui, `revisar` só vai para o relatório.

O `rollback-cpf.mjs` deve ser **self-contained** (sem imports do repo), para poder ser copiado para fora do `/tmp` e sobreviver à sessão — igual ao `rollback.mjs` que ficou em `/home/jp/daton/carga-gabardo-lms-rollback/`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --env-file=.env.local scripts/carga-funcoes-treinamentos/test-apply-cpf.mjs`
Expected: todos os casos passam, incluindo o **caso 3 (R1)**.

- [ ] **Step 5: Commit**

```bash
git add scripts/carga-funcoes-treinamentos/apply-cpf.mjs scripts/carga-funcoes-treinamentos/rollback-cpf.mjs scripts/carga-funcoes-treinamentos/test-apply-cpf.mjs
git commit -m "feat(carga): apply por CPF (2 fases, transacional, manifesto) + rollback"
```

### Task 11: Merge cirúrgico dos 9 fantasmas

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/merge-fantasmas.mjs`
- Test: `scripts/carga-funcoes-treinamentos/test-merge-fantasmas.mjs`

**Contexto:** o matcher da carga antiga não normalizava partículas ("de"/"da"), então 9 colaboradores ativos ganharam um "ex" fantasma com os seus treinamentos. Exemplo do padrão (nomes fictícios): ex#6810 "ROBERTO ALVES **DE** SOUZA" = ativo#488 "ROBERTO ALVES SOUZA".

**Interfaces:**
- Produces: `pares.json` — a lista explícita `[{ exId, ativoId }]` dos **9 pares confirmados**. O script **não descobre pares sozinho**: ele recebe a lista, para não haver surpresa em produção.
- Produces: manifesto `report/merge-fantasmas-<batchId>.json` com `{ movidos: [{ trainingId, de, para }], removidos: number[] }`.

**Ordem obrigatória** (FK): mover `employee_trainings` (dedup contra o que o ativo já tem) → mover `employee_competencies` → só então remover o fantasma. `employee_trainings` é `ON DELETE CASCADE`: apagar antes de mover **destrói os treinamentos**.

- [ ] **Step 1: Escrever o teste que falha**

```js
// Casos (docker, org descartável):
// 1. os treinamentos do fantasma passam a apontar para o ativo
// 2. treinamento que o ativo JÁ tem (mesmo título+data) não vira duplicata — é descartado
// 3. o fantasma é removido de employees
// 4. o ativo NÃO é tocado (nome, status, unit_id, cpf inalterados)
// 5. rollback recria o fantasma e devolve os treinamentos movidos
// 6. par cujo exId não está no manifesto de criação da carga é RECUSADO
//    (trava de segurança: só se mescla fantasma criado pelo lote gabardo-lms-20260706)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --env-file=.env.local scripts/carga-funcoes-treinamentos/test-merge-fantasmas.mjs`
Expected: FAIL — script não existe.

- [ ] **Step 3: Implementar**

Com `--dry-run` por padrão; só escreve com `--apply`. A trava do caso 6 lê `employees_created` de `/home/jp/daton/carga-gabardo-lms-rollback/report/applied-B-gabardo-lms-20260706.json`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --env-file=.env.local scripts/carga-funcoes-treinamentos/test-merge-fantasmas.mjs`
Expected: todos os casos passam.

- [ ] **Step 5: Commit**

```bash
git add scripts/carga-funcoes-treinamentos/merge-fantasmas.mjs scripts/carga-funcoes-treinamentos/test-merge-fantasmas.mjs scripts/carga-funcoes-treinamentos/pares.json
git commit -m "feat(carga): merge dos 9 fantasmas de nome idêntico (move treinos, depois remove)"
```

### Task 12: Relatório para a cliente

**Files:**
- Create: `scripts/carga-funcoes-treinamentos/relatorio-cliente.mjs`

**Interfaces:**
- Consumes: `report/dry-run-cpf-2.json` (Task 9).
- Produces: `PENDENCIAS_GABARDO_TREINAMENTOS.xlsx`, uma aba por assunto:
  1. **CPF duplicado** — `123.456.789-09` em CARLOS EDUARDO (156) e RENATO (163); um dos dois está errado na origem.
  2. **Sem CPF** — PAULO HENRIQUE ALVES (983), sem CPF no cadastro e sem CPF na planilha.
  3. **Títulos suspeitos** — os 73 títulos com mais de 120 caracteres (descrição no lugar do nome do treinamento).
  4. **Fantasmas duvidosos** — os 12 pares parecidos porém não confirmados (ex.: "JOAO DA SILVA" vs "PEDRO JOAO DA SILVA"), para a Ana dizer se são a mesma pessoa.
  5. **Linhas em revisão** — o bucket `revisar` do dry-run de produção, se houver.

- [ ] **Step 1: Gerar o xlsx a partir do dry-run de produção**

Run: `node --env-file=.env scripts/carga-funcoes-treinamentos/relatorio-cliente.mjs 2`
Expected: `PENDENCIAS_GABARDO_TREINAMENTOS.xlsx` com as 5 abas.

- [ ] **Step 2: Commit**

```bash
git add scripts/carga-funcoes-treinamentos/relatorio-cliente.mjs
git commit -m "feat(carga): relatório de pendências para a cliente (5 abas)"
```

---

# PARTE 3 — Procedimento de produção

**Nada aqui roda sem "go" explícito do João Pedro.** Cada passo é verificável e reversível.

### Task 13: Executar a carga

- [ ] **Step 1: Pré-condições**

- [ ] PR da Parte 1 mergeado e deployado (Render + Cloudflare).
- [ ] DDL das três colunas aplicada na Neon (Task 4, Step 3 confirma).
- [ ] Testes das Tasks 7–11 passando (`node test-*.mjs`).

- [ ] **Step 2: Dry-run contra a produção**

Run: `node --env-file=/home/jp/daton/Daton/.env scripts/carga-funcoes-treinamentos/dry-run-cpf.mjs 2`

Números esperados (do levantamento de 13/07 — **se divergirem muito, PARAR e investigar**):

| Bucket | Esperado |
| ------ | -------- |
| Linhas na planilha | 75.335 |
| `casados` (entram) | ~65.275 |
| `jaExiste` (pulados) | ~10.054 |
| `revisar` | ~0 |
| Títulos novos no catálogo | ~1.875 |

- [ ] **Step 3: Revisar os buckets com a cliente**

Gerar o relatório (Task 12) e mandar para a Ana. **Se o bucket `revisar` não estiver vazio, resolver antes do apply.**

- [ ] **Step 4: Apply em janela**

Run: `node --env-file=/home/jp/daton/Daton/.env scripts/carga-funcoes-treinamentos/apply-cpf.mjs 2 53 --batch=gabardo-lms-cpf-<AAAAMMDD>`

(`53` = user id do João Pedro, `createdByUserId`.)

- [ ] **Step 5: Copiar o rollback para fora do `/tmp`**

```bash
mkdir -p /home/jp/daton/carga-gabardo-cpf-rollback/report
cp scripts/carga-funcoes-treinamentos/rollback-cpf.mjs /home/jp/daton/carga-gabardo-cpf-rollback/
cp scripts/carga-funcoes-treinamentos/report/applied-cpf-*.json /home/jp/daton/carga-gabardo-cpf-rollback/report/
```

- [ ] **Step 6: Validar**

Conferir na produção:

- [ ] `employee_trainings` da org 2 subiu de 33.810 para ~99.085.
- [ ] Colaboradores ativos continuam **1.861** (nenhum criado, nenhum inativado).
- [ ] **Zero** dos registros inseridos entra no escopo do board de eficácia (a query do caso 3 da Task 10, agora contra a produção).
- [ ] O indicador de horas/colaborador reflete as horas novas.
- [ ] Abrir a ficha de um colaborador conhecido (ex.: FERNANDO GOMES DE ARAUJO) e conferir os treinamentos de 2025 na tela.

- [ ] **Step 7: Merge dos fantasmas (só depois do ok da Ana sobre os 12 duvidosos)**

Run: `node --env-file=/home/jp/daton/Daton/.env scripts/carga-funcoes-treinamentos/merge-fantasmas.mjs 2 --apply`

- [ ] **Step 8: Registrar no diário de bordo**

```bash
python3 scripts/diario-add.py --modulo "Aprendizagem" --titulo "Carga de treinamentos por CPF (Gabardo)" --file <entrada.md>
```

Registrar com fidelidade: o que entrou, o que ficou pendente com a cliente, e o que falhou.

---

## Notas de execução

- **Ordem é obrigatória.** A Parte 2 depende da coluna decimal já estar em produção; carregar antes faz 4.874 treinos entrarem como `0 h`, e corrigir depois exige outro backfill.
- **`.env.local` para o docker, `.env` para a produção.** O `.env` do repo aponta para a Neon de **produção** — todo comando com `--env-file=.env` escreve na produção. O backend de dev na porta 3001 também aponta para a produção: não usar para testar carga.
- **Rodar duas vezes é seguro** (dedup), mas o manifesto é por lote: usar um `--batch` novo a cada apply.
