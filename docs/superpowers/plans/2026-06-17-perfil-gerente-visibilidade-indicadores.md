# Perfil "Gerente" + visibilidade por dono nos Indicadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No módulo de Indicadores (KPI), cada usuário enxerga/edita só o que lhe cabe — operador opera só os seus, analista lê só os seus, e um novo perfil "Gerente" gerencia uma filial inteira (+ corporativos), enquanto o admin segue vendo tudo.

**Architecture:** Vínculo por FK de verdade (`users.unitId`, `kpi_indicators.unitId`). Uma função pura `canActOnKpiIndicator` (backend + espelho no frontend) centraliza a matriz de permissão; as rotas KPI aplicam filtro de visibilidade no GET e gate por-indicador na escrita; a UI esconde botões conforme a mesma matriz. Corporativo é detectado por `rollupStrategy != null`.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), Express 5, Zod, OpenAPI 3.1 + Orval (codegen), React 19 + React Query + React Hook Form, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-perfil-gerente-visibilidade-indicadores-design.md`

---

## Convenções

- **Roles:** o valor novo é `manager` (rótulo UI "Gerente").
- **Corporativo:** indicador com `rollupStrategy != null` (criado via `POST /kpi/corporate-indicators`; tem `unit = "Corporativo"`). Esses ficam `unitId = null`.
- **Não commitar/pushar sem pedido** (CLAUDE.md). O plano usa commits locais por tarefa; ajuste conforme o fluxo do executor.
- **Banco:** schema é sincronizado via `drizzle-kit push` / DDL cirúrgico (a branch local está atrás de `main`; **não** rodar `pnpm --filter @workspace/db push` puro — ver spec §3). Aplicar as 2 colunas via DDL.
- **Codegen:** após editar `lib/api-spec/openapi.yaml`, rodar `pnpm --filter @workspace/api-spec codegen` (precisa de `python3`). Nunca editar arquivos gerados à mão.
- **Tabela-verdade de permissão** (referência para todas as tarefas):

| ação | admin / platform_admin | manager (filial U) | operator | analyst |
|---|---|---|---|---|
| view | ✅ todos | `unitId==U` **ou** corporativo | `responsibleUserId==eu` | `responsibleUserId==eu` |
| createUnit | ✅ | alvo `unitId==U` | ❌ | ❌ |
| createCorporate | ✅ | ✅ | ❌ | ❌ |
| editDefinition | ✅ | `unitId==U` ou corp | ❌ | ❌ |
| operate (valores/justif.) | ✅ | `unitId==U` ou corp | `responsibleUserId==eu` | ❌ |
| delete | ✅ | `unitId==U` **e não** corp | ❌ | ❌ |

---

## File Structure

**Criar:**
- `artifacts/api-server/src/services/kpi/access.ts` — função pura `canActOnKpiIndicator` + tipos.
- `artifacts/api-server/tests/services/kpi/access.unit.test.ts` — tabela-verdade (node-unit; glob exige sufixo `.unit.test.ts`).
- `artifacts/web/src/lib/kpi-access.ts` — espelho frontend da função pura.
- `artifacts/web/tests/lib/kpi-access.unit.test.ts` — tabela-verdade (web-unit).
- `scripts/src/backfill-kpi-unit-id.ts` — backfill único `kpi_indicators.unitId`.
- `artifacts/api-server/tests/routes/kpi-access.integration.test.ts` — integração (visibilidade + 403).

**Modificar:**
- `lib/db/src/schema/users.ts` — `unitId`.
- `lib/db/src/schema/kpi.ts` — `unitId`.
- `artifacts/api-server/src/middlewares/auth.ts` — `UserRole` += `manager`.
- `artifacts/api-server/src/routes/kpi/index.ts` — scope helper, filtro GET, gates de escrita, `unitId` no serialize/POST/PATCH.
- `artifacts/api-server/src/routes/org-users.ts` — `manager` + `unitId` no create e no PATCH role.
- `artifacts/api-server/src/routes/auth.ts` — `unitId` no `/auth/me`.
- `lib/api-spec/openapi.yaml` — `User.unitId`, `KpiIndicator.unitId`, Create/Update bodies, CreateOrgUserBody, role PATCH.
- `artifacts/web/src/contexts/AuthContext.tsx` — expor `unitId` + `userId`; `UserRole` += `manager`.
- `artifacts/web/src/pages/app/kpi/indicadores.tsx` — gate de botões + enviar `unitId`.
- `artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx` — opção "Gerente" + dropdown de filial.

---

## Phase 0 — Schema & backfill

### Task 1: Colunas `unitId` no schema (users + kpi_indicators)

**Files:**
- Modify: `lib/db/src/schema/users.ts`
- Modify: `lib/db/src/schema/kpi.ts`

- [ ] **Step 1: Adicionar `unitId` em `users.ts`**

Em `lib/db/src/schema/users.ts`, importar `unitsTable` e adicionar a coluna. O import de `unitsTable` cria dependência circular potencial (units → organizations; users → organizations). `units.ts` não importa `users.ts`, então `users.ts` importar `units.ts` é seguro.

```ts
import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { unitsTable } from "./units";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  role: text("role").notNull().default("analyst"),
  theme: text("theme").notNull().default("light"),
  // Filial do usuário. Obrigatório (na camada de app) só para role "manager";
  // null para admin/operator/analyst. onDelete set null: apagar a filial não
  // apaga o gerente (vide spec §3.1 / open question 1).
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
```

- [ ] **Step 2: Verificar que não há ciclo de import**

Run: `pnpm --filter @workspace/db typecheck`
Expected: PASS (sem erro de import circular nem de tipo). Se acusar ciclo, mover o import de `unitsTable` para baixo dos outros — ordem de import não resolve ciclo de runtime, mas Drizzle só referencia `unitsTable.id` lazy via callback, então não há acesso em tempo de módulo.

- [ ] **Step 3: Adicionar `unitId` em `kpi.ts`**

Em `lib/db/src/schema/kpi.ts`, importar `unitsTable` e adicionar a coluna em `kpiIndicatorsTable`, logo após `unit`:

```ts
import { unitsTable } from "./units";
```

```ts
  unit: varchar("unit", { length: 200 }),
  // FK real para a filial. null = corporativo (rollup) OU legado não-casado
  // pelo backfill. Fonte de verdade do escopo de visibilidade (a coluna texto
  // `unit` é mantida por compatibilidade/legado de imports Excel).
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  responsible: varchar("responsible", { length: 200 }),
```

- [ ] **Step 4: Typecheck do schema**

Run: `pnpm --filter @workspace/db typecheck`
Expected: PASS.

- [ ] **Step 5: Aplicar DDL no banco local/test**

Aplicar via SQL direto (não `push` puro). Conectar ao banco de desenvolvimento local/test (NÃO prod — ver spec §3.3):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_id integer REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE kpi_indicators ADD COLUMN IF NOT EXISTS unit_id integer REFERENCES units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS kpi_indicators_unit_id_idx ON kpi_indicators(unit_id);
CREATE INDEX IF NOT EXISTS users_unit_id_idx ON users(unit_id);
```

