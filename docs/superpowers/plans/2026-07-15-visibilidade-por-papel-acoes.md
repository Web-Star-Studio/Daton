# Visibilidade por papel no hub de Ações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para executar task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** No hub de Gestão de Ações, o operador vê só os planos a que está vinculado, o gestor vê a filial dele + corporativos, admin e analista veem tudo (analista só leitura).

**Architecture:** Espelha o modelo de visibilidade do KPI (`services/kpi/access.ts` + `routes/kpi/index.ts`). Um predicado puro `canViewActionPlan` (back + espelho front), aplicado na listagem (filtro SQL), no `requirePlanAccess` (por-plano) e no summary. A filial do plano é uma coluna nova `action_plans.unit_id`, **derivada** (origem → filial da origem; manual → filial do ponto focal; sem filial → corporativo/nulo) e **fixa na criação**.

**Tech Stack:** TypeScript, Drizzle/Postgres, Express 5, Zod, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-visibilidade-por-papel-acoes-design.md`

## Global Constraints

- **Nunca `pnpm db push`** — aponta para o Neon de **produção**. Banco de teste: DDL cirúrgico.
- **Testes de integração exigem `TEST_ENV=integration`** — sem isso o Vitest bate na **produção**.
- **O container Postgres de integração (`daton-postgres-1`, banco `daton_integration` em `127.0.0.1:55432`) é compartilhado entre worktrees.** Se uma tabela/coluna sumir no meio da suíte (`42P01`/`42703`), outra sessão fez `push`; reaplique o schema cirurgicamente (Task 10 tem o DDL) e siga. **Nunca** `db push` para consertar.
- **Nunca editar arquivos gerados** (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`) — só via `pnpm --filter @workspace/api-spec codegen`.
- **Espelhar o KPI:** o gestor tem UMA filial (`users.unit_id`), como `getRequesterKpiScope` (`routes/kpi/index.ts:143`). Não usar `unit_managers`.
- **Divergência do KPI (proposital):** analista de Ações vê **tudo** (auditor), diferente do analista de KPI.
- **`unit_id` nulo = corporativo** (todos os gestores veem). Preenchido = aquela filial.
- Todo commit passa `pnpm typecheck`. Estilo: Prettier (2 espaços, aspas duplas, trailing commas). Comentários/erros ao usuário em **PT-BR**.

## Estrutura de arquivos

**Criados:**
- `artifacts/api-server/src/services/action-plans/access.ts` — predicado `canViewActionPlan` + tipos (espelha `services/kpi/access.ts`).
- `artifacts/api-server/src/services/action-plans/derive-unit.ts` — `deriveActionPlanUnit(...)` (resolve a filial da origem ou do ponto focal).
- `artifacts/web/src/lib/action-plans-access.ts` — espelho front do predicado.
- Testes: `tests/services/action-plans/access.unit.test.ts`, `tests/services/action-plans/derive-unit.integration.test.ts`, `tests/routes/action-plans-visibility.integration.test.ts`, `artifacts/web/tests/lib/action-plans-access.unit.test.ts`.
- `scripts/src/migrate/action-plans-unit-backfill.ts` — backfill.
- `scripts/sql/20260715_add_action_plans_unit_id.sql` — DDL de produção.

**Modificados:**
- `lib/db/src/schema/action-plans.ts` — coluna `unitId` + índice.
- `artifacts/api-server/src/routes/action-plans.ts` — scope builder, filtro da listagem, `requirePlanAccess`, POST create (deriva+grava unit).
- `artifacts/api-server/src/services/action-plans/summary.ts` — escopo nas contagens.
- `artifacts/web/src/pages/app/planos-acao/**` — esconder/mostrar conforme o papel (opcional; o back já barra).

---

### Task 1: Coluna `action_plans.unit_id` no schema

**Files:** Modify `lib/db/src/schema/action-plans.ts`

**Interfaces produzidas:** `action_plans.unit_id` (integer, nullable, FK → `units.id`, `ON DELETE SET NULL`), exposta em `ActionPlan = typeof actionPlansTable.$inferSelect`.

- [ ] **Step 1: Subir/garantir o banco de teste**

```bash
pnpm test:integration:up 2>/dev/null || true
```

- [ ] **Step 2: Adicionar a coluna e o índice**

Em `lib/db/src/schema/action-plans.ts`: se `unitsTable` ainda não está importado, adicione `import { unitsTable } from "./units";`. Na definição de `actionPlansTable`, logo **abaixo** de `responsibleUserId` (o ponto focal), acrescente:

```ts
    /**
     * Filial do plano, para a visibilidade por papel (gestor vê a sua filial).
     * **Derivada e fixa na criação** (ver services/action-plans/derive-unit.ts):
     * origem → filial da origem; manual → filial do ponto focal; sem filial
     * derivável → null = **corporativo** (todos os gestores veem). Não recalcula.
     */
    unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
```

No array de índices da tabela (onde estão `action_plans_org_source_idx` etc.), acrescente:

```ts
    index("action_plans_org_unit_idx").on(table.organizationId, table.unitId),
```

- [ ] **Step 3: Aplicar no banco de teste (cirúrgico, nunca `db push`)**

```bash
docker exec -i daton-postgres-1 psql -U postgres -d daton_integration <<'SQL'
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS unit_id integer REFERENCES units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS action_plans_org_unit_idx ON action_plans (organization_id, unit_id);
SQL
```

- [ ] **Step 4: Typecheck e commit**

```bash
pnpm typecheck
git add lib/db/src/schema/action-plans.ts
git commit -m "feat(db): action_plans.unit_id (filial derivada p/ visibilidade por papel)"
```

---

### Task 2: `deriveActionPlanUnit` — resolve a filial

**Files:** Create `artifacts/api-server/src/services/action-plans/derive-unit.ts`; Test `artifacts/api-server/tests/services/action-plans/derive-unit.integration.test.ts`

**Interfaces produzidas:**
- `deriveActionPlanUnit(orgId: number, sourceModule: ActionPlanSourceModule, sourceRef: ActionPlanSourceRef, pontoFocalUserId: number | null): Promise<number | null>` — a filial derivada, ou `null` (corporativo).

- [ ] **Step 1: Teste que falha**

Crie `artifacts/api-server/tests/services/action-plans/derive-unit.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, kpiIndicatorsTable, swotFactorsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cleanupTestContext, createTestContext, createTestUser, createUnit, type TestOrgContext,
} from "../../../../../tests/support/backend";
import { deriveActionPlanUnit } from "../../../src/services/action-plans/derive-unit";

const contexts: TestOrgContext[] = [];
afterEach(async () => { await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c))); });

describe("deriveActionPlanUnit", () => {
  it("manual: herda a filial do ponto focal", async () => {
    const ctx = await createTestContext({ seed: "derive-manual" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "POA");
    const focal = await createTestUser(ctx, { suffix: "focal", role: "operator" });
    await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, focal.id));

    expect(await deriveActionPlanUnit(ctx.organizationId, "manual", { manualContext: "x" }, focal.id)).toBe(unit.id);
  });

  it("manual sem ponto focal: corporativo (null)", async () => {
    const ctx = await createTestContext({ seed: "derive-manual-nofocal" });
    contexts.push(ctx);
    expect(await deriveActionPlanUnit(ctx.organizationId, "manual", { manualContext: "x" }, null)).toBeNull();
  });

  it("origem swot: herda a filial do fator; fator corporativo → null", async () => {
    const ctx = await createTestContext({ seed: "derive-swot" });
    contexts.push(ctx);
    const unit = await createUnit(ctx, "SBC");
    const [comFilial] = await db.insert(swotFactorsTable).values({
      organizationId: ctx.organizationId, type: "weakness", description: "d", unitId: unit.id,
    }).returning({ id: swotFactorsTable.id });
    const [corp] = await db.insert(swotFactorsTable).values({
      organizationId: ctx.organizationId, type: "threat", description: "d", unitId: null,
    }).returning({ id: swotFactorsTable.id });

    expect(await deriveActionPlanUnit(ctx.organizationId, "swot", { swotFactorId: comFilial.id }, null)).toBe(unit.id);
    expect(await deriveActionPlanUnit(ctx.organizationId, "swot", { swotFactorId: corp.id }, null)).toBeNull();
  });

  it("origem sem entidade de filial (nonconformity): corporativo (null)", async () => {
    const ctx = await createTestContext({ seed: "derive-nc" });
    contexts.push(ctx);
    expect(await deriveActionPlanUnit(ctx.organizationId, "nonconformity", { nonconformityId: 999999 }, null)).toBeNull();
  });
});
```

> `createUnit(context, name)` (`tests/support/backend.ts:134`) cria uma unidade `filial`/`ativa` e devolve a row (com `.id`).

- [ ] **Step 2: Rodar e ver falhar**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/derive-unit.integration.test.ts
```

Esperado: FAIL — `deriveActionPlanUnit` não existe.

- [ ] **Step 3: Implementar**

Crie `artifacts/api-server/src/services/action-plans/derive-unit.ts`:

```ts
import { and, eq } from "drizzle-orm";
import {
  db,
  employeeTrainingsTable,
  employeesTable,
  kpiIndicatorsTable,
  kpiMonthlyValuesTable,
  kpiYearConfigsTable,
  laiaAssessmentsTable,
  strategicPlanRiskOpportunityItemsTable,
  swotFactorsTable,
  usersTable,
  type ActionPlanSourceModule,
  type ActionPlanSourceRef,
} from "@workspace/db";

const MANUAL_FAMILY: ReadonlySet<ActionPlanSourceModule> = new Set([
  "manual", "improvement", "corrective", "norm_requirement",
]);

