# Suas Pendências — Fase 4 (Calendário & Concluídos hoje) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Concluídos hoje" (positive reinforcement) and a calendar mode (see everything, including future, plotted by date) to the Suas Pendências panel — closing the spec's "nada escondido, mas a lista não polui" promise.

**Architecture:** Backend: each provider implements the (already-optional) `listCompletedToday(ctx)`; the aggregator fans it out in parallel (graceful degradation, name enrichment) and returns `completedToday` + `counts.completedToday`; the endpoint surfaces them. Frontend: a "Concluídos hoje" section consumes `completedToday`; a Lista/Calendário toggle switches the main area to a month grid (built with `date-fns`, already a dependency) that plots all dated `items` (incl. `upcoming`) by `dueDate`.

**Tech Stack:** Express 5 + Drizzle (PostgreSQL), Vitest (`integration` + `web-unit`), React 19 + `date-fns` ^3.6.0 + lucide-react, Tailwind/shadcn.

## Global Constraints

- **"Hoje" is relative to `ctx.now`** (injected, testable). A completed-today query filters the completion timestamp to the half-open day range `[startOfDay(now), startOfDay(now)+1d)` — never `::date` casting against the DB clock.
- **`listCompletedToday` is OPTIONAL** per provider (`PendenciaProvider.listCompletedToday?`). The aggregator must handle providers that don't define it.
- **Completed items reuse the `Pendencia` shape** with `urgency: "no_due"` (they aren't priority-grouped) and a PT-BR `statusLabel` ("Concluído hoje" / "Lançado hoje" / "Renovado hoje" / "Encerrada hoje"); `dueDate` carries the completion date.
- **Completion semantics per domain** (verified against schema):
  - action_plan: `status IN (completed, cancelled)` AND `closedAt` in day-range → "Encerrado hoje".
  - nonconformity: `status IN (closed, canceled)` AND `closedAt` in day-range → "Encerrada hoje".
  - corrective_action: `status IN (done, canceled)` AND `updatedAt` in day-range (no dedicated completion column) → "Concluída hoje".
  - kpi: `kpi_monthly_values.value IS NOT NULL` AND `updatedAt` in day-range, joined to `kpi_indicators` with `responsibleUserId IN ctx` and `rollupStrategy IS NULL` → "Lançado hoje".
  - regulatory_document: a `regulatory_document_renewals` row with `status = 'renovado'` AND `updatedAt` in day-range, joined to `regulatory_documents.responsibleUserId IN ctx` → "Renovado hoje".
- **Graceful degradation** stays: a failing `listCompletedToday` provider is logged and skipped.
- **Calendar plots only dated items** (overdue/due_soon/upcoming with a non-null `dueDate`); `no_due` items never appear on the calendar (list-only). Deep-links use the same `item.link.route`.
- Multi-tenant org scoping on every query; responsável is `users.id`. PT-BR copy. Prettier 2-space/double-quote/trailing-comma. Don't push; commit per task only. `web-unit` tests = `artifacts/web/tests/**/*.unit.test.{ts,tsx}` (jsdom); run individual files. Integration tests need the test DB (`pnpm test:integration:up` / synced).

## File Structure

- `artifacts/api-server/src/services/pendencias/providers/*.ts` — add `listCompletedToday` to action-plans, nonconformities, kpi, regulatory-documents (+ a shared `dayBounds` helper).
- `artifacts/api-server/src/services/pendencias/aggregate.ts` — fan out `listCompletedToday`, add `completedToday`/`counts.completedToday`.
- `artifacts/api-server/src/routes/pendencias.ts` — surface real `completedToday` + counts.
- `artifacts/web/src/lib/pendencias-format.ts` — add `completedToday: number` to `PendenciasCounts`; add `itemsByDay` grouping helper for the calendar.
- `artifacts/web/src/pages/app/pendencias.tsx` — "Concluídos hoje" section + Lista/Calendário toggle.
- `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx` — the month-grid calendar.

---

### Task 1: action-plans `listCompletedToday` + shared `dayBounds`

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/providers/action-plans.ts`
- Test: `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`

**Interfaces:**
- Consumes: `Pendencia`/context (from `../types`), `actionPlansTable`.
- Produces: `actionPlanPendenciaProvider.listCompletedToday(ctx): Promise<Pendencia[]>` — plans encerrados (status completed/cancelled) com `closedAt` no dia de `ctx.now`.

- [ ] **Step 1: Write the failing test (append to the existing describe)**

Add this `it(...)` to `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`:

```ts
  it("listCompletedToday returns plans closed today", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-done" });
    contexts.push(ctx);
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const [done] = await db
      .insert(actionPlansTable)
      .values({
        organizationId: ctx.organizationId,
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Encerrado hoje",
        status: "completed",
        responsibleUserId: ctx.userId,
        closedAt: new Date(2026, 5, 15, 9, 0, 0),
      })
      .returning({ id: actionPlansTable.id });
    // closed yesterday → excluded
    await db.insert(actionPlansTable).values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Encerrado ontem",
      status: "completed",
      responsibleUserId: ctx.userId,
      closedAt: new Date(2026, 5, 14, 9, 0, 0),
    });

    const items = await actionPlanPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`action_plan:${done.id}`);
    expect(items[0].statusLabel).toBe("Encerrado hoje");
    expect(items[0].urgency).toBe("no_due");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`
Expected: FAIL — `listCompletedToday` is undefined.

- [ ] **Step 3: Add `dayBounds` + `listCompletedToday`**

In `artifacts/api-server/src/services/pendencias/providers/action-plans.ts`, extend the drizzle import to include `gte` and `lt`:

```ts
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
```

Add a module-level helper (above the provider):

```ts
/** Janela [início do dia de `now`, início do dia seguinte) para filtrar "hoje". */
export function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}
```

Add `listCompletedToday` to the `actionPlanPendenciaProvider` object (after `listPending`):

```ts
  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const rows = await db
      .select({
        id: actionPlansTable.id,
        code: actionPlansTable.code,
        title: actionPlansTable.title,
        status: actionPlansTable.status,
        closedAt: actionPlansTable.closedAt,
        responsibleUserId: actionPlansTable.responsibleUserId,
      })
      .from(actionPlansTable)
      .where(
        and(
          eq(actionPlansTable.organizationId, ctx.orgId),
          isNotNull(actionPlansTable.responsibleUserId),
          inArray(actionPlansTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(actionPlansTable.status, ["completed", "cancelled"]),
          gte(actionPlansTable.closedAt, start),
          lt(actionPlansTable.closedAt, end),
        ),
      );
    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => ({
        id: `action_plan:${r.id}`,
        source: "action_plan",
        sourceLabel: SOURCE_LABELS.action_plan,
        title: r.title,
        subtitle: r.code ?? undefined,
        statusLabel: "Encerrado hoje",
        dueDate: r.closedAt ? r.closedAt.toISOString() : null,
        urgency: "no_due",
        responsibleUserId: r.responsibleUserId as number,
        link: { route: `/planos-acao/${r.id}`, ctaLabel: "Ver plano" },
        meta: { code: r.code, status: r.status, completed: true },
      }));
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`
Expected: PASS (all action-plan provider tests).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/action-plans.ts artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts
git commit -m "feat(pendencias): action plans listCompletedToday + dayBounds helper"
```

