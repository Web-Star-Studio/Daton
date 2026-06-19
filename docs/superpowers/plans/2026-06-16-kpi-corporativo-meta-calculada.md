# Meta/tolerância calculada do indicador corporativo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a meta/tolerância de um indicador corporativo (rollup) ser calculada ao vivo a partir das metas das filiais, pela mesma estratégia do valor (soma/média/mín/máx).

**Architecture:** Compose-on-read no servidor: uma função pura agrega as metas; uma função DB-bound (`computeRollupGoal`) busca as metas dos filhos do ano e agrega; o endpoint do ano injeta a meta calculada no `yearConfig` (com flag `isGoalComputed`). Edição manual da meta de corporativo é ignorada e o campo some da UI. Telas de exibição não mudam (já leem `yearConfig.goal`).

**Tech Stack:** Express 5 + Drizzle (PostgreSQL), Zod/Orval (OpenAPI codegen), React 19 + Vite, Vitest (unit + integration via supertest).

**Spec:** `docs/superpowers/specs/2026-06-16-kpi-corporativo-meta-calculada-design.md`

---

## Estrutura de arquivos

- `artifacts/api-server/src/services/kpi/rollup.ts` — **modificar**: extrair `aggregateByStrategy` (pura) + reusar em `computeRollupValue`; adicionar `computeRollupGoal` (DB).
- `artifacts/api-server/tests/services/kpi/rollup.unit.test.ts` — **criar**: testes da função pura.
- `artifacts/api-server/src/routes/kpi/index.ts` — **modificar**: `serializeYearConfig` aceita meta computada; endpoint do ano injeta meta do corporativo; PUT ignora goal de corporativo; criação corporativa para de exigir goal.
- `artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts` — **criar**: teste e2e do endpoint.
- `lib/api-spec/openapi.yaml` — **modificar**: campos `isGoalComputed`/`goalChildrenWithData`/`goalChildrenTotal` em `KpiYearConfig` + rodar codegen.
- `artifacts/web/src/pages/app/kpi/_components/corporate-create-dialog.tsx` — **modificar**: remover campo de meta, adicionar prévia calculada, receber metas dos filhos por prop.
- `artifacts/web/src/pages/app/kpi/indicadores.tsx` — **modificar**: passar `childGoals` ao diálogo; esconder campo de tolerância ao editar corporativo.
- `artifacts/web/src/pages/app/kpi/lancamentos.tsx` — **modificar**: esconder campo de tolerância no config de corporativo.

---

## Task 1: Função pura `aggregateByStrategy` + refatorar `computeRollupValue`

**Files:**
- Test: `artifacts/api-server/tests/services/kpi/rollup.unit.test.ts` (criar)
- Modify: `artifacts/api-server/src/services/kpi/rollup.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/tests/services/kpi/rollup.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateByStrategy } from "../../../src/services/kpi/rollup";

describe("aggregateByStrategy", () => {
  it("soma os valores (sum_values)", () => {
    expect(aggregateByStrategy([1, 1, 1], "sum_values")).toBe(3);
  });
  it("calcula a média (average)", () => {
    expect(aggregateByStrategy([1, 1, 4], "average")).toBe(2);
  });
  it("pega o mínimo (min)", () => {
    expect(aggregateByStrategy([3, 1, 2], "min")).toBe(1);
  });
  it("pega o máximo (max)", () => {
    expect(aggregateByStrategy([3, 1, 2], "max")).toBe(3);
  });
  it("trata sum_inputs como soma (fallback de meta)", () => {
    expect(aggregateByStrategy([1, 2], "sum_inputs")).toBe(3);
  });
  it("retorna null para lista vazia", () => {
    expect(aggregateByStrategy([], "average")).toBeNull();
  });
  it("funciona com um único valor", () => {
    expect(aggregateByStrategy([5], "average")).toBe(5);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run artifacts/api-server/tests/services/kpi/rollup.unit.test.ts --project node-unit`
Expected: FAIL — `aggregateByStrategy` não é exportada.