/**
 * Filial do plano, derivada na criação (e no backfill), FIXA depois.
 * - Origem com filial → a filial da entidade de origem (pode ser null = corporativo).
 * - Manual → a filial do ponto focal (null se não houver ponto focal).
 * - Origens org-level (nonconformity, audit_finding, road_safety, rac, incident) → null.
 * Sem fallback cruzado: origem-sem-filial NÃO cai no ponto focal (decisão da cliente).
 */
export async function deriveActionPlanUnit(
  orgId: number,
  sourceModule: ActionPlanSourceModule,
  sourceRef: ActionPlanSourceRef,
  pontoFocalUserId: number | null,
): Promise<number | null> {
  if (MANUAL_FAMILY.has(sourceModule)) {
    if (pontoFocalUserId == null) return null;
    const [u] = await db
      .select({ unitId: usersTable.unitId })
      .from(usersTable)
      .where(and(eq(usersTable.id, pontoFocalUserId), eq(usersTable.organizationId, orgId)));
    return u?.unitId ?? null;
  }

  switch (sourceModule) {
    case "kpi": {
      // Preferir kpiIndicatorId; senão resolver via kpiMonthlyValueId.
      if (typeof sourceRef.kpiIndicatorId === "number") {
        const [r] = await db
          .select({ unitId: kpiIndicatorsTable.unitId })
          .from(kpiIndicatorsTable)
          .where(and(eq(kpiIndicatorsTable.id, sourceRef.kpiIndicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
        return r?.unitId ?? null;
      }
      if (typeof sourceRef.kpiMonthlyValueId === "number") {
        const [r] = await db
          .select({ unitId: kpiIndicatorsTable.unitId })
          .from(kpiMonthlyValuesTable)
          .innerJoin(kpiYearConfigsTable, eq(kpiYearConfigsTable.id, kpiMonthlyValuesTable.yearConfigId))
          .innerJoin(kpiIndicatorsTable, eq(kpiIndicatorsTable.id, kpiYearConfigsTable.indicatorId))
          .where(and(eq(kpiMonthlyValuesTable.id, sourceRef.kpiMonthlyValueId), eq(kpiMonthlyValuesTable.organizationId, orgId)));
        return r?.unitId ?? null;
      }
      return null;
    }
    case "swot": {
      if (typeof sourceRef.swotFactorId !== "number") return null;
      const [r] = await db
        .select({ unitId: swotFactorsTable.unitId })
        .from(swotFactorsTable)
        .where(and(eq(swotFactorsTable.id, sourceRef.swotFactorId), eq(swotFactorsTable.organizationId, orgId)));
      return r?.unitId ?? null;
    }
    case "risk": {
      if (typeof sourceRef.riskOpportunityItemId !== "number") return null;
      const [r] = await db
        .select({ unitId: strategicPlanRiskOpportunityItemsTable.unitId })
        .from(strategicPlanRiskOpportunityItemsTable)
        .where(eq(strategicPlanRiskOpportunityItemsTable.id, sourceRef.riskOpportunityItemId));
      return r?.unitId ?? null;
    }
    case "environmental": {
      if (typeof sourceRef.laiaAssessmentId !== "number") return null;
      const [r] = await db
        .select({ unitId: laiaAssessmentsTable.unitId })
        .from(laiaAssessmentsTable)
        .where(and(eq(laiaAssessmentsTable.id, sourceRef.laiaAssessmentId), eq(laiaAssessmentsTable.organizationId, orgId)));
      return r?.unitId ?? null;
    }
    case "training": {
      if (typeof sourceRef.trainingId !== "number") return null;
      const [r] = await db
        .select({ unitId: employeesTable.unitId })
        .from(employeeTrainingsTable)
        .innerJoin(employeesTable, eq(employeesTable.id, employeeTrainingsTable.employeeId))
        .where(and(eq(employeeTrainingsTable.id, sourceRef.trainingId), eq(employeesTable.organizationId, orgId)));
      return r?.unitId ?? null;
    }
    // Org-level / sem entidade de filial → corporativo.
    case "nonconformity":
    case "audit_finding":
    case "road_safety":
    case "incident":
    case "rac":
      return null;
    default:
      return null;
  }
}
```

> **Atenção do implementador:** confirme os nomes reais das colunas/joins contra o schema (ex.: `strategic_plan_risk_opportunity_items.unitId` não filtra por org na consulta acima porque a tabela pode não ter `organizationId` direto — se tiver, some o `and(org)`; se não, mantenha só o `eq(id)`). Ajuste os `organizationId` conforme cada tabela realmente expõe. O `source-context.ts` é a referência dos joins válidos.

- [ ] **Step 4: Rodar e ver passar**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/derive-unit.integration.test.ts
```

- [ ] **Step 5: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/services/action-plans/derive-unit.ts artifacts/api-server/tests/services/action-plans/derive-unit.integration.test.ts
git commit -m "feat(api): deriveActionPlanUnit (filial da origem / do ponto focal)"
```

---

### Task 3: Predicado `canViewActionPlan` (back) + testes unitários

**Files:** Create `artifacts/api-server/src/services/action-plans/access.ts`; Test `artifacts/api-server/tests/services/action-plans/access.unit.test.ts`

**Interfaces produzidas** (espelham `services/kpi/access.ts`):
- `ActionPlanRequesterScope = { role: UserRole; userId: number; unitId: number | null }`
- `ActionPlanAccessFields = { unitId: number | null; responsibleUserId: number | null; coResponsibleUserIds: number[]; effectivenessEvaluatorUserId: number | null }`
- `canViewActionPlan(scope, plan): boolean`

- [ ] **Step 1: Teste que falha** — `access.unit.test.ts` (puro, sem DB):

```ts
import { describe, expect, it } from "vitest";
import { canViewActionPlan, type ActionPlanAccessFields, type ActionPlanRequesterScope } from "../../../src/services/action-plans/access";

const plan = (o: Partial<ActionPlanAccessFields>): ActionPlanAccessFields => ({
  unitId: null, responsibleUserId: null, coResponsibleUserIds: [], effectivenessEvaluatorUserId: null, ...o,
});
const scope = (o: Partial<ActionPlanRequesterScope>): ActionPlanRequesterScope => ({
  role: "operator", userId: 1, unitId: null, ...o,
});

describe("canViewActionPlan", () => {
  it("admin vê qualquer plano", () => {
    for (const role of ["org_admin", "platform_admin"] as const) {
      expect(canViewActionPlan(scope({ role, userId: 9 }), plan({ unitId: 5 }))).toBe(true);
    }
  });
  it("analista vê tudo (auditor)", () => {
    expect(canViewActionPlan(scope({ role: "analyst", userId: 9 }), plan({ unitId: 5 }))).toBe(true);
    expect(canViewActionPlan(scope({ role: "analyst", userId: 9 }), plan({ unitId: null }))).toBe(true);
  });
  it("operador vê só onde é ponto focal / co-responsável / avaliador", () => {
    const s = scope({ role: "operator", userId: 7 });
    expect(canViewActionPlan(s, plan({ responsibleUserId: 7 }))).toBe(true);
    expect(canViewActionPlan(s, plan({ coResponsibleUserIds: [3, 7] }))).toBe(true);
    expect(canViewActionPlan(s, plan({ effectivenessEvaluatorUserId: 7 }))).toBe(true);
    expect(canViewActionPlan(s, plan({ responsibleUserId: 8, unitId: 5 }))).toBe(false);
  });
  it("gestor vê a filial dele, corporativo, e onde é pessoal; não vê filial alheia", () => {
    const s = scope({ role: "manager", userId: 7, unitId: 5 });
    expect(canViewActionPlan(s, plan({ unitId: 5 }))).toBe(true);       // minha filial
    expect(canViewActionPlan(s, plan({ unitId: null }))).toBe(true);     // corporativo
    expect(canViewActionPlan(s, plan({ unitId: 8, responsibleUserId: 7 }))).toBe(true); // pessoal, outra filial
    expect(canViewActionPlan(s, plan({ unitId: 8 }))).toBe(false);       // filial alheia, não-pessoal
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/access.unit.test.ts
```

- [ ] **Step 3: Implementar** — `access.ts`:

```ts
import type { UserRole } from "../../middlewares/auth";

export interface ActionPlanRequesterScope {
  role: UserRole;
  userId: number;
  /** Filial do gestor (users.unit_id); null para os demais perfis. */
  unitId: number | null;
}

export interface ActionPlanAccessFields {
  /** Filial do plano; null = corporativo. */
  unitId: number | null;
  responsibleUserId: number | null;
  coResponsibleUserIds: number[];
  effectivenessEvaluatorUserId: number | null;
}

function isAdmin(role: UserRole): boolean {
  return role === "org_admin" || role === "platform_admin";
}

/**
 * Matriz única de VISIBILIDADE do hub de Ações. Espelha `canActOnKpiIndicator`.
 * Espelhada no front em `artifacts/web/src/lib/action-plans-access.ts` — sync.
 * Só governa quem VÊ; a escrita é barrada à parte (requireWriteAccess p/ analista).
 */
export function canViewActionPlan(
  scope: ActionPlanRequesterScope,
  plan: ActionPlanAccessFields,
): boolean {
  if (isAdmin(scope.role)) return true;
  if (scope.role === "analyst") return true; // auditor: vê tudo, só leitura

  const personallyInvolved =
    (plan.responsibleUserId !== null && plan.responsibleUserId === scope.userId) ||
    plan.coResponsibleUserIds.includes(scope.userId) ||
    (plan.effectivenessEvaluatorUserId !== null && plan.effectivenessEvaluatorUserId === scope.userId);
  if (personallyInvolved) return true;

  if (scope.role === "manager") {
    return plan.unitId === null || (scope.unitId !== null && plan.unitId === scope.unitId);
  }
  return false; // operator
}
```

- [ ] **Step 4: Rodar e ver passar**; **Step 5: typecheck + commit**

```bash
pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/access.unit.test.ts
pnpm typecheck
git add artifacts/api-server/src/services/action-plans/access.ts artifacts/api-server/tests/services/action-plans/access.unit.test.ts
git commit -m "feat(api): predicado canViewActionPlan (visibilidade por papel)"
```

---

### Task 4: POST create deriva e grava `unit_id`

**Files:** Modify `artifacts/api-server/src/routes/action-plans.ts` (POST); Test estende `tests/routes/action-plans-visibility.integration.test.ts` (criado na Task 6) — ou um teste focado aqui.

**Interfaces:** consome `deriveActionPlanUnit` (Task 2).

- [ ] **Step 1: Teste focado** — em `tests/routes/action-plans-visibility.integration.test.ts` (crie o arquivo se ainda não existir):

```ts
// POST manual com ponto focal grava a filial do ponto focal
it("POST manual grava unit_id = filial do ponto focal", async () => {
  const ctx = await createTestContext({ seed: "post-unit", role: "org_admin" });
  contexts.push(ctx);
  const unit = await createUnit(ctx, "POA");
  const focal = await createTestUser(ctx, { suffix: "focal", role: "operator" });
  await db.update(usersTable).set({ unitId: unit.id }).where(eq(usersTable.id, focal.id));

  const res = await request(app)
    .post(`/api/organizations/${ctx.organizationId}/action-plans`)
    .set(authHeader(ctx))
    .send({ sourceModule: "manual", sourceRef: { manualContext: "x" }, title: "T", responsibleUserId: focal.id });
  expect(res.status).toBe(201);

  const [row] = await db.select({ unitId: actionPlansTable.unitId }).from(actionPlansTable).where(eq(actionPlansTable.id, res.body.id));
  expect(row.unitId).toBe(unit.id);
});
```

- [ ] **Step 2: Rodar e ver falhar** (unit_id vem null).

- [ ] **Step 3: Implementar** — na rota **POST** de `routes/action-plans.ts`, importe `deriveActionPlanUnit` e, no bloco que monta os valores do `db.insert(actionPlansTable).values({...})`, acrescente o cálculo **antes** do insert e o campo no insert:

```ts
  const unitId = await deriveActionPlanUnit(
    params.data.orgId, body.data.sourceModule, body.data.sourceRef, body.data.responsibleUserId ?? null,
  );
```

e no objeto `.values({ ... })`, logo abaixo de `responsibleUserId: body.data.responsibleUserId ?? null,`:

```ts
    unitId,
```

- [ ] **Step 4: Rodar e ver passar**; **Step 5: typecheck + commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/tests/routes/action-plans-visibility.integration.test.ts
git commit -m "feat(api): POST de plano deriva e grava a filial (unit_id)"
```

---

### Task 5: Scope builder + filtro da listagem por papel

**Files:** Modify `artifacts/api-server/src/routes/action-plans.ts`; Test estende `action-plans-visibility.integration.test.ts`.

**Interfaces produzidas:**
- `getRequesterActionPlanScope(req): Promise<ActionPlanRequesterScope>` — monta `{ role, userId, unitId }` (unitId = users.unit_id se manager).
- `actionPlanVisibilityCondition(scope): SQL | undefined` — condição WHERE (undefined = sem restrição, para admin/analista).

- [ ] **Step 1: Testes** — na listagem, com 3 planos (do operador X; da filial do gestor; de outra filial):

```ts
it("operador vê só os planos dele na listagem", async () => {
  const ctx = await createTestContext({ seed: "list-op", role: "org_admin" });
  contexts.push(ctx);
  const unitA = await createUnit(ctx, "A"); const unitB = await createUnit(ctx, "B");
  const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
  await db.update(usersTable).set({ unitId: unitA.id }).where(eq(usersTable.id, op.id));
  const meu = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: op.id });
  await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId }); // mesma filial, não é dele
  await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: ctx.userId });

  const res = await request(app).get(`/api/organizations/${ctx.organizationId}/action-plans`).set(authHeader({ token: op.token }));
  expect(res.status).toBe(200);
  expect(res.body.map((p: { id: number }) => p.id)).toEqual([meu]);
});

it("gestor vê a filial dele + corporativo, não a filial alheia", async () => {
  const ctx = await createTestContext({ seed: "list-mgr", role: "org_admin" });
  contexts.push(ctx);
  const unitA = await createUnit(ctx, "A"); const unitB = await createUnit(ctx, "B");
  const mgr = await createTestUser(ctx, { suffix: "mgr", role: "manager", modules: ["actionPlans"] });
  await db.update(usersTable).set({ unitId: unitA.id }).where(eq(usersTable.id, mgr.id));
  const naMinha = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId });
  const corporativo = await seedPlan(ctx, { unitId: null, responsibleUserId: ctx.userId });
  await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: ctx.userId }); // filial alheia

  const res = await request(app).get(`/api/organizations/${ctx.organizationId}/action-plans`).set(authHeader({ token: mgr.token }));
  expect(res.body.map((p: { id: number }) => p.id).sort()).toEqual([naMinha, corporativo].sort());
});
```

> `seedPlan` local: insere em `action_plans` com `organizationId`, `sourceModule: "manual"`, `sourceRef`, `title`, `status: "open"`, `unitId`, `responsibleUserId`. `authHeader({ token })` já aceita `{ token }`.

- [ ] **Step 2: Rodar e ver falhar** (hoje a listagem não escopa por papel).

- [ ] **Step 3: Implementar**

Em `routes/action-plans.ts`, importe do `access.ts` e do drizzle o que faltar (`or`, `sql`, `exists` já devem estar após o #158). Acrescente os dois helpers (espelhando `getRequesterKpiScope` e `kpiVisibilityCondition`):

```ts
async function getRequesterActionPlanScope(
  req: { auth?: { userId: number; role: ActionPlanRequesterScope["role"] } },
): Promise<ActionPlanRequesterScope> {
  const { userId, role } = req.auth!;
  let unitId: number | null = null;
  if (role === "manager") {
    const [u] = await db.select({ unitId: usersTable.unitId }).from(usersTable).where(eq(usersTable.id, userId));
    unitId = u?.unitId ?? null;
  }
  return { role, userId, unitId };
}

/** Condição SQL de visibilidade por papel. undefined = sem restrição (admin/analista). */
function actionPlanVisibilityCondition(scope: ActionPlanRequesterScope): SQL | undefined {
  if (scope.role === "org_admin" || scope.role === "platform_admin" || scope.role === "analyst") return undefined;

  // "Pessoalmente vinculado": ponto focal, avaliador, ou co-responsável (EXISTS na junção).
  const personal = or(
    eq(actionPlansTable.responsibleUserId, scope.userId),
    eq(actionPlansTable.effectivenessEvaluatorUserId, scope.userId),
    exists(
      db.select({ one: sql`1` }).from(actionPlanResponsiblesTable).where(
        and(
          eq(actionPlanResponsiblesTable.actionPlanId, actionPlansTable.id),
          eq(actionPlanResponsiblesTable.userId, scope.userId),
        ),
      ),
    ),
  )!;

  if (scope.role === "manager") {
    return or(
      personal,
      isNull(actionPlansTable.unitId), // corporativo
      scope.unitId !== null ? eq(actionPlansTable.unitId, scope.unitId) : sql`false`,
    );
  }
  return personal; // operator
}
```

Na rota `GET .../action-plans`, depois de montar `conditions` (o array de filtros), acrescente:

```ts
  const scope = await getRequesterActionPlanScope(req);
  const visibility = actionPlanVisibilityCondition(scope);
  if (visibility) conditions.push(visibility);
```

`ActionPlanRequesterScope` importado de `../services/action-plans/access`. `isNull` do drizzle no import.

> **Nota sobre o gate `canReadListing`:** ele fica como está (módulo abre o hub). O filtro por papel é aplicado **dentro**. Um operador com o módulo continua abrindo o hub, mas agora só vê os planos dele.

- [ ] **Step 4: Rodar e ver passar**; **Step 5: typecheck + commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/tests/routes/action-plans-visibility.integration.test.ts
git commit -m "feat(api): listagem do hub escopada por papel"
```

---

### Task 6: `requirePlanAccess` aplica o predicado (fecha o acesso por URL)

**Files:** Modify `artifacts/api-server/src/routes/action-plans.ts` (`requirePlanAccess`); Test estende `action-plans-visibility.integration.test.ts`.

- [ ] **Step 1: Teste**

```ts
it("operador recebe 403 ao abrir por id um plano de outra filial em que não está vinculado", async () => {
  const ctx = await createTestContext({ seed: "acc-op", role: "org_admin" });
  contexts.push(ctx);
  const unitB = await createUnit(ctx, "B");
  const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
  const alheio = await seedPlan(ctx, { unitId: unitB.id, responsibleUserId: ctx.userId });

  const res = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/action-plans/${alheio}`)
    .set(authHeader({ token: op.token }));
  expect(res.status).toBe(403);
});

it("gestor abre um plano da filial dele", async () => {
  const ctx = await createTestContext({ seed: "acc-mgr", role: "org_admin" });
  contexts.push(ctx);
  const unitA = await createUnit(ctx, "A");
  const mgr = await createTestUser(ctx, { suffix: "mgr", role: "manager", modules: ["actionPlans"] });
  await db.update(usersTable).set({ unitId: unitA.id }).where(eq(usersTable.id, mgr.id));
  const naFilial = await seedPlan(ctx, { unitId: unitA.id, responsibleUserId: ctx.userId });

  const res = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/action-plans/${naFilial}`)
    .set(authHeader({ token: mgr.token }));
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Rodar e ver falhar** (hoje o operador com o módulo abre qualquer plano).

- [ ] **Step 3: Implementar**

Em `requirePlanAccess`, o `select` do plano passa a trazer `unitId` e os campos de acesso; e o cálculo de `allowed` troca a cláusula `hasModule(actionPlans)` pelo predicado. Substitua o corpo interno por:

```ts
    const [plan] = await db
      .select({
        sourceModule: actionPlansTable.sourceModule,
        unitId: actionPlansTable.unitId,
        responsibleUserId: actionPlansTable.responsibleUserId,
        effectivenessEvaluatorUserId: actionPlansTable.effectivenessEvaluatorUserId,
      })
      .from(actionPlansTable)
      .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
    if (!plan) { next(); return; }

    const scope = await getRequesterActionPlanScope(req);
    const coResponsibleUserIds = await listCoResponsibleIds(planId);
    const roleAllows = canViewActionPlan(scope, {
      unitId: plan.unitId,
      responsibleUserId: plan.responsibleUserId,
      coResponsibleUserIds,
      effectivenessEvaluatorUserId: plan.effectivenessEvaluatorUserId,
    });
    const originOwner = SOURCE_MODULE_OWNER[plan.sourceModule];
    // canViewActionPlan já exige o módulo do hub implicitamente? Não — o gate do hub
    // é a listagem. Aqui, a visibilidade por papel + a via de origem genuína decidem.
    const allowed =
      roleAllows ||
      (originOwner !== "actionPlans" && (await userHasModuleAccess(req.auth!, originOwner)));
    if (!allowed) { res.status(403).json({ error: "Sem acesso a este plano de ação" }); return; }
```

Imports: `canViewActionPlan` de `../services/action-plans/access`; `listCoResponsibleIds` já importado (do #158).

> **Sutileza importante:** hoje `requirePlanAccess` concede acesso a quem tem o módulo `actionPlans` (irrestrito). O novo predicado **substitui** essa cláusula: admin/analista → true (veem tudo); gestor → sua filial/corporativo/pessoal; operador → só pessoal. A via `hasModule(originOwner)` fica só para origens **não-manuais** (kpi/governança/etc.), preservando o fluxo de desvio do KPI/RAC. Isso **não** exige mais o módulo `actionPlans` para o admin (ele já é `isAdmin` no predicado) — comportamento correto.

- [ ] **Step 4: Rodar toda a suíte de acesso + a de módulo do #158** (garantir que nada regrediu):

```bash
TEST_ENV=integration pnpm exec vitest run --project integration \
  artifacts/api-server/tests/routes/action-plans-visibility.integration.test.ts \
  artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts \
  artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts
```

> Se algum teste do #158 (module-access) assumir que "quem tem o módulo abre qualquer plano", ele reflete o comportamento ANTIGO e deve ser **atualizado** para o novo modelo (admin abre tudo; operador com módulo só abre os seus). Ajuste-o conscientemente e explique no commit.

- [ ] **Step 5: typecheck + commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/tests/routes/action-plans-visibility.integration.test.ts
git commit -m "feat(api): requirePlanAccess aplica visibilidade por papel (fecha URL direta)"
```

---

### Task 7: Summary/dashboards no mesmo escopo

**Files:** Modify `artifacts/api-server/src/services/action-plans/summary.ts` e a rota do summary em `routes/action-plans.ts`; Test estende visibility.

- [ ] **Step 1: Teste** — as contagens de um operador refletem só os planos dele:

```ts
it("summary do operador conta só os planos dele", async () => {
  const ctx = await createTestContext({ seed: "sum-op", role: "org_admin" });
  contexts.push(ctx);
  const op = await createTestUser(ctx, { suffix: "op", role: "operator", modules: ["actionPlans"] });
  await seedPlan(ctx, { responsibleUserId: op.id });          // dele
  await seedPlan(ctx, { responsibleUserId: ctx.userId });      // de outro
  await seedPlan(ctx, { responsibleUserId: ctx.userId });      // de outro

  const res = await request(app).get(`/api/organizations/${ctx.organizationId}/action-plans/summary`).set(authHeader({ token: op.token }));
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(1);
});
```

- [ ] **Step 2: Rodar e ver falhar** (summary hoje conta a org toda).

- [ ] **Step 3: Implementar**

`computeActionPlanSummary(orgId)` hoje (`services/action-plans/summary.ts:31`) faz **um** `db.select(...)` das linhas da org e agrega em JS. A mudança é mínima: aceitar uma condição extra e aplicá-la no `WHERE`.

Em `summary.ts`, troque o import e a assinatura:

```ts
import { and, eq, type SQL } from "drizzle-orm";
```

```ts
/** Aggregate the org's action plans into dashboard metrics. Computed in JS over
 * the org-scoped rows (hundreds at most), mirroring how KPI dashboards aggregate
 * from a list response rather than via bespoke SQL.
 *
 * `visibility` (opcional) é a condição de escopo por papel do solicitante — as
 * contagens têm de refletir o MESMO recorte da listagem, senão o operador vê
 * "vencidas: 12" e só 1 plano na lista. undefined = sem restrição (admin/analista).
 */
export async function computeActionPlanSummary(
  orgId: number,
  visibility?: SQL,
): Promise<ActionPlanSummary> {
```

e no `.where(...)` desse `select`, troque a condição só-de-org por:

```ts
    .where(visibility ? and(eq(actionPlansTable.organizationId, orgId), visibility) : eq(actionPlansTable.organizationId, orgId))
```

Na rota `GET /organizations/:orgId/action-plans/summary` (em `routes/action-plans.ts`), monte o escopo e passe adiante:

```ts
  const scope = await getRequesterActionPlanScope(req);
  const out = await computeActionPlanSummary(params.data.orgId, actionPlanVisibilityCondition(scope));
```

(substituindo a chamada atual `computeActionPlanSummary(params.data.orgId)`).

- [ ] **Step 4: rodar/passar**; **Step 5: typecheck + commit**

```bash
git commit -m "feat(api): summary de Ações no escopo do papel do solicitante"
```

---

### Task 8: Espelho front + esconder o que não se vê

**Files:** Create `artifacts/web/src/lib/action-plans-access.ts` + Test `artifacts/web/tests/lib/action-plans-access.unit.test.ts`; Modify telas que exibem opções que dependem do papel (mínimo: nada quebra porque o back já barra).

**Interfaces:** `canViewActionPlan` (mesma assinatura do back), para o front decidir mostrar/esconder sem ida ao servidor.

- [ ] **Step 1: Teste** — espelha os mesmos casos do back (`access.unit.test.ts`), importando de `@/lib/action-plans-access`.

- [ ] **Step 2: ver falhar; Step 3: implementar** — copie a lógica pura de `access.ts` para `artifacts/web/src/lib/action-plans-access.ts` (sem dependências de server). Use o tipo de papel do front.

- [ ] **Step 4: Nota de UI** — como o back já escopa a listagem/summary/acesso, o front **não precisa** de mudança para ficar correto (o operador simplesmente recebe menos planos). Mudança de UI é **opcional** e mínima: nenhum botão "ver todos", nenhuma tela pressupõe ver a org inteira. Se houver algum texto/counter que assuma escopo org, ajuste. **Não** superconstruir.

- [ ] **Step 5: typecheck + web-unit + commit**

```bash
pnpm typecheck
pnpm exec vitest run --project web-unit artifacts/web/tests/lib/action-plans-access.unit.test.ts
git commit -m "feat(web): espelho de visibilidade por papel (action-plans-access)"
```

---

### Task 9: Backfill

**Files:** Create `scripts/src/migrate/action-plans-unit-backfill.ts`

- [ ] **Step 1: Escrever o backfill** — percorre todos os planos com `unit_id IS NULL` (ou todos, idempotente) e grava `deriveActionPlanUnit(orgId, sourceModule, sourceRef, responsibleUserId)`. Reusa o serviço da Task 2. Loga quantos foram atribuídos a filial vs corporativo. **Idempotente** (rodar de novo não muda nada além de recomputar).

> Espelha os outros scripts em `scripts/src/migrate/`. Roda com `TEST_ENV`/DATABASE_URL apontando ao alvo — **nunca** `db push`.

- [ ] **Step 2: Ensaiar contra o banco de teste**

```bash
TEST_ENV=integration pnpm exec tsx scripts/src/migrate/action-plans-unit-backfill.ts
```

- [ ] **Step 3: commit**

```bash
git commit -m "chore(db): backfill de action_plans.unit_id"
```

---

### Task 10: DDL de produção (escrever; **não** aplicar sem autorização)

**Files:** Create `scripts/sql/20260715_add_action_plans_unit_id.sql`

- [ ] **Step 1: Escrever**

```sql
-- Visibilidade por papel no hub de Ações (spec 2026-07-15).
-- Aditivo + idempotente. Ordem: DDL -> backfill (action-plans-unit-backfill) -> deploy.
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS unit_id integer REFERENCES units (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS action_plans_org_unit_idx ON action_plans (organization_id, unit_id);
```

- [ ] **Step 2: Provar idempotência no banco de teste**

```bash
docker exec -i daton-postgres-1 psql -U postgres -d daton_integration < scripts/sql/20260715_add_action_plans_unit_id.sql
```

- [ ] **Step 3: commit + PARAR** — relatar que a DDL de prod **não** foi aplicada; ela exige autorização e vai **antes** do backfill e do deploy.

```bash
git commit -m "chore(db): DDL de action_plans.unit_id para produção"
```

---

## Encerramento

- [ ] **Suíte completa**

```bash
pnpm typecheck
pnpm test:unit
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-visibility.integration.test.ts artifacts/api-server/tests/services/action-plans
```

- [ ] **Diário de bordo** (PT-BR, fidelidade: o que foi feito, impacto na visibilidade, pendências — DDL de prod NÃO aplicada, backfill NÃO aplicado).

- [ ] **PR draft** — corpo destaca: DDL + backfill de prod **não aplicados** (ordem DDL → backfill → deploy); a via de origem e o widget "Ações vinculadas" **não** foram escopados (fronteira da spec §8).