Expected: colunas criadas. (A aplicação em PROD/org 2 é feita junto do go-live, com o mesmo DDL.)

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/users.ts lib/db/src/schema/kpi.ts
git commit -m "feat(db): unitId em users e kpi_indicators (perfil gerente)"
```

---

### Task 2: Script de backfill `kpi_indicators.unitId`

**Files:**
- Create: `scripts/src/backfill-kpi-unit-id.ts`

- [ ] **Step 1: Escrever o script**

Casa o texto `unit` com `units.name` por organização (trim + case-insensitive). Pula corporativos (`rollupStrategy != null`). Loga os não-casados.

```ts
import { db, kpiIndicatorsTable, unitsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

async function main() {
  const units = await db
    .select({ id: unitsTable.id, organizationId: unitsTable.organizationId, name: unitsTable.name })
    .from(unitsTable);

  // index: orgId -> normalizedName -> unitId
  const byOrg = new Map<number, Map<string, number>>();
  for (const u of units) {
    const key = (u.name ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!byOrg.has(u.organizationId)) byOrg.set(u.organizationId, new Map());
    byOrg.get(u.organizationId)!.set(key, u.id);
  }

  const indicators = await db
    .select({
      id: kpiIndicatorsTable.id,
      organizationId: kpiIndicatorsTable.organizationId,
      unit: kpiIndicatorsTable.unit,
      rollupStrategy: kpiIndicatorsTable.rollupStrategy,
    })
    .from(kpiIndicatorsTable)
    .where(isNull(kpiIndicatorsTable.unitId));

  let matched = 0;
  const unmatched: { id: number; organizationId: number; unit: string | null }[] = [];

  for (const ind of indicators) {
    if (ind.rollupStrategy) continue; // corporativo: fica null por design
    const name = (ind.unit ?? "").trim().toLowerCase();
    const unitId = name ? byOrg.get(ind.organizationId)?.get(name) : undefined;
    if (unitId) {
      await db.update(kpiIndicatorsTable).set({ unitId }).where(eq(kpiIndicatorsTable.id, ind.id));
      matched++;
    } else {
      unmatched.push({ id: ind.id, organizationId: ind.organizationId, unit: ind.unit });
    }
  }

  console.log(`Backfill concluído: ${matched} casados.`);
  console.log(`Não-casados (revisar manualmente): ${unmatched.length}`);
  for (const u of unmatched) {
    console.log(`  - indicador #${u.id} (org ${u.organizationId}) unit="${u.unit ?? ""}"`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Conferir como os scripts são executados**

Run: `cat scripts/package.json`
Expected: ver o runner (tsx/esbuild) e os scripts existentes (ex.: `seed`). Replicar o mesmo padrão de invocação para o novo arquivo (ex.: adicionar um script `"backfill:kpi-unit": "tsx src/backfill-kpi-unit-id.ts"` se os outros usam `tsx`).

- [ ] **Step 3: Adicionar o script no package.json de scripts**

Seguindo o padrão visto no Step 2, adicionar a entrada em `scripts/package.json` (campo `"scripts"`), espelhando o runner dos demais.

- [ ] **Step 4: Dry-run local (banco de dev com dados de teste)**

Run: `pnpm --filter @workspace/scripts backfill:kpi-unit` (ou o nome usado)
Expected: imprime contagem de casados/não-casados sem erro. (Rodar em PROD/org 2 só no go-live, em sessão/porta separada — spec §3.3.)

- [ ] **Step 5: Commit**

```bash
git add scripts/src/backfill-kpi-unit-id.ts scripts/package.json
git commit -m "chore(scripts): backfill de kpi_indicators.unitId por nome de filial"
```

---

## Phase 1 — Núcleo de acesso (puro, TDD)

### Task 3: Função pura `canActOnKpiIndicator` (backend)

**Files:**
- Create: `artifacts/api-server/src/services/kpi/access.ts`
- Test: `artifacts/api-server/tests/services/kpi/access.unit.test.ts`

- [ ] **Step 1: Escrever os testes (tabela-verdade)**

```ts
import { describe, it, expect } from "vitest";
import { canActOnKpiIndicator, type KpiRequesterScope, type KpiIndicatorAccessFields } from "../../../src/services/kpi/access";

const admin: KpiRequesterScope = { role: "org_admin", userId: 1, unitId: null };
const platform: KpiRequesterScope = { role: "platform_admin", userId: 9, unitId: null };
const mgrU: KpiRequesterScope = { role: "manager", userId: 2, unitId: 10 };
const op: KpiRequesterScope = { role: "operator", userId: 3, unitId: null };
const an: KpiRequesterScope = { role: "analyst", userId: 4, unitId: null };

const indU10Resp3: KpiIndicatorAccessFields = { unitId: 10, responsibleUserId: 3, isCorporate: false };
const indU20Resp5: KpiIndicatorAccessFields = { unitId: 20, responsibleUserId: 5, isCorporate: false };
const corp: KpiIndicatorAccessFields = { unitId: null, responsibleUserId: 5, isCorporate: true };

describe("canActOnKpiIndicator — view", () => {
  it("admin e platform veem tudo", () => {
    for (const i of [indU10Resp3, indU20Resp5, corp]) {
      expect(canActOnKpiIndicator(admin, i, "view")).toBe(true);
      expect(canActOnKpiIndicator(platform, i, "view")).toBe(true);
    }
  });
  it("manager vê a própria filial e corporativos, não outras filiais", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "view")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "view")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "view")).toBe(false);
  });
  it("operator/analyst veem só onde são responsáveis", () => {
    expect(canActOnKpiIndicator(op, indU10Resp3, "view")).toBe(true);
    expect(canActOnKpiIndicator(op, indU20Resp5, "view")).toBe(false);
    expect(canActOnKpiIndicator(an, indU10Resp3, "view")).toBe(false); // resp=3, an=4
  });
});

describe("canActOnKpiIndicator — operate", () => {
  it("operator opera só os seus", () => {
    expect(canActOnKpiIndicator(op, indU10Resp3, "operate")).toBe(true);
    expect(canActOnKpiIndicator(op, indU20Resp5, "operate")).toBe(false);
  });
  it("analyst nunca opera", () => {
    expect(canActOnKpiIndicator(an, { unitId: null, responsibleUserId: 4, isCorporate: false }, "operate")).toBe(false);
  });
  it("manager opera filial + corp", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "operate")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "operate")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "operate")).toBe(false);
  });
});

describe("canActOnKpiIndicator — editDefinition / delete / create", () => {
  it("operator/analyst não editam definição nem criam nem deletam", () => {
    for (const a of ["editDefinition", "delete", "createUnit", "createCorporate"] as const) {
      expect(canActOnKpiIndicator(op, indU10Resp3, a)).toBe(false);
      expect(canActOnKpiIndicator(an, indU10Resp3, a)).toBe(false);
    }
  });
  it("manager edita definição da filial e de corp, mas só deleta filial própria (não corp)", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "editDefinition")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "editDefinition")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "delete")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "delete")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "delete")).toBe(false);
  });
  it("manager cria na própria filial e cria corporativo", () => {
    expect(canActOnKpiIndicator(mgrU, { unitId: 10, responsibleUserId: null, isCorporate: false }, "createUnit")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, { unitId: 20, responsibleUserId: null, isCorporate: false }, "createUnit")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, { unitId: null, responsibleUserId: null, isCorporate: true }, "createCorporate")).toBe(true);
  });
  it("admin pode tudo", () => {
    for (const a of ["view", "operate", "editDefinition", "delete", "createUnit", "createCorporate"] as const) {
      expect(canActOnKpiIndicator(admin, corp, a)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/kpi/access.unit.test.ts`
Expected: FAIL — `canActOnKpiIndicator` não existe.

- [ ] **Step 3: Implementar a função pura**

```ts
import type { UserRole } from "../../middlewares/auth";

export interface KpiRequesterScope {
  role: UserRole;
  userId: number;
  /** Filial do gerente; null para os demais perfis. */
  unitId: number | null;
}

export interface KpiIndicatorAccessFields {
  /** Filial do indicador; null = corporativo ou legado não-casado. */
  unitId: number | null;
  responsibleUserId: number | null;
  /** rollupStrategy != null. */
  isCorporate: boolean;
}

export type KpiAction =
  | "view"
  | "createUnit"
  | "createCorporate"
  | "editDefinition"
  | "operate"
  | "delete";

function isAdmin(role: UserRole): boolean {
  return role === "org_admin" || role === "platform_admin";
}

/**
 * Matriz única de permissão do módulo de Indicadores. Espelhada em
 * `artifacts/web/src/lib/kpi-access.ts` — manter as duas em sync.
 */
export function canActOnKpiIndicator(
  scope: KpiRequesterScope,
  ind: KpiIndicatorAccessFields,
  action: KpiAction,
): boolean {
  if (isAdmin(scope.role)) return true;

  const isOwner = ind.responsibleUserId !== null && ind.responsibleUserId === scope.userId;
  const inMyUnit = scope.unitId !== null && ind.unitId === scope.unitId;

  if (scope.role === "manager") {
    switch (action) {
      case "view":
      case "editDefinition":
      case "operate":
        return inMyUnit || ind.isCorporate;
      case "delete":
        return inMyUnit && !ind.isCorporate;
      case "createUnit":
        return inMyUnit; // ind.unitId = filial alvo
      case "createCorporate":
        return true;
    }
  }

  if (scope.role === "operator") {
    switch (action) {
      case "view":
      case "operate":
        return isOwner;
      default:
        return false;
    }
  }

  if (scope.role === "analyst") {
    return action === "view" && isOwner;
  }

  return false;
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/kpi/access.unit.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/kpi/access.ts artifacts/api-server/tests/services/kpi/access.unit.test.ts
git commit -m "feat(kpi): função pura canActOnKpiIndicator (matriz de permissão)"
```

---

### Task 4: Role `manager` no middleware + helper de scope

**Files:**
- Modify: `artifacts/api-server/src/middlewares/auth.ts:18`

- [ ] **Step 1: Adicionar `manager` ao tipo `UserRole`**

Em `artifacts/api-server/src/middlewares/auth.ts`, linha 18:

```ts
export type UserRole = "platform_admin" | "org_admin" | "operator" | "analyst" | "manager";
```

Nada mais muda aqui: `requireWriteAccess()` só bloqueia `analyst` (manager passa), `requireModuleAccess` trata não-admin como module-gated (manager precisa do módulo `kpi`), e `requireRole("org_admin")` continua barrando manager nas rotas de admin.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/middlewares/auth.ts
git commit -m "feat(auth): adiciona role manager ao UserRole"
```

---

## Phase 2 — Enforcement nas rotas KPI

> Todas as edições nesta fase são em `artifacts/api-server/src/routes/kpi/index.ts`.

### Task 5: Imports + helper `getRequesterKpiScope` + `unitId` no serialize

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts:1-78`

- [ ] **Step 1: Ampliar imports do drizzle e do middleware/access**

No topo do arquivo, adicionar `or` (e o tipo `SQL`) ao import de `drizzle-orm` (linha 2) e importar a função de acesso + tipos. Linha 2 atual: `import { and, asc, desc, eq, ilike, inArray, lt, sql } from "drizzle-orm";`. Linha 40 atual: `import { requireAuth, requireWriteAccess } from "../../middlewares/auth";`.

Trocar/expandir para:

```ts
import { and, asc, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
// ...
import { requireAuth, requireWriteAccess } from "../../middlewares/auth";
import {
  canActOnKpiIndicator,
  type KpiAction,
  type KpiIndicatorAccessFields,
  type KpiRequesterScope,
} from "../../services/kpi/access";
```

> `SQL` é usado por `kpiVisibilityCondition` (Task 6) — já incluído aqui para não reabrir o import depois. `KpiAction`/`KpiIndicatorAccessFields` são usados nos helpers das Tasks 6/11.

- [ ] **Step 2: Adicionar `unitId` ao `serializeIndicator`**

Em `serializeIndicator` (linha ~65), após `unit:`:

```ts
    unit: r.unit ?? null,
    unitId: r.unitId ?? null,
    responsible: r.responsible ?? null,
```

- [ ] **Step 3: Adicionar o helper de scope e um wrapper de checagem (após `serializeIndicator`/helpers, ~linha 103)**

```ts
/**
 * Resolve o escopo do solicitante para o módulo KPI. Faz lookup do unitId só
 * quando role=manager (fonte sempre fresca, sem depender do token).
 */
async function getRequesterKpiScope(req: { auth?: { userId: number; role: KpiRequesterScope["role"] } }): Promise<KpiRequesterScope> {
  const { userId, role } = req.auth!;
  let unitId: number | null = null;
  if (role === "manager") {
    const [u] = await db
      .select({ unitId: usersTable.unitId })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    unitId = u?.unitId ?? null;
  }
  return { role, userId, unitId };
}

/** Campos de acesso a partir de uma row de indicador. */
function accessFieldsOf(r: { unitId: number | null; responsibleUserId: number | null; rollupStrategy: string | null }): KpiIndicatorAccessFields {
  return {
    unitId: r.unitId ?? null,
    responsibleUserId: r.responsibleUserId ?? null,
    isCorporate: r.rollupStrategy != null,
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS (o `unitId` no serialize pode acusar erro até o codegen da Task 13 — se o tipo de retorno for inferido, OK; se houver tipo explícito de resposta, segue na Task 13). Se falhar só por isso, prosseguir — fica verde após Task 13.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): scope helper + unitId no serialize de indicador"
```

---

### Task 6: Filtro de visibilidade no `GET /kpi/indicators`

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts:314-338`

- [ ] **Step 1: Aplicar o scope às condições da query**

Substituir o corpo do handler GET indicators (linhas 314–338) por:

```ts
router.get("/organizations/:orgId/kpi/indicators", requireAuth, async (req, res): Promise<void> => {
  const params = ListKpiIndicatorsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const query = ListKpiIndicatorsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const scope = await getRequesterKpiScope(req);

  const conditions = [eq(kpiIndicatorsTable.organizationId, params.data.orgId)];
  if (query.data.unit) {
    conditions.push(ilike(kpiIndicatorsTable.unit, `%${query.data.unit}%`));
  }
  const visibility = kpiVisibilityCondition(scope);
  if (visibility) conditions.push(visibility);

  const rows = await db
    .select({
      indicator: kpiIndicatorsTable,
      responsibleUserName: usersTable.name,
    })
    .from(kpiIndicatorsTable)
    .leftJoin(usersTable, eq(usersTable.id, kpiIndicatorsTable.responsibleUserId))
    .where(and(...conditions))
    .orderBy(kpiIndicatorsTable.name);

  res.json(rows.map((r) => serializeIndicator(r.indicator, r.responsibleUserName ?? null)));
});
```

- [ ] **Step 2: Adicionar o helper `kpiVisibilityCondition` (junto dos helpers, após `accessFieldsOf`)**

(O tipo `SQL` já foi importado na Task 5.)

```ts
/**
 * Condição SQL de visibilidade por role. undefined = sem restrição (admin).
 * - manager: própria filial OU corporativo (rollupStrategy not null)
 * - operator/analyst: só onde é responsável
 */
function kpiVisibilityCondition(scope: KpiRequesterScope): SQL | undefined {
  if (scope.role === "org_admin" || scope.role === "platform_admin") return undefined;
  if (scope.role === "manager") {
    return or(
      scope.unitId !== null ? eq(kpiIndicatorsTable.unitId, scope.unitId) : sql`false`,
      sql`${kpiIndicatorsTable.rollupStrategy} is not null`,
    );
  }
  // operator / analyst
  return eq(kpiIndicatorsTable.responsibleUserId, scope.userId);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): filtro de visibilidade por role no GET indicators"
```

---

### Task 7: Filtro de visibilidade no `GET /kpi/years/:year`

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts:589-597`

- [ ] **Step 1: Aplicar o scope às `indicatorConditions`**

No handler `GET /organizations/:orgId/kpi/years/:year`, logo após o parse de `query` e antes de montar `indicatorConditions`, resolver o scope e incluir a condição:

```ts
  const scope = await getRequesterKpiScope(req);

  // Fetch all indicators (optionally filtered by unit), restritos ao escopo do solicitante
  const indicatorConditions = [eq(kpiIndicatorsTable.organizationId, params.data.orgId)];
  if (query.data.unit) {
    indicatorConditions.push(ilike(kpiIndicatorsTable.unit, `%${query.data.unit}%`));
  }
  const visibility = kpiVisibilityCondition(scope);
  if (visibility) indicatorConditions.push(visibility);
```

(O resto do handler é inalterado — quando a lista filtrada inclui um corporativo, o rollup compose-on-read continua agregando os filhos via `computeRollupValue`, que é o comportamento desejado para o gerente.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): filtro de visibilidade por role no GET years"
```

---

### Task 8: Gate de escrita no `POST /kpi/indicators` (+ aceitar `unitId`)

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts:340-399`

- [ ] **Step 1: Resolver `unitId` alvo, checar permissão e gravar**

No handler POST indicators, após validar `formulaCheck` e resolver `responsibleUserId`/`responsibleText` (linha ~363), inserir a resolução de unidade + gate, e incluir `unitId` no insert:

```ts
  // Resolve a filial alvo: aceita unitId (preferido) e mantém o texto `unit`.
  let targetUnitId: number | null = typeof (req.body?.unitId) === "number" ? req.body.unitId : null;
  let unitText: string | null = normalizeKpiUnit(body.data.unit);
  if (targetUnitId !== null) {
    const [unitRow] = await db
      .select({ id: unitsTable.id, name: unitsTable.name })
      .from(unitsTable)
      .where(and(eq(unitsTable.id, targetUnitId), eq(unitsTable.organizationId, params.data.orgId)));
    if (!unitRow) { res.status(400).json({ error: "unitId não corresponde a uma filial desta organização" }); return; }
    unitText = unitRow.name;
  }

  const scope = await getRequesterKpiScope(req);
  const canCreate = canActOnKpiIndicator(
    scope,
    { unitId: targetUnitId, responsibleUserId, isCorporate: false },
    "createUnit",
  );
  if (!canCreate) { res.status(403).json({ error: "Sem permissão para criar indicador nesta filial" }); return; }
```

Depois, no `db.insert(kpiIndicatorsTable).values({...})` (linha ~365), trocar `unit: normalizeKpiUnit(body.data.unit)` por:

```ts
    unit: unitText,
    unitId: targetUnitId,
```

Adicionar `unitsTable` ao import de `@workspace/db` no topo (linha 3-15).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS (o `req.body.unitId` é lido cru; o contrato gerado ganha `unitId` na Task 13).

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): POST indicators aceita unitId e checa permissão de criação"
```

---

### Task 9: Gate no `PATCH /kpi/indicators/:id` (+ aceitar `unitId`)

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts:401-564`

- [ ] **Step 1: Carregar a row atual cedo e checar `editDefinition`**

O handler já busca `current` (linha ~458) só com `formulaExpression`/`formulaVariables`. Ampliar essa seleção e mover a checagem de permissão para antes do update. Trocar o bloco `const [current] = await db.select({...})` (linhas 458–468) por:

```ts
  const [current] = await db
    .select({
      formulaExpression: kpiIndicatorsTable.formulaExpression,
      formulaVariables: kpiIndicatorsTable.formulaVariables,
      unitId: kpiIndicatorsTable.unitId,
      responsibleUserId: kpiIndicatorsTable.responsibleUserId,
      rollupStrategy: kpiIndicatorsTable.rollupStrategy,
    })
    .from(kpiIndicatorsTable)
    .where(and(
      eq(kpiIndicatorsTable.id, params.data.indicatorId),
      eq(kpiIndicatorsTable.organizationId, params.data.orgId),
    ));
  if (!current) { res.status(404).json({ error: "Indicador não encontrado" }); return; }

  const scope = await getRequesterKpiScope(req);
  if (!canActOnKpiIndicator(scope, accessFieldsOf(current), "editDefinition")) {
    res.status(403).json({ error: "Sem permissão para editar este indicador" }); return;
  }
```

- [ ] **Step 2: Aceitar troca de `unitId` no update**

No bloco que monta `updateData` (após linha ~412, onde trata `unit`), adicionar tratamento de `unitId`. Logo após `if (body.data.unit !== undefined) updateData.unit = normalizeKpiUnit(body.data.unit);`:

```ts
  if (typeof req.body?.unitId === "number" || req.body?.unitId === null) {
    const newUnitId: number | null = req.body.unitId;
    if (newUnitId === null) {
      updateData.unitId = null;
    } else {
      const [unitRow] = await db
        .select({ id: unitsTable.id, name: unitsTable.name })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, newUnitId), eq(unitsTable.organizationId, params.data.orgId)));
      if (!unitRow) { res.status(400).json({ error: "unitId não corresponde a uma filial desta organização" }); return; }
      updateData.unitId = unitRow.id;
      updateData.unit = unitRow.name;
    }
  }
```

> Nota: para `manager`, trocar a filial de um indicador pra fora da sua é permitido só se ele ainda tiver permissão na nova (a checagem `editDefinition` foi na filial atual). Aceitável no v1; admin é quem reorganiza filiais.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): PATCH indicators checa permissão e aceita troca de unitId"
```

---

### Task 10: Gate no `DELETE /kpi/indicators/:id`

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts:566-577`

- [ ] **Step 1: Carregar a row e checar `delete` antes de apagar**

Substituir o corpo do handler DELETE (linhas 566–577) por:

```ts
router.delete("/organizations/:orgId/kpi/indicators/:indicatorId", requireAuth, requireWriteAccess(), async (req, res): Promise<void> => {
  const params = DeleteKpiIndicatorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const [existing] = await db
    .select({
      unitId: kpiIndicatorsTable.unitId,
      responsibleUserId: kpiIndicatorsTable.responsibleUserId,
      rollupStrategy: kpiIndicatorsTable.rollupStrategy,
    })
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)));
  if (!existing) { res.status(404).json({ error: "Indicador não encontrado" }); return; }

  const scope = await getRequesterKpiScope(req);
  if (!canActOnKpiIndicator(scope, accessFieldsOf(existing), "delete")) {
    res.status(403).json({ error: "Sem permissão para excluir este indicador" }); return;
  }

  const [row] = await db.delete(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Indicador não encontrado" }); return; }
  res.status(204).send();
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): DELETE indicators checa permissão (gerente não exclui corporativo)"
```

---

### Task 11: Gate em year-config (editDefinition), values e justificativas (operate)

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts` — handlers PUT year-config (929), PUT values (966), POST justifications (1129)

- [ ] **Step 1: Helper de checagem por id (junto dos helpers)**

```ts
/** Carrega os campos de acesso de um indicador da org e checa a ação. Retorna
 * 'ok' | 404 | 403 para o handler responder. */
async function authorizeIndicatorAction(
  req: { auth?: { userId: number; role: KpiRequesterScope["role"]; organizationId: number } },
  orgId: number,
  indicatorId: number,
  action: KpiAction,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [ind] = await db
    .select({
      unitId: kpiIndicatorsTable.unitId,
      responsibleUserId: kpiIndicatorsTable.responsibleUserId,
      rollupStrategy: kpiIndicatorsTable.rollupStrategy,
    })
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, indicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
  if (!ind) return { ok: false, status: 404, error: "Indicador não encontrado" };
  const scope = await getRequesterKpiScope(req);
  if (!canActOnKpiIndicator(scope, accessFieldsOf(ind), action)) {
    return { ok: false, status: 403, error: "Sem permissão para esta operação no indicador" };
  }
  return { ok: true };
}
```

- [ ] **Step 2: PUT year-config — checar `editDefinition`**

No handler `PUT .../years/:year` (linha 929), o código já busca o indicador (linha ~938) para validar org. Substituir esse bloco de verificação por uma chamada ao helper, logo após o parse do body:

```ts
  const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "editDefinition");
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
```

E remover o `const [indicator] = await db.select(...)` + `if (!indicator) 404` redundante (o helper já cobre o 404).

- [ ] **Step 3: PUT values — checar `operate`**

No handler `PUT .../years/:year/values` (linha 966), após o parse do body e ANTES de `ensureYearConfig`:

```ts
  const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "operate");
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
```

- [ ] **Step 4: POST justifications — checar `operate`**

No handler `POST .../months/:month/justifications` (linha 1129), após o parse do body e ANTES de `ensureMonthlyValueRow`:

```ts
  const auth = await authorizeIndicatorAction(req, params.data.orgId, params.data.indicatorId, "operate");
  if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): gate de operate/editDefinition em year-config, values e justificativas"
