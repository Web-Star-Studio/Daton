# SP6/B — Indicadores de Treinamento no módulo KPI + Dashboard operacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as métricas do LMS virarem indicadores KPI reais (fonte computada, escopo corporativo) no módulo de Indicadores existente, com meta/tolerância configuráveis e desvio→plano de ação, e construir a tela operacional (Dashboard, tela 1 do mockup).

**Architecture:** Espelha o seam do rollup corporativo (`kpi/index.ts`): um indicador com `computedSource='lms'` tem o valor de cada mês calculado por um provider do LMS e **materializado** em `kpi_monthly_values` (para o desvio poder gerar plano de ação, que se liga ao `kpiMonthlyValueId`). Indicadores são `kpi_indicators` normais, então semáforo/histórico/dashboards/RAC funcionam sem mudança. A tela 1 é read-only, consome um endpoint de resumo agregado.

**Tech Stack:** Express 5 + Drizzle (PostgreSQL), Zod, OpenAPI 3.1 + Orval, React 19 + Wouter + TanStack Query + recharts.

## Global Constraints

- Nunca `drizzle push` em produção — DDL cirúrgico na base de integração (:55432) e adicionado a `scripts/sql/`. Nunca escrever na porta :3001 (prod). Testar em :3002 / :55432.
- Codegen usa **python3** (sem ruby): `python3 -c "import yaml,json;json.dump(yaml.safe_load(open('openapi.yaml')),open('.openapi.codegen.json','w'),indent=2)"` → `./node_modules/.bin/orval --config ./orval.config.ts` → remover linhas com `./generated/types` de `../api-zod/src/index.ts` → `rm .openapi.codegen.json` (rodar em `lib/api-spec`).
- Após codegen, rodar `pnpm run typecheck:libs` (tsc --build) antes do typecheck do web (o web consome os `.d.ts` compilados).
- Testes de integração: `pnpm exec vitest run --project integration --no-file-parallelism <arquivo>` com `NODE_OPTIONS=--max-old-space-size=4096`.
- Escopo **corporativo** (não por filial). Não reintroduzir meta manual no rollup corporativo existente.
- Toda rota nova: `requireAuth`, escrita com `requireWriteAccess()`, escopo por `req.auth.organizationId`, e montada sob o módulo `kpi`/`employees` conforme o vizinho.
- Padrão de mutator de banco reusável: `type Database = Pick<typeof db, "select" | "insert" | "update">`.

## File Structure

- **Create** `artifacts/api-server/src/services/kpi/lms-metrics.ts` — provider `computeLmsMetric` (6 métricas).
- **Create** `artifacts/api-server/src/services/aprendizagem/learning-summary.ts` — agregação do dashboard.
- **Create** `artifacts/api-server/src/routes/learning-summary.ts` — GET resumo do dashboard.
- **Modify** `lib/db/src/schema/kpi.ts` — colunas `computedSource`/`computedMetric` em `kpiIndicatorsTable`; `tolerance` em `kpiYearConfigsTable`.
- **Modify** `artifacts/api-server/src/routes/kpi/index.ts` — ramo `computedSource==='lms'` no laço de resolução (materializa células); ativação de indicadores; incluir `tolerance` na serialização do ano.
- **Modify** `lib/api-spec/openapi.yaml` — `computedSource`/`computedMetric` em `KpiIndicator`; `tolerance` em `KpiYearConfig` + no body de upsert; endpoints `.../kpi/lms-indicators/activate` e `.../learning/summary` + schemas.
- **Modify** `artifacts/web/src/lib/kpi-client.ts` — `getTrafficLight` aceita `tolerance`.
- **Modify** `artifacts/web/src/pages/app/kpi/indicadores.tsx` — campo Tolerância; meta editável p/ LMS; lançamento read-only + selo.
- **Modify** `artifacts/web/src/pages/app/kpi/_components/lancar-screen.tsx` — bloquear lançamento manual p/ `computedSource==='lms'`.
- **Create** `artifacts/web/src/pages/app/aprendizagem/dashboard/index.tsx` — tela 1.
- **Modify** `artifacts/web/src/App.tsx` + `artifacts/web/src/components/layout/AppLayout.tsx` — rota + item de menu do dashboard.
- **Modify** `scripts/sql/20260701_add_learning_management_module.sql` (ou novo arquivo dated) — DDL das colunas novas.

---

### Task 1: Schema — colunas de fonte computada e tolerância + DDL

**Files:**
- Modify: `lib/db/src/schema/kpi.ts`
- Modify: `scripts/sql/20260701_add_learning_management_module.sql`

