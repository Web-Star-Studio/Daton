# Filtros da listagem de Gestão de Ações + drill-down — Implementation Plan

> **For agentic workers:** implemente task-a-task, TDD, commits frequentes. Steps usam checkbox (`- [ ]`).

**Goal:** Ampliar os filtros da aba Lista do hub de Gestão de Ações (Tipo, Prioridade, Eficácia, Prazo, "Limpar filtros", contador) e tornar os cards/tiles clicáveis para levar à Lista já filtrada.

**Architecture:** Os filtros novos rodam no **servidor** (novos query params → condições SQL), não em memória, para que os números dos cards (calculados por `computeActionPlanSummary`) e a lista batam por construção. As fronteiras de prazo (`startOfToday`, `dueSoonLimit`) são recomputadas na rota com o mesmo código do summary. No front, o estado dos filtros sobe da `ListaScreen` para o hub (`planos-acao.tsx`), que coordena aba + filtro; os painéis recebem um callback `onDrillDown`.

**Tech Stack:** TypeScript, Drizzle (PostgreSQL), Express 5, Zod, OpenAPI 3.1 + Orval, React 19, Vitest (`node-unit`, `web-unit`, `integration`), supertest, @testing-library/react, wouter.

**Spec:** `docs/superpowers/specs/2026-07-14-filtros-gestao-acoes-design.md`

## Global Constraints

- Novos query params, nomes exatos: `actionType`, `effectiveness`, `dueWindow`. (`priority` já existe no contrato.)
- Valores de `effectiveness`: `effective | ineffective | pending`. Valores de `dueWindow`: `overdue | due_soon`.
- **Aguardando verificação** (`effectiveness=pending`) = `status = 'completed'` **e** `effectiveness_result IS NULL`. Mesmo critério do tile "Aguardando" (`eficacia-screen.tsx:38`) e do summary.
- **Vencidas** (`dueWindow=overdue`) = `status NOT IN ('completed','cancelled')` **e** `due_date < startOfToday`.
- **Vencendo em 7 dias** (`dueWindow=due_soon`) = `status NOT IN ('completed','cancelled')` **e** `startOfToday ≤ due_date < dueSoonLimit`.
- `startOfToday`/`dueSoonLimit` calculados como em `summary.ts:52-54` (relógio do servidor, meia-noite local, `+7 * 86_400_000`).
- Todos os filtros combinam com AND; a ordenação (`desc(updatedAt)`), a ausência de paginação e a autorização por `sourceModule` ficam **como estão**.
- `pnpm typecheck` tem de passar. Não editar arquivos gerados à mão — só `pnpm --filter @workspace/api-spec codegen` (requer python3).
- Testes de integração: `TEST_ENV=integration` sempre; schema de teste via `pnpm test:integration:db:push`, nunca `pnpm --filter @workspace/db push` (aponta para a produção).
- `pnpm test:unit` num comando só estoura a heap do V8 neste ambiente — rodar por `--project` e por arquivo.

---

## File Structure

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `lib/api-spec/openapi.yaml` | 3 query params novos + 2 enums de query | 1 |
| `artifacts/api-server/src/routes/action-plans.ts` | Condições SQL dos filtros novos | 1 |
| `artifacts/api-server/tests/routes/action-plans-filters.integration.test.ts` | **Criar** — testes dos filtros | 1 |
| `artifacts/web/src/pages/app/planos-acao/_components/list-filters.ts` | **Criar** — tipo do filtro + helpers puros | 2 |
| `artifacts/web/tests/pages/action-plan-list-filters.unit.test.ts` | **Criar** — teste dos helpers | 2 |
| `artifacts/web/src/pages/app/planos-acao/_components/lista-screen.tsx` | Controles novos, contador, limpar, filtro inicial, cards-atalho | 3 |
| `artifacts/web/src/pages/app/planos-acao.tsx` | Coordena aba + filtro; passa `onDrillDown` | 3 |
| `artifacts/web/src/pages/app/planos-acao/_components/eficacia-screen.tsx` | Tiles viram atalhos | 4 |
| `artifacts/web/tests/pages/planos-acao-drilldown.unit.test.tsx` | **Criar** — teste do drill-down | 4 |