```

---

### Task 12: Gate no `POST /kpi/corporate-indicators` (createCorporate)

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts:1171-1305`

- [ ] **Step 1: Checar `createCorporate` após validar a org**

No handler de corporate-indicators, logo após `if (orgId !== req.auth!.organizationId) {...}` (linha ~1178):

```ts
    const scope = await getRequesterKpiScope(req);
    if (!canActOnKpiIndicator(scope, { unitId: null, responsibleUserId: null, isCorporate: true }, "createCorporate")) {
      res.status(403).json({ error: "Sem permissão para criar indicador corporativo" }); return;
    }
```

(operator/analyst → 403; admin/manager → segue.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): gate de criação de corporativo (admin/gerente)"
```

---

## Phase 3 — Org-users (role manager + unitId)

### Task 13: Backend org-users aceita `manager` + `unitId`

**Files:**
- Modify: `artifacts/api-server/src/routes/org-users.ts`

- [ ] **Step 1: Importar `unitsTable` e ampliar o schema de criação**

No import do topo (linha 5):

```ts
import { db, usersTable, userModulePermissionsTable, unitsTable } from "@workspace/db";
```

Trocar `createOrgUserBodySchema` (linhas 11–17) por:

```ts
const createOrgUserBodySchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(["org_admin", "manager", "operator", "analyst"]),
    modules: z.array(z.enum(APP_MODULES)).default([]),
    unitId: z.number().int().nullable().optional(),
  })
  .refine((d) => d.role !== "manager" || (d.unitId !== null && d.unitId !== undefined), {
    message: "Gerente requer uma filial (unitId)",
    path: ["unitId"],
  });