---

### Task 2: Aggregator + endpoint surface `completedToday`

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/aggregate.ts`
- Modify: `artifacts/api-server/src/routes/pendencias.ts`
- Test: `artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts`, `artifacts/api-server/tests/routes/pendencias.integration.test.ts`

**Interfaces:**
- Consumes: `actionPlanPendenciaProvider.listCompletedToday` (Task 1).
- Produces: `AggregateResult` gains `completedToday: Pendencia[]`; `PendenciaCounts` gains `completedToday: number`. Endpoint response `completedToday` is the real array.

- [ ] **Step 1: Extend the aggregate test (RED)**

In `artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts`, inside the existing test (after the existing asserts), seed a closed plan and assert it appears in `completedToday`:

```ts
    await db.insert(actionPlansTable).values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Plano encerrado hoje",
      status: "completed",
      responsibleUserId: ctx.userId,
      closedAt: NOW,
    });
    const res2 = await aggregatePendencias({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now: NOW,
      dueSoonDays: 7,
    });
    expect(res2.completedToday.some((i) => i.title === "Plano encerrado hoje")).toBe(true);
    expect(res2.counts.completedToday).toBe(res2.completedToday.length);
    expect(res2.counts.completedToday).toBeGreaterThanOrEqual(1);
```

(Ensure `NOW` is a `Date` already defined in that test; the existing test uses `new Date(2026, 5, 15)`.)

- [ ] **Step 2: Run the aggregate test to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts`
Expected: FAIL — `res2.completedToday`/`counts.completedToday` undefined.

- [ ] **Step 3: Update the aggregator**

In `artifacts/api-server/src/services/pendencias/aggregate.ts`:

Add `completedToday` to the counts and result interfaces:
```ts
export interface PendenciaCounts {
  total: number;
  overdue: number;
  dueSoon: number;
  noDue: number;
  upcoming: number;
  completedToday: number;
  bySource: Record<PendenciaSource, number>;
}

export interface AggregateResult {
  items: Pendencia[];
  counts: PendenciaCounts;
  completedToday: Pendencia[];
}
```

After the existing `listPending` fan-out and BEFORE building counts, add a parallel `listCompletedToday` fan-out (only for providers that define it), with the same graceful degradation + name enrichment:

```ts
  // Completed-today fan-out (providers may not implement it).
  const completedSettled = await Promise.allSettled(
    pendenciaProviders.map((p) =>
      p.listCompletedToday ? p.listCompletedToday(ctx) : Promise.resolve([]),
    ),
  );
  const completedToday: Pendencia[] = [];
  for (let i = 0; i < completedSettled.length; i++) {
    const r = completedSettled[i];
    if (r.status === "fulfilled") completedToday.push(...r.value);
    else
      console.error(
        `[pendencias] provider "${pendenciaProviders[i].source}" listCompletedToday failed:`,
        r.reason,
      );
  }
```

Extend the name-enrichment block so it also covers `completedToday` (collect ids from both arrays). Change the `ids` line to:
```ts
  const ids = [...new Set([...items, ...completedToday].map((i) => i.responsibleUserId))];
```
and inside the `if (ids.length > 0)` block, after enriching `items`, also enrich completed:
```ts
    for (const item of completedToday) {
      item.responsibleName = nameById.get(item.responsibleUserId) ?? undefined;
    }
```

In the counts object initializer add `completedToday: 0,`. After the items loop, set:
```ts
  counts.completedToday = completedToday.length;
```

Change the return to `return { items, counts, completedToday };`.

- [ ] **Step 4: Update the endpoint**

In `artifacts/api-server/src/routes/pendencias.ts`, change the destructure of `aggregatePendencias` to include `completedToday`:
```ts
  const { items, counts, completedToday } = await aggregatePendencias({ ... });
```
and in the `res.json({...})`, replace `completedToday: []` with `completedToday,`.

- [ ] **Step 5: Update the route test (it asserted `[]`)**

In `artifacts/api-server/tests/routes/pendencias.integration.test.ts`, in the scope=mine test, replace `expect(res.body.completedToday).toEqual([]);` with an assertion that doesn't depend on the live date (the endpoint uses real `new Date()`, so seeding a closed-today plan there is date-fragile). Assert the shape instead:
```ts
    expect(Array.isArray(res.body.completedToday)).toBe(true);
    expect(typeof res.body.counts.completedToday).toBe("number");
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts artifacts/api-server/tests/routes/pendencias.integration.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @workspace/api-server typecheck` → PASS, then:
```bash
git add artifacts/api-server/src/services/pendencias/aggregate.ts artifacts/api-server/src/routes/pendencias.ts artifacts/api-server/tests/services/pendencias/aggregate.integration.test.ts artifacts/api-server/tests/routes/pendencias.integration.test.ts
git commit -m "feat(pendencias): aggregate + surface completedToday in endpoint"
```

---