**Interfaces:**
- Produces: `kpiIndicatorsTable.computedSource` (varchar 32, nullable), `kpiIndicatorsTable.computedMetric` (varchar 64, nullable), `kpiYearConfigsTable.tolerance` (numeric 20,8, nullable).

- [ ] **Step 1: Adicionar colunas ao schema.** Em `kpi.ts`, em `kpiIndicatorsTable` (depois de `rollupStrategy`, antes de `norms`):

```ts
  computedSource: varchar("computed_source", { length: 32 }),
  computedMetric: varchar("computed_metric", { length: 64 }),
```

Em `kpiYearConfigsTable` (depois de `goal`):

```ts
  tolerance: numeric("tolerance", { precision: 20, scale: 8 }),
```

- [ ] **Step 2: DDL na base de integração.** Criar um script tsx temporário dentro de `artifacts/api-server/` (executar com `./node_modules/.bin/tsx --env-file ../../.env`, depois apagar) que roda:

```sql
ALTER TABLE kpi_indicators ADD COLUMN IF NOT EXISTS computed_source varchar(32);
ALTER TABLE kpi_indicators ADD COLUMN IF NOT EXISTS computed_metric varchar(64);
ALTER TABLE kpi_year_configs ADD COLUMN IF NOT EXISTS tolerance numeric(20,8);
```

Verificar com `information_schema.columns`.

- [ ] **Step 3: Adicionar ao script de DDL de produção.** Append em `scripts/sql/20260701_add_learning_management_module.sql` (antes do `COMMIT;` ou como bloco novo comentado "SP6/B"):

```sql
-- SP6/B: indicadores de treinamento (fonte computada) + tolerância configurável
ALTER TABLE public.kpi_indicators ADD COLUMN IF NOT EXISTS computed_source varchar(32);
ALTER TABLE public.kpi_indicators ADD COLUMN IF NOT EXISTS computed_metric varchar(64);
ALTER TABLE public.kpi_year_configs ADD COLUMN IF NOT EXISTS tolerance numeric(20,8);
```

- [ ] **Step 4: Typecheck libs.** Run: `pnpm run typecheck:libs`. Expected: PASS (colunas não mudam tipos consumidos).

- [ ] **Step 5: Commit.**

```bash
git add lib/db/src/schema/kpi.ts scripts/sql/20260701_add_learning_management_module.sql
git commit -m "feat(kpi): colunas de fonte computada (LMS) + tolerância configurável"
```

---

### Task 2: Provider `computeLmsMetric` — pat_completion + effectiveness_overall

**Files:**
- Create: `artifacts/api-server/src/services/kpi/lms-metrics.ts`
- Test: `artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts`

**Interfaces:**
- Produces:
```ts
export type LmsMetricKey =
  | "pat_completion" | "effectiveness_overall" | "mandatory_coverage"
  | "hours_per_employee" | "critical_gaps" | "expired_trainings";
type Database = Pick<typeof db, "select">;
export async function computeLmsMetric(args: {
  orgId: number; metric: LmsMetricKey; year: number; month: number; database: Database;
}): Promise<number | null>;
```

- [ ] **Step 1: Teste falho (integração).** Criar o arquivo de teste. Semear via `createTestContext`, criar catálogo, PAT com 2 itens (1 realizada), e 2 reviews de eficácia (1 eficaz) no mês. Asserts:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@workspace/db";
import { computeLmsMetric } from "../../../src/services/kpi/lms-metrics";
import { authHeader, cleanupTestContext, createTestContext, createEmployee, type TestOrgContext } from "../../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => { await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c))); });

describe("computeLmsMetric", () => {
  it("pat_completion = realizadas/total até o mês (%)", async () => {
    const ctx = await createTestContext({ seed: "lms-metric-pat" });
    contexts.push(ctx);
    const org = ctx.organizationId;
    // catálogo
    const cat = (await request(app).post(`/api/organizations/${org}/training-catalog`).set(authHeader(ctx)).send({ title: `T ${ctx.prefix}` })).body.id;
    // PAT: 2 itens em jan, 1 realizada
    await request(app).post(`/api/organizations/${org}/annual-program`).set(authHeader(ctx)).send({ year: 2026, catalogItemId: cat, plannedMonth: 1, status: "realizada" });
    await request(app).post(`/api/organizations/${org}/annual-program`).set(authHeader(ctx)).send({ year: 2026, catalogItemId: cat, plannedMonth: 1, status: "planejada" });
    const v = await computeLmsMetric({ orgId: org, metric: "pat_completion", year: 2026, month: 1, database: db });
    expect(v).toBe(50);
  });
});
```

(importar `app` de `../../../src/app`.)

- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm exec vitest run --project integration --no-file-parallelism artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts`. Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar o arquivo com as 2 primeiras métricas.**