```

- [ ] **Step 2: Persistir `unitId` no create (validando a filial)**

No handler POST (linha ~81), trocar a desestruturação e o insert. Após `const { name, email, password, role, modules } = parsed.data;`:

```ts
    const { name, email, password, role, modules } = parsed.data;
    const unitId = role === "manager" ? parsed.data.unitId ?? null : null;

    if (unitId !== null) {
      const [unitRow] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));
      if (!unitRow) { res.status(400).json({ error: "Filial (unitId) inválida para esta organização" }); return; }
    }
```

No `tx.insert(usersTable).values({...})` (linha ~94), adicionar `unitId`:

```ts
        const [user] = await tx.insert(usersTable).values({
          name: name.toUpperCase(),
          email,
          passwordHash,
          organizationId: orgId,
          role,
          unitId,
        }).returning();
```

- [ ] **Step 3: Permitir `manager` + `unitId` no PATCH role**

No handler `PATCH .../users/:userId/role` (linha 128), trocar a validação de roles e aceitar `unitId`:

```ts
    const { role, unitId } = req.body as { role: string; unitId?: number | null };
    const validRoles: UserRole[] = ["operator", "analyst", "manager"];
    if (!validRoles.includes(role as UserRole)) {
      res.status(400).json({ error: "Cargo inválido. Valores permitidos: operator, analyst, manager" });
      return;
    }
    if (role === "manager" && (unitId === null || unitId === undefined)) {
      res.status(400).json({ error: "Gerente requer uma filial (unitId)" });
      return;
    }