### Task 3: nonconformities `listCompletedToday` (NC + corrective actions)

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/providers/nonconformities.ts`
- Test: `artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts`

**Interfaces:**
- Consumes: `dayBounds` (Task 1, exported from `./action-plans`), `nonconformitiesTable`/`correctiveActionsTable`.
- Produces: `nonconformityPendenciaProvider.listCompletedToday(ctx)` — NCs fechadas hoje (`closedAt`) + ações corretivas done hoje (`updatedAt`).

- [ ] **Step 1: Write the failing test (append)**

```ts
  it("listCompletedToday returns NCs closed + corrective actions done today", async () => {
    const ctx = await createTestContext({ seed: "pend-nc-done" });
    contexts.push(ctx);
    const now = new Date(2026, 5, 15, 10, 0, 0);

    const [nc] = await db
      .insert(nonconformitiesTable)
      .values({
        organizationId: ctx.organizationId,
        originType: "process",
        title: `NC fechada hoje ${ctx.prefix}`,
        description: "d",
        status: "closed",
        responsibleUserId: ctx.userId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
        closedAt: new Date(2026, 5, 15, 9, 0, 0),
      })
      .returning({ id: nonconformitiesTable.id });

    const [ca] = await db
      .insert(correctiveActionsTable)
      .values({
        organizationId: ctx.organizationId,
        nonconformityId: nc.id,
        title: `Ação feita hoje ${ctx.prefix}`,
        description: "d",
        status: "done",
        responsibleUserId: ctx.userId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      })
      .returning({ id: correctiveActionsTable.id });

    const items = await nonconformityPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(`nonconformity:${nc.id}`);
    expect(ids).toContain(`corrective_action:${ca.id}`);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts`
Expected: FAIL — `listCompletedToday` undefined.

- [ ] **Step 3: Implement**

In `artifacts/api-server/src/services/pendencias/providers/nonconformities.ts`, extend the drizzle import to add `gte`, `lt`, and import `dayBounds` from `./action-plans`:
```ts
import { and, eq, gte, inArray, isNotNull, lt, notInArray } from "drizzle-orm";
import { dayBounds } from "./action-plans";
```
Add `listCompletedToday` to the provider:
```ts
  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);

    const ncs = await db
      .select({
        id: nonconformitiesTable.id,
        title: nonconformitiesTable.title,
        responsibleUserId: nonconformitiesTable.responsibleUserId,
      })
      .from(nonconformitiesTable)
      .where(
        and(
          eq(nonconformitiesTable.organizationId, ctx.orgId),
          isNotNull(nonconformitiesTable.responsibleUserId),
          inArray(nonconformitiesTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(nonconformitiesTable.status, ["closed", "canceled"]),
          gte(nonconformitiesTable.closedAt, start),
          lt(nonconformitiesTable.closedAt, end),
        ),
      );

    const cas = await db
      .select({
        id: correctiveActionsTable.id,
        title: correctiveActionsTable.title,
        nonconformityId: correctiveActionsTable.nonconformityId,
        responsibleUserId: correctiveActionsTable.responsibleUserId,
      })
      .from(correctiveActionsTable)
      .where(
        and(
          eq(correctiveActionsTable.organizationId, ctx.orgId),
          isNotNull(correctiveActionsTable.responsibleUserId),
          inArray(correctiveActionsTable.responsibleUserId, ctx.responsibleUserIds),
          inArray(correctiveActionsTable.status, ["done", "canceled"]),
          gte(correctiveActionsTable.updatedAt, start),
          lt(correctiveActionsTable.updatedAt, end),
        ),
      );

    const todayIso = `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, "0")}-${String(ctx.now.getDate()).padStart(2, "0")}`;
    const items: Pendencia[] = [];
    for (const nc of ncs) {
      if (nc.responsibleUserId === null) continue;
      items.push({
        id: `nonconformity:${nc.id}`,
        source: "nonconformity",
        sourceLabel: "Não conformidade",
        title: nc.title,
        statusLabel: "Encerrada hoje",
        dueDate: todayIso,
        urgency: "no_due",
        responsibleUserId: nc.responsibleUserId,
        link: { route: NC_ROUTE, ctaLabel: "Ver" },
        meta: { nonconformityId: nc.id, completed: true },
      });
    }
    for (const ca of cas) {
      if (ca.responsibleUserId === null) continue;
      items.push({
        id: `corrective_action:${ca.id}`,
        source: "nonconformity",
        sourceLabel: "Ação corretiva",
        title: ca.title,
        statusLabel: "Concluída hoje",
        dueDate: todayIso,
        urgency: "no_due",
        responsibleUserId: ca.responsibleUserId,
        link: { route: NC_ROUTE, ctaLabel: "Ver" },
        meta: { correctiveActionId: ca.id, nonconformityId: ca.nonconformityId, completed: true },
      });
    }
    return items;
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/nonconformities.ts artifacts/api-server/tests/services/pendencias/nonconformities-provider.integration.test.ts
git commit -m "feat(pendencias): nonconformities listCompletedToday (NC + corrective actions)"
```

---

### Task 4: kpi `listCompletedToday`

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/providers/kpi.ts`
- Test: `artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`

**Interfaces:**
- Consumes: `dayBounds` (from `./action-plans`); `kpiIndicatorsTable`/`kpiYearConfigsTable`/`kpiMonthlyValuesTable`.
- Produces: `kpiPendenciaProvider.listCompletedToday(ctx)` — indicadores (não-rollup) com um valor mensal lançado/atualizado hoje.

- [ ] **Step 1: Write the failing test (append)**

```ts
  it("listCompletedToday returns indicators with a value entered today", async () => {
    const ctx = await createTestContext({ seed: "pend-kpi-done" });
    contexts.push(ctx);
    const now = new Date(2026, 5, 15, 10, 0, 0);
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
    const [cfg] = await db
      .insert(kpiYearConfigsTable)
      .values({ organizationId: ctx.organizationId, indicatorId: indicator.id, year: 2026 })
      .returning({ id: kpiYearConfigsTable.id });
    await db.insert(kpiMonthlyValuesTable).values({
      organizationId: ctx.organizationId,
      yearConfigId: cfg.id,
      month: 5,
      value: "88.5",
    });

    const items = await kpiPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.id.startsWith(`kpi:${indicator.id}:`))).toBe(true);
    expect(items[0].statusLabel).toBe("Lançado hoje");
  });
```

(The `kpi_monthly_values.updatedAt` defaults to `now()` on insert, so the row is "today" at test time — but the test injects `now = 2026-06-15`. Because the insert's `updatedAt` is the real wall clock, this test asserts on a real-time insert; to keep it deterministic, the implementation filters by `updatedAt` in `dayBounds(ctx.now)`. Set the injected `now` to the real "today" is fragile — instead the test below inserts with an explicit `updatedAt`.)

Replace the monthly value insert with an explicit `updatedAt` so the test is deterministic against the injected `now`:
```ts
    await db.insert(kpiMonthlyValuesTable).values({
      organizationId: ctx.organizationId,
      yearConfigId: cfg.id,
      month: 5,
      value: "88.5",
      updatedAt: new Date(2026, 5, 15, 9, 0, 0),
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`
Expected: FAIL — `listCompletedToday` undefined.

- [ ] **Step 3: Implement**

In `artifacts/api-server/src/services/pendencias/providers/kpi.ts`, extend the drizzle import to add `gte`, `lt`, and import `dayBounds`:
```ts
import { and, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { dayBounds } from "./action-plans";
```
Add a `MONTH_LABELS` reference is already in the file. Add `listCompletedToday`:
```ts
  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const rows = await db
      .select({
        indicatorId: kpiIndicatorsTable.id,
        indicatorName: kpiIndicatorsTable.name,
        responsibleUserId: kpiIndicatorsTable.responsibleUserId,
        year: kpiYearConfigsTable.year,
        month: kpiMonthlyValuesTable.month,
      })
      .from(kpiMonthlyValuesTable)
      .innerJoin(kpiYearConfigsTable, eq(kpiMonthlyValuesTable.yearConfigId, kpiYearConfigsTable.id))
      .innerJoin(kpiIndicatorsTable, eq(kpiYearConfigsTable.indicatorId, kpiIndicatorsTable.id))
      .where(
        and(
          eq(kpiMonthlyValuesTable.organizationId, ctx.orgId),
          isNotNull(kpiMonthlyValuesTable.value),
          gte(kpiMonthlyValuesTable.updatedAt, start),
          lt(kpiMonthlyValuesTable.updatedAt, end),
          isNotNull(kpiIndicatorsTable.responsibleUserId),
          inArray(kpiIndicatorsTable.responsibleUserId, ctx.responsibleUserIds),
          isNull(kpiIndicatorsTable.rollupStrategy),
        ),
      );
    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => ({
        id: `kpi:${r.indicatorId}:${r.year}:${r.month}`,
        source: "kpi",
        sourceLabel: SOURCE_LABELS.kpi,
        title: r.indicatorName,
        statusLabel: "Lançado hoje",
        dueDate: `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, "0")}-${String(ctx.now.getDate()).padStart(2, "0")}`,
        urgency: "no_due",
        responsibleUserId: r.responsibleUserId as number,
        link: { route: "/kpi/lancamentos", ctaLabel: "Ver" },
        meta: { indicatorId: r.indicatorId, year: r.year, month: r.month, completed: true },
      }));
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/kpi.ts artifacts/api-server/tests/services/pendencias/kpi-provider.integration.test.ts
git commit -m "feat(pendencias): kpi listCompletedToday (lançado hoje)"
```

---

### Task 5: regulatory `listCompletedToday`

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/providers/regulatory-documents.ts`
- Test: `artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`

**Interfaces:**
- Consumes: `dayBounds`; `regulatoryDocumentsTable`, `regulatoryDocumentRenewalsTable`.
- Produces: `regulatoryDocumentPendenciaProvider.listCompletedToday(ctx)` — renovações `renovado` hoje.

- [ ] **Step 1: Write the failing test (append)**

```ts
  it("listCompletedToday returns renewals marked renovado today", async () => {
    const ctx = await createTestContext({ seed: "pend-reg-done" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, `Filial ${ctx.prefix}`);
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const [doc] = await db
      .insert(regulatoryDocumentsTable)
      .values({
        organizationId: ctx.organizationId,
        unitId: unit.id,
        identifierType: "alvara",
        issuingBody: "Prefeitura",
        responsibleUserId: ctx.userId,
        expirationDate: "2026-07-01",
        status: "a_vencer",
      })
      .returning({ id: regulatoryDocumentsTable.id });
    await db.insert(regulatoryDocumentRenewalsTable).values({
      organizationId: ctx.organizationId,
      documentId: doc.id,
      status: "renovado",
      updatedAt: new Date(2026, 5, 15, 9, 0, 0),
    });

    const items = await regulatoryDocumentPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`regulatory_document:${doc.id}`);
    expect(items[0].statusLabel).toBe("Renovado hoje");
  });
```

Note: the renewals table is `regulatoryDocumentRenewalsTable` ("regulatory_document_renewals"); its FK to the parent doc is `documentId` ("document_id"), `status` is text with `"renovado"` among its values, and `updatedAt` is the timestamp. Add `regulatoryDocumentRenewalsTable` to the test's `@workspace/db` import.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`
Expected: FAIL — `listCompletedToday` undefined.

- [ ] **Step 3: Implement**

In `artifacts/api-server/src/services/pendencias/providers/regulatory-documents.ts`, extend imports:
```ts
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db, regulatoryDocumentsTable, regulatoryDocumentRenewalsTable } from "@workspace/db";
import { dayBounds } from "./action-plans";
```
Add `listCompletedToday` (use the real FK column name confirmed in Step 1):
```ts
  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const rows = await db
      .select({
        docId: regulatoryDocumentsTable.id,
        identifierType: regulatoryDocumentsTable.identifierType,
        documentNumber: regulatoryDocumentsTable.documentNumber,
        responsibleUserId: regulatoryDocumentsTable.responsibleUserId,
      })
      .from(regulatoryDocumentRenewalsTable)
      .innerJoin(
        regulatoryDocumentsTable,
        eq(regulatoryDocumentRenewalsTable.documentId, regulatoryDocumentsTable.id),
      )
      .where(
        and(
          eq(regulatoryDocumentRenewalsTable.organizationId, ctx.orgId),
          eq(regulatoryDocumentRenewalsTable.status, "renovado"),
          gte(regulatoryDocumentRenewalsTable.updatedAt, start),
          lt(regulatoryDocumentRenewalsTable.updatedAt, end),
          isNotNull(regulatoryDocumentsTable.responsibleUserId),
          inArray(regulatoryDocumentsTable.responsibleUserId, ctx.responsibleUserIds),
        ),
      );
    return rows
      .filter((r) => r.responsibleUserId !== null)
      .map((r): Pendencia => ({
        id: `regulatory_document:${r.docId}`,
        source: "regulatory_document",
        sourceLabel: SOURCE_LABELS.regulatory_document,
        title: r.documentNumber ? `${r.identifierType} ${r.documentNumber}` : r.identifierType,
        statusLabel: "Renovado hoje",
        dueDate: `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, "0")}-${String(ctx.now.getDate()).padStart(2, "0")}`,
        urgency: "no_due",
        responsibleUserId: r.responsibleUserId as number,
        link: { route: "/qualidade/regulatorios", ctaLabel: "Ver" },
        meta: { documentId: r.docId, completed: true },
      }));
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts`
Expected: PASS. If the test DB lacks the renewals table or a column, run `pnpm test:integration:db:push` (or recreate: `docker exec <pg> psql -U postgres -d daton_integration -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"` then push) and re-run.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/pendencias/providers/regulatory-documents.ts artifacts/api-server/tests/services/pendencias/regulatory-provider.integration.test.ts
git commit -m "feat(pendencias): regulatory listCompletedToday (renovado hoje)"
```

---

### Task 6: Frontend — counts type + "Concluídos hoje" section

**Files:**
- Modify: `artifacts/web/src/lib/pendencias-format.ts`
- Modify: `artifacts/web/src/pages/app/pendencias.tsx`
- Modify: `artifacts/web/tests/pages/pendencias.unit.test.tsx`

**Interfaces:**
- Produces: `PendenciasCounts` gains `completedToday: number`; the panel renders a "Concluídos hoje" section when `data.completedToday.length > 0`.

- [ ] **Step 1: Add `completedToday` to the counts type**

In `artifacts/web/src/lib/pendencias-format.ts`, add to `PendenciasCounts`:
```ts
  completedToday: number;