```ts
import { and, eq, gte, lte, sql, isNotNull, count } from "drizzle-orm";
import {
  db,
  annualTrainingProgramTable,
  trainingEffectivenessReviewsTable,
  employeeTrainingsTable,
  employeesTable,
} from "@workspace/db";

export type LmsMetricKey =
  | "pat_completion" | "effectiveness_overall" | "mandatory_coverage"
  | "hours_per_employee" | "critical_gaps" | "expired_trainings";

type Database = Pick<typeof db, "select">;

// último dia do mês (ISO YYYY-MM-DD), UTC-safe.
function endOfMonthIso(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // month é 1–12; dia 0 do próximo = último deste
  return d.toISOString().slice(0, 10);
}

function pct(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return Math.round((numer / denom) * 1000) / 10; // 1 casa
}

export async function computeLmsMetric(args: {
  orgId: number; metric: LmsMetricKey; year: number; month: number; database: Database;
}): Promise<number | null> {
  const { orgId, metric, year, month, database } = args;

  if (metric === "pat_completion") {
    const rows = await database
      .select({
        total: count(),
        realizadas: sql<number>`count(*) filter (where ${annualTrainingProgramTable.status} = 'realizada')`,
      })
      .from(annualTrainingProgramTable)
      .where(
        and(
          eq(annualTrainingProgramTable.organizationId, orgId),
          eq(annualTrainingProgramTable.year, year),
          sql`(${annualTrainingProgramTable.plannedMonth} is null or ${annualTrainingProgramTable.plannedMonth} <= ${month})`,
        ),
      );
    const r = rows[0];
    return pct(Number(r?.realizadas ?? 0), Number(r?.total ?? 0));
  }

  if (metric === "effectiveness_overall") {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = endOfMonthIso(year, month);
    const rows = await database
      .select({
        total: count(),
        eficazes: sql<number>`count(*) filter (where ${trainingEffectivenessReviewsTable.isEffective} = true)`,
      })
      .from(trainingEffectivenessReviewsTable)
      .innerJoin(employeeTrainingsTable, eq(trainingEffectivenessReviewsTable.trainingId, employeeTrainingsTable.id))
      .innerJoin(employeesTable, eq(employeeTrainingsTable.employeeId, employeesTable.id))
      .where(
        and(
          eq(employeesTable.organizationId, orgId),
          gte(trainingEffectivenessReviewsTable.evaluationDate, start),
          lte(trainingEffectivenessReviewsTable.evaluationDate, end),
        ),
      );
    const r = rows[0];
    return pct(Number(r?.eficazes ?? 0), Number(r?.total ?? 0));
  }

  return null; // demais métricas nas próximas tasks
}
```

Nota: `employee_trainings` não tem `organizationId` — o escopo vem do join com `employees.organizationId` (padrão do repo). Confirmar os nomes das colunas de `trainingEffectivenessReviewsTable` (`trainingId`, `isEffective`, `evaluationDate`) no schema antes de rodar.

- [ ] **Step 4: Rodar e ver passar.** Run: comando do Step 2. Expected: PASS (pat_completion). Adicionar também um `it` para `effectiveness_overall` e confirmar.

- [ ] **Step 5: Commit.**

```bash
git add artifacts/api-server/src/services/kpi/lms-metrics.ts artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts
git commit -m "feat(kpi): provider LMS — pat_completion + effectiveness_overall"
```

---

### Task 3: Provider — mandatory_coverage, hours_per_employee, expired_trainings, critical_gaps

**Files:**
- Modify: `artifacts/api-server/src/services/kpi/lms-metrics.ts`
- Modify: `artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts`

**Interfaces:**
- Consumes: `computeLmsMetric` (Task 2). Reusa o cálculo de gaps existente — localizar em `artifacts/api-server` a função/consulta que serve `GET /organizations/:orgId/employees/competency-gaps` (rota em `employees.ts:1580`) e extrair/So reutilizar a contagem de colaboradores com gap crítico por org.

- [ ] **Step 1: Testes falhos.** Adicionar `it` para cada métrica com dados semeados:
  - `mandatory_coverage`: criar 2 `employee_trainings` com `requirementId` (1 concluído) → esperar 50.
  - `hours_per_employee`: 1 colaborador, 1 treino concluído `workloadHours=10` → esperar 10.
  - `expired_trainings`: 1 treino com `expirationDate` no passado (≤ fim do mês) e sem conclusão posterior → esperar 1.
  - `critical_gaps`: montar 1 colaborador com requisito de competência não atendido (crítico) → esperar 1 (apenas mês corrente; meses passados → null).