```

E o `db.update(usersTable).set({ role })` (linha ~167) passa a validar e setar o `unitId` (limpando quando não-gerente). Inserir, logo antes do `await db.update(...)`:

```ts
    const nextUnitId = role === "manager" ? unitId ?? null : null;
    if (nextUnitId !== null) {
      const [unitRow] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, nextUnitId), eq(unitsTable.organizationId, orgId)));
      if (!unitRow) {
        res.status(400).json({ error: "Filial (unitId) inválida para esta organização" });
        return;
      }
    }
    await db.update(usersTable).set({ role, unitId: nextUnitId }).where(eq(usersTable.id, userId));
```

(substitui o `await db.update(usersTable).set({ role }).where(...)` original.)

- [ ] **Step 4: Incluir `unitId` no `serializeOrgUser`**

Para a UI conseguir exibir/editar a filial, adicionar `unitId` ao retorno. Trocar `serializeOrgUser` (linhas 19–34) para receber e emitir `unitId`, e o GET de usuários (linha 43) a selecionar `unitId`:

```ts
function serializeOrgUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  unitId: number | null;
  createdAt: Date;
}, modules: string[]) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    unitId: user.unitId ?? null,
    createdAt: user.createdAt.toISOString(),
    modules,
  };
}
```

No GET (linha 43), adicionar `unitId: usersTable.unitId,` ao `.select({...})`. No POST, o `createdUser` retornado pelo insert já terá `unitId` (é `returning()`), então `serializeOrgUser(createdUser, normalizedModules)` funciona.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/org-users.ts
git commit -m "feat(org-users): cadastro/edição de Gerente com filial (unitId)"
```

---

### Task 14: `/auth/me` expõe `unitId`

**Files:**
- Modify: `artifacts/api-server/src/routes/auth.ts:28-63`

- [ ] **Step 1: Incluir `unitId` em `serializeAuthUser`**

Em `serializeAuthUser` (linhas 28–44), adicionar `unitId` ao parâmetro e ao retorno:

```ts
function serializeAuthUser(user: {
  id: number;
  name: string;
  email: string;
  organizationId: number;
  role: string;
  unitId: number | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    unitId: user.unitId ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
```