- [ ] **Step 3: Implementar `aggregateByStrategy` e reusar em `computeRollupValue`**

Em `artifacts/api-server/src/services/kpi/rollup.ts`, adicionar a função pura (logo após os imports / antes de `applyParentFormula`):

```ts
/**
 * Agrega uma lista de números pela estratégia de rollup. Usada tanto pelo
 * valor (computeRollupValue) quanto pela meta (computeRollupGoal). Lista vazia
 * → null. `sum_inputs` aqui age como soma (só relevante p/ meta; no valor o
 * sum_inputs é tratado antes, via fórmula do pai).
 */
export function aggregateByStrategy(
  values: number[],
  strategy: KpiRollupStrategy,
): number | null {
  if (values.length === 0) return null;
  switch (strategy) {
    case "sum_values":
    case "sum_inputs":
      return values.reduce((acc, v) => acc + v, 0);
    case "average":
      return values.reduce((acc, v) => acc + v, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return null;
  }
}
```

No mesmo arquivo, substituir o bloco final de `computeRollupValue` (o `switch (strategy)` das estratégias por valor, atualmente entre `const values = ...` e o `return { ...baseResult, computed };`) por:

```ts
  // Estratégias baseadas em `value` das filhas
  const values = withData.map((b) => b.value!).filter((v): v is number => Number.isFinite(v));
  const computed = aggregateByStrategy(values, strategy);
  return { ...baseResult, computed };
```

(Remove o `if (values.length === 0) return ...` e o `switch` antigos — `aggregateByStrategy` já cobre os dois. O caminho `sum_inputs` continua tratado antes, no bloco que aplica a fórmula do pai, sem alteração.)

- [ ] **Step 4: Rodar testes + typecheck**

Run: `pnpm exec vitest run artifacts/api-server/tests/services/kpi/rollup.unit.test.ts --project node-unit`
Expected: PASS (7 testes).
Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/kpi/rollup.ts artifacts/api-server/tests/services/kpi/rollup.unit.test.ts
git commit -m "refactor(kpi): extrai aggregateByStrategy puro do rollup de valor"
```

---

## Task 2: Teste de integração do endpoint (meta calculada) — escrever falhando

**Files:**
- Test: `artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts` (criar)

> Requer DB de teste no ar: `pnpm test:integration:up` antes de rodar.

- [ ] **Step 1: Escrever o teste de integração**

Criar `artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
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