```
(right after `upcoming: number;`).

- [ ] **Step 2: Extend the page render test (RED)**

In `artifacts/web/tests/pages/pendencias.unit.test.tsx`, add (in the first describe, after the populated case) a test asserting the completed section. Add `completedToday` to the fixtures' `counts` (set to `0`), and add an `it`:
```tsx
  it("renders the Concluídos hoje section when present", () => {
    const withDone = {
      ...response,
      items: [],
      completedToday: [
        {
          id: "action_plan:9",
          source: "action_plan" as const,
          sourceLabel: "Plano de ação",
          title: "Plano encerrado",
          statusLabel: "Encerrado hoje",
          dueDate: "2026-06-19",
          urgency: "no_due" as const,
          responsibleUserId: 1,
          link: { route: "/planos-acao/9", ctaLabel: "Ver plano" },
        },
      ],
      counts: { ...response.counts, total: 0, overdue: 0, dueSoon: 0, completedToday: 1 },
    };
    (usePendencias as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: withDone,
      isLoading: false,
      isError: false,
    });
    render(<SuasPendenciasPage />);
    expect(screen.getByText("Concluídos hoje")).toBeInTheDocument();
    expect(screen.getByText("Plano encerrado")).toBeInTheDocument();
  });
```
Also update every existing fixture `counts` object in this file to include `completedToday: 0` (the response/withItems fixtures) so they typecheck.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: FAIL — "Concluídos hoje" not present.

- [ ] **Step 4: Add the section to the page**

In `artifacts/web/src/pages/app/pendencias.tsx`, inside the `{data && (...)}` block, AFTER the priority list IIFE and before the closing `</>`, add:
```tsx
          {data.completedToday.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                Concluídos hoje
                <span className="text-[11px] font-normal text-muted-foreground">
                  {data.completedToday.length}
                </span>
              </h2>
              <div className="space-y-2">
                {data.completedToday.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/30 px-4 py-2.5 opacity-70"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="truncate text-[13px] text-muted-foreground line-through">
                      {it.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {it.sourceLabel} · {it.statusLabel}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
```
Add `CheckCircle2` to the `lucide-react` import in the page.

Note: the empty-state gate stays `groups.p1+p2+p3 === 0` — so when there are no actionable items but there ARE completed ones, the page shows "Você está em dia 🎉" followed by the "Concluídos hoje" section. That's the intended positive-reinforcement UX.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS, then:
```bash
git add artifacts/web/src/lib/pendencias-format.ts artifacts/web/src/pages/app/pendencias.tsx artifacts/web/tests/pages/pendencias.unit.test.tsx
git commit -m "feat(pendencias): Concluídos hoje section + counts.completedToday"
```

---

### Task 7: Frontend — calendar mode (Lista/Calendário toggle + month grid)

**Files:**
- Create: `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx`
- Modify: `artifacts/web/src/lib/pendencias-format.ts` (add `itemsByDay` helper)
- Modify: `artifacts/web/src/pages/app/pendencias.tsx` (toggle + render calendar)
- Test: `artifacts/web/tests/lib/pendencias-format.unit.test.ts` (itemsByDay), `artifacts/web/tests/components/pendencias-calendar.unit.test.tsx` (calendar render)

**Interfaces:**
- Consumes: `Pendencia`, `URGENCY_META` (format); `date-fns`.
- Produces: `itemsByDay(items): Map<string, Pendencia[]>` (key `YYYY-MM-DD`, only dated items); `<PendenciasCalendar items month onMonthChange />`.

- [ ] **Step 1: Add + test `itemsByDay`**

In `artifacts/web/tests/lib/pendencias-format.unit.test.ts`, add:
```ts
import { itemsByDay } from "@/lib/pendencias-format";

describe("itemsByDay", () => {
  it("buckets dated items by YYYY-MM-DD and drops null-due items", () => {
    const map = itemsByDay([
      item("a", "overdue", "2026-06-10"),
      item("b", "due_soon", "2026-06-10"),
      item("c", "no_due", null),
      item("d", "upcoming", "2026-07-01T08:00:00.000Z"),
    ]);
    expect(map.get("2026-06-10")?.map((i) => i.id)).toEqual(["a", "b"]);
    expect(map.has("2026-07-01")).toBe(true);
    expect([...map.values()].flat().some((i) => i.id === "c")).toBe(false);
  });
});
```
In `artifacts/web/src/lib/pendencias-format.ts`, add:
```ts
export function itemsByDay(items: Pendencia[]): Map<string, Pendencia[]> {
  const map = new Map<string, Pendencia[]>();
  for (const it of items) {
    if (!it.dueDate) continue;
    const d = it.dueDate.slice(0, 10); // "YYYY-MM-DD"
    const list = map.get(d);
    if (list) list.push(it);
    else map.set(d, [it]);
  }
  return map;
}
```
Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/pendencias-format.unit.test.ts` → FAIL then (after adding the function) PASS.

- [ ] **Step 2: Write the calendar render test (RED)**

Create `artifacts/web/tests/components/pendencias-calendar.unit.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendenciasCalendar } from "@/components/pendencias/PendenciasCalendar";
import type { Pendencia } from "@/lib/pendencias-format";

function item(id: string, dueDate: string): Pendencia {
  return {
    id, source: "action_plan", sourceLabel: "Plano de ação", title: id,
    statusLabel: "", dueDate, urgency: "overdue", responsibleUserId: 1,
    link: { route: "/planos-acao/1", ctaLabel: "Ver" },
  };
}

describe("PendenciasCalendar", () => {
  it("renders the month label and marks days that have items", () => {
    render(
      <PendenciasCalendar
        items={[item("a", "2026-06-10"), item("b", "2026-06-10")]}
        month={new Date(2026, 5, 1)}
        onMonthChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/junho de 2026/i)).toBeInTheDocument();
    // day 10 cell is labelled with its item count (unambiguous vs. the day-number "2")
    expect(screen.getByLabelText(/Dia 10: 2 pendência/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/components/pendencias-calendar.unit.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 4: Implement the calendar**

Create `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx`:
```tsx
import { useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { itemsByDay, URGENCY_META, type Pendencia } from "@/lib/pendencias-format";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DOT_COLOR: Record<"danger" | "warning" | "info", string> = {
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export function PendenciasCalendar({
  items,
  month,
  onMonthChange,
}: {
  items: Pendencia[];
  month: Date;
  onMonthChange: (next: Date) => void;
}) {
  const byDay = itemsByDay(items);
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const [selected, setSelected] = useState<string | null>(null);
  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  function keyOf(d: Date): string {
    return format(d, "yyyy-MM-dd");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold capitalize text-foreground">
          {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => onMonthChange(subMonths(month, 1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const k = keyOf(d);
          const dayItems = byDay.get(k) ?? [];
          const inMonth = isSameMonth(d, month);
          const isSelected = selected === k;
          return (
            <button
              key={k}
              type="button"
              aria-label={dayItems.length > 0 ? `Dia ${format(d, "d")}: ${dayItems.length} pendência(s)` : undefined}
              onClick={() => setSelected(dayItems.length > 0 ? k : null)}
              className={cn(
                "flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-[12px] transition-colors",
                inMonth ? "border-border/60" : "border-transparent text-muted-foreground/40",
                isSelected ? "ring-2 ring-foreground" : "hover:bg-muted/30",
                dayItems.length > 0 && "font-medium",
              )}
            >
              <span>{format(d, "d")}</span>
              {dayItems.length > 0 && (
                <span className="mt-auto flex items-center gap-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className={cn("h-1.5 w-1.5 rounded-full", DOT_COLOR[URGENCY_META[it.urgency].badgeVariant])}
                    />
                  ))}
                  <span className="ml-0.5 text-[10px] text-muted-foreground">{dayItems.length}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && selectedItems.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
          <p className="text-[12px] font-medium text-foreground">
            {format(new Date(`${selected}T12:00:00`), "dd 'de' MMMM", { locale: ptBR })}
          </p>
          {selectedItems.map((it) => (
            <Link
              key={it.id}
              href={it.link.route}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted/40"
            >
              <span className="truncate">
                <span className="text-muted-foreground">{it.sourceLabel} · </span>
                {it.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{it.link.ctaLabel} ↗</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the calendar test to verify it passes**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/components/pendencias-calendar.unit.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add the Lista/Calendário toggle to the page**

In `artifacts/web/src/pages/app/pendencias.tsx`:
1. Add imports:
```tsx
import { PendenciasCalendar } from "@/components/pendencias/PendenciasCalendar";
import { List, CalendarDays } from "lucide-react";
```
2. Add view state near the scope state:
```tsx
const [view, setView] = useState<"list" | "calendar">("list");
const [calMonth, setCalMonth] = useState<Date>(() => new Date());
```
3. Render a toggle just before the `{data && (...)}` block (or right after SummaryCards inside it):
```tsx
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                view === "list" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                view === "calendar" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendário
            </button>
          </div>
```
4. Wrap the priority-list IIFE so it only renders in list view, and render the calendar in calendar view. Replace the IIFE block with:
```tsx
            {view === "list" ? (
              (() => {
                const now = new Date();
                const groups = groupByPriority(data.items);
                const empty = groups.p1.length + groups.p2.length + groups.p3.length === 0;
                if (empty) return <EmptyState />;
                return (
                  <div className="space-y-6">
                    <PrioritySection title={URGENCY_META.overdue.sectionTitle} priority="P1" items={groups.p1} now={now} />
                    <PrioritySection title={URGENCY_META.due_soon.sectionTitle} priority="P2" items={groups.p2} now={now} />
                    <PrioritySection title={URGENCY_META.no_due.sectionTitle} priority="P3" items={groups.p3} now={now} />
                  </div>
                );
              })()
            ) : (
              <PendenciasCalendar items={data.items} month={calMonth} onMonthChange={setCalMonth} />
            )}
```
(The "Concluídos hoje" section from Task 6 stays below, in both views.)

- [ ] **Step 7: Typecheck + run the page test (no regression)**

Run: `pnpm --filter @workspace/web typecheck` → PASS.
Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/pendencias.unit.test.tsx` → PASS (the default view is "list", so existing assertions hold).

- [ ] **Step 8: Commit**

```bash
git add artifacts/web/src/components/pendencias/PendenciasCalendar.tsx artifacts/web/src/lib/pendencias-format.ts artifacts/web/src/pages/app/pendencias.tsx artifacts/web/tests/lib/pendencias-format.unit.test.ts artifacts/web/tests/components/pendencias-calendar.unit.test.tsx
git commit -m "feat(pendencias): calendar mode (Lista/Calendário toggle + month grid)"
```

---

### Task 8: Phase verification + final review

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all projects.

- [ ] **Step 2: Run all F4 tests**

Run:
```bash
pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias artifacts/api-server/tests/routes/pendencias.integration.test.ts
pnpm exec vitest run --project web-unit artifacts/web/tests/lib/pendencias-format.unit.test.ts artifacts/web/tests/pages/pendencias.unit.test.tsx artifacts/web/tests/components/pendencias-calendar.unit.test.tsx
```
Expected: all PASS.

- [ ] **Step 3: Stop for review**

F4 completes the Suas Pendências feature (F1 identity + F2 engine + F3 panel + F4 calendar/concluídos). All commits are on `suas-pendencias` (PR #102). No push without explicit go.

---

## Notes / follow-ups

- **Manager scope** in the endpoint is still mine-only (deferred from F2/F3) — a manager seeing `scope=unit` for their own filial is a future enhancement.
- The calendar groups by `dueDate` date-part; KPI overdue items use the last-day-of-month as `dueDate` (so they plot on that day) — acceptable.
- `completedToday` items carry `urgency: "no_due"` and a completion `dueDate` (today) so they could also appear in the calendar on today's cell; if that's undesirable, filter `meta.completed` out of the calendar feed in a follow-up (the panel only passes `data.items` to the calendar, not `completedToday`, so they do NOT appear on the calendar — confirmed by Task 7 Step 6 passing `data.items`).