Ajustar a assinatura de `serializeMeResponse` (linhas 46–63) para incluir `unitId` no tipo do `user` (mesmo shape). O handler `/auth/me` faz `db.select().from(usersTable)` (select *), então `user.unitId` já existe na row — nenhuma query muda.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/auth.ts
git commit -m "feat(auth): /auth/me retorna unitId do usuário"
```

---

## Phase 4 — OpenAPI + codegen

### Task 15: Atualizar o contrato OpenAPI e regenerar

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- (gerados) `lib/api-zod/**`, `lib/api-client-react/**`

- [ ] **Step 1: `User` ganha `unitId` (linhas 9492–9515)**

Adicionar nas `properties` de `User`:

```yaml
    unitId:
      type: integer
      nullable: true
```

(não acrescentar em `required`.)

- [ ] **Step 2: `KpiIndicator` ganha `unitId` (linhas 15450–15519)**

Adicionar após `unit:`:

```yaml
    unitId:
      type: integer
      nullable: true
      description: Filial do indicador. null = corporativo ou legado não-classificado.
```

- [ ] **Step 3: `CreateKpiIndicatorBody` e `UpdateKpiIndicatorBody` ganham `unitId` (linhas 15520+/15579+)**

Em ambos, adicionar:

```yaml
    unitId:
      type: integer
      nullable: true
```

- [ ] **Step 4: `CreateOrgUserBody` — role `manager` + `unitId` (linhas 11668–11692)**

```yaml
    role:
      type: string
      enum: [org_admin, manager, operator, analyst]
    modules:
      type: array
      items:
        $ref: "#/components/schemas/AppModule"
    unitId:
      type: integer
      nullable: true
```

- [ ] **Step 5: PATCH role — enum `manager` + `unitId` (linhas 3176–3204)**

```yaml
          schema:
            type: object
            properties:
              role:
                type: string
                enum: [operator, analyst, manager]
              unitId:
                type: integer
                nullable: true
            required:
              - role
```

- [ ] **Step 6: Regenerar o client**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: regenera `lib/api-zod` e `lib/api-client-react` sem erro (precisa de `python3`). Os tipos `User`, `KpiIndicator`, `CreateKpiIndicatorBody`, `UpdateKpiIndicatorBody`, `CreateOrgUserBody` passam a ter `unitId`/`manager`.

- [ ] **Step 7: Typecheck geral**

Run: `pnpm typecheck`
Expected: PASS. Em particular, o `unitId` no `serializeIndicator` (Task 5) e nos bodies do backend agora batem com o contrato.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api): contrato com unitId (User/KpiIndicator/bodies) e role manager"
```

---

## Phase 5 — Frontend

### Task 16: AuthContext expõe `unitId` + `userId`; `UserRole` += manager

**Files:**
- Modify: `artifacts/web/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Ampliar `UserRole` e `AuthContextType`**

Linha 5:

```ts
type UserRole = "platform_admin" | "org_admin" | "operator" | "analyst" | "manager";
```

Na interface `AuthContextType` (linhas 22–32), adicionar:

```ts
  userId: number | null;
  unitId: number | null;
```

- [ ] **Step 2: Calcular e prover os valores**

Após `const modules = data?.modules || [];` (linha 75):

```ts
  const userId = data?.user?.id ?? null;
  const unitId = (data?.user as { unitId?: number | null } | undefined)?.unitId ?? null;
```

No `value={{ ... }}` do provider (linhas 79–89), adicionar `userId,` e `unitId,`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS (após codegen da Task 15, `data.user.unitId` existe; o cast é defensivo).

- [ ] **Step 4: Commit**

```bash
git add artifacts/web/src/contexts/AuthContext.tsx
git commit -m "feat(web): AuthContext expõe userId, unitId e role manager"
```

---

### Task 17: Espelho frontend `kpi-access.ts` (TDD)

**Files:**
- Create: `artifacts/web/src/lib/kpi-access.ts`
- Test: `artifacts/web/tests/lib/kpi-access.unit.test.ts`

- [ ] **Step 1: Escrever os testes (mesma tabela-verdade do backend)**

```ts
import { describe, it, expect } from "vitest";
import { canActOnKpiIndicator, type KpiRequesterScope, type KpiIndicatorAccessFields } from "@/lib/kpi-access";

const admin: KpiRequesterScope = { role: "org_admin", userId: 1, unitId: null };
const mgrU: KpiRequesterScope = { role: "manager", userId: 2, unitId: 10 };
const op: KpiRequesterScope = { role: "operator", userId: 3, unitId: null };
const an: KpiRequesterScope = { role: "analyst", userId: 4, unitId: null };

const indU10Resp3: KpiIndicatorAccessFields = { unitId: 10, responsibleUserId: 3, isCorporate: false };
const indU20Resp5: KpiIndicatorAccessFields = { unitId: 20, responsibleUserId: 5, isCorporate: false };
const corp: KpiIndicatorAccessFields = { unitId: null, responsibleUserId: 5, isCorporate: true };

describe("kpi-access (web mirror)", () => {
  it("admin tudo", () => {
    expect(canActOnKpiIndicator(admin, corp, "delete")).toBe(true);
  });
  it("manager: filial + corp; deleta filial mas não corp", () => {
    expect(canActOnKpiIndicator(mgrU, indU10Resp3, "editDefinition")).toBe(true);
    expect(canActOnKpiIndicator(mgrU, corp, "delete")).toBe(false);
    expect(canActOnKpiIndicator(mgrU, indU20Resp5, "view")).toBe(false);
  });
  it("operator opera só os seus, não edita definição", () => {
    expect(canActOnKpiIndicator(op, indU10Resp3, "operate")).toBe(true);
    expect(canActOnKpiIndicator(op, indU10Resp3, "editDefinition")).toBe(false);
    expect(canActOnKpiIndicator(op, indU20Resp5, "view")).toBe(false);
  });
  it("analyst só vê os seus", () => {
    expect(canActOnKpiIndicator(an, { unitId: null, responsibleUserId: 4, isCorporate: false }, "view")).toBe(true);
    expect(canActOnKpiIndicator(an, indU10Resp3, "operate")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/kpi-access.unit.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar (cópia idêntica da lógica do backend)**

```ts
export type KpiUserRole = "platform_admin" | "org_admin" | "operator" | "analyst" | "manager";

export interface KpiRequesterScope {
  role: KpiUserRole;
  userId: number;
  unitId: number | null;
}

export interface KpiIndicatorAccessFields {
  unitId: number | null;
  responsibleUserId: number | null;
  isCorporate: boolean;
}

export type KpiAction =
  | "view"
  | "createUnit"
  | "createCorporate"
  | "editDefinition"
  | "operate"
  | "delete";

function isAdmin(role: KpiUserRole): boolean {
  return role === "org_admin" || role === "platform_admin";
}

/** Espelho de artifacts/api-server/src/services/kpi/access.ts — manter em sync. */
export function canActOnKpiIndicator(
  scope: KpiRequesterScope,
  ind: KpiIndicatorAccessFields,
  action: KpiAction,
): boolean {
  if (isAdmin(scope.role)) return true;
  const isOwner = ind.responsibleUserId !== null && ind.responsibleUserId === scope.userId;
  const inMyUnit = scope.unitId !== null && ind.unitId === scope.unitId;

  if (scope.role === "manager") {
    switch (action) {
      case "view":
      case "editDefinition":
      case "operate":
        return inMyUnit || ind.isCorporate;
      case "delete":
        return inMyUnit && !ind.isCorporate;
      case "createUnit":
        return inMyUnit;
      case "createCorporate":
        return true;
    }
  }
  if (scope.role === "operator") {
    return (action === "view" || action === "operate") && isOwner;
  }
  if (scope.role === "analyst") {
    return action === "view" && isOwner;
  }
  return false;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/kpi-access.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/lib/kpi-access.ts artifacts/web/tests/lib/kpi-access.unit.test.ts
git commit -m "feat(web): espelho kpi-access (matriz de permissão no frontend)"
```

---

### Task 18: `indicadores.tsx` — esconder botões + enviar `unitId`

**Files:**
- Modify: `artifacts/web/src/pages/app/kpi/indicadores.tsx`

> Antes de editar, ler o arquivo atual (é grande, ~1150 linhas) para confirmar os anchors abaixo.

- [ ] **Step 1: Importar acesso + constante corporativa + scope do auth**

No topo (junto dos imports), adicionar:

```ts
import { canActOnKpiIndicator, type KpiRequesterScope } from "@/lib/kpi-access";
import { CORPORATE_UNIT_LABEL } from "@/lib/kpi-constants";
```

Na função do componente, onde hoje faz `const { organization } = useAuth();` (linha ~253), passar a pegar role/userId/unitId:

```ts
  const { organization, role, userId, unitId } = useAuth();
  const orgId = organization!.id;
  const scope: KpiRequesterScope = { role: (role ?? "analyst") as KpiRequesterScope["role"], userId: userId ?? -1, unitId };
```

- [ ] **Step 2: Helper de campos de acesso a partir de um indicador da lista**

Logo após o `scope`, adicionar:

```ts
  const accessOf = (ind: KpiIndicator) => ({
    unitId: (ind as { unitId?: number | null }).unitId ?? null,
    responsibleUserId: ind.responsibleUserId ?? null,
    isCorporate: (ind.unit ?? "").trim().toLowerCase() === CORPORATE_UNIT_LABEL.toLowerCase(),
  });
  const canCreate = scope.role === "org_admin" || scope.role === "platform_admin" || scope.role === "manager";
```

- [ ] **Step 3: Esconder os botões do header para quem não cria**

No `useHeaderActions(...)` (linhas 365–389), envolver os `HeaderActionButton` de criação com `canCreate`. O botão "Objetivos" pode seguir visível para admins; para simplicidade, condicionar todo o bloco de criação:

```tsx
useHeaderActions(
  <div className="flex gap-2">
    {(scope.role === "org_admin" || scope.role === "platform_admin") && (
      <Button variant="outline" size="sm" onClick={() => setObjectivesDialog(true)}>
        <Target className="h-4 w-4 mr-1.5" />
        Objetivos
      </Button>
    )}
    {canCreate && (viewMode === "corporates" ? (
      <HeaderActionButton
        label="Novo corporativo"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => setCorporateCreateOpen(true)}
      />
    ) : (
      <HeaderActionButton
        label="Novo Indicador"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => {
          setEditingIndicator(null);
          setIndicatorForm(defaultIndicatorForm());
          setIndicatorDialog(true);
        }}
      />
    ))}
  </div>,
);
```

> Verificar as dependências do `useHeaderActions` (provavelmente recebe um array de deps); incluir `scope.role`, `viewMode`, `canCreate` para reavaliar.

- [ ] **Step 4: Esconder Editar/Remover por indicador**

No bloco do `DropdownMenuContent` (linhas 1028–1041), condicionar cada item e esconder o menu inteiro se nenhuma ação for permitida:

```tsx
<DropdownMenuContent align="end">
  {canActOnKpiIndicator(scope, accessOf(ind), "editDefinition") && (
    <DropdownMenuItem onClick={() => handleEditIndicator(ind)}>
      <Pencil className="mr-2 h-3.5 w-3.5" />
      Editar
    </DropdownMenuItem>
  )}
  {canActOnKpiIndicator(scope, accessOf(ind), "delete") && (
    <DropdownMenuItem
      onClick={() => setDeleteConfirm(ind)}
      className="text-destructive focus:text-destructive"
    >
      <Trash2 className="mr-2 h-3.5 w-3.5" />
      Remover
    </DropdownMenuItem>
  )}
