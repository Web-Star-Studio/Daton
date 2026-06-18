# Suas Pendências — Fase 2 (Motor de pendências + endpoint) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the extensible server-side engine that aggregates every domain's "responsável + prazo" items into one normalized, prioritized list, exposed at `GET /organizations/:orgId/pendencias` with scope (mine/unit/org) and role-based authorization.

**Architecture:** A **provider registry**: each domain implements `PendenciaProvider.listPending(ctx)` returning normalized `Pendencia[]`; an aggregator fans out over the registry, enriches responsible names, computes counts, and sorts by priority. Adding a future module = adding one provider to the registry — nothing else changes. Urgency is owned by each domain (KPI=overdue, regulatory uses its persisted `a_vencer`/`vencido`, date-based domains use the shared `classifyUrgency`). Providers are plain async functions tested directly with an injected `now`; the route handles scope resolution + auth.

**Tech Stack:** Express 5, Drizzle ORM (PostgreSQL), Zod, Vitest (`node-unit` for pure logic, `integration` for DB/route), supertest.

## Global Constraints

- **Responsável é sempre `users.id`** (FK), nunca employee (memory `responsavel-must-be-user`). Todo provider filtra por `responsibleUserId IN (ctx.responsibleUserIds)`.
- **Filial é escopada pelo responsável** via `users.primaryUnitId` (entregue na F1) — `scope=unit` resolve os usuários daquela filial, não as unidades das entidades.
- **Não gatear por módulo:** o painel de pendências é de todo usuário. Montar o router só com `requireAuth, requireCompletedOnboarding` (igual ao `actionPlansRouter`), sem `requireModuleAccessForPaths`.
- **Autorização de escopo:** `operator`/`analyst` só podem `scope=mine` (qualquer outro → 403). `org_admin`/`platform_admin` podem `mine`/`unit`/`org`.
- **Degradação graciosa:** se um provider lança erro, o agregador loga e segue com os demais — um domínio quebrado não derruba o painel.
- **Reuso, sem duplicar regra:** a lógica de "indicador atrasado" (`computeFeedStatus`) é extraída para um service compartilhado e reusada; a rota KPI passa a importar de lá (sem mudança de comportamento). (spec risk note `computeFeedStatus`.)
- **Não commitar/pushar sem pedido explícito.** Os passos "Commit" abaixo só rodam quando o usuário autorizar.
- Tudo passa `pnpm typecheck`. Strings de usuário em PT-BR. Integration tests dependem do DB de teste: `pnpm test:integration:up` + `pnpm test:integration:db:push` (NUNCA `db push` puro — aponta p/ PROD).

## File Structure

- `artifacts/api-server/src/services/pendencias/types.ts` — `Pendencia`, urgency/priority types, `PendenciaProvider`, `PendenciaProviderContext`, `classifyUrgency`, `urgencyToPriority`, `SOURCE_LABELS`. **Pure (no DB import)** so `node-unit` can test it. NOTE: the `node-unit` vitest project only matches `*.unit.test.ts`; the `integration` project only matches `*.integration.test.ts` — name test files accordingly.
- `artifacts/api-server/src/services/kpi/feed-status.ts` — `expectedMonthsFor`, `firstOverdueMonth`, `computeFeedStatus` extracted from the KPI route. **Pure.**
- `artifacts/api-server/src/services/pendencias/providers/kpi.ts` — `kpiPendenciaProvider`.
- `artifacts/api-server/src/services/pendencias/providers/action-plans.ts` — `actionPlanPendenciaProvider`.
- `artifacts/api-server/src/services/pendencias/providers/nonconformities.ts` — `nonconformityPendenciaProvider` (NCs + corrective actions).
- `artifacts/api-server/src/services/pendencias/providers/regulatory-documents.ts` — `regulatoryDocumentPendenciaProvider`.
- `artifacts/api-server/src/services/pendencias/registry.ts` — `pendenciaProviders` array (único ponto de extensão).
- `artifacts/api-server/src/services/pendencias/aggregate.ts` — `aggregatePendencias(ctx)` (fan-out, enrich, counts, sort).
- `artifacts/api-server/src/routes/pendencias.ts` — `GET /organizations/:orgId/pendencias`.
- Modify `artifacts/api-server/src/routes/index.ts` — import + mount the router.
- Modify `artifacts/api-server/src/routes/kpi/index.ts` — import the extracted feed-status; delete the local copies.

---

### Task 1: Normalized types + `classifyUrgency`

**Files:**
- Create: `artifacts/api-server/src/services/pendencias/types.ts`
- Test: `artifacts/api-server/tests/services/pendencias/classify-urgency.unit.test.ts`

**Interfaces:**
- Produces:
  - `type PendenciaSource = "kpi" | "action_plan" | "nonconformity" | "regulatory_document"`
  - `type PendenciaUrgency = "overdue" | "due_soon" | "upcoming" | "no_due"`
  - `type PendenciaPriority = "p1" | "p2" | "p3"`
  - `interface Pendencia { id: string; source: PendenciaSource; sourceLabel: string; title: string; subtitle?: string; statusLabel: string; dueDate: string | null; urgency: PendenciaUrgency; responsibleUserId: number; responsibleName?: string; link: { route: string; ctaLabel: string }; meta?: Record<string, unknown> }`
  - `interface PendenciaProviderContext { orgId: number; responsibleUserIds: number[]; now: Date; dueSoonDays: number }`
  - `interface PendenciaProvider { source: PendenciaSource; listPending(ctx): Promise<Pendencia[]>; listCompletedToday?(ctx): Promise<Pendencia[]> }`
  - `classifyUrgency(dueDate: string | Date | null, now: Date, dueSoonDays: number): PendenciaUrgency`
  - `urgencyToPriority(u: PendenciaUrgency): PendenciaPriority | null` (upcoming → null)
  - `SOURCE_LABELS: Record<PendenciaSource, string>`

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/services/pendencias/classify-urgency.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyUrgency, urgencyToPriority } from "../../../src/services/pendencias/types";

const NOW = new Date(2026, 5, 15, 10, 0, 0); // 2026-06-15 local