---

### Task 1: Backend — query params `actionType`, `effectiveness`, `dueWindow`

Depois desta task a API filtra por tipo, eficácia e janela de prazo, com o mesmo critério do summary.

**Files:**
- Modify: `lib/api-spec/openapi.yaml:9239-9259` (parameters) + a seção `components/schemas` (2 enums novos)
- Modify: `artifacts/api-server/src/routes/action-plans.ts:2` (imports drizzle) e `:174-185` (conditions)
- Test: `artifacts/api-server/tests/routes/action-plans-filters.integration.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `ListActionPlansQueryParams` (Zod gerado) passa a aceitar `actionType?`, `effectiveness?`, `dueWindow?`. A Task 2/3 consome esses nomes.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/tests/routes/action-plans-filters.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { actionPlansTable, db } from "@workspace/db";
import type { ActionPlanSourceModule } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const MS_PER_DAY = 86_400_000;
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * MS_PER_DAY);
}

async function seedPlan(
  orgId: number,
  fields: Partial<typeof actionPlansTable.$inferInsert> & { title: string },
): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: orgId,
      sourceModule: "improvement" as ActionPlanSourceModule,
      sourceRef: {},
      ...fields,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

async function listTitles(ctx: TestOrgContext, query: Record<string, string>): Promise<string[]> {
  const res = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/action-plans`)
    .query(query)
    .set(authHeader(ctx));
  expect(res.status).toBe(200);
  return res.body.map((p: { title: string }) => p.title).sort();
}