</DropdownMenuContent>
```

E, para não mostrar um botão de menu vazio, envolver todo o `<DropdownMenu>...</DropdownMenu>` (linhas 1018–1042) com:

```tsx
{(canActOnKpiIndicator(scope, accessOf(ind), "editDefinition") || canActOnKpiIndicator(scope, accessOf(ind), "delete")) && (
  /* <DropdownMenu> ... </DropdownMenu> */
)}
```

- [ ] **Step 5: Enviar `unitId` no create/update do indicador**

O form usa `unit` (nome). Adicionar `unitId` ao `IndicatorFormData` e ao envio. No tipo (linhas 145–159) e no `defaultIndicatorForm` (linhas 161–176), adicionar `unitId: number | null` (default `null`).

No campo "Unidade / filial" (linhas 1112–1120), mapear a seleção do nome para o id. Como `orgUnitOptions` hoje é `string[]` de nomes, alterar o `onChange` para resolver o id via `orgUnits`:

```tsx
<SearchableStringSelect
  value={indicatorForm.unit}
  onChange={(v) => {
    const u = orgUnits.find((x) => x.name === v);
    setIndicatorForm((f) => ({ ...f, unit: v, unitId: u?.id ?? null }));
  }}
  options={orgUnitOptions}
  placeholder="Selecione uma unidade"
  searchPlaceholder="Buscar unidade..."
  emptyMessage="Nenhuma unidade encontrada"
/>
```

No payload de create (linhas 549–563) e de update (linhas 517–531), adicionar:

```ts
  unitId: indicatorForm.unitId ?? undefined, // create
  // e no update:
  unitId: indicatorForm.unitId,              // update (permite null para limpar)
```

Em `handleEditIndicator` (que popula o form a partir do indicador), setar `unitId: (ind as {unitId?: number|null}).unitId ?? null`. Localizar essa função e incluir o campo.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/web/src/pages/app/kpi/indicadores.tsx
git commit -m "feat(web): esconde ações de indicador por permissão e envia unitId"
```

---

### Task 19: Cadastro de usuário — opção "Gerente" + dropdown de filial

**Files:**
- Modify: `artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx`

- [ ] **Step 1: Rótulo + tipo do form aceitam manager + unitId**

Em `ROLE_LABELS` (linha ~74), adicionar `manager: "Gerente",`.

Em `CreateUserFormData` (linhas 53–60):

```ts
type CreateUserFormData = {
  name: string;
  email: string;
  password: string;
  role: "org_admin" | "manager" | "operator" | "analyst";
  modules: OrgUserModule[];
  unitId: number | null;
};
```

Em `emptyCreateUserForm` (linhas ~62), adicionar `unitId: null,`.

- [ ] **Step 2: Buscar as filiais para o dropdown**

Importar e usar `useListUnits` (já usado em indicadores.tsx). Próximo aos outros hooks do componente:

```ts
import { useListUnits } from "@workspace/api-client-react";
// dentro do componente:
const { data: orgUnits = [] } = useListUnits(orgId);
```

- [ ] **Step 3: Opção "Gerente" no select + dropdown condicional de filial**

No `<Select {...createUserForm.register("role")}>` (linhas 1084–1088), adicionar a opção:

```tsx
<Select {...createUserForm.register("role")}>
  <option value="org_admin">Administrador</option>
  <option value="manager">Gerente</option>
  <option value="operator">Operador</option>
  <option value="analyst">Analista</option>
</Select>
```

Logo após o bloco do select de cargo (depois do `<p>` de ajuda, ~linha 1096), adicionar o dropdown de filial visível só para Gerente:

```tsx
{createUserRole === "manager" && (
  <div className="mt-3">
    <Label>Filial do gerente</Label>
    <Select
      value={createUserForm.watch("unitId") ?? ""}
      onChange={(e) =>
        createUserForm.setValue("unitId", e.target.value ? Number(e.target.value) : null, { shouldValidate: true })
      }
    >
      <option value="">Selecione uma filial</option>
      {orgUnits.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </Select>
    <p className="mt-1 text-[11px] text-muted-foreground">
      O gerente verá e gerenciará os indicadores desta filial (e os corporativos).
    </p>
  </div>
)}
```

> `createUserRole` já é derivado de `createUserForm.watch("role")` no componente (usado nos textos de ajuda). Reutilizar.

- [ ] **Step 4: Validar filial no submit + enviar unitId**

No `onSubmit` (linhas 975–1011), antes do `mutateAsync`, validar e incluir `unitId`:

```ts
    if (data.role === "manager" && !data.unitId) {
      createUserForm.setError("unitId", { type: "manual", message: "Selecione a filial do gerente" });
      return;
    }
    // ...
    await createOrgUserMut.mutateAsync({
      orgId,
      data: {
        name: data.name.trim(),
        email: data.email.trim(),
        password: data.password,
        role: data.role,
        modules: data.role === "org_admin" ? [] : data.modules,
        unitId: data.role === "manager" ? data.unitId : null,
      },
    });
```