async function createLeaf(
  context: TestOrgContext,
  name: string,
  unit: string,
  goal: number,
) {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/kpi/indicators`)
    .set(authHeader(context))
    .send({
      name,
      measurement: "x",
      formulaVariables: [{ key: "x", label: "X" }],
      formulaExpression: "x",
      unit,
      measureUnit: "un",
      direction: "down",
      periodicity: "monthly",
      norms: [],
      goal,
    });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("KPI corporativo: meta calculada", () => {
  it("soma as metas das filiais e marca isGoalComputed", async () => {
    const context = await createTestContext({ seed: "kpi-corp-goal-sum" });
    contexts.push(context);
    const year = new Date().getFullYear();

    const a = await createLeaf(context, `Acidentes A ${context.prefix}`, "Piracicaba", 1);
    const b = await createLeaf(context, `Acidentes B ${context.prefix}`, "Porto Alegre", 1);

    // Cria corporativo SEM enviar goal (passa a ser calculado).
    const corp = await request(app)
      .post(`/api/organizations/${context.organizationId}/kpi/corporate-indicators`)
      .set(authHeader(context))
      .send({
        name: `Acidentes - Corporativo ${context.prefix}`,
        strategy: "sum_values",
        childIndicatorIds: [a, b],
        year,
        measureUnit: "un",
        direction: "down",
        periodicity: "monthly",
        responsibleUserId: context.userId,
      });
    expect(corp.status).toBe(201);
    const corpId = corp.body.indicatorId as number;

    const yearData = await request(app)
      .get(`/api/organizations/${context.organizationId}/kpi/years/${year}`)
      .set(authHeader(context));
    expect(yearData.status).toBe(200);

    const corpRow = yearData.body.find(
      (r: { indicator: { id: number } }) => r.indicator.id === corpId,
    );
    expect(corpRow).toBeTruthy();
    expect(corpRow.yearConfig.goal).toBe(2);
    expect(corpRow.yearConfig.isGoalComputed).toBe(true);

    // Folha não é afetada: meta continua a armazenada, sem flag.
    const leafRow = yearData.body.find(
      (r: { indicator: { id: number } }) => r.indicator.id === a,
    );
    expect(leafRow.yearConfig.goal).toBe(1);
    expect(leafRow.yearConfig.isGoalComputed).toBe(false);
  });

  it("ignora edição manual da meta de um corporativo", async () => {
    const context = await createTestContext({ seed: "kpi-corp-goal-block" });
    contexts.push(context);
    const year = new Date().getFullYear();

    const a = await createLeaf(context, `Av A ${context.prefix}`, "Anápolis", 2);
    const b = await createLeaf(context, `Av B ${context.prefix}`, "Cariacica", 4);

    const corp = await request(app)
      .post(`/api/organizations/${context.organizationId}/kpi/corporate-indicators`)
      .set(authHeader(context))
      .send({
        name: `Av - Corporativo ${context.prefix}`,
        strategy: "average",
        childIndicatorIds: [a, b],
        year,
        measureUnit: "un",
        direction: "down",
        periodicity: "monthly",
        responsibleUserId: context.userId,
      });
    expect(corp.status).toBe(201);
    const corpId = corp.body.indicatorId as number;

    // Tenta forçar uma meta manual no corporativo — deve ser ignorada.
    await request(app)
      .put(`/api/organizations/${context.organizationId}/kpi/indicators/${corpId}/years/${year}`)
      .set(authHeader(context))
      .send({ goal: 999 });

    const yearData = await request(app)
      .get(`/api/organizations/${context.organizationId}/kpi/years/${year}`)
      .set(authHeader(context));
    const corpRow = yearData.body.find(
      (r: { indicator: { id: number } }) => r.indicator.id === corpId,
    );
    // média(2,4) = 3, não 999.
    expect(corpRow.yearConfig.goal).toBe(3);
    expect(corpRow.yearConfig.isGoalComputed).toBe(true);
  });
});
```

- [ ] **Step 2: Subir o DB de teste e rodar — confirmar falha**

Run: `pnpm test:integration:up`
Run: `pnpm exec vitest run artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts --project integration`
Expected: FAIL — `yearConfig.goal` vem o valor armazenado (não calculado) e `isGoalComputed` é `undefined`.

- [ ] **Step 3: Commit do teste (vermelho)**

```bash
git add artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts
git commit -m "test(kpi): meta calculada do corporativo (integração, vermelho)"
```

---

## Task 3: `computeRollupGoal` + injeção no endpoint do ano

**Files:**
- Modify: `artifacts/api-server/src/services/kpi/rollup.ts`
- Modify: `artifacts/api-server/src/routes/kpi/index.ts`

- [ ] **Step 1: Adicionar `computeRollupGoal` em `rollup.ts`**

No fim de `artifacts/api-server/src/services/kpi/rollup.ts`, adicionar:

```ts
export interface RollupGoalResult {
  computed: number | null;
  strategy: KpiRollupStrategy;
  /** Quantos filhos têm meta definida no ano. */
  childrenWithGoal: number;
  /** Total de filhos vinculados. */
  childrenTotal: number;
}

/**
 * Calcula a meta/tolerância de um corporativo agregando as metas dos filhos no
 * ano, pela mesma estratégia do valor. Considera só filhos com meta definida
 * (kpi_year_configs.goal != null) naquele ano. Sem filho com meta → computed null.
 * Não aplica carry-forward de meta dos filhos (usa o config do ano).
 */
export async function computeRollupGoal(
  orgId: number,
  parentIndicatorId: number,
  year: number,
): Promise<RollupGoalResult | null> {
  const [parent] = await db
    .select({ rollupStrategy: kpiIndicatorsTable.rollupStrategy })
    .from(kpiIndicatorsTable)
    .where(and(
      eq(kpiIndicatorsTable.id, parentIndicatorId),
      eq(kpiIndicatorsTable.organizationId, orgId),
    ));
  if (!parent) return null;
  const strategy = (parent.rollupStrategy ?? "sum_inputs") as KpiRollupStrategy;

  const childLinks = await db
    .select({ childIndicatorId: kpiIndicatorRollupsTable.childIndicatorId })
    .from(kpiIndicatorRollupsTable)
    .where(and(
      eq(kpiIndicatorRollupsTable.parentIndicatorId, parentIndicatorId),
      eq(kpiIndicatorRollupsTable.organizationId, orgId),
    ));
  if (childLinks.length === 0) return null;
  const childIds = childLinks.map((l) => l.childIndicatorId);

  const childConfigs = await db
    .select({
      indicatorId: kpiYearConfigsTable.indicatorId,
      goal: kpiYearConfigsTable.goal,
    })
    .from(kpiYearConfigsTable)
    .where(and(
      eq(kpiYearConfigsTable.organizationId, orgId),
      eq(kpiYearConfigsTable.year, year),
      inArray(kpiYearConfigsTable.indicatorId, childIds),
    ));
  const goalByChild = new Map(childConfigs.map((c) => [c.indicatorId, c.goal]));

  const goals: number[] = [];
  for (const id of childIds) {
    const g = goalByChild.get(id);
    if (g !== null && g !== undefined) {
      const n = parseFloat(g);
      if (Number.isFinite(n)) goals.push(n);
    }
  }

  return {
    computed: aggregateByStrategy(goals, strategy),
    strategy,
    childrenWithGoal: goals.length,
    childrenTotal: childIds.length,
  };
}
```

- [ ] **Step 2: `serializeYearConfig` passa a aceitar a meta computada**

Em `artifacts/api-server/src/routes/kpi/index.ts`, substituir a função `serializeYearConfig` (linhas ~91-103) por:

```ts
function serializeYearConfig(
  r: typeof kpiYearConfigsTable.$inferSelect,
  computedGoal?: {
    computed: number | null;
    childrenWithGoal: number;
    childrenTotal: number;
  } | null,
) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    indicatorId: r.indicatorId,
    objectiveId: r.objectiveId ?? null,
    year: r.year,
    seq: r.seq ?? null,
    goal: computedGoal
      ? computedGoal.computed
      : r.goal !== null && r.goal !== undefined
        ? parseFloat(r.goal)
        : null,
    isGoalComputed: computedGoal ? true : false,
    goalChildrenWithData: computedGoal ? computedGoal.childrenWithGoal : null,
    goalChildrenTotal: computedGoal ? computedGoal.childrenTotal : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 3: Importar `computeRollupGoal` e injetar a meta no endpoint do ano**

No topo de `index.ts`, ajustar o import do rollup (linha ~48):

```ts
import { computeRollupValue, computeRollupGoal, type RollupGoalResult } from "../../services/kpi/rollup";
```

No handler `GET .../kpi/years/:year`, **logo após** o loop de rollup de VALOR (depois da linha `valuesByYearConfigId.set(yc.id, monthMap);` que fecha o `for (const ind of rollupIndicators)`), adicionar:

```ts
  // ─── Rollup da META (tolerância) on-read ─────────────────────────────────
  // Uma vez por corporativo (a meta é por ano, não por mês).
  const computedGoalByIndicatorId = new Map<number, RollupGoalResult>();
  for (const ind of rollupIndicators) {
    const goalResult = await computeRollupGoal(params.data.orgId, ind.id, params.data.year);
    if (goalResult) computedGoalByIndicatorId.set(ind.id, goalResult);
  }
```

Na montagem da resposta (linha ~897), trocar:

```ts
        yearConfig: serializeYearConfig(yc),
```

por:

```ts
        yearConfig: serializeYearConfig(yc, computedGoalByIndicatorId.get(ind.id) ?? null),
```

- [ ] **Step 4: Criação corporativa para de exigir meta**

(Necessário para o teste de integração criar o corporativo SEM goal.)

No handler `POST .../kpi/corporate-indicators`, **remover** o bloco de validação obrigatória do goal (linhas ~1209-1211):

```ts
    if (body.goal == null || !Number.isFinite(Number(body.goal))) {
      res.status(400).json({ error: "Tolerância obrigatória" }); return;
    }
```

E no `insert` do year-config (linha ~1293), trocar:

```ts
        goal: body.goal != null ? String(body.goal) : null,
```

por:

```ts
        goal: null, // meta do corporativo é sempre calculada das filiais
```

- [ ] **Step 5: Rodar a 1ª parte do teste de integração + typecheck**

Run: `pnpm typecheck`
Expected: sem erros.
Run: `pnpm exec vitest run artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts -t "soma as metas" --project integration`
Expected: PASS (o teste de soma + isGoalComputed). O 2º teste (ignora edição manual) ainda falha — coberto na Task 4.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/services/kpi/rollup.ts artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): meta do corporativo calculada das filiais (compose-on-read)"
```

---

## Task 4: Bloquear edição manual da meta de corporativo (PUT)

**Files:**
- Modify: `artifacts/api-server/src/routes/kpi/index.ts`

> A remoção da obrigatoriedade de meta na criação corporativa já foi feita na Task 3.

- [ ] **Step 1: PUT year-config ignora goal de corporativo**

No handler `PUT .../kpi/indicators/:indicatorId/years/:year`, trocar a busca do indicador (linhas ~938-940) para também trazer `rollupStrategy`:

```ts
  const [indicator] = await db.select({
    id: kpiIndicatorsTable.id,
    rollupStrategy: kpiIndicatorsTable.rollupStrategy,
  })
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, params.data.indicatorId), eq(kpiIndicatorsTable.organizationId, params.data.orgId)));
```

E trocar a linha do `goalStr` (linha ~944) por:

```ts
  // Corporativo: meta é derivada das filiais — qualquer goal manual é ignorado.
  const isCorporate = indicator.rollupStrategy != null;
  const goalStr = isCorporate
    ? null
    : body.data.goal !== null && body.data.goal !== undefined
      ? String(body.data.goal)
      : null;
```

- [ ] **Step 2: Rodar o teste de integração completo + typecheck**

Run: `pnpm typecheck`
Expected: sem erros.
Run: `pnpm exec vitest run artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts --project integration`
Expected: PASS (os 2 testes).

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/kpi/index.ts
git commit -m "feat(kpi): ignora meta manual de corporativo (PUT year-config)"
```

---

## Task 5: Contrato OpenAPI + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- (gerados) `lib/api-zod/**`, `lib/api-client-react/**`

- [ ] **Step 1: Adicionar os campos no schema `KpiYearConfig`**

Em `lib/api-spec/openapi.yaml`, no schema `KpiYearConfig` (após a propriedade `goal`, antes de `createdAt`), adicionar:

```yaml
        isGoalComputed:
          type: boolean
          description: True quando a meta foi calculada das filiais (corporativo).
        goalChildrenWithData:
          type: integer
          nullable: true
          description: Filiais com meta consideradas no cálculo (só quando isGoalComputed).
        goalChildrenTotal:
          type: integer
          nullable: true
          description: Total de filiais vinculadas (só quando isGoalComputed).
```

(Não adicionar a `required` — são opcionais; folhas não enviam.)

- [ ] **Step 2: Rodar o codegen**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: regenera `lib/api-zod` e `lib/api-client-react`; o tipo `KpiYearConfig` passa a ter `isGoalComputed?`, `goalChildrenWithData?`, `goalChildrenTotal?`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "chore(api): KpiYearConfig expõe isGoalComputed e contagem de filiais"
```

---

## Task 6: Diálogo de criação — remover campo de meta + prévia calculada

**Files:**
- Modify: `artifacts/web/src/pages/app/kpi/_components/corporate-create-dialog.tsx`
- Modify: `artifacts/web/src/pages/app/kpi/indicadores.tsx`

- [ ] **Step 1: Diálogo recebe metas dos filhos por prop**

Em `corporate-create-dialog.tsx`, na interface `Props`, adicionar:

```ts
  /** Meta (tolerância) do ano por indicador-filho, p/ a prévia calculada. */
  childGoals: Map<number, number | null>;
```

E adicionar `childGoals` aos parâmetros desestruturados de `CorporateCreateDialog`.

- [ ] **Step 2: Remover o estado/validação da meta e calcular a prévia**

Em `corporate-create-dialog.tsx`:

Remover as linhas de estado da meta:

```ts
  const [goal, setGoal] = useState("");
```

Remover, em `reset()`, a linha `setGoal("");`.

Remover o bloco de meta/validação:

```ts
  // Tolerância e responsável são obrigatórios.
  const goalNum = parseBrNumber(goal);
  const goalValid = goalNum != null;
```

Adicionar a prévia calculada (perto de onde `measureUnit`/`direction` são derivados):

```ts
  // Prévia da meta calculada: agrega as metas dos filhos selecionados pela
  // estratégia escolhida (mesma regra do backend). Filhos sem meta ficam de fora.
  const computedGoalPreview = useMemo(() => {
    const goals = selectedList
      .map((c) => childGoals.get(c.id))
      .filter((g): g is number => typeof g === "number" && Number.isFinite(g));
    if (goals.length === 0) return null;
    switch (strategy) {
      case "sum_values": return goals.reduce((a, v) => a + v, 0);
      case "average": return goals.reduce((a, v) => a + v, 0) / goals.length;
      case "min": return Math.min(...goals);
      case "max": return Math.max(...goals);
      default: return null;
    }
  }, [selectedList, childGoals, strategy]);
```

Ajustar `canSubmit` (remover `goalValid`):

```ts
  const canSubmit =
    effectiveName.trim().length > 0 &&
    selectedIds.size >= 2 &&
    (!isNonMonthly || referenceMonth != null) &&
    responsibleUserId != null;
```

Em `handleCreate`, remover `goal: goalNum,` do objeto `data`.

`parseBrNumber` deixa de ser usada — remover a função e, se aplicável, o import não utilizado (rodar typecheck pra confirmar).

- [ ] **Step 3: Trocar o input de meta pela prévia (read-only)**

Em `corporate-create-dialog.tsx`, substituir o bloco do campo "Tolerância / meta *" (o `<div className="space-y-1.5">` com `<Label>Tolerância / meta *</Label>` e o `<Input>`) por:

```tsx
          <div className="space-y-1.5">
            <Label>Tolerância / meta (calculada)</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {computedGoalPreview != null ? (
                <span className="font-medium text-foreground/90">
                  {formatKpiValue(computedGoalPreview, measureUnit)}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Selecione filiais com meta definida.
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Calculada das filiais pela estratégia escolhida — atualiza sozinha
              se a meta de uma filial mudar.
            </p>
          </div>
```

Ajustar o texto do rodapé do diálogo de `* Tolerância e responsável são obrigatórios.` para `* Responsável obrigatório.`.

- [ ] **Step 4: `indicadores.tsx` passa `childGoals` ao diálogo**

Em `indicadores.tsx`, na invocação do `<CorporateCreateDialog>` (linha ~1449), adicionar a prop:

```tsx
      <CorporateCreateDialog
        open={corporateCreateOpen}
        onClose={() => setCorporateCreateOpen(false)}
        orgId={orgId}
        year={year}
        indicators={indicators}
        childGoals={new Map(yearRows.map((r) => [r.indicator.id, r.yearConfig.goal ?? null]))}
      />
```

(`yearRows` já existe — `const { data: yearRows = [] } = useKpiYearData(orgId, year);`.)

- [ ] **Step 5: Typecheck + build do web**

Run: `pnpm typecheck`
Expected: sem erros (se sobrar import não usado de `parseBrNumber`, removê-lo).

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/pages/app/kpi/_components/corporate-create-dialog.tsx artifacts/web/src/pages/app/kpi/indicadores.tsx
git commit -m "feat(kpi-web): meta do corporativo vira prévia calculada (sem digitar)"
```

---

## Task 7: Esconder edição de tolerância para corporativo nas telas

**Files:**
- Modify: `artifacts/web/src/pages/app/kpi/indicadores.tsx`
- Modify: `artifacts/web/src/pages/app/kpi/lancamentos.tsx`

- [ ] **Step 1: `indicadores.tsx` — esconder campo "Tolerância (ano)" ao editar corporativo**

Em `indicadores.tsx`, no form (bloco do `<Label>Tolerância ({year})</Label>`, linhas ~1263-1271), envolver com condição usando `editingIndicator` (já existe no componente) e `isCorporateUnit` (já importado):

```tsx
              {editingIndicator && isCorporateUnit(editingIndicator.unit) ? (
                <div className="space-y-1.5">
                  <Label>Tolerância ({year})</Label>
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                    Calculada automaticamente das filiais.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Tolerância ({year})</Label>
                  <Input
                    type="number"
                    value={indicatorForm.goal}
                    onChange={(e) => setIndicatorForm((f) => ({ ...f, goal: e.target.value }))}
                    placeholder="Ex: 95"
                  />
                </div>
              )}
```

- [ ] **Step 2: `lancamentos.tsx` — esconder campo "Tolerância *" no config de corporativo**

Em `lancamentos.tsx`, no config dialog (bloco do `<Label>Tolerância *</Label>`, linhas ~820-828), usar `configDialog` (o `KpiYearRow` aberto) + `isCorporateUnit`:

Garantir o import (no topo do arquivo, junto aos imports de `@/lib/kpi-constants` se houver; senão adicionar):

```ts
import { isCorporateUnit } from "@/lib/kpi-constants";
```

Substituir o `<div>` do campo "Tolerância *" por:

```tsx
              {configDialog && isCorporateUnit(configDialog.indicator.unit) ? (
                <div className="space-y-1.5">
                  <Label>Tolerância</Label>
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                    Calculada automaticamente das filiais.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Tolerância *</Label>
                  <Input
                    type="number"
                    value={configForm.goal}
                    onChange={(e) => setConfigForm((f) => ({ ...f, goal: e.target.value }))}
                    placeholder="Ex: 98.9"
                  />
                </div>
              )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add artifacts/web/src/pages/app/kpi/indicadores.tsx artifacts/web/src/pages/app/kpi/lancamentos.tsx
git commit -m "feat(kpi-web): oculta edição manual de tolerância em corporativos"
```

---

## Task 8: Verificação final

- [ ] **Step 1: Typecheck + unit + build**

Run: `pnpm typecheck`
Expected: sem erros.
Run: `pnpm test:unit`
Expected: verde (inclui `rollup.unit.test.ts`).
Run: `pnpm build`
Expected: build OK.

- [ ] **Step 2: Integração (com DB de teste no ar)**

Run: `pnpm test:integration:up` (se ainda não estiver)
Run: `pnpm exec vitest run artifacts/api-server/tests/routes/kpi-corporate-goal.integration.test.ts --project integration`
Expected: PASS.
Run (opcional): `pnpm test:integration:down`

- [ ] **Step 3: Verificação manual rápida (opcional)**

Subir web+api locais (porta de teste, NÃO :3001/prod), criar um corporativo somando 2 indicadores com tolerância 1 cada e conferir que a meta aparece como 2 sem digitar; trocar a estratégia p/ média e conferir 1.

---

## Notas / fora de escopo

- **Carry-forward da meta dos filhos não é aplicado** ao cálculo da meta do corporativo (usa o config do ano). Se virar problema, refinar depois.
- Override manual da meta do corporativo não existe (decisão: 100% automática).
- O valor (não a meta) continua exatamente como hoje.
- Badge "↻ calculado" ao lado da tolerância do corporativo é polish opcional (usar `isGoalComputed`); não incluído para manter o escopo enxuto.