describe("filtros da listagem de planos de ação", () => {
  it("filtra por actionType", async () => {
    const ctx = await createTestContext({ seed: "filtro-tipo" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Corr", actionType: "corrective" });
    await seedPlan(ctx.organizationId, { title: "Prev", actionType: "preventive" });

    expect(await listTitles(ctx, { actionType: "preventive" })).toEqual(["Prev"]);
  });

  it("effectiveness=pending devolve concluídas sem veredito e exclui as com veredito", async () => {
    const ctx = await createTestContext({ seed: "filtro-efic-pending" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Aguardando", status: "completed", effectivenessResult: null });
    await seedPlan(ctx.organizationId, { title: "JaAvaliada", status: "completed", effectivenessResult: "effective" });
    await seedPlan(ctx.organizationId, { title: "Aberta", status: "open", effectivenessResult: null });

    expect(await listTitles(ctx, { effectiveness: "pending" })).toEqual(["Aguardando"]);
  });

  it("effectiveness=effective devolve só as eficazes", async () => {
    const ctx = await createTestContext({ seed: "filtro-efic-eff" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Eficaz", status: "completed", effectivenessResult: "effective" });
    await seedPlan(ctx.organizationId, { title: "NaoEficaz", status: "completed", effectivenessResult: "ineffective" });

    expect(await listTitles(ctx, { effectiveness: "effective" })).toEqual(["Eficaz"]);
  });

  it("dueWindow=overdue devolve abertas vencidas e exclui concluídas/canceladas com prazo passado", async () => {
    const ctx = await createTestContext({ seed: "filtro-overdue" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Vencida", status: "in_progress", dueDate: daysFromNow(-3) });
    await seedPlan(ctx.organizationId, { title: "ConcluidaVencida", status: "completed", dueDate: daysFromNow(-3) });
    await seedPlan(ctx.organizationId, { title: "CanceladaVencida", status: "cancelled", dueDate: daysFromNow(-3) });
    await seedPlan(ctx.organizationId, { title: "Futura", status: "open", dueDate: daysFromNow(3) });

    expect(await listTitles(ctx, { dueWindow: "overdue" })).toEqual(["Vencida"]);
  });

  it("dueWindow=due_soon devolve abertas vencendo em ≤7 dias e exclui as já vencidas", async () => {
    const ctx = await createTestContext({ seed: "filtro-due-soon" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Vencendo", status: "open", dueDate: daysFromNow(3) });
    await seedPlan(ctx.organizationId, { title: "Vencida", status: "open", dueDate: daysFromNow(-1) });
    await seedPlan(ctx.organizationId, { title: "Longe", status: "open", dueDate: daysFromNow(30) });

    expect(await listTitles(ctx, { dueWindow: "due_soon" })).toEqual(["Vencendo"]);
  });

  it("combina dois filtros com AND", async () => {
    const ctx = await createTestContext({ seed: "filtro-and" });
    contexts.push(ctx);
    await seedPlan(ctx.organizationId, { title: "Alvo", actionType: "corrective", priority: "high" });
    await seedPlan(ctx.organizationId, { title: "SoTipo", actionType: "corrective", priority: "low" });
    await seedPlan(ctx.organizationId, { title: "SoPrio", actionType: "preventive", priority: "high" });

    expect(await listTitles(ctx, { actionType: "corrective", priority: "high" })).toEqual(["Alvo"]);
  });
});
```

- [ ] **Step 2: Preparar o banco de teste e rodar — confirmar que falha**

```bash
pnpm test:integration:up
pnpm test:integration:db:push
```

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-filters.integration.test.ts`

Expected: FAIL — os params novos ainda não existem no Zod (`actionType`/`effectiveness`/`dueWindow` são ignorados), então os filtros não recortam nada e as listas voltam com itens a mais.

- [ ] **Step 3: Adicionar os enums de query ao OpenAPI**

Em `lib/api-spec/openapi.yaml`, na seção `components/schemas` (junto dos outros enums de action plan, ex.: depois de `ActionPlanEffectivenessResult`), adicionar:

```yaml
    ActionPlanEffectivenessFilter:
      type: string
      enum: [effective, ineffective, pending]
    ActionPlanDueWindow:
      type: string
      enum: [overdue, due_soon]
```

- [ ] **Step 4: Declarar os 3 query params novos**

Em `lib/api-spec/openapi.yaml`, no bloco `parameters` de `listActionPlans` (depois de `sourceKpiMonthlyValueId`, `:9255-9259`):

```yaml
        - name: actionType
          in: query
          schema:
            $ref: "#/components/schemas/ActionPlanType"
        - name: effectiveness
          in: query
          schema:
            $ref: "#/components/schemas/ActionPlanEffectivenessFilter"
        - name: dueWindow
          in: query
          schema:
            $ref: "#/components/schemas/ActionPlanDueWindow"
```

- [ ] **Step 5: Regerar o cliente**

Run: `pnpm --filter @workspace/api-spec codegen`

Verificar: `grep -c "dueWindow" lib/api-zod/src/generated/api.ts lib/api-client-react/src/generated/api.schemas.ts` → ≥ 1 em cada.

- [ ] **Step 6: Ampliar os imports do drizzle**

Em `artifacts/api-server/src/routes/action-plans.ts:2`, acrescentar `gte`, `lt`, `isNull`, `notInArray`:

```ts
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm";
```

- [ ] **Step 7: Aplicar as condições novas**

Em `artifacts/api-server/src/routes/action-plans.ts`, logo antes de `const plans = await db` (após a condição de `sourceKpiMonthlyValueId`, `:185`):

```ts
  if (query.data.actionType) conditions.push(eq(actionPlansTable.actionType, query.data.actionType));
  if (query.data.effectiveness === "effective" || query.data.effectiveness === "ineffective") {
    conditions.push(eq(actionPlansTable.effectivenessResult, query.data.effectiveness));
  } else if (query.data.effectiveness === "pending") {
    // "Aguardando verificação": concluída, ainda sem veredito de eficácia.
    conditions.push(eq(actionPlansTable.status, "completed"));
    conditions.push(isNull(actionPlansTable.effectivenessResult));
  }
  if (query.data.dueWindow) {
    // Mesmas fronteiras do card (summary.ts): meia-noite local + 7 dias.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueSoonLimit = new Date(startOfToday.getTime() + 7 * 86_400_000);
    conditions.push(notInArray(actionPlansTable.status, ["completed", "cancelled"]));
    if (query.data.dueWindow === "overdue") {
      conditions.push(lt(actionPlansTable.dueDate, startOfToday));
    } else {
      conditions.push(gte(actionPlansTable.dueDate, startOfToday));
      conditions.push(lt(actionPlansTable.dueDate, dueSoonLimit));
    }
  }
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-filters.integration.test.ts`

Expected: PASS — 6 testes.

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck` → limpo.

- [ ] **Step 10: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/tests/routes/action-plans-filters.integration.test.ts
git commit -m "feat(acoes): filtros de tipo, eficácia e prazo na listagem"
```

---

### Task 2: Front — modelo de filtro e helpers puros

Isola a lógica de filtro (estado, montagem do query, "tem filtro ativo?") numa unidade pura, testável sem renderizar. `search` e `mineOnly` seguem locais da `ListaScreen` (não fazem parte do drill-down); este modelo cobre os filtros server-side compartilháveis com o drill-down.

**Files:**
- Create: `artifacts/web/src/pages/app/planos-acao/_components/list-filters.ts`
- Test: `artifacts/web/tests/pages/action-plan-list-filters.unit.test.ts`

**Interfaces:**
- Consumes: tipos de `@/lib/action-plans-client` (`ActionPlanStatus`, `ActionPlanType`, `ActionPlanPriority`, `ListActionPlansParams`).
- Produces:
  - `type ListFilters = { status: "" | ActionPlanStatus; sourceModule: string; responsibleUserId: string; actionType: "" | ActionPlanType; priority: "" | ActionPlanPriority; effectiveness: "" | ActionPlanEffectivenessFilter; dueWindow: "" | ActionPlanDueWindow }`
  - `type ActionPlanEffectivenessFilter = "effective" | "ineffective" | "pending"`
  - `type ActionPlanDueWindow = "overdue" | "due_soon"`
  - `EMPTY_FILTERS: ListFilters`
  - `hasActiveFilters(f: ListFilters): boolean`
  - `buildActionPlanQuery(f: ListFilters, opts: { mineUserId?: number }): ListActionPlansParams | undefined`

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/web/tests/pages/action-plan-list-filters.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  buildActionPlanQuery,
  hasActiveFilters,
  type ListFilters,
} from "@/pages/app/planos-acao/_components/list-filters";

describe("EMPTY_FILTERS / hasActiveFilters", () => {
  it("EMPTY_FILTERS não tem filtro ativo", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("qualquer campo preenchido conta como ativo", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, effectiveness: "pending" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, dueWindow: "overdue" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, actionType: "corrective" })).toBe(true);
  });
});

describe("buildActionPlanQuery", () => {
  it("sem filtros e sem 'mine' → undefined", () => {
    expect(buildActionPlanQuery(EMPTY_FILTERS, {})).toBeUndefined();
  });

  it("mapeia cada campo para o query param correspondente", () => {
    const f: ListFilters = {
      status: "open",
      sourceModule: "improvement",
      responsibleUserId: "7",
      actionType: "corrective",
      priority: "high",
      effectiveness: "pending",
      dueWindow: "overdue",
    };
    expect(buildActionPlanQuery(f, {})).toEqual({
      status: "open",
      sourceModule: "improvement",
      responsibleUserId: 7,
      actionType: "corrective",
      priority: "high",
      effectiveness: "pending",
      dueWindow: "overdue",
    });
  });

  it("'mine' sobrescreve o responsável escolhido", () => {
    const f = { ...EMPTY_FILTERS, responsibleUserId: "7" };
    expect(buildActionPlanQuery(f, { mineUserId: 42 })).toEqual({ responsibleUserId: 42 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-list-filters.unit.test.ts`

Expected: FAIL — módulo `list-filters` não existe.

- [ ] **Step 3: Implementar o módulo**

Criar `artifacts/web/src/pages/app/planos-acao/_components/list-filters.ts`:

```ts
import type {
  ActionPlanPriority,
  ActionPlanStatus,
  ActionPlanType,
  ListActionPlansParams,
} from "@/lib/action-plans-client";

export type ActionPlanEffectivenessFilter = "effective" | "ineffective" | "pending";
export type ActionPlanDueWindow = "overdue" | "due_soon";

/** Filtros server-side da aba Lista. `search` e `mineOnly` ficam locais na tela
 * (não entram no drill-down). Campos vazios ("") = "sem filtro". */
export type ListFilters = {
  status: "" | ActionPlanStatus;
  sourceModule: string;
  responsibleUserId: string;
  actionType: "" | ActionPlanType;
  priority: "" | ActionPlanPriority;
  effectiveness: "" | ActionPlanEffectivenessFilter;
  dueWindow: "" | ActionPlanDueWindow;
};

export const EMPTY_FILTERS: ListFilters = {
  status: "",
  sourceModule: "",
  responsibleUserId: "",
  actionType: "",
  priority: "",
  effectiveness: "",
  dueWindow: "",
};

export function hasActiveFilters(f: ListFilters): boolean {
  return (
    f.status !== "" ||
    f.sourceModule !== "" ||
    f.responsibleUserId !== "" ||
    f.actionType !== "" ||
    f.priority !== "" ||
    f.effectiveness !== "" ||
    f.dueWindow !== ""
  );
}

/** Monta o query da listagem. `mineUserId` (botão "Atribuídas a mim") sobrepõe o
 * responsável escolhido. Devolve undefined quando não há nada a filtrar. */
export function buildActionPlanQuery(
  f: ListFilters,
  opts: { mineUserId?: number },
): ListActionPlansParams | undefined {
  const p: ListActionPlansParams = {};
  if (f.status) p.status = f.status;
  if (f.sourceModule) p.sourceModule = f.sourceModule as ListActionPlansParams["sourceModule"];
  if (opts.mineUserId !== undefined) p.responsibleUserId = opts.mineUserId;
  else if (f.responsibleUserId) p.responsibleUserId = Number(f.responsibleUserId);
  if (f.actionType) p.actionType = f.actionType;
  if (f.priority) p.priority = f.priority;
  if (f.effectiveness) p.effectiveness = f.effectiveness;
  if (f.dueWindow) p.dueWindow = f.dueWindow;
  return Object.keys(p).length > 0 ? p : undefined;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-list-filters.unit.test.ts`

Expected: PASS — 5 testes.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → limpo. (Se `ListActionPlansParams` ainda não expõe os campos novos, é sinal de que a Task 1 não foi regerada — pare e verifique.)

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/list-filters.ts artifacts/web/tests/pages/action-plan-list-filters.unit.test.ts
git commit -m "feat(acoes): modelo de filtros da listagem (helpers puros)"
```

---

### Task 3: Front — barra de filtros, contador, "Limpar", filtro inicial e cards-atalho

Substitui os `useState` soltos da `ListaScreen` pelo `ListFilters`, adiciona os quatro controles, o "Limpar filtros" e o contador, aceita um filtro inicial vindo do hub e transforma os cards "Vencidas"/"Vencendo" em atalhos. O hub passa a coordenar aba + filtro pendente.

**Files:**
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/lista-screen.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao.tsx`

**Interfaces:**
- Consumes: `ListFilters`, `EMPTY_FILTERS`, `hasActiveFilters`, `buildActionPlanQuery`, `ActionPlanEffectivenessFilter`, `ActionPlanDueWindow` (Task 2); `ACTION_TYPE_LABELS`, `ACTION_PLAN_PRIORITY_LABELS`, `EFFECTIVENESS_RESULT_LABELS` (já em `action-plans-client.ts`).
- Produces: `ListaScreen` aceita a prop `initialFilters?: Partial<ListFilters>`; `ActionPlansModulePage` expõe `onDrillDown` aos painéis.

- [ ] **Step 1 (hub): elevar o estado de aba + filtro pendente**

Em `artifacts/web/src/pages/app/planos-acao.tsx`, dentro de `ActionPlansModulePage`, ao lado do `const [tab, setTab]`:

```tsx
  const [pendingFilters, setPendingFilters] = useState<Partial<ListFilters> | undefined>(undefined);

  // Chamado pelos painéis (ex.: tile "Aguardando" da Eficácia): troca para a
  // aba Lista e injeta o filtro correspondente.
  const drillDown = useCallback((filters: Partial<ListFilters>) => {
    setPendingFilters(filters);
    setTab("lista");
  }, []);
```

Imports novos no topo: `useCallback` (de "react") e `type ListFilters` de `./planos-acao/_components/list-filters`.

A renderização da aba lista passa o filtro pendente (consumindo-o depois):

```tsx
        {tab === "lista" && (
          <ListaScreen
            orgId={orgId}
            canWrite={canWrite}
            onNova={() => setNovaOpen(true)}
            initialFilters={pendingFilters}
            onInitialFiltersApplied={() => setPendingFilters(undefined)}
          />
        )}
        {tab === "eficacia" && <EficaciaScreen orgId={orgId} onDrillDown={drillDown} />}
```

(As demais abas seguem iguais; `onDrillDown` só entra na Eficácia nesta entrega.)

- [ ] **Step 2 (lista): trocar os useState soltos pelo ListFilters**

Em `lista-screen.tsx`, a assinatura e o estado:

```tsx
export function ListaScreen({
  orgId,
  canWrite,
  onNova,
  initialFilters,
  onInitialFiltersApplied,
}: {
  orgId: number;
  canWrite: boolean;
  onNova: () => void;
  initialFilters?: Partial<ListFilters>;
  onInitialFiltersApplied?: () => void;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);
  const [mineOnly, setMineOnly] = useState(false);

  // Aplica (uma vez) o filtro trazido por um drill-down de painel.
  useEffect(() => {
    if (!initialFilters) return;
    setFilters({ ...EMPTY_FILTERS, ...initialFilters });
    setMineOnly(false);
    onInitialFiltersApplied?.();
  }, [initialFilters, onInitialFiltersApplied]);

  const queryParams = useMemo(
    () => buildActionPlanQuery(filters, { mineUserId: mineOnly && user?.id ? user.id : undefined }),
    [filters, mineOnly, user?.id],
  );
```

Imports a adicionar em `lista-screen.tsx`: `useEffect`; `X` de `lucide-react`; e de `./list-filters`: `EMPTY_FILTERS`, `buildActionPlanQuery`, `hasActiveFilters`, `type ListFilters`; e de `@/lib/action-plans-client`: `ACTION_TYPE_LABELS`, `ACTION_PLAN_PRIORITY_LABELS`, `EFFECTIVENESS_RESULT_LABELS`, `type ActionPlanType`, `type ActionPlanPriority`. Os usos de `statusFilter`/`sourceFilter`/`responsibleFilter` passam a ler `filters.status`/`filters.sourceModule`/`filters.responsibleUserId`; o bloco `filteredExternal` usa `filters.sourceModule` e `filters.status`.

- [ ] **Step 3 (lista): controles novos + contador + limpar**

Na barra (`:105-140`), depois do Select de responsável, antes do `<span>` do contador, acrescentar os quatro Selects e trocar o rodapé da barra:

```tsx
        <Select value={filters.actionType} onChange={(e) => setFilters((f) => ({ ...f, actionType: e.target.value as "" | ActionPlanType }))} className="w-40">
          <option value="">Todos os tipos</option>
          {(["corrective", "preventive", "improvement"] as ActionPlanType[]).map((t) => (
            <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>
          ))}
        </Select>
        <Select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as "" | ActionPlanPriority }))} className="w-40">
          <option value="">Todas as prioridades</option>
          {(["high", "medium", "low"] as ActionPlanPriority[]).map((p) => (
            <option key={p} value={p}>{ACTION_PLAN_PRIORITY_LABELS[p]}</option>
          ))}
        </Select>
        <Select value={filters.effectiveness} onChange={(e) => setFilters((f) => ({ ...f, effectiveness: e.target.value as ListFilters["effectiveness"] }))} className="w-48">
          <option value="">Toda eficácia</option>
          <option value="effective">{EFFECTIVENESS_RESULT_LABELS.effective}</option>
          <option value="ineffective">{EFFECTIVENESS_RESULT_LABELS.ineffective}</option>
          <option value="pending">Aguardando verificação</option>
        </Select>
        <Select value={filters.dueWindow} onChange={(e) => setFilters((f) => ({ ...f, dueWindow: e.target.value as ListFilters["dueWindow"] }))} className="w-40">
          <option value="">Qualquer prazo</option>
          <option value="overdue">Vencidas</option>
          <option value="due_soon">Vencendo em 7 dias</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters(filters) && (
            <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={() => { setFilters(EMPTY_FILTERS); setMineOnly(false); }}>
              <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}
          <span className="text-sm text-muted-foreground">{filtered.length} açõe{filtered.length !== 1 ? "s" : ""}</span>
        </div>
```

(O `<span>` antigo do contador em `:139` é substituído por esse bloco `ml-auto`.)

- [ ] **Step 4 (lista): "Limpar filtros" também no empty state**

No empty state (`:145-150`), acrescentar, antes do botão "Nova ação":

```tsx
          {hasActiveFilters(filters) && (
            <Button variant="outline" size="sm" className="mt-1" onClick={() => { setFilters(EMPTY_FILTERS); setMineOnly(false); }}>
              <X className="mr-1.5 h-4 w-4" /> Limpar filtros
            </Button>
          )}
```

- [ ] **Step 5 (lista): cards "Vencidas"/"Vencendo" viram atalhos**

Transformar os dois `StatCard` em botões que setam o filtro. `StatCard` ganha um `onClick?` opcional; quando presente, vira `<button>`:

```tsx
function StatCard({ label, value, tone, hint, icon: Icon, onClick }: { label: string; value: number | string; tone?: string; hint?: string; icon: typeof ClipboardList; onClick?: () => void }) {
  const content = (
    <>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </>
  );
  const base = "rounded-xl border border-border/60 bg-card/42 px-4 py-3 backdrop-blur-md text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(base, "transition-colors hover:bg-card/70 focus:outline-none focus:ring-2 focus:ring-ring")}>{content}</button>
  ) : (
    <div className={base}>{content}</div>
  );
}
```

E os dois cards de prazo (`:100-101`):

```tsx
        <StatCard label="Vencidas" value={summary?.overdue ?? 0} tone="text-red-600 dark:text-red-400" icon={AlertTriangle} hint="requer atenção" onClick={() => { setFilters({ ...EMPTY_FILTERS, dueWindow: "overdue" }); setMineOnly(false); }} />
        <StatCard label="Vencendo (7d)" value={summary?.dueSoon ?? 0} tone="text-amber-600 dark:text-amber-400" icon={Clock} hint="próximos 7 dias" onClick={() => { setFilters({ ...EMPTY_FILTERS, dueWindow: "due_soon" }); setMineOnly(false); }} />
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck` → limpo.

- [ ] **Step 7: Commit**

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/lista-screen.tsx artifacts/web/src/pages/app/planos-acao.tsx
git commit -m "feat(acoes): filtros de tipo/prioridade/eficácia/prazo na aba Lista + cards-atalho"
```

---

### Task 4: Front — tiles da aba Eficácia viram atalhos

**Files:**
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/eficacia-screen.tsx`
- Test: `artifacts/web/tests/pages/planos-acao-drilldown.unit.test.tsx` (criar)

**Interfaces:**
- Consumes: `onDrillDown` (Task 3), `ActionPlanEffectivenessFilter` (Task 2).
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/web/tests/pages/planos-acao-drilldown.unit.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/action-plans-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/action-plans-client")>();
  return {
    ...actual,
    useActionPlansSummary: () => ({ data: { effectivenessRatePct: 50, effectivenessEvolution: [] } }),
    useActionPlans: () => ({
      data: [
        { id: 1, status: "completed", effectivenessResult: "effective" },
        { id: 2, status: "completed", effectivenessResult: null },
      ],
    }),
  };
});

import { EficaciaScreen } from "@/pages/app/planos-acao/_components/eficacia-screen";

describe("EficaciaScreen — tiles como atalho", () => {
  it("clicar em 'Aguardando' dispara drill-down com effectiveness=pending", async () => {
    const onDrillDown = vi.fn();
    render(<EficaciaScreen orgId={2} onDrillDown={onDrillDown} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Aguardando/ }));

    expect(onDrillDown).toHaveBeenCalledWith({ effectiveness: "pending" });
  });

  it("clicar em 'Eficazes' dispara drill-down com effectiveness=effective", async () => {
    const onDrillDown = vi.fn();
    render(<EficaciaScreen orgId={2} onDrillDown={onDrillDown} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Eficazes/ }));

    expect(onDrillDown).toHaveBeenCalledWith({ effectiveness: "effective" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/planos-acao-drilldown.unit.test.tsx`

Expected: FAIL — os tiles não são `button` e `EficaciaScreen` não aceita `onDrillDown`.

- [ ] **Step 3: Tornar os tiles clicáveis**

Em `eficacia-screen.tsx`, `Tile` ganha `onClick?` e vira `button` quando presente:

```tsx
function Tile({ label, value, tone, bg, onClick }: { label: string; value: string; tone: string; bg: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</div>
      <div className={cn("text-[11px]", tone)}>{label}</div>
    </>
  );
  const base = cn("rounded-xl px-4 py-3 text-center", bg);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(base, "w-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring")}>{inner}</button>
  ) : (
    <div className={base}>{inner}</div>
  );
}
```

Assinatura e uso:

```tsx
export function EficaciaScreen({ orgId, onDrillDown }: { orgId: number; onDrillDown?: (filters: { effectiveness: ActionPlanEffectivenessFilter }) => void }) {
```

```tsx
            <Tile label="Eficazes" value={String(counts.effective)} tone="text-emerald-700 dark:text-emerald-300" bg="bg-emerald-100 dark:bg-emerald-500/15" onClick={onDrillDown && (() => onDrillDown({ effectiveness: "effective" }))} />
            <Tile label="Não eficazes" value={String(counts.ineffective)} tone="text-red-700 dark:text-red-300" bg="bg-red-100 dark:bg-red-500/15" onClick={onDrillDown && (() => onDrillDown({ effectiveness: "ineffective" }))} />
            <Tile label="Aguardando" value={String(counts.pending)} tone="text-amber-700 dark:text-amber-300" bg="bg-amber-100 dark:bg-amber-500/15" onClick={onDrillDown && (() => onDrillDown({ effectiveness: "pending" }))} />
```

Import novo: `type ActionPlanEffectivenessFilter` de `./list-filters`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/planos-acao-drilldown.unit.test.tsx`

Expected: PASS — 2 testes.

- [ ] **Step 5: Typecheck + suíte web da feature + commit**

Run: `pnpm typecheck` → limpo.
Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-list-filters.unit.test.ts artifacts/web/tests/pages/planos-acao-drilldown.unit.test.tsx` → tudo verde.

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/eficacia-screen.tsx artifacts/web/tests/pages/planos-acao-drilldown.unit.test.tsx
git commit -m "feat(acoes): tiles da aba Eficácia levam à Lista filtrada"
```

---

## Self-review (feito ao escrever)

- **Cobertura da spec:** filtros Tipo/Prioridade/Eficácia/Prazo (Task 1 backend + Task 3 UI); contador e "Limpar filtros" na barra e no empty state (Task 3); drill-down dos cards de prazo (Task 3) e dos tiles de eficácia (Task 4); critério de prazo idêntico ao summary (Task 1, Step 7 — mesmas fronteiras; teste de exclusão de concluídas/canceladas). Fora de escopo respeitado (sem paginação, sem GUT/ODS/unidade, sem URL).
- **Consistência de tipos:** `ListFilters`, `buildActionPlanQuery`, `EMPTY_FILTERS`, `hasActiveFilters` definidos na Task 2 e consumidos com a mesma assinatura nas Tasks 3–4; `ActionPlanEffectivenessFilter`/`ActionPlanDueWindow` nascem na Task 2 e batem com os enums do OpenAPI (Task 1).
- **Ordem:** Task 1 (backend/contrato) → Task 2 (helpers) → Task 3 (barra/hub) → Task 4 (tiles). Cada uma testável isolada.
```
