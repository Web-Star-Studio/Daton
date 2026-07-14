# Fase 0 — Precisão da nota (eficácia e turmas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o `score` de avaliação de eficácia e de nota de turma aceitar decimais, para que o número persistido seja o número que a tela mostra.

**Architecture:** Duas colunas `integer` viram `numeric(4,2)` com `mode: "number"` no Drizzle — exatamente o movimento que o PR #150 fez com `workload_hours`. O OpenAPI passa a declarar `type: number`, o codegen propaga para Zod e React Query, e os dois pontos de escrita no front param de arredondar/truncar.

**Tech Stack:** Drizzle ORM + PostgreSQL (Neon), Express 5, OpenAPI 3.1 + Orval, React 19, Vitest (integração).

## Global Constraints

- **Nunca commitar/pushar sem pedido explícito do usuário** (CLAUDE.md).
- **Nenhuma escrita no banco de produção sem autorização explícita** nomeando o banco de produção. "Go" genérico não basta.
- **Nunca rodar `pnpm --filter @workspace/db push`**: o `.env` aponta para a produção e o push de uma branch atrasada tenta dropar colunas de outras branches. DDL na produção é sempre cirúrgica, via script.
- **Testes de integração só com `TEST_ENV=integration`**. `vitest --project integration` cru carrega o `.env` e bate na produção.
- `pnpm typecheck` **completo** antes de qualquer push — o `vite build`/esbuild não type-checa.
- Nunca editar arquivos gerados (`lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`). Regenerar via codegen.
- Prettier: 2 espaços, aspas duplas, trailing commas.

**Contexto do bug (medido na produção em 2026-07-14):** `eficacia/index.tsx:306` calcula `Math.round(avg * 2 * 10) / 10` (ex.: 7.3) e grava em coluna `integer`. O Postgres **arredonda** — não rejeita. A tela mostra "3,7/5" e persiste 7, que relido vira 3,5/5. As 159 avaliações existentes da org 2 têm score íntegro de 3 a 10; **não há dado corrompido a reparar**, só precisão perdida daqui pra frente.

---

### Task 1: Alargar as duas colunas de `score` no schema

**Files:**
- Modify: `lib/db/src/schema/employees.ts:227` (`trainingEffectivenessReviewsTable.score`)
- Modify: `lib/db/src/schema/learning-catalog.ts:200` (`trainingClassParticipantsTable.score`)
- Create: `scripts/src/migrate/ddl-score-numeric.ts`
- Test: `artifacts/api-server/tests/routes/training-effectiveness-score.integration.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `trainingEffectivenessReviewsTable.score: number | null` e `trainingClassParticipantsTable.score: number | null`, ambos aceitando duas casas decimais. Nenhuma assinatura de função muda.

- [ ] **Step 1: Escrever o teste de integração que falha**

Crie `artifacts/api-server/tests/routes/training-effectiveness-score.integration.test.ts`:

```typescript
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, employeeTrainingsTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  const cs = contexts.splice(0);
  await Promise.all(cs.map((c) => cleanupTestContext(c)));
});