- [ ] **Step 2: Rodar e ver falhar.** Run: comando do Task 2 Step 2. Expected: FAIL (retornam null).

- [ ] **Step 3: Implementar os 4 ramos** (substituir o `return null`):

```ts
  if (metric === "mandatory_coverage") {
    const end = endOfMonthIso(year, month);
    const rows = await database
      .select({
        total: count(),
        concluidos: sql<number>`count(*) filter (where ${employeeTrainingsTable.status} = 'concluido' and (${employeeTrainingsTable.completionDate} is null or ${employeeTrainingsTable.completionDate} <= ${end}))`,
      })
      .from(employeeTrainingsTable)
      .innerJoin(employeesTable, eq(employeeTrainingsTable.employeeId, employeesTable.id))
      .where(and(eq(employeesTable.organizationId, orgId), isNotNull(employeeTrainingsTable.requirementId)));
    const r = rows[0];
    return pct(Number(r?.concluidos ?? 0), Number(r?.total ?? 0));
  }

  if (metric === "hours_per_employee") {
    const end = endOfMonthIso(year, month);
    const [hoursRow] = await database
      .select({ hours: sql<number>`coalesce(sum(${employeeTrainingsTable.workloadHours}), 0)` })
      .from(employeeTrainingsTable)
      .innerJoin(employeesTable, eq(employeeTrainingsTable.employeeId, employeesTable.id))
      .where(and(
        eq(employeesTable.organizationId, orgId),
        eq(employeeTrainingsTable.status, "concluido"),
        sql`(${employeeTrainingsTable.completionDate} is null or ${employeeTrainingsTable.completionDate} <= ${end})`,
      ));
    const [empRow] = await database
      .select({ n: count() }).from(employeesTable)
      .where(and(eq(employeesTable.organizationId, orgId), eq(employeesTable.status, "active")));
    const n = Number(empRow?.n ?? 0);
    if (n === 0) return null;
    return Math.round((Number(hoursRow?.hours ?? 0) / n) * 10) / 10;
  }

  if (metric === "expired_trainings") {
    const end = endOfMonthIso(year, month);
    const [row] = await database
      .select({ n: count() })
      .from(employeeTrainingsTable)
      .innerJoin(employeesTable, eq(employeeTrainingsTable.employeeId, employeesTable.id))
      .where(and(
        eq(employeesTable.organizationId, orgId),
        isNotNull(employeeTrainingsTable.expirationDate),
        lte(employeeTrainingsTable.expirationDate, end),
        sql`${employeeTrainingsTable.status} <> 'concluido'`,
      ));
    return Number(row?.n ?? 0);
  }

  if (metric === "critical_gaps") {
    // snapshot: só o mês corrente (histórico não é reconstruível)
    const now = new Date();
    const isCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    if (!isCurrent) return null;
    return await countCriticalGapEmployees(orgId, database);
  }
```

Implementar `countCriticalGapEmployees(orgId, database)` reutilizando a lógica do endpoint de gaps (Task 3 Interfaces). Se a lógica estiver inline na rota, extrair para uma função exportada em um serviço (ex.: `services/employees/competency-gaps.ts`) e chamar tanto na rota quanto aqui (DRY).

Adicionar os imports que faltarem em `lms-metrics.ts`.

- [ ] **Step 4: Rodar e ver passar.** Run: comando do Task 2 Step 2. Expected: PASS (todas as 6 métricas).

- [ ] **Step 5: Commit.**

```bash
git add artifacts/api-server/src/services/kpi/lms-metrics.ts artifacts/api-server/tests/services/kpi/lms-metrics.integration.test.ts artifacts/api-server/src/services/employees/competency-gaps.ts artifacts/api-server/src/routes/employees.ts
git commit -m "feat(kpi): provider LMS — cobertura, horas, vencidos, gaps críticos"
```

---

### Task 4: Ativação idempotente dos indicadores corporativos

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (endpoint `POST /organizations/{orgId}/kpi/lms-indicators/activate`)
- Modify: `artifacts/api-server/src/routes/kpi/index.ts` (handler)
- Test: `artifacts/api-server/tests/routes/kpi-lms-indicators.integration.test.ts`

**Interfaces:**
- Produces: cria (idempotente) 6 `kpi_indicators` com `computedSource='lms'` + `kpi_year_configs` do ano com meta/tolerância padrão. Resposta `{ activated: number, indicatorIds: number[] }`.

- [ ] **Step 1: Definir o catálogo das 6 métricas** (constante no topo do handler ou em `lms-metrics.ts`):