describe("classifyUrgency", () => {
  it("returns no_due for null", () => {
    expect(classifyUrgency(null, NOW, 7)).toBe("no_due");
  });
  it("returns overdue for a past date", () => {
    expect(classifyUrgency("2026-06-14", NOW, 7)).toBe("overdue");
  });
  it("returns due_soon for today", () => {
    expect(classifyUrgency("2026-06-15", NOW, 7)).toBe("due_soon");
  });
  it("returns due_soon at the dueSoonDays boundary", () => {
    expect(classifyUrgency("2026-06-22", NOW, 7)).toBe("due_soon"); // +7
  });
  it("returns upcoming just past the boundary", () => {
    expect(classifyUrgency("2026-06-23", NOW, 7)).toBe("upcoming"); // +8
  });
  it("accepts a Date and full ISO string", () => {
    expect(classifyUrgency(new Date(2026, 5, 14), NOW, 7)).toBe("overdue");
    expect(classifyUrgency("2026-06-20T23:00:00.000Z", NOW, 7)).toBe("due_soon");
  });
});

describe("urgencyToPriority", () => {
  it("maps urgencies to priorities, upcoming hidden", () => {
    expect(urgencyToPriority("overdue")).toBe("p1");
    expect(urgencyToPriority("due_soon")).toBe("p2");
    expect(urgencyToPriority("no_due")).toBe("p3");
    expect(urgencyToPriority("upcoming")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/pendencias/classify-urgency.unit.test.ts`
Expected: FAIL — cannot import from a non-existent `types` module.

- [ ] **Step 3: Create the types module**

Create `artifacts/api-server/src/services/pendencias/types.ts`:

```ts
export type PendenciaSource =
  | "kpi"
  | "action_plan"
  | "nonconformity"
  | "regulatory_document";

export type PendenciaUrgency = "overdue" | "due_soon" | "upcoming" | "no_due";
export type PendenciaPriority = "p1" | "p2" | "p3";

export interface Pendencia {
  /** estável e único, ex.: "action_plan:123" */
  id: string;
  source: PendenciaSource;
  sourceLabel: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  /** ISO (date-only "YYYY-MM-DD" ou datetime). null = sem prazo. */
  dueDate: string | null;
  urgency: PendenciaUrgency;
  responsibleUserId: number;
  responsibleName?: string;
  link: { route: string; ctaLabel: string };
  meta?: Record<string, unknown>;
}

export interface PendenciaProviderContext {
  orgId: number;
  /** responsáveis que o solicitante pode ver (já resolvido pelo escopo). */
  responsibleUserIds: number[];
  /** "agora" injetável p/ testabilidade. */
  now: Date;
  /** janela de "a vencer em breve" (default 7). */
  dueSoonDays: number;
}

export interface PendenciaProvider {
  source: PendenciaSource;
  listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]>;
  listCompletedToday?(ctx: PendenciaProviderContext): Promise<Pendencia[]>;
}

export const SOURCE_LABELS: Record<PendenciaSource, string> = {
  kpi: "Indicador",
  action_plan: "Plano de ação",
  nonconformity: "Não conformidade",
  regulatory_document: "Documento regulatório",
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse evitando drift de fuso: "YYYY-MM-DD" vira data local, não UTC. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

export function classifyUrgency(
  dueDate: string | Date | null,
  now: Date,
  dueSoonDays: number,
): PendenciaUrgency {
  if (dueDate == null) return "no_due";
  const dueDay = startOfDay(toDate(dueDate));
  const today = startOfDay(now);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= dueSoonDays) return "due_soon";
  return "upcoming";
}

export function urgencyToPriority(u: PendenciaUrgency): PendenciaPriority | null {
  switch (u) {
    case "overdue":
      return "p1";
    case "due_soon":
      return "p2";
    case "no_due":
      return "p3";
    case "upcoming":
      return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/pendencias/classify-urgency.unit.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/types.ts artifacts/api-server/tests/services/pendencias/classify-urgency.unit.test.ts
git commit -m "feat(pendencias): normalized Pendencia types + classifyUrgency"
```

---

### Task 2: Extract KPI feed-status to a shared service

**Files:**
- Create: `artifacts/api-server/src/services/kpi/feed-status.ts`
- Modify: `artifacts/api-server/src/routes/kpi/index.ts` (remove local `expectedMonthsFor`/`computeFeedStatus`, import from service)
- Test: `artifacts/api-server/tests/services/kpi/feed-status.unit.test.ts`

**Interfaces:**
- Produces:
  - `expectedMonthsFor(periodicity: string, referenceMonth: number | null): number[]`
  - `firstOverdueMonth(monthValues: (number | null)[], periodicity: string, referenceMonth: number | null, year: number, now?: Date): number | null` — earliest 1-indexed month that is expected, already due, and unfilled; `null` if none.
  - `computeFeedStatus(monthValues, periodicity, referenceMonth, year, now?): "fed" | "overdue"` — `"overdue"` iff `firstOverdueMonth(...) !== null`. Same observable behavior as the current route copy.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/services/kpi/feed-status.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeFeedStatus,
  expectedMonthsFor,
  firstOverdueMonth,
} from "../../../src/services/kpi/feed-status";

// Fixed "now" = 2026-06-15 → for the current year, months 1..5 are due (currentMonth-1).
const NOW = new Date(2026, 5, 15);
const empty = (): (number | null)[] => Array(12).fill(null);

describe("firstOverdueMonth (monthly)", () => {
  it("flags the earliest due month that is empty", () => {
    expect(firstOverdueMonth(empty(), "monthly", null, 2026, NOW)).toBe(1);
  });
  it("returns null when all due months are filled", () => {
    const v = empty();
    for (let m = 1; m <= 5; m++) v[m - 1] = 10;
    expect(firstOverdueMonth(v, "monthly", null, 2026, NOW)).toBeNull();
  });
  it("ignores not-yet-due months (June onward)", () => {
    const v = empty();
    for (let m = 1; m <= 5; m++) v[m - 1] = 10; // 1..5 filled; 6.. empty but not due
    expect(firstOverdueMonth(v, "monthly", null, 2026, NOW)).toBeNull();
  });
});

describe("firstOverdueMonth (non-monthly)", () => {
  it("uses referenceMonth for quarterly", () => {
    // quarterly from ref month 1 → expected [1,4,7,10]; due months ≤5 → 1 and 4
    expect(firstOverdueMonth(empty(), "quarterly", 1, 2026, NOW)).toBe(1);
  });
  it("returns null with no referenceMonth", () => {
    expect(firstOverdueMonth(empty(), "annual", null, 2026, NOW)).toBeNull();
  });
});

describe("firstOverdueMonth (year boundaries)", () => {
  it("returns null for a future year", () => {
    expect(firstOverdueMonth(empty(), "monthly", null, 2027, NOW)).toBeNull();
  });
  it("treats a past year as all 12 due", () => {
    expect(firstOverdueMonth(empty(), "monthly", null, 2025, NOW)).toBe(1);
  });
});

describe("computeFeedStatus", () => {
  it("derives fed/overdue from firstOverdueMonth", () => {
    expect(computeFeedStatus(empty(), "monthly", null, 2026, NOW)).toBe("overdue");
    const v = empty();
    for (let m = 1; m <= 5; m++) v[m - 1] = 1;
    expect(computeFeedStatus(v, "monthly", null, 2026, NOW)).toBe("fed");
  });
});

describe("expectedMonthsFor", () => {
  it("maps periodicities to month sets", () => {
    expect(expectedMonthsFor("annual", 3)).toEqual([3]);
    expect(expectedMonthsFor("semiannual", 1)).toEqual([1, 7]);
    expect(expectedMonthsFor("quarterly", 2)).toEqual([2, 5, 8, 11]);
    expect(expectedMonthsFor("monthly", 1)).toEqual([]);
    expect(expectedMonthsFor("annual", null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/kpi/feed-status.unit.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create the feed-status service**

Create `artifacts/api-server/src/services/kpi/feed-status.ts`:

```ts
/**
 * Lógica de "indicador a alimentar / atrasado", extraída da rota KPI para ser
 * reusada pelo provider de pendências (sem duplicar a regra). Comportamento de
 * `computeFeedStatus` é idêntico ao da rota original.
 */
export function expectedMonthsFor(
  periodicity: string,
  referenceMonth: number | null,
): number[] {
  if (!referenceMonth || referenceMonth < 1 || referenceMonth > 12) return [];
  const at = (offset: number) => ((referenceMonth - 1 + offset) % 12) + 1;
  if (periodicity === "annual") return [at(0)];
  if (periodicity === "semiannual") return [at(0), at(6)];
  if (periodicity === "quarterly") return [at(0), at(3), at(6), at(9)];
  return [];
}

/** Primeiro mês (1-indexado) esperado, já exigível e sem lançamento. null = nenhum. */
export function firstOverdueMonth(
  monthValues: (number | null)[],
  periodicity: string,
  referenceMonth: number | null,
  year: number,
  now: Date = new Date(),
): number | null {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const maxMonthDue =
    year < currentYear ? 12 : year > currentYear ? 0 : currentMonth - 1;
  if (maxMonthDue === 0) return null;

  if (
    periodicity === "monthly" ||
    periodicity === "monthly_15d" ||
    periodicity === "monthly_45d"
  ) {
    for (let m = 1; m <= maxMonthDue; m++) {
      if (monthValues[m - 1] === null || monthValues[m - 1] === undefined) return m;
    }
    return null;
  }

  if (!referenceMonth || referenceMonth < 1 || referenceMonth > 12) return null;
  const expected = expectedMonthsFor(periodicity, referenceMonth);
  for (const m of expected) {
    if (m <= maxMonthDue && (monthValues[m - 1] === null || monthValues[m - 1] === undefined)) {
      return m;
    }
  }
  return null;
}

export function computeFeedStatus(
  monthValues: (number | null)[],
  periodicity: string,
  referenceMonth: number | null,
  year: number,
  now: Date = new Date(),
): "fed" | "overdue" {
  return firstOverdueMonth(monthValues, periodicity, referenceMonth, year, now) === null
    ? "fed"
    : "overdue";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/kpi/feed-status.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Point the KPI route at the service (no behavior change)**

In `artifacts/api-server/src/routes/kpi/index.ts`:
1. Delete the local `function expectedMonthsFor(...) { ... }` (lines ~110-120) and `function computeFeedStatus(...) { ... }` (lines ~122-163).
2. Add an import at the top of the file (next to the other local imports):

```ts
import { computeFeedStatus } from "../../services/kpi/feed-status";
```

(The single call site `computeFeedStatus(monthValues, periodicity, referenceMonth, year)` at ~line 884 stays unchanged — `now` defaults to `new Date()`.)

- [ ] **Step 6: Typecheck the api-server (proves the route still compiles against the extracted fn)**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/services/kpi/feed-status.ts artifacts/api-server/src/routes/kpi/index.ts artifacts/api-server/tests/services/kpi/feed-status.unit.test.ts
git commit -m "refactor(kpi): extract feed-status to shared service (+ firstOverdueMonth)"
```

---

### Task 3: KPI provider

**Files:**
- Create: `artifacts/api-server/src/services/pendencias/providers/kpi.ts`
- Test: `artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`

**Interfaces:**
- Consumes: `Pendencia`/`PendenciaProvider`/`PendenciaProviderContext` (Task 1), `firstOverdueMonth` (Task 2), `kpiIndicatorsTable`/`kpiYearConfigsTable`/`kpiMonthlyValuesTable` from `@workspace/db`.
- Produces: `export const kpiPendenciaProvider: PendenciaProvider` — one `overdue` pendência per responsible indicator with a current-year config and an unfilled due month.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  db,
  kpiIndicatorsTable,
  kpiYearConfigsTable,
} from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { kpiPendenciaProvider } from "../../../src/services/pendencias/providers/kpi";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("kpiPendenciaProvider", () => {
  it("emits an overdue pendência for an indicator with no values in a due month", async () => {
    const ctx = await createTestContext({ seed: "pend-kpi" });
    contexts.push(ctx);

    const [indicator] = await db
      .insert(kpiIndicatorsTable)
      .values({
        organizationId: ctx.organizationId,
        name: `Indicador ${ctx.prefix}`,
        measurement: "Taxa",
        direction: "up",
        periodicity: "monthly",
        responsibleUserId: ctx.userId,
      })
      .returning({ id: kpiIndicatorsTable.id });

    await db.insert(kpiYearConfigsTable).values({
      organizationId: ctx.organizationId,
      indicatorId: indicator.id,
      year: 2026,
    });

    // now = mid-2026 → months 1..5 due, none filled → overdue at month 1.
    const items = await kpiPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: new Date(2026, 5, 15),
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "kpi",
      urgency: "overdue",
      responsibleUserId: ctx.userId,
      dueDate: "2026-01-31",
    });
    expect(items[0].id).toBe(`kpi:${indicator.id}:2026:1`);
    expect(items[0].link.route).toBe("/app/kpi/lancamentos");
  });

  it("emits nothing when the indicator belongs to another responsible", async () => {
    const ctx = await createTestContext({ seed: "pend-kpi-other" });
    contexts.push(ctx);

    const [indicator] = await db
      .insert(kpiIndicatorsTable)
      .values({
        organizationId: ctx.organizationId,
        name: `Indicador ${ctx.prefix}`,
        measurement: "Taxa",
        direction: "up",
        periodicity: "monthly",
        responsibleUserId: ctx.userId,
      })
      .returning({ id: kpiIndicatorsTable.id });
    await db.insert(kpiYearConfigsTable).values({
      organizationId: ctx.organizationId,
      indicatorId: indicator.id,
      year: 2026,
    });

    const items = await kpiPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId + 99999], // not the responsible
      now: new Date(2026, 5, 15),
      dueSoonDays: 7,
    });
    expect(items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`
Expected: FAIL — provider module does not exist.

- [ ] **Step 3: Implement the KPI provider**

Create `artifacts/api-server/src/services/pendencias/providers/kpi.ts`:

```ts
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
} from "@workspace/db";
import { firstOverdueMonth } from "../../kpi/feed-status";
import {
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** "YYYY-MM-DD" do último dia do mês (1-indexado), sem drift de fuso. */
function lastDayIso(year: number, month: number): string {
  const day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const kpiPendenciaProvider: PendenciaProvider = {
  source: "kpi",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const year = ctx.now.getFullYear();

    const indicators = await db
      .select({
        id: kpiIndicatorsTable.id,
        name: kpiIndicatorsTable.name,
        periodicity: kpiIndicatorsTable.periodicity,
        referenceMonth: kpiIndicatorsTable.referenceMonth,
        responsibleUserId: kpiIndicatorsTable.responsibleUserId,
      })
      .from(kpiIndicatorsTable)
      .where(
        and(
          eq(kpiIndicatorsTable.organizationId, ctx.orgId),
          isNotNull(kpiIndicatorsTable.responsibleUserId),
          inArray(kpiIndicatorsTable.responsibleUserId, ctx.responsibleUserIds),
        ),
      );
    if (indicators.length === 0) return [];

    const indicatorIds = indicators.map((i) => i.id);
    const configs = await db
      .select({
        id: kpiYearConfigsTable.id,
        indicatorId: kpiYearConfigsTable.indicatorId,
      })
      .from(kpiYearConfigsTable)
      .where(
        and(
          eq(kpiYearConfigsTable.organizationId, ctx.orgId),
          eq(kpiYearConfigsTable.year, year),
          inArray(kpiYearConfigsTable.indicatorId, indicatorIds),
        ),
      );
    if (configs.length === 0) return [];

    const configByIndicator = new Map(configs.map((c) => [c.indicatorId, c.id]));
    const configIds = configs.map((c) => c.id);

    const values = await db
      .select({
        yearConfigId: kpiMonthlyValuesTable.yearConfigId,
        month: kpiMonthlyValuesTable.month,
        value: kpiMonthlyValuesTable.value,
      })
      .from(kpiMonthlyValuesTable)
      .where(inArray(kpiMonthlyValuesTable.yearConfigId, configIds));

    // configId -> month(1..12) -> filled?
    const filledByConfig = new Map<number, (number | null)[]>();
    for (const cid of configIds) filledByConfig.set(cid, Array(12).fill(null));
    for (const v of values) {
      const arr = filledByConfig.get(v.yearConfigId);
      if (arr && v.value !== null) arr[v.month - 1] = 1; // any non-null marks "filled"
    }

    const items: Pendencia[] = [];
    for (const ind of indicators) {
      const configId = configByIndicator.get(ind.id);
      if (configId === undefined || ind.responsibleUserId === null) continue;
      const monthValues = filledByConfig.get(configId) ?? Array(12).fill(null);
      const month = firstOverdueMonth(
        monthValues,
        ind.periodicity,
        ind.referenceMonth ?? null,
        year,
        ctx.now,
      );
      if (month === null) continue;
      items.push({
        id: `kpi:${ind.id}:${year}:${month}`,
        source: "kpi",
        sourceLabel: SOURCE_LABELS.kpi,
        title: ind.name,
        statusLabel: `Lançamento em atraso (${MONTH_LABELS[month - 1]}/${year})`,
        dueDate: lastDayIso(year, month),
        urgency: "overdue",
        responsibleUserId: ind.responsibleUserId,
        link: { route: "/app/kpi/lancamentos", ctaLabel: "Alimentar" },
        meta: { indicatorId: ind.id, year, month },
      });
    }
    return items;
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/kpi.ts artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts
git commit -m "feat(pendencias): KPI provider (indicador atrasado)"
```

---

### Task 4: Action plans provider

**Files:**
- Create: `artifacts/api-server/src/services/pendencias/providers/action-plans.ts`
- Test: `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`

**Interfaces:**
- Consumes: types (Task 1), `classifyUrgency` (Task 1), `actionPlansTable` from `@workspace/db`.
- Produces: `export const actionPlanPendenciaProvider: PendenciaProvider` — one pendência per open/in_progress plan owned by a responsible, urgency from `dueDate`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { actionPlanPendenciaProvider } from "../../../src/services/pendencias/providers/action-plans";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15);

async function seedPlan(
  ctx: TestOrgContext,
  overrides: { title: string; status: "open" | "in_progress" | "completed" | "cancelled"; dueDate: Date | null },
) {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "test" },
      title: overrides.title,
      status: overrides.status,
      responsibleUserId: ctx.userId,
      dueDate: overrides.dueDate,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("actionPlanPendenciaProvider", () => {
  it("classifies overdue, due_soon and upcoming open plans; skips completed/cancelled", async () => {
    const ctx = await createTestContext({ seed: "pend-ap" });
    contexts.push(ctx);
    const overdueId = await seedPlan(ctx, { title: "Atrasado", status: "open", dueDate: new Date(2026, 5, 10) });
    const soonId = await seedPlan(ctx, { title: "Em breve", status: "in_progress", dueDate: new Date(2026, 5, 18) });
    const futureId = await seedPlan(ctx, { title: "Futuro", status: "open", dueDate: new Date(2026, 7, 1) });
    await seedPlan(ctx, { title: "Concluído", status: "completed", dueDate: new Date(2026, 5, 10) });
    await seedPlan(ctx, { title: "Cancelado", status: "cancelled", dueDate: new Date(2026, 5, 10) });

    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(items).toHaveLength(3);
    expect(byId.get(`action_plan:${overdueId}`)?.urgency).toBe("overdue");
    expect(byId.get(`action_plan:${soonId}`)?.urgency).toBe("due_soon");
    expect(byId.get(`action_plan:${futureId}`)?.urgency).toBe("upcoming");
    expect(byId.get(`action_plan:${overdueId}`)?.link.route).toBe(`/app/planos-acao/${overdueId}`);
    expect(byId.get(`action_plan:${overdueId}`)?.source).toBe("action_plan");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`
Expected: FAIL — provider module missing.

- [ ] **Step 3: Implement the action plans provider**

Create `artifacts/api-server/src/services/pendencias/providers/action-plans.ts`:

```ts
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, actionPlansTable } from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
};

export const actionPlanPendenciaProvider: PendenciaProvider = {
  source: "action_plan",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const rows = await db
      .select({
        id: actionPlansTable.id,
        code: actionPlansTable.code,
        title: actionPlansTable.title,
        status: actionPlansTable.status,
        priority: actionPlansTable.priority,
        dueDate: actionPlansTable.dueDate,
        responsibleUserId: actionPlansTable.responsibleUserId,
      })
      .from(actionPlansTable)
      .where(
        and(
          eq(actionPlansTable.organizationId, ctx.orgId),
          isNotNull(actionPlansTable.responsibleUserId),
          inArray(actionPlansTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(actionPlansTable.status, ["open", "in_progress"]),
        ),
      );

    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => {
        const dueIso = r.dueDate ? r.dueDate.toISOString() : null;
        return {
          id: `action_plan:${r.id}`,
          source: "action_plan",
          sourceLabel: SOURCE_LABELS.action_plan,
          title: r.title,
          subtitle: r.code ?? undefined,
          statusLabel: STATUS_LABELS[r.status] ?? r.status,
          dueDate: dueIso,
          urgency: classifyUrgency(dueIso, ctx.now, ctx.dueSoonDays),
          responsibleUserId: r.responsibleUserId as number,
          link: { route: `/app/planos-acao/${r.id}`, ctaLabel: "Ver plano" },
          meta: { code: r.code, priority: r.priority, status: r.status },
        };
      });
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/action-plans.ts artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts
git commit -m "feat(pendencias): action plans provider"
```

---

### Task 5: Nonconformities + corrective actions provider

**Files:**
- Create: `artifacts/api-server/src/services/pendencias/providers/nonconformities.ts`
- Test: `artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts`

**Interfaces:**
- Consumes: types (Task 1), `classifyUrgency` (Task 1), `nonconformitiesTable`/`correctiveActionsTable` from `@workspace/db`.
- Produces: `export const nonconformityPendenciaProvider: PendenciaProvider` — emits `nonconformity:<id>` items (no_due) for open NCs and `corrective_action:<id>` items (date-classified) for open corrective actions; both `source: "nonconformity"`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, nonconformitiesTable, correctiveActionsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { nonconformityPendenciaProvider } from "../../../src/services/pendencias/providers/nonconformities";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15);

describe("nonconformityPendenciaProvider", () => {
  it("emits a no_due NC and a date-classified corrective action; skips closed/done", async () => {
    const ctx = await createTestContext({ seed: "pend-nc" });
    contexts.push(ctx);

    const [openNc] = await db
      .insert(nonconformitiesTable)
      .values({
        organizationId: ctx.organizationId,
        originType: "process",
        title: `NC aberta ${ctx.prefix}`,
        description: "desc",
        status: "open",
        responsibleUserId: ctx.userId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      })
      .returning({ id: nonconformitiesTable.id });

    // closed NC → ignored
    await db.insert(nonconformitiesTable).values({
      organizationId: ctx.organizationId,
      originType: "process",
      title: `NC fechada ${ctx.prefix}`,
      description: "desc",
      status: "closed",
      responsibleUserId: ctx.userId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const [overdueCa] = await db
      .insert(correctiveActionsTable)
      .values({
        organizationId: ctx.organizationId,
        nonconformityId: openNc.id,
        title: `Ação ${ctx.prefix}`,
        description: "desc",
        status: "pending",
        responsibleUserId: ctx.userId,
        dueDate: "2026-06-10",
        createdById: ctx.userId,
        updatedById: ctx.userId,
      })
      .returning({ id: correctiveActionsTable.id });

    // done CA → ignored
    await db.insert(correctiveActionsTable).values({
      organizationId: ctx.organizationId,
      nonconformityId: openNc.id,
      title: `Ação feita ${ctx.prefix}`,
      description: "desc",
      status: "done",
      responsibleUserId: ctx.userId,
      dueDate: "2026-06-10",
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const items = await nonconformityPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(items).toHaveLength(2);
    expect(byId.get(`nonconformity:${openNc.id}`)?.urgency).toBe("no_due");
    expect(byId.get(`nonconformity:${openNc.id}`)?.source).toBe("nonconformity");
    expect(byId.get(`corrective_action:${overdueCa.id}`)?.urgency).toBe("overdue");
    expect(byId.get(`corrective_action:${overdueCa.id}`)?.source).toBe("nonconformity");
    expect(byId.get(`corrective_action:${overdueCa.id}`)?.dueDate).toBe("2026-06-10");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts`
Expected: FAIL — provider module missing.

- [ ] **Step 3: Implement the nonconformities provider**

Create `artifacts/api-server/src/services/pendencias/providers/nonconformities.ts`:

```ts
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db, nonconformitiesTable, correctiveActionsTable } from "@workspace/db";
import {
  classifyUrgency,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

const NC_STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  under_analysis: "Em análise",
  action_in_progress: "Ação em andamento",
  awaiting_effectiveness: "Aguardando eficácia",
};

const NC_ROUTE = "/app/governanca/nao-conformidades";

export const nonconformityPendenciaProvider: PendenciaProvider = {
  source: "nonconformity",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];

    const ncs = await db
      .select({
        id: nonconformitiesTable.id,
        title: nonconformitiesTable.title,
        status: nonconformitiesTable.status,
        responsibleUserId: nonconformitiesTable.responsibleUserId,
      })
      .from(nonconformitiesTable)
      .where(
        and(
          eq(nonconformitiesTable.organizationId, ctx.orgId),
          isNotNull(nonconformitiesTable.responsibleUserId),
          inArray(nonconformitiesTable.responsibleUserId, ctx.responsibleUserIds),
          notInArray(nonconformitiesTable.status, ["closed", "canceled"]),
        ),
      );

    const cas = await db
      .select({
        id: correctiveActionsTable.id,
        title: correctiveActionsTable.title,
        status: correctiveActionsTable.status,
        dueDate: correctiveActionsTable.dueDate,
        responsibleUserId: correctiveActionsTable.responsibleUserId,
        nonconformityId: correctiveActionsTable.nonconformityId,
      })
      .from(correctiveActionsTable)
      .where(
        and(
          eq(correctiveActionsTable.organizationId, ctx.orgId),
          isNotNull(correctiveActionsTable.responsibleUserId),
          inArray(correctiveActionsTable.responsibleUserId, ctx.responsibleUserIds),
          notInArray(correctiveActionsTable.status, ["done", "canceled"]),
        ),
      );

    const items: Pendencia[] = [];

    for (const nc of ncs) {
      if (nc.responsibleUserId === null) continue;
      items.push({
        id: `nonconformity:${nc.id}`,
        source: "nonconformity",
        sourceLabel: "Não conformidade",
        title: nc.title,
        statusLabel: NC_STATUS_LABELS[nc.status] ?? nc.status,
        dueDate: null,
        urgency: "no_due",
        responsibleUserId: nc.responsibleUserId,
        link: { route: NC_ROUTE, ctaLabel: "Tratar" },
        meta: { nonconformityId: nc.id, status: nc.status },
      });
    }

    for (const ca of cas) {
      if (ca.responsibleUserId === null) continue;
      items.push({
        id: `corrective_action:${ca.id}`,
        source: "nonconformity",
        sourceLabel: "Ação corretiva",
        title: ca.title,
        statusLabel: ca.dueDate ? `Prazo ${ca.dueDate}` : "Sem prazo",
        dueDate: ca.dueDate ?? null,
        urgency: classifyUrgency(ca.dueDate ?? null, ctx.now, ctx.dueSoonDays),
        responsibleUserId: ca.responsibleUserId,
        link: { route: NC_ROUTE, ctaLabel: "Responder" },
        meta: { correctiveActionId: ca.id, nonconformityId: ca.nonconformityId, status: ca.status },
      });
    }

    return items;
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/nonconformities.ts artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts
git commit -m "feat(pendencias): nonconformities + corrective actions provider"
```

---

### Task 6: Regulatory documents provider

**Files:**
- Create: `artifacts/api-server/src/services/pendencias/providers/regulatory-documents.ts`
- Test: `artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`

**Interfaces:**
- Consumes: types (Task 1), `regulatoryDocumentsTable` from `@workspace/db`.
- Produces: `export const regulatoryDocumentPendenciaProvider: PendenciaProvider` — pendência per doc whose persisted `status IN ('a_vencer','vencido')`; `vencido → overdue`, `a_vencer → due_soon` (respects the doc's own alert window, not `dueSoonDays`).

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, regulatoryDocumentsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { regulatoryDocumentPendenciaProvider } from "../../../src/services/pendencias/providers/regulatory-documents";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("regulatoryDocumentPendenciaProvider", () => {
  it("maps vencido→overdue and a_vencer→due_soon; ignores vigente", async () => {
    const ctx = await createTestContext({ seed: "pend-reg" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);

    const seed = async (status: string, expirationDate: string) => {
      const [row] = await db
        .insert(regulatoryDocumentsTable)
        .values({
          organizationId: ctx.organizationId,
          unitId: unit.id,
          identifierType: "alvara",
          issuingBody: "Prefeitura",
          responsibleUserId: ctx.userId,
          expirationDate,
          status,
        })
        .returning({ id: regulatoryDocumentsTable.id });
      return row.id;
    };

    const vencidoId = await seed("vencido", "2026-05-01");
    const aVencerId = await seed("a_vencer", "2026-07-01");
    await seed("vigente", "2027-01-01");

    const items = await regulatoryDocumentPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: new Date(2026, 5, 15),
      dueSoonDays: 7,
    });

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(items).toHaveLength(2);
    expect(byId.get(`regulatory_document:${vencidoId}`)?.urgency).toBe("overdue");
    expect(byId.get(`regulatory_document:${aVencerId}`)?.urgency).toBe("due_soon");
    expect(byId.get(`regulatory_document:${vencidoId}`)?.dueDate).toBe("2026-05-01");
    expect(byId.get(`regulatory_document:${aVencerId}`)?.link.route).toBe("/app/qualidade/regulatorios");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`
Expected: FAIL — provider module missing.

- [ ] **Step 3: Implement the regulatory documents provider**

Create `artifacts/api-server/src/services/pendencias/providers/regulatory-documents.ts`:

```ts
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, regulatoryDocumentsTable } from "@workspace/db";
import {
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
  type PendenciaUrgency,
} from "../types";

export const regulatoryDocumentPendenciaProvider: PendenciaProvider = {
  source: "regulatory_document",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const rows = await db
      .select({
        id: regulatoryDocumentsTable.id,
        identifierType: regulatoryDocumentsTable.identifierType,
        documentNumber: regulatoryDocumentsTable.documentNumber,
        status: regulatoryDocumentsTable.status,
        expirationDate: regulatoryDocumentsTable.expirationDate,
        responsibleUserId: regulatoryDocumentsTable.responsibleUserId,
      })
      .from(regulatoryDocumentsTable)
      .where(
        and(
          eq(regulatoryDocumentsTable.organizationId, ctx.orgId),
          isNotNull(regulatoryDocumentsTable.responsibleUserId),
          inArray(regulatoryDocumentsTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(regulatoryDocumentsTable.status, ["a_vencer", "vencido"]),
        ),
      );

    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => {
        const urgency: PendenciaUrgency = r.status === "vencido" ? "overdue" : "due_soon";
        return {
          id: `regulatory_document:${r.id}`,
          source: "regulatory_document",
          sourceLabel: SOURCE_LABELS.regulatory_document,
          title: r.documentNumber
            ? `${r.identifierType} ${r.documentNumber}`
            : r.identifierType,
          statusLabel: r.status === "vencido" ? "Vencido" : "A vencer",
          dueDate: r.expirationDate,
          urgency,
          responsibleUserId: r.responsibleUserId as number,
          link: { route: "/app/qualidade/regulatorios", ctaLabel: "Renovar" },
          meta: { documentId: r.id, status: r.status },
        };
      });
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/regulatory-documents.ts artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts
git commit -m "feat(pendencias): regulatory documents provider"
```

---

### Task 7: Registry + aggregator

**Files:**
- Create: `artifacts/api-server/src/services/pendencias/registry.ts`
- Create: `artifacts/api-server/src/services/pendencias/aggregate.ts`
- Test: `artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts`

**Interfaces:**
- Consumes: all four providers + types.
- Produces:
  - `pendenciaProviders: PendenciaProvider[]`
  - `interface PendenciaCounts { total: number; overdue: number; dueSoon: number; noDue: number; upcoming: number; bySource: Record<PendenciaSource, number> }`
  - `interface AggregateResult { items: Pendencia[]; counts: PendenciaCounts }`
  - `aggregatePendencias(ctx: PendenciaProviderContext): Promise<AggregateResult>` — fans out over the registry (graceful degradation), enriches `responsibleName` from `usersTable`, sorts by priority then dueDate, computes counts (list-visible = non-upcoming).

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable, regulatoryDocumentsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createUnit,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { aggregatePendencias } from "../../../src/services/pendencias/aggregate";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15);

describe("aggregatePendencias", () => {
  it("merges providers, sorts by priority, enriches name, and counts", async () => {
    const ctx = await createTestContext({ seed: "pend-agg" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);

    // action plan overdue (p1)
    await db.insert(actionPlansTable).values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Plano atrasado",
      status: "open",
      responsibleUserId: ctx.userId,
      dueDate: new Date(2026, 5, 1),
    });
    // regulatory a_vencer (p2 / due_soon)
    await db.insert(regulatoryDocumentsTable).values({
      organizationId: ctx.organizationId,
      unitId: unit.id,
      identifierType: "alvara",
      issuingBody: "Prefeitura",
      responsibleUserId: ctx.userId,
      expirationDate: "2026-07-01",
      status: "a_vencer",
    });

    const { items, counts } = await aggregatePendencias({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items.length).toBeGreaterThanOrEqual(2);
    // p1 (overdue action plan) sorts before p2 (due_soon regulatory)
    expect(items[0].urgency).toBe("overdue");
    expect(items[0].responsibleName).toBeTruthy(); // enriched from usersTable
    expect(counts.overdue).toBe(1);
    expect(counts.bySource.action_plan).toBe(1);
    expect(counts.bySource.regulatory_document).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts`
Expected: FAIL — `aggregate`/`registry` modules missing.

- [ ] **Step 3: Create the registry**

Create `artifacts/api-server/src/services/pendencias/registry.ts`:

```ts
import type { PendenciaProvider } from "./types";
import { kpiPendenciaProvider } from "./providers/kpi";
import { actionPlanPendenciaProvider } from "./providers/action-plans";
import { nonconformityPendenciaProvider } from "./providers/nonconformities";
import { regulatoryDocumentPendenciaProvider } from "./providers/regulatory-documents";

/**
 * Ponto único de extensão: um módulo novo com "responsável + prazo" entra aqui
 * como mais um provider e passa a aparecer no painel, contadores e calendário.
 */
export const pendenciaProviders: PendenciaProvider[] = [
  kpiPendenciaProvider,
  actionPlanPendenciaProvider,
  nonconformityPendenciaProvider,
  regulatoryDocumentPendenciaProvider,
];
```

- [ ] **Step 4: Create the aggregator**

Create `artifacts/api-server/src/services/pendencias/aggregate.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  urgencyToPriority,
  type Pendencia,
  type PendenciaProviderContext,
  type PendenciaSource,
} from "./types";
import { pendenciaProviders } from "./registry";

export interface PendenciaCounts {
  total: number;
  overdue: number;
  dueSoon: number;
  noDue: number;
  upcoming: number;
  bySource: Record<PendenciaSource, number>;
}

export interface AggregateResult {
  items: Pendencia[];
  counts: PendenciaCounts;
}

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

function sortKey(p: Pendencia): [number, number] {
  const prio = urgencyToPriority(p.urgency);
  const prioRank = prio ? PRIORITY_RANK[prio] : 3; // upcoming last
  const dueRank = p.dueDate ? new Date(p.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  return [prioRank, dueRank];
}

export async function aggregatePendencias(
  ctx: PendenciaProviderContext,
): Promise<AggregateResult> {
  // Fan out with graceful degradation: one broken provider must not sink the panel.
  const settled = await Promise.allSettled(
    pendenciaProviders.map((p) => p.listPending(ctx)),
  );
  const items: Pendencia[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      items.push(...r.value);
    } else {
      console.error(
        `[pendencias] provider "${pendenciaProviders[i].source}" failed:`,
        r.reason,
      );
    }
  }

  // Enrich responsibleName (needed by the unit/org scopes).
  const ids = [...new Set(items.map((i) => i.responsibleUserId))];
  if (ids.length > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, ctx.orgId), inArray(usersTable.id, ids)));
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const item of items) {
      item.responsibleName = nameById.get(item.responsibleUserId) ?? undefined;
    }
  }

  // Sort by priority then due date.
  items.sort((a, b) => {
    const [pa, da] = sortKey(a);
    const [pb, db_] = sortKey(b);
    return pa - pb || da - db_;
  });

  // Counts cover what the list exposes (upcoming counted separately, calendar-only).
  const counts: PendenciaCounts = {
    total: 0,
    overdue: 0,
    dueSoon: 0,
    noDue: 0,
    upcoming: 0,
    bySource: { kpi: 0, action_plan: 0, nonconformity: 0, regulatory_document: 0 },
  };
  for (const item of items) {
    if (item.urgency === "overdue") counts.overdue++;
    else if (item.urgency === "due_soon") counts.dueSoon++;
    else if (item.urgency === "no_due") counts.noDue++;
    else if (item.urgency === "upcoming") counts.upcoming++;
    if (item.urgency !== "upcoming") {
      counts.total++;
      counts.bySource[item.source]++;
    }
  }

  return { items, counts };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/registry.ts artifacts/api-server/src/services/pendencias/aggregate.ts artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts
git commit -m "feat(pendencias): provider registry + aggregator"
```

---

### Task 8: Endpoint `GET /organizations/:orgId/pendencias`

**Files:**
- Create: `artifacts/api-server/src/routes/pendencias.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (import + mount)
- Test: `artifacts/api-server/tests/routes/pendencias.integration.test.ts`

**Interfaces:**
- Consumes: `aggregatePendencias` (Task 7), `requireAuth`/`requireCompletedOnboarding`, `usersTable`/`unitsTable`.
- Produces: `GET /api/organizations/:orgId/pendencias?scope=&unitId=&dueSoonDays=` returning `{ user: { id, name, role, lastLoginAt, filial }, scope, counts, items, completedToday: [] }`. Authorization: operator/analyst → only `mine`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/tests/routes/pendencias.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  createUnit,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedOverduePlan(orgId: number, userId: number, title: string) {
  await db.insert(actionPlansTable).values({
    organizationId: orgId,
    sourceModule: "manual",
    sourceRef: { manualContext: "t" },
    title,
    status: "open",
    responsibleUserId: userId,
    dueDate: new Date(Date.now() - 5 * 86_400_000), // 5 days ago → overdue
  });
}

describe("GET /organizations/:orgId/pendencias", () => {
  it("returns the caller's own pendências with user block and counts (scope=mine)", async () => {
    const ctx = await createTestContext({ seed: "pend-ep-mine" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    await db.update(usersTable).set({ primaryUnitId: unit.id }).where(eq(usersTable.id, ctx.userId));
    await seedOverduePlan(ctx.organizationId, ctx.userId, `Meu plano ${ctx.prefix}`);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("mine");
    expect(res.body.user.id).toBe(ctx.userId);
    expect(res.body.user.filial).toMatchObject({ id: unit.id });
    expect(res.body.counts.overdue).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((i: { source: string }) => i.source === "action_plan")).toBe(true);
    expect(res.body.completedToday).toEqual([]);
  });

  it("lets an org_admin see a filial's pendências (scope=unit)", async () => {
    const ctx = await createTestContext({ seed: "pend-ep-unit", role: "org_admin" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const member = await createTestUser(ctx, { role: "operator", suffix: "op" });
    await db.update(usersTable).set({ primaryUnitId: unit.id }).where(eq(usersTable.id, member.id));
    await seedOverduePlan(ctx.organizationId, member.id, `Plano do membro ${ctx.prefix}`);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias?scope=unit&unitId=${unit.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("unit");
    const planItem = res.body.items.find((i: { source: string }) => i.source === "action_plan");
    expect(planItem).toBeTruthy();
    expect(planItem.responsibleName).toBeTruthy();
  });

  it("forbids operator/analyst from non-mine scopes (403)", async () => {
    const ctx = await createTestContext({ seed: "pend-ep-403", role: "operator" });
    contexts.push(ctx);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/pendencias?scope=org`)
      .set(authHeader(ctx));

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/pendencias.integration.test.ts`
Expected: FAIL — route not mounted (404), so status assertions fail.

- [ ] **Step 3: Implement the route**

Create `artifacts/api-server/src/routes/pendencias.ts`:

```ts
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, unitsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { aggregatePendencias } from "../services/pendencias/aggregate";

const router: IRouter = Router();

const querySchema = z.object({
  scope: z.enum(["mine", "unit", "org"]).default("mine"),
  unitId: z.coerce.number().int().positive().optional(),
  dueSoonDays: z.coerce.number().int().min(1).max(90).default(7),
});

router.get("/organizations/:orgId/pendencias", requireAuth, async (req, res): Promise<void> => {
  const orgId = Number(req.params.orgId);
  const { userId, organizationId, role } = req.auth!;
  if (orgId !== organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { scope, unitId, dueSoonDays } = parsed.data;

  const isAdmin = role === "org_admin" || role === "platform_admin";
  if (scope !== "mine" && !isAdmin) {
    res.status(403).json({ error: "Sem permissão para este escopo" });
    return;
  }
  if (scope === "unit" && !unitId) {
    res.status(400).json({ error: "unitId é obrigatório para scope=unit" });
    return;
  }

  // Resolve the responsible users for the requested scope.
  let responsibleUserIds: number[];
  if (scope === "mine") {
    responsibleUserIds = [userId];
  } else if (scope === "unit") {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.primaryUnitId, unitId!)));
    responsibleUserIds = rows.map((r) => r.id);
  } else {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.organizationId, orgId));
    responsibleUserIds = rows.map((r) => r.id);
  }

  const now = new Date();
  const { items, counts } = await aggregatePendencias({
    orgId,
    responsibleUserIds,
    now,
    dueSoonDays,
  });

  // Caller identity block for the panel header.
  const [me] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
      lastLoginAt: usersTable.lastLoginAt,
      primaryUnitId: usersTable.primaryUnitId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  let filial: { id: number; name: string } | null = null;
  if (me?.primaryUnitId) {
    const [unit] = await db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(eq(unitsTable.id, me.primaryUnitId));
    filial = unit ?? null;
  }

  res.json({
    user: {
      id: me?.id ?? userId,
      name: me?.name ?? "",
      role: me?.role ?? role,
      lastLoginAt: me?.lastLoginAt ? me.lastLoginAt.toISOString() : null,
      filial,
    },
    scope,
    counts,
    items,
    completedToday: [],
  });
});

export default router;
```

- [ ] **Step 4: Mount the router**

In `artifacts/api-server/src/routes/index.ts`:
1. Add the import next to the other route imports (e.g. after the `regulatoryDocumentsRouter` import, line ~35):

```ts
import pendenciasRouter from "./pendencias";
```

2. Mount it with auth + onboarding only (no module gate), next to the `actionPlansRouter` mount (line ~160):

```ts
router.use(requireAuth, requireCompletedOnboarding, pendenciasRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/pendencias.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/pendencias.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/tests/routes/pendencias.integration.test.ts
git commit -m "feat(pendencias): GET /organizations/:orgId/pendencias endpoint (scope + auth)"
```

---

### Task 9: Phase verification

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all projects.

- [ ] **Step 2: Run all F2 tests together**

Run:
```bash
pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/pendencias/classify-urgency.unit.test.ts artifacts/api-server/tests/services/kpi/feed-status.unit.test.ts
pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias artifacts/api-server/tests/routes/pendencias.integration.test.ts
```
Expected: all PASS.

- [ ] **Step 3: Stop for review**

F2 is complete and testable (backend only — no frontend, no schema change, so no PROD DDL). Hand off for review / PR per the user's instruction (no auto-merge, no push without explicit go). F3 (painel) consumes this endpoint next.

---

## Notes for later phases (not implemented here)

- **F3 (painel):** `pendencias-client.ts` (hand-written, bespoke shape), the panel page, the user-identity block (consumes this endpoint's `user` block), the scope selector (admin), landing redirect, sidebar item.
- **F4 (calendário & concluídos hoje):** the calendar mode (consumes `items` including `upcoming`) + implement `listCompletedToday` on each provider and fill `completedToday`/`counts.completedToday`.