describe("POST /employees/:empId/trainings/:trainId/effectiveness-reviews — precisão do score", () => {
  it("persiste e devolve o score com casas decimais", async () => {
    const ctx = await createTestContext({ seed: "eff-score-decimal" });
    contexts.push(ctx);

    const employee = await createEmployee(ctx, {
      name: `Motorista ${ctx.prefix}`,
      position: "Motorista",
    });

    const [training] = await db
      .insert(employeeTrainingsTable)
      .values({
        employeeId: employee.id,
        title: `NR-35 ${ctx.prefix}`,
        status: "concluido",
        completionDate: "2026-03-15",
      })
      .returning();

    // 3 critérios Kirkpatrick com média 3,67 → score 7,3 na escala 0–10.
    const res = await request(app)
      .post(
        `/api/organizations/${ctx.orgId}/employees/${employee.id}/trainings/${training.id}/effectiveness-reviews`,
      )
      .set(authHeader(ctx))
      .send({
        evaluationDate: "2026-05-15",
        score: 7.3,
        isEffective: true,
        resultLevel: 4,
        evaluatorRole: "gestor",
      });

    expect(res.status).toBe(201);
    // Hoje isto falha com 7 — o Postgres arredonda ao inserir em coluna integer.
    expect(res.body.score).toBe(7.3);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
pnpm test:integration:up
TEST_ENV=integration pnpm exec vitest run --project integration \
  artifacts/api-server/tests/routes/training-effectiveness-score.integration.test.ts
```

Esperado: FAIL — `expected 7 to be 7.3`.

Se falhar por schema desatualizado no banco de teste, rode antes: `pnpm test:integration:db:push`.

- [ ] **Step 3: Alterar as duas colunas no schema Drizzle**

Em `lib/db/src/schema/employees.ts`, dentro de `trainingEffectivenessReviewsTable`, troque:

```typescript
    score: integer("score"),
```

por:

```typescript
    // numeric, não integer: a média Kirkpatrick de 3 critérios é decimal por
    // natureza (3,67 → 7,3 na escala 0–10). Em integer o Postgres arredondava
    // em silêncio e a tela exibia um número que o banco não guardava.
    score: numeric("score", { precision: 4, scale: 2, mode: "number" }),
```

Garanta que `numeric` está no import do `drizzle-orm/pg-core` no topo do arquivo (o mesmo arquivo já usa `numeric` em `workloadHours`).

Em `lib/db/src/schema/learning-catalog.ts`, dentro de `trainingClassParticipantsTable`, troque:

```typescript
    score: integer("score"),
```

por:

```typescript
    // numeric: a nota de turma admite meio ponto (8,5). Ver employees.ts / score.
    score: numeric("score", { precision: 4, scale: 2, mode: "number" }),
```

- [ ] **Step 4: Escrever o script de DDL**

Crie `scripts/src/migrate/ddl-score-numeric.ts`:

```typescript
/**
 * DDL cirúrgica: alarga as duas colunas de `score` de integer para numeric(4,2).
 *
 * É um widening cast — o Postgres converte os inteiros existentes sem perda e
 * sem reescrever semântica (7 vira 7.00). Idempotente: se a coluna já for
 * numeric, o ALTER é no-op.
 *
 * NÃO usar `drizzle-kit push`: o .env aponta para a produção e o push tentaria
 * dropar colunas de outras branches.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts exec tsx src/migrate/ddl-score-numeric.ts
 */
import { config } from "dotenv";
import pg from "pg";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL ausente");

const STATEMENTS = [
  `ALTER TABLE training_effectiveness_reviews
     ALTER COLUMN score TYPE numeric(4,2) USING score::numeric(4,2)`,
  `ALTER TABLE training_class_participants
     ALTER COLUMN score TYPE numeric(4,2) USING score::numeric(4,2)`,
];

async function main() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const before = await client.query(`
    SELECT table_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE column_name = 'score'
      AND table_name IN ('training_effectiveness_reviews', 'training_class_participants')
    ORDER BY table_name
  `);
  console.log("ANTES:");
  console.table(before.rows);

  for (const sql of STATEMENTS) {
    console.log("\n→", sql.replace(/\s+/g, " ").trim());
    await client.query(sql);
  }

  const after = await client.query(`
    SELECT table_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE column_name = 'score'
      AND table_name IN ('training_effectiveness_reviews', 'training_class_participants')
    ORDER BY table_name
  `);
  console.log("\nDEPOIS:");
  console.table(after.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Aplicar a DDL no banco de TESTE e rodar o teste**

```bash
pnpm test:integration:db:push
TEST_ENV=integration pnpm exec vitest run --project integration \
  artifacts/api-server/tests/routes/training-effectiveness-score.integration.test.ts
```

Esperado: PASS.

Se `test:integration:db:push` não alterar o tipo da coluna (o `drizzle-kit push` às vezes não altera tipos in-place), aplique a DDL no banco de teste apontando `DATABASE_URL` para ele e rodando o script do Step 4.

- [ ] **Step 6: Rodar o typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros. Se o `mode: "number"` mudar o tipo inferido em algum ponto que fazia `Number(score)`, o typecheck aponta.

- [ ] **Step 7: Commit** *(só se o usuário tiver pedido)*

```bash
git add lib/db/src/schema/employees.ts lib/db/src/schema/learning-catalog.ts \
        scripts/src/migrate/ddl-score-numeric.ts \
        artifacts/api-server/tests/routes/training-effectiveness-score.integration.test.ts
git commit -m "fix(aprendizagem): score de eficácia e de turma aceita decimais"
```

---

### Task 2: Propagar o tipo pelo OpenAPI e regenerar o cliente

**Files:**
- Modify: `lib/api-spec/openapi.yaml:11023` (`TrainingClassParticipant.score`)
- Modify: `lib/api-spec/openapi.yaml:11141` (`UpdateTrainingClassParticipantBody.score`)
- Modify: `lib/api-spec/openapi.yaml:12968` (`TrainingEffectivenessReview.score`)
- Modify: `lib/api-spec/openapi.yaml:13712` (`CreateTrainingEffectivenessReviewBody.score`)
- Regenerate: `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`

**Interfaces:**
- Consumes: as colunas `numeric` da Task 1.
- Produces: `score?: number` (decimal) nos tipos gerados `TrainingClassParticipant`, `UpdateTrainingClassParticipantBody`, `TrainingEffectivenessReview`, `CreateTrainingEffectivenessReviewBody`.

> **Atenção:** há uma quinta ocorrência de `score` em `openapi.yaml:14512` — é o score de risco do plano estratégico (`likelihood × impact`), **derivado pelo servidor e inteiro por definição**. **Não tocar.**

> **ESTA TAREFA NÃO MUDA COMPORTAMENTO EM RUNTIME — e isso é esperado.**
> Está registrado no ledger deste repositório (PR #150, que fez o mesmo movimento com `workload_hours`): **o Orval gera código idêntico para `type: integer` e `type: number`** — nos dois casos sai `z.number()` e `number` em TypeScript, **sem** `.int()`. Consequências, todas normais:
> - **O codegen provavelmente não vai produzir diff nenhum.** Se `git diff lib/api-zod lib/api-client-react` vier vazio depois do codegen, **está certo** — não force uma mudança que não existe, e não conclua que o codegen falhou.
> - O Zod **já aceita** `7.3` hoje. O único portão real de precisão era a coluna do banco, e ele é a Task 1.
> - O valor desta tarefa é de **contrato**: o `openapi.yaml` hoje declara `integer` para um campo que passará a devolver decimais. O documento está mentindo, e quem gerar um cliente a partir dele (ou ler o contrato) será enganado. É isso que se conserta aqui.
>
> Portanto: **não escreva um teste "verificando" que o Zod aceita decimal** — ele passaria antes e depois da mudança e não provaria nada. A verificação desta tarefa é documental (o YAML deixou de dizer `integer`) e de não-regressão (`pnpm typecheck` verde).

- [ ] **Step 1: Editar as quatro definições**

Em cada um dos quatro pontos, troque `type: integer` por `type: number`. Os `minimum`/`maximum` existentes (0 e 10 nos dois de eficácia) permanecem.

`openapi.yaml:11023` — `TrainingClassParticipant`:

```yaml
        score:
          type: number
          nullable: true
```

`openapi.yaml:11141` — `UpdateTrainingClassParticipantBody`:

```yaml
        score:
          type: number
          nullable: true
```

`openapi.yaml:12968` — `TrainingEffectivenessReview`:

```yaml
        score:
          type: number
          nullable: true
          minimum: 0
          maximum: 10
```

`openapi.yaml:13712` — `CreateTrainingEffectivenessReviewBody`:

```yaml
        score:
          type: number
          minimum: 0
          maximum: 10
```

- [ ] **Step 2: Rodar o codegen**

```bash
pnpm --filter @workspace/api-spec codegen
```

Esperado: `lib/api-zod/src/generated/` e `lib/api-client-react/src/generated/` regenerados, com `score` agora `number` (Zod: `z.number()` em vez de `z.number().int()`).

Se o codegen falhar por falta de Ruby, use o caminho manual já usado no projeto: converter o YAML para JSON com `python3 -c "import yaml,json;..."` e rodar o Orval sobre o JSON. Não há Ruby neste ambiente.

- [ ] **Step 3: Confirmar o que mudou — e o que (corretamente) não mudou**

```bash
git diff --stat lib/api-zod/src/generated lib/api-client-react/src/generated
```

Esperado: **provavelmente vazio.** Ver a nota em **Interfaces** — o Orval emite o mesmo código para `integer` e `number`. Diff vazio aqui **não** é falha do codegen; é a confirmação de que o único portão de runtime era a coluna do banco (Task 1).

Confirme então que o **contrato** de fato mudou:

```bash
git diff lib/api-spec/openapi.yaml
```

Esperado: exatamente 4 linhas trocadas de `type: integer` para `type: number` — as de `TrainingClassParticipant`, `UpdateTrainingClassParticipantBody`, `TrainingEffectivenessReview` e `CreateTrainingEffectivenessReviewBody`. **Nenhuma outra.** Se a linha 14512 (risco do plano estratégico) aparecer no diff, desfaça: aquele score é inteiro por definição.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros.

- [ ] **Step 5: Commit** *(só se o usuário tiver pedido)*

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api): score de eficácia e de turma passa a ser decimal no contrato"
```

---

### Task 3: Corrigir os dois pontos de escrita no front

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/eficacia/index.tsx:306`
- Modify: `artifacts/web/src/pages/app/aprendizagem/turmas/detail-panel.tsx:361-372` (componente `ScoreInput`)

**Interfaces:**
- Consumes: os tipos gerados da Task 2 (`score: number`).
- Produces: nada consumido por tarefas posteriores.

- [ ] **Step 1: Corrigir o cálculo da nota de eficácia**

Em `artifacts/web/src/pages/app/aprendizagem/eficacia/index.tsx`, dentro de `handleSaveReview`, troque:

```typescript
          score: Math.round(avg * 2 * 10) / 10, // 0–10
```

por:

```typescript
          // avg é a média de 3 critérios Kirkpatrick (1–5); ×2 leva à escala 0–10.
          // Duas casas: é o que a coluna numeric(4,2) guarda e o que a tela exibe.
          score: Math.round(avg * 2 * 100) / 100,
```

O `resultLevel: Math.round(avg)` logo abaixo **permanece inteiro** — `result_level` continua sendo `integer` (1–5) e isso é intencional.

- [ ] **Step 2: Dar limites e passo ao input de nota da turma**

Em `artifacts/web/src/pages/app/aprendizagem/turmas/detail-panel.tsx`, no componente `ScoreInput`, troque o `<Input>` por:

```tsx
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      max={10}
      step={0.5}
      value={val}
      disabled={disabled}
      className="h-8 w-20"
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val === "" || val === String(score ?? "")) return;
        const parsed = Number(val);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
          // Valor inválido: volta ao que estava, em vez de gravar lixo.
          setVal(score != null ? String(score) : "");
          return;
        }
        onSave(parsed);
      }}
    />
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Esperado: sem erros.

- [ ] **Step 4: Verificar na UI**

Suba o app numa porta que **não** seja a 3001 (a 3001 é o backend de desenvolvimento do usuário e aponta para o Neon de **produção**), apontando para o banco local do `docker compose`. Veja o skill `verify` do projeto.

Passos: abrir Aprendizagem → Eficácia → "Iniciar avaliação" num treino concluído → dar notas 4/4/3 (média 3,67) → salvar → reabrir o card e confirmar que a nota exibida é **7,33** e não 7.

- [ ] **Step 5: Commit** *(só se o usuário tiver pedido)*

```bash
git add artifacts/web/src/pages/app/aprendizagem/eficacia/index.tsx \
        artifacts/web/src/pages/app/aprendizagem/turmas/detail-panel.tsx
git commit -m "fix(web): nota de eficácia e de turma param de perder precisão"
```

---

### Task 4: Aplicar a DDL na produção

**Files:**
- Run: `scripts/src/migrate/ddl-score-numeric.ts`

**Interfaces:**
- Consumes: o script da Task 1.
- Produces: as colunas alargadas na produção.

> **PORTÃO HUMANO.** Esta tarefa escreve no **banco de produção (Neon)**. Não execute sem o usuário autorizar explicitamente, nomeando o banco de produção. Um "pode seguir" genérico **não** basta.

- [ ] **Step 1: Pedir a autorização explícita**

Apresente ao usuário: as duas instruções `ALTER TABLE`, o fato de serem *widening casts* (nenhum dado é perdido — os inteiros existentes viram `7.00`), e que a operação é idempotente.

- [ ] **Step 2: Aplicar**

```bash
pnpm --filter @workspace/scripts ddl-score-numeric
```

Não use `pnpm --filter @workspace/scripts exec tsx --env-file ../.env src/migrate/ddl-score-numeric.ts`:
o `dotenv` foi removido do script (não é dependência do monorepo) e, sem o
`sh -c` que o `pnpm run` interpõe, o Node resolve `--env-file` contra o
`$PWD` herdado do shell que chamou o pnpm — não o cwd real do pacote — e
falha com `../.env: not found` mesmo com o arquivo existindo (verificado
neste ambiente, Node 25). O comando acima usa o script `ddl-score-numeric`
já cadastrado em `scripts/package.json` (mesmo mecanismo de `seed`/`migrate`),
que roda via `pnpm run` e carrega o `.env` corretamente.

Esperado na saída: bloco `ANTES` com `data_type: integer` e bloco `DEPOIS` com `data_type: numeric`, `numeric_precision: 4`, `numeric_scale: 2`, para as duas tabelas.

- [ ] **Step 3: Confirmar que nenhum dado se perdeu**

O script já imprime antes/depois do tipo. Confirme adicionalmente que as 159 avaliações da org 2 continuam lá, com um `SELECT count(*)` — **somente leitura**.

---

## Self-review

**Cobertura da spec (§3 Fase 0):** as duas colunas (Task 1), o cálculo em `eficacia:306` (Task 3), os `min`/`max`/`step` do input de turmas (Task 3), o precedente do PR #150 (citado na Task 1), e a exigência de autorização para DDL em produção (Task 4). Coberto.

**Riscos que o plano assume conscientemente:**
- O `drizzle-kit push` pode não alterar tipos in-place; a Task 1 Step 5 já prevê o fallback.
- A quinta ocorrência de `score` no OpenAPI (risco do plano estratégico) é uma armadilha real — está sinalizada em destaque na Task 2.