```ts
export const LMS_INDICATOR_DEFS: Array<{
  metric: LmsMetricKey; name: string; measurement: string;
  direction: "up" | "down"; category: string; norms: string[];
  goal: number; tolerance: number;
}> = [
  { metric: "pat_completion", name: "% Cumprimento do PAT", measurement: "% de itens do programa anual realizados", direction: "up", category: "RH", norms: ["9001"], goal: 80, tolerance: 1 },
  { metric: "effectiveness_overall", name: "% Eficácia geral de treinamentos", measurement: "% de avaliações de eficácia com resultado eficaz", direction: "up", category: "RH", norms: ["9001"], goal: 80, tolerance: 1 },
  { metric: "mandatory_coverage", name: "% Cobertura de treinamentos obrigatórios", measurement: "% de obrigatoriedades concluídas", direction: "up", category: "RH", norms: ["9001"], goal: 100, tolerance: 2 },
  { metric: "hours_per_employee", name: "Horas de treinamento por colaborador", measurement: "horas acumuladas ÷ colaboradores ativos", direction: "up", category: "RH", norms: ["9001"], goal: 20, tolerance: 2 },
  { metric: "critical_gaps", name: "Colaboradores com gap crítico", measurement: "nº de colaboradores com competência crítica não atendida", direction: "down", category: "RH", norms: ["9001"], goal: 0, tolerance: 0 },
  { metric: "expired_trainings", name: "Treinamentos vencidos", measurement: "nº de treinamentos vencidos e não renovados", direction: "down", category: "RH", norms: ["9001"], goal: 0, tolerance: 0 },
];
```

- [ ] **Step 2: Teste falho.** Criar o teste: chamar o endpoint 2×; após a 1ª esperar 6 indicadores com `computedSource='lms'`; após a 2ª esperar que o total continua 6 (idempotente).

```ts
it("ativa 6 indicadores LMS de forma idempotente", async () => {
  const ctx = await createTestContext({ seed: "lms-activate" });
  contexts.push(ctx);
  const url = `/api/organizations/${ctx.organizationId}/kpi/lms-indicators/activate`;
  const first = await request(app).post(url).set(authHeader(ctx)).send({ year: 2026 });
  expect(first.status).toBe(200);
  expect(first.body.activated).toBe(6);
  const second = await request(app).post(url).set(authHeader(ctx)).send({ year: 2026 });
  expect(second.body.activated).toBe(0);
});
```

- [ ] **Step 3: Rodar e ver falhar.** Expected: 404 (rota inexistente).

- [ ] **Step 4: Spec no openapi + codegen.** Adicionar o path em `openapi.yaml` (body `{ year: integer }`, resposta `ActivateLmsIndicatorsResponse { activated: integer, indicatorIds: integer[] }`). Rodar o codegen (Global Constraints) e `typecheck:libs`.

- [ ] **Step 5: Implementar o handler** em `kpi/index.ts` (montado no mesmo router). Para cada def: `select` indicador existente por `(organizationId, computedSource='lms', computedMetric=metric)`; se não existe, `insert` o indicador (com `formulaExpression=''`, `formulaVariables=[]`, `periodicity='monthly'`, `unitId=null`) e um `kpi_year_configs` do ano com `goal`/`tolerance`. Retornar contagem dos criados nesta chamada.

- [ ] **Step 6: Rodar e ver passar.** Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add -A && git commit -m "feat(kpi): ativação idempotente dos indicadores de treinamento (LMS)"
```

---

### Task 5: Seam de resolução on-read + materialização das células

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts` (após o laço de rollup, ~linha 937)
- Test: `artifacts/api-server/tests/routes/kpi-lms-indicators.integration.test.ts`

**Interfaces:**
- Consumes: `computeLmsMetric` (Task 2/3), indicadores ativados (Task 4).
- Produces: no GET do ano, indicadores `computedSource='lms'` vêm com os 12 meses calculados; as células são **materializadas** em `kpi_monthly_values` (`isComputed=true`, `isOverridden=false`) com `id` real (para plano de ação).

- [ ] **Step 1: Teste falho.** Ativar indicadores, semear dados (PAT 50%), `GET /organizations/:orgId/kpi/years/2026`, achar o indicador `pat_completion` e conferir que o valor de janeiro é 50 e que a célula tem `monthlyValueId != 0`.

- [ ] **Step 2: Rodar e ver falhar.** Expected: valor null / monthlyValueId 0.