> Gerente continua selecionando módulos como operador (o bloco de checkboxes só some para `org_admin`). Garantir que o gerente marque `kpi`. Opcional: pré-marcar `kpi` quando role vira manager.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS (o `CreateOrgUserBody` gerado já tem `unitId` e `role` com `manager`).

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/components/settings/OrganizationUsersSettingsSection.tsx
git commit -m "feat(web): cadastro de Gerente com seleção de filial"
```

---

## Phase 6 — Integração & verificação

### Task 20: Testes de integração (visibilidade + 403)

**Files:**
- Create: `artifacts/api-server/tests/routes/kpi-access.integration.test.ts`

> Padrão confirmado: `supertest` + `import app from "../../src/app"`; helpers em `tests/support/backend.ts` (`createTestContext`, `createTestUser`, `createUnit`, `authHeader`, `cleanupTestContext`). Rotas sob `/api/...`. `createTestUser` NÃO aceita `unitId` — como o scope é resolvido por lookup no banco (não no token), basta `db.update(usersTable).set({ unitId })` depois. Não há factory de KPI — inserir indicadores direto via `db`.

- [ ] **Step 1: Escrever os testes de integração (concretos)**

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, kpiIndicatorsTable, usersTable } from "@workspace/db";
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
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function insertIndicator(
  orgId: number,
  opts: { name: string; unitId?: number | null; responsibleUserId?: number | null; rollupStrategy?: string | null; unit?: string | null },
) {
  const [row] = await db
    .insert(kpiIndicatorsTable)
    .values({
      organizationId: orgId,
      name: opts.name,
      measurement: "med",
      formulaExpression: "",
      formulaVariables: [],
      unit: opts.unit ?? null,
      unitId: opts.unitId ?? null,
      responsibleUserId: opts.responsibleUserId ?? null,
      direction: "up",
      periodicity: "monthly",
      norms: [],
      rollupStrategy: opts.rollupStrategy ?? null,
    })
    .returning({ id: kpiIndicatorsTable.id });
  return row.id;
}

describe("KPI access control (integration)", () => {
  it("operador vê e opera só os seus; não toca nos de outros", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-op", modules: ["kpi"] });
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const op = await createTestUser(ctx, { role: "operator", modules: ["kpi"], suffix: "op" });

    const x = await insertIndicator(ctx.organizationId, { name: "X", unitId: filialA.id, responsibleUserId: op.id });
    const y = await insertIndicator(ctx.organizationId, { name: "Y", unitId: filialA.id, responsibleUserId: ctx.userId });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(bearer(op.token));
    expect(list.status).toBe(200);
    expect(list.body.map((i: { id: number }) => i.id).sort()).toEqual([x]);

    const okOwn = await request(app)
      .put(`/api/organizations/${ctx.organizationId}/kpi/indicators/${x}/years/2026/values`)
      .set(bearer(op.token))
      .send({ values: [{ month: 1, value: 10, inputs: {} }] });
    expect(okOwn.status).toBe(200);

    const denied = await request(app)
      .put(`/api/organizations/${ctx.organizationId}/kpi/indicators/${y}/years/2026/values`)
      .set(bearer(op.token))
      .send({ values: [{ month: 1, value: 10, inputs: {} }] });
    expect(denied.status).toBe(403);
  });

  it("gerente vê a própria filial + corporativos, não vê outra filial; não exclui corporativo", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-mgr", modules: ["kpi"] });
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const filialB = await createUnit(ctx, `B ${ctx.prefix}`);
    const mgr = await createTestUser(ctx, { role: "manager", modules: ["kpi"], suffix: "mgr" });
    await db.update(usersTable).set({ unitId: filialA.id }).where(eq(usersTable.id, mgr.id));

    const a = await insertIndicator(ctx.organizationId, { name: "A1", unitId: filialA.id });
    const b = await insertIndicator(ctx.organizationId, { name: "B1", unitId: filialB.id });
    const corp = await insertIndicator(ctx.organizationId, { name: "Corp", unit: "Corporativo", unitId: null, rollupStrategy: "average" });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(bearer(mgr.token));
    expect(list.status).toBe(200);
    const ids = list.body.map((i: { id: number }) => i.id).sort();
    expect(ids).toContain(a);
    expect(ids).toContain(corp);
    expect(ids).not.toContain(b);

    const delCorp = await request(app)
      .delete(`/api/organizations/${ctx.organizationId}/kpi/indicators/${corp}`)
      .set(bearer(mgr.token));
    expect(delCorp.status).toBe(403);

    const delOwn = await request(app)
      .delete(`/api/organizations/${ctx.organizationId}/kpi/indicators/${a}`)
      .set(bearer(mgr.token));
    expect(delOwn.status).toBe(204);
  });

  it("analista vê só os seus e não escreve", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-an", modules: ["kpi"] });
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const an = await createTestUser(ctx, { role: "analyst", modules: ["kpi"], suffix: "an" });
    const mine = await insertIndicator(ctx.organizationId, { name: "M", unitId: filialA.id, responsibleUserId: an.id });
    const other = await insertIndicator(ctx.organizationId, { name: "O", unitId: filialA.id, responsibleUserId: ctx.userId });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(bearer(an.token));
    expect(list.body.map((i: { id: number }) => i.id).sort()).toEqual([mine]);

    const write = await request(app)
      .put(`/api/organizations/${ctx.organizationId}/kpi/indicators/${mine}/years/2026/values`)
      .set(bearer(an.token))
      .send({ values: [{ month: 1, value: 1, inputs: {} }] });
    expect(write.status).toBe(403); // analyst é bloqueado por requireWriteAccess
    expect(other).toBeGreaterThan(0);
  });

  it("admin vê tudo", async () => {
    const ctx = await createTestContext({ seed: "kpi-acl-adm" }); // org_admin
    contexts.push(ctx);
    const filialA = await createUnit(ctx, `A ${ctx.prefix}`);
    const filialB = await createUnit(ctx, `B ${ctx.prefix}`);
    const a = await insertIndicator(ctx.organizationId, { name: "A1", unitId: filialA.id });
    const b = await insertIndicator(ctx.organizationId, { name: "B1", unitId: filialB.id });

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/kpi/indicators`)
      .set(authHeader(ctx));
    const ids = list.body.map((i: { id: number }) => i.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });
});
```

> Se o cleanup (`cleanupTestData`) não cobrir `kpi_indicators`, confirmar na leitura de `e2e/support/cleanup.ts` e, se preciso, apagar os indicadores inseridos no `afterEach` (por `organizationId`). A FK `kpi_indicators.organization_id` pode bloquear a limpeza do org caso os indicadores não sejam removidos antes.

- [ ] **Step 2: Subir o banco de teste e rodar**

Run: `pnpm test:integration:up && pnpm exec vitest run --project integration artifacts/api-server/tests/routes/kpi-access.integration.test.ts`
Expected: PASS em todos os casos.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/tests/routes/kpi-access.integration.test.ts
git commit -m "test(kpi): integração de visibilidade e gates por role"
```

---

### Task 21: Verificação final

- [ ] **Step 1: Suite unitária completa**

Run: `pnpm test:unit`
Expected: PASS (inclui `access.test.ts` e `kpi-access.unit.test.ts`).

- [ ] **Step 2: Typecheck + build do monorepo**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 3: Verificação manual (dev local, NÃO prod)**

Subir API (porta de dev ≠ 3001) + web e validar, com contas de teste:
- Login operador "dono" de 1 indicador → módulo Indicadores lista só o dele; sem botões "Novo"/"Editar"/"Remover"; consegue lançar valores em Lançamentos do seu indicador.
- Login gerente da filial A → vê indicadores de A + corporativos; cria/edita/exclui de A; cria corporativo; **não** consegue excluir corporativo (sem botão / 403); não vê filial B.
- Login admin → vê e faz tudo.
- Cadastro de usuário → opção "Gerente" exibe dropdown de filial obrigatório; salvar cria o usuário com `unitId`.

- [ ] **Step 4: Registrar no diário de bordo**

Após validado, rodar `python3 scripts/diario-add.py --modulo Indicadores --titulo "Perfil Gerente + visibilidade por dono" --file <entrada.md>` (conteúdo: o que foi feito, impacto, validações). Ver CLAUDE.md.

---

## Notas de não-escopo / follow-ups

- Coluna texto `unit` mantida (back-compat / imports Excel). Remover em follow-up após validar o backfill em produção.
- Imports de KPI por Excel ainda gravam só `unit` (texto). Definir, em follow-up, o mapeamento para `unitId` no fluxo de import.
- Escopo por filial **não** se aplica a outros módulos no v1 (documentação ISO etc. seguem visíveis a todos).
- Gerente sem filial (`unitId` null por exclusão de filial) → enxerga só corporativos. Avisar na UI (follow-up menor).