- [ ] **Step 3: Implementar o ramo LMS.** Espelhar o laço de rollup (886–937), filtrando `indicators.filter(i => i.computedSource === "lms")`. Para cada mês, `value = await computeLmsMetric({...})`. Diferença-chave vs rollup: **materializar** — fazer `upsert` em `kpi_monthly_values` por `(yearConfigId, month)` com `value`, `isComputed=true`, `isOverridden=false`, e usar o `id` retornado como `monthlyValueId` da célula em memória. Respeitar `isOverridden` existente (se um dia houver). Usar `db.insert(...).onConflictDoUpdate({ target: [yearConfigId, month], set: {...} }).returning()` sobre a constraint `kpi_monthly_value_config_month_unique`.

- [ ] **Step 4: Rodar e ver passar.** Expected: PASS (valor 50, monthlyValueId real).

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat(kpi): resolução on-read + materialização dos indicadores LMS"
```

---

### Task 6: Tolerância na serialização + `getTrafficLight` configurável

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (`KpiYearConfig.tolerance`, body de upsert)
- Modify: `artifacts/api-server/src/routes/kpi/index.ts` (upsert do year-config aceita `tolerance`; serialização inclui `tolerance`)
- Modify: `artifacts/web/src/lib/kpi-client.ts` (`getTrafficLight` param opcional)
- Test: `artifacts/web/tests/lib/kpi-traffic-light.unit.test.ts`

**Interfaces:**
- Produces: `getTrafficLight(value, goal, direction, tolerance?: number | null)` — `tolerance ?? 0.01`.

- [ ] **Step 1: Teste falho (web-unit).**

```ts
import { getTrafficLight } from "@/lib/kpi-client";
import { describe, it, expect } from "vitest";
describe("getTrafficLight tolerância", () => {
  it("usa a tolerância informada", () => {
    // meta 80, valor 78, direção up: com tolerância 5 → yellow; sem → red
    expect(getTrafficLight(78, 80, "up", 5)).toBe("yellow");
    expect(getTrafficLight(78, 80, "up")).toBe("red");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/kpi-traffic-light.unit.test.ts`. Expected: FAIL (4º arg ignorado / assinatura).

- [ ] **Step 3: Implementar.** Em `kpi-client.ts:121`:

```ts
export function getTrafficLight(
  value: number | null | undefined,
  goal: number | null | undefined,
  direction: KpiDirection,
  tolerance?: number | null,
): TrafficLight | null {
  if (value === null || value === undefined) return null;
  if (goal === null || goal === undefined) return null;
  const tol = tolerance ?? 0.01;
  if (direction === "up") {
    if (value >= goal) return "green";
    if (value >= goal - tol) return "yellow";
    return "red";
  } else {
    if (value <= goal) return "green";
    if (value <= goal + tol) return "yellow";
    return "red";
  }
}
```

- [ ] **Step 4: Backend — persistir e serializar `tolerance`.** No `openapi.yaml`: adicionar `tolerance` (number, nullable) em `KpiYearConfig` e no body do upsert de year-config. No handler de upsert do year-config (`kpi/index.ts`), gravar `tolerance: body.data.tolerance ?? null`. Na serialização do ano, incluir `tolerance: yc.tolerance != null ? Number(yc.tolerance) : null`. Rodar codegen + `typecheck:libs`.

- [ ] **Step 5: Rodar e ver passar.** Run: comando do Step 2 + `pnpm --filter @workspace/web typecheck`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add -A && git commit -m "feat(kpi): tolerância configurável por indicador/ano no semáforo"
```

---

### Task 7: UI de config — campo Tolerância + meta editável para LMS

**Files:**
- Modify: `artifacts/web/src/pages/app/kpi/indicadores.tsx`

**Interfaces:**
- Consumes: `getTrafficLight` com `tolerance` (Task 6); `KpiYearConfig.tolerance` (gerado).

- [ ] **Step 1: Campo Tolerância no formulário de indicador/ano.** Onde hoje há o input de `goal` ("Tolerância e objetivo para {year}", ~linha 1306–1314), adicionar um input numérico "Tolerância" que grava `tolerance` no mesmo upsert (`useUpsertKpiYearConfigWithInvalidation`). Incluir `tolerance` no `IndicatorFormData` e no payload.

- [ ] **Step 2: Meta editável para indicador LMS.** Onde a meta é read-only para corporativo (`isCorporateUnit(...)` → "Calculada automaticamente das filiais", ~linha 1298–1304): a condição deve ser "corporativo **de rollup**", não LMS. Como os indicadores LMS têm `unitId=null` mas `computedSource='lms'` (e não são rollup), garantir que a checagem de read-only use rollup/`isCorporateUnit` sem capturar LMS — na ativação (Task 4) NÃO setar `unit='Corporativo'` para os LMS, de modo que `isCorporateUnit(ind.unit)` seja falso e a meta fique editável.

- [ ] **Step 3: Passar `tolerance` ao semáforo.** Onde `getTrafficLight(value, goal, direction)` é chamado a partir de linhas do ano, passar o 4º arg `row.tolerance`.

- [ ] **Step 4: Typecheck + build.** Run: `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat(kpi-web): config de tolerância + meta editável p/ indicador de treinamento"
```

---

### Task 8: Lançamento somente-leitura + selo para indicadores LMS

**Files:**
- Modify: `artifacts/web/src/pages/app/kpi/_components/lancar-screen.tsx`
- Modify: `artifacts/web/src/pages/app/kpi/_components/indicator-card.tsx` (selo)

**Interfaces:**
- Consumes: `KpiIndicator.computedSource` (gerado, Task 4/6 codegen).

- [ ] **Step 1: Bloquear entrada manual.** Em `lancar-screen.tsx`, quando o indicador selecionado tem `computedSource === "lms"`, desabilitar os inputs de valor/inputs e exibir mensagem "Valor calculado automaticamente do módulo de Treinamento". O desvio→plano de ação (célula fora da tolerância) deve continuar acessível (a célula é materializada, `monthlyValueId != null`).

- [ ] **Step 2: Selo no card.** Em `indicator-card.tsx`, quando `computedSource === "lms"`, exibir selo "↻ automático (Treinamento)" (espelhar o selo de rollup ~linha 197–213).

- [ ] **Step 3: Typecheck + build.** Run: `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add -A && git commit -m "feat(kpi-web): lançamento read-only + selo p/ indicadores de treinamento"
```

---

### Task 9: Endpoint de resumo do dashboard operacional

**Files:**
- Create: `artifacts/api-server/src/services/aprendizagem/learning-summary.ts`
- Create: `artifacts/api-server/src/routes/learning-summary.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (montar o router sob módulo `employees`)
- Modify: `lib/api-spec/openapi.yaml` (`GET /organizations/{orgId}/learning/summary` + `LearningSummary` schema)
- Test: `artifacts/api-server/tests/routes/learning-summary.integration.test.ts`

**Interfaces:**
- Produces: `LearningSummary` = `{ cards: { patCompletion, effectiveness, criticalGaps, expiredTrainings }, byUnit: Array<{ unitId, unitName, completion, effectiveness, gaps, status }>, byNorm: Array<{ norm, effectiveness }>, expired: Array<{ employeeName, unitName, title, expirationDate }>, pendingEffectiveness: Array<{ employeeName, title }> }`.

- [ ] **Step 1: Teste falho.** Semear dados mínimos, `GET /organizations/:orgId/learning/summary?year=2026`, conferir shape (cards numéricos, arrays presentes) e escopo por org (chamar com outra org → 403).

- [ ] **Step 2: Rodar e ver falhar.** Expected: 404.

- [ ] **Step 3: Implementar** `computeLearningSummary({ orgId, year, unitId?, database })` reusando `computeLmsMetric` para os cards corporativos + consultas agregadas por filial/norma + as listas (vencidos via `employee_trainings`, eficácia pendente via `training_effectiveness` pendente). Rota `GET` valida params/query (Zod), escopo por org, `requireAuth`. Montar em `index.ts` no bloco de módulo `employees` (regex incluindo `/learning/summary`). Spec + codegen + `typecheck:libs`.

- [ ] **Step 4: Rodar e ver passar.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat(aprendizagem): endpoint de resumo do dashboard operacional"
```

---

### Task 10: Tela Dashboard operacional (mockup tela 1)

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/dashboard/index.tsx`
- Modify: `artifacts/web/src/App.tsx` (rotas `/aprendizagem/dashboard` e `/app/aprendizagem/dashboard`)
- Modify: `artifacts/web/src/components/layout/AppLayout.tsx` (item de menu "Dashboard" no grupo Aprendizagem; `moduleByPath` → `employees`; breadcrumb)

**Interfaces:**
- Consumes: hook gerado do `GET /learning/summary` (`useGetLearningSummary` ou nome gerado pelo Orval).

- [ ] **Step 1: Página read-only** fiel ao mockup: 4 cartões (cumprimento, eficácia, gaps, vencidos), barras "Cumprimento por filial" e "Eficácia por norma" (recharts), tabela de vencidos, lista de eficácia pendente (deep-link `/aprendizagem/eficacia` via wouter). Estados loading/empty/erro (`isError`). Gating de leitura por `useAuth`/orgId.

- [ ] **Step 2: Rotas + menu + breadcrumb.** Registrar as rotas (ambos os prefixos), o item de menu e o `moduleByPath` (`module: "employees"`).

- [ ] **Step 3: Typecheck + build.** Run: `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add -A && git commit -m "feat(aprendizagem): tela Dashboard operacional (tela 1 do mockup)"
```

---

### Task 11: Desvio → plano de ação (verificação de integração) + botão de ativação

**Files:**
- Test: `artifacts/api-server/tests/routes/kpi-lms-indicators.integration.test.ts`
- Modify: (opcional) uma tela do LMS/KPI com botão "Ativar indicadores de treinamento" chamando o endpoint da Task 4.

**Interfaces:**
- Consumes: seam (Task 5), fluxo de ação KPI existente (`sourceModule="kpi"`, `sourceRef.kpiMonthlyValueId`).

- [ ] **Step 1: Teste de integração ponta-a-ponta.** Ativar indicadores, semear dado que deixe `expired_trainings > 0` (célula vermelha, materializada), criar um plano de ação com `sourceModule="kpi"` + `sourceRef.kpiMonthlyValueId` = id da célula, e conferir via a consulta de ações vinculadas (`sourceRef->>'kpiMonthlyValueId'`) que a ação aparece. Confirma que a materialização (Task 5) habilita o plano de ação.

- [ ] **Step 2: Rodar e ver passar.** Expected: PASS (se falhar por monthlyValueId 0, revisar a materialização da Task 5).

- [ ] **Step 3: Botão de ativação.** Adicionar botão "Ativar indicadores de treinamento" (gated por escrita) numa tela do módulo LMS (ex.: no Dashboard ou na tela de eficácia), chamando o endpoint da Task 4 e dando toast de resultado.

- [ ] **Step 4: Typecheck + build.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "test(kpi): desvio→plano de ação em indicador LMS + botão de ativação"
```

---

### Task 12: Verificação final do SP6/B

**Files:** nenhum (verificação).

- [ ] **Step 1: Typecheck completo.** Run: `pnpm typecheck`. Expected: verde (libs+apps+e2e).
- [ ] **Step 2: Integração (aprendizagem + kpi + regressão).** Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec vitest run --project integration --no-file-parallelism`. Expected: verde exceto as 2 falhas pré-existentes só-docker (governance-system, laia — count-as-string).
- [ ] **Step 3: node-unit (regressão kpi).** Run: `pnpm exec vitest run --project node-unit --no-file-parallelism`. Expected: verde.
- [ ] **Step 4: web-unit do semáforo.** Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/kpi-traffic-light.unit.test.ts`. Expected: verde.
- [ ] **Step 5: build web.** Run: `pnpm --filter @workspace/web build`. Expected: verde.
- [ ] **Step 6: Smoke runtime** em :3002 (DB :55432): subir a API, ativar indicadores numa org de teste, `GET .../kpi/years/2026` e `GET .../learning/summary`. Derrubar só o processo de :3002 (nunca tocar :3001).
- [ ] **Step 7: Diário de bordo.** `python3 scripts/diario-add.py --modulo "Gestão de Aprendizagem" --titulo "SP6/B — indicadores de treinamento no módulo de Indicadores + dashboard" --file <entrada.md>`.
- [ ] **Step 8: Backup push.** `git push origin feat/gestao-aprendizagem`.

---

## Self-Review (contra o spec)

- **Cobertura:** seam computedSource=lms (T5) ✓; provider 6 métricas (T2/T3) ✓; schema computed_source/metric + tolerance (T1) ✓; ativação idempotente (T4) ✓; tolerância configurável + getTrafficLight (T6/T7) ✓; lançamento read-only + selo (T8) ✓; desvio→plano de ação (T11) ✓; dashboard tela 1 + resumo (T9/T10) ✓; DDL prod (T1) ✓; caveats (gaps snapshot, por-norma) refletidos em T3/T9. Fora de escopo (por-filial, histórico de gaps, export) não viram tarefa — correto.
- **Consistência de tipos:** `LmsMetricKey` (T2) usado em T3/T4/T5/T9; `computeLmsMetric` assinatura estável; `getTrafficLight(...tolerance?)` (T6) consumido em T7; `computedSource`/`computedMetric`/`tolerance` consistentes entre schema (T1), openapi/codegen (T4/T6) e UI (T7/T8).
- **Riscos anotados:** confirmar nomes de coluna de `trainingEffectivenessReviewsTable` antes de T2; extrair `countCriticalGapEmployees` do endpoint de gaps (DRY) em T3; a materialização (T5) é o que habilita o plano de ação (T11) — se T11 falhar, revisar T5.
