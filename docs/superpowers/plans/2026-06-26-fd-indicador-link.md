# Vincular Indicador (KPI) a Fator de Desempenho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir vincular um indicador existente (módulo Indicadores/KPI) a um Fator de Desempenho (Segurança Viária), fazendo o fator consumir valor/meta/unidade do indicador em vez de exigir lançamento manual.

**Architecture:** Uma única coluna FK `kpi_indicator_id` em `road_safety_factors` carrega o vínculo. O backend só **persiste e serve** esse id (e bloqueia lançamento manual em fator vinculado). A **resolução de valor/meta é feita no frontend**, reaproveitando `useKpiYearData` (que já entrega valores mensais com compose-on-read para corporativo) — evitando duplicar a matemática de rollup no servidor e minimizando a superfície do contrato.

**Tech Stack:** Drizzle ORM (Postgres), Express 5, OpenAPI 3.1 + Orval (zod + react-query), React 19 + TanStack Query + Wouter, Vitest + Supertest.

## Global Constraints

- `pnpm typecheck` e `pnpm build` devem passar ao final.
- **Nunca** editar arquivos gerados à mão. Regerar com Orval. Como **não há ruby** neste ambiente, rodar o codegen com shim python3 (passos exatos na Task 2). Regen na spec atual produz diff zero (verificado).
- Pickers de seleção usam **SearchableSelect** (`@/components/ui/searchable-select`), nunca o `Select` nativo.
- Resolução de valor/meta do indicador vinculado é **frontend** (via `useKpiYearData`). O backend não devolve campos `linked*`.
- A coluna nova é aplicada no PROD por **DDL cirúrgico** (`ALTER TABLE ... ADD COLUMN`), nunca `pnpm db push`.
- Estilo: indentação 2 espaços, aspas duplas, trailing commas. `camelCase`/`PascalCase` conforme o entorno.

---

### Task 1: Coluna `kpiIndicatorId` no schema do fator

**Files:**
- Modify: `lib/db/src/schema/road-safety.ts`

**Interfaces:**
- Produces: coluna `roadSafetyFactorsTable.kpiIndicatorId` (`integer`, nullable, FK → `kpiIndicatorsTable.id`, `onDelete: "set null"`). O tipo inferido `RoadSafetyFactor` passa a ter `kpiIndicatorId: number | null`.

- [ ] **Step 1: Adicionar import do schema de KPI**

No topo de `lib/db/src/schema/road-safety.ts`, junto aos imports de tabelas, adicionar:

```ts
import { kpiIndicatorsTable } from "./kpi";
```

- [ ] **Step 2: Adicionar a coluna no Bloco B (após `monitoringDetail`)**

Em `roadSafetyFactorsTable`, logo após a linha `monitoringDetail: text("monitoring_detail"),` adicionar:

```ts
    /** Indicador (KPI) vinculado — quando setado, o fator consome valor/meta do
     * módulo Indicadores e o lançamento manual fica bloqueado. */
    kpiIndicatorId: integer("kpi_indicator_id").references(
      () => kpiIndicatorsTable.id,
      { onDelete: "set null" },
    ),
```

- [ ] **Step 3: Typecheck do pacote db**

Run: `pnpm --filter @workspace/db typecheck`
Expected: PASS (sem erros).

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/road-safety.ts
git commit -m "feat(road-safety): coluna kpi_indicator_id no fator de desempenho"
```

---

### Task 2: Contrato OpenAPI + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (schemas `RoadSafetyFactor`, `CreateRoadSafetyFactorBody`, `UpdateRoadSafetyFactorBody`)
- Regenerate (não editar à mão): `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`

**Interfaces:**
- Produces: `RoadSafetyFactor.kpiIndicatorId?: number | null` e o mesmo campo nos bodies de create/update, nos tipos gerados consumidos pelo frontend e pela rota.

- [ ] **Step 1: Adicionar `kpiIndicatorId` ao schema `RoadSafetyFactor`**

Em `lib/api-spec/openapi.yaml`, dentro de `RoadSafetyFactor.properties`, adicionar (ex.: logo após `monitoringDetail`):

```yaml
        kpiIndicatorId:
          type: integer
          nullable: true
          description: Indicador (KPI) vinculado — fonte do valor/meta exibidos. Null = monitoramento manual.
```

- [ ] **Step 2: Adicionar o mesmo campo a `CreateRoadSafetyFactorBody` e `UpdateRoadSafetyFactorBody`**

Em ambos os schemas, dentro de `properties` (ex.: após `monitoringDetail`):

```yaml
        kpiIndicatorId:
          type: integer
          nullable: true
          description: Vincular este fator a um indicador do módulo Indicadores. Null desvincula.
```

(Não adicionar a `required`.)

- [ ] **Step 3: Rodar o codegen (shim python3 no lugar do ruby)**

Run (a partir da raiz do worktree):

```bash
python3 -c "import yaml,json; json.dump(yaml.safe_load(open('lib/api-spec/openapi.yaml')), open('lib/api-spec/.openapi.codegen.json','w'), indent=2)" \
&& ./lib/api-spec/node_modules/.bin/orval --config lib/api-spec/orval.config.ts \
&& python3 -c "p='lib/api-zod/src/index.ts'; ls=open(p).readlines(); open(p,'w').writelines([l for l in ls if './generated/types' not in l])" \
&& rm -f lib/api-spec/.openapi.codegen.json
```

Expected: `🎉 api-client-react` e `🎉 zod` sem erro.

- [ ] **Step 4: Conferir que o campo entrou nos tipos gerados**

Run: `grep -rn "kpiIndicatorId" lib/api-client-react/src/generated lib/api-zod/src/generated | head`
Expected: aparece em `RoadSafetyFactor`, `CreateRoadSafetyFactorBody`, `UpdateRoadSafetyFactorBody` (schemas + zod).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/api-zod typecheck && pnpm --filter @workspace/api-client-react typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(road-safety): kpiIndicatorId no contrato OpenAPI (regen orval)"
```

---

### Task 3: Backend — persistir/validar vínculo, forçar monitoringForm, bloquear lançamento manual

**Files:**
- Modify: `artifacts/api-server/src/routes/road-safety/index.ts`
- Test: `artifacts/api-server/tests/routes/road-safety-indicator-link.integration.test.ts`

**Interfaces:**
- Consumes: `roadSafetyFactorsTable`, `kpiIndicatorsTable` de `@workspace/db`; `CreateRoadSafetyFactorBody`/`UpdateRoadSafetyFactorBody` (agora com `kpiIndicatorId`).
- Produces: resposta do fator inclui `kpiIndicatorId`; POST/PATCH validam o indicador e forçam `monitoringForm="indicator"` quando vinculado; POST measurement responde **409** em fator vinculado.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `artifacts/api-server/tests/routes/road-safety-indicator-link.integration.test.ts`:

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

async function createIndicator(context: TestOrgContext, name: string) {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/kpi/indicators`)
    .set(authHeader(context))
    .send({
      name,
      measurement: "x",
      formulaVariables: [{ key: "x", label: "X" }],
      formulaExpression: "x",
      unit: "Corporativo",
      measureUnit: "un",
      direction: "down",
      periodicity: "monthly",
      norms: [],
      goal: 10,
    });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("Road safety: vínculo com indicador (KPI)", () => {
  it("cria fator vinculado e força monitoringForm=indicator", async () => {
    const context = await createTestContext({ seed: "rs-link-create" });
    contexts.push(context);
    const indId = await createIndicator(context, `Idade veículos ${context.prefix}`);

    const res = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "Idade dos veículos", kpiIndicatorId: indId });

    expect(res.status).toBe(201);
    expect(res.body.kpiIndicatorId).toBe(indId);
    expect(res.body.monitoringForm).toBe("indicator");
  });

  it("rejeita vínculo a indicador de outra organização", async () => {
    const context = await createTestContext({ seed: "rs-link-org-a" });
    contexts.push(context);
    const other = await createTestContext({ seed: "rs-link-org-b" });
    contexts.push(other);
    const foreignInd = await createIndicator(other, `Estranho ${other.prefix}`);

    const res = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "X", kpiIndicatorId: foreignInd });

    expect(res.status).toBe(400);
  });

  it("PATCH vincula e desvincula", async () => {
    const context = await createTestContext({ seed: "rs-link-patch" });
    contexts.push(context);
    const indId = await createIndicator(context, `Ind ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "Y" });
    const factorId = created.body.id as number;

    const linked = await request(app)
      .patch(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`)
      .set(authHeader(context))
      .send({ kpiIndicatorId: indId });
    expect(linked.status).toBe(200);
    expect(linked.body.kpiIndicatorId).toBe(indId);
    expect(linked.body.monitoringForm).toBe("indicator");

    const unlinked = await request(app)
      .patch(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`)
      .set(authHeader(context))
      .send({ kpiIndicatorId: null });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.kpiIndicatorId).toBeNull();
  });

  it("bloqueia lançamento manual em fator vinculado (409)", async () => {
    const context = await createTestContext({ seed: "rs-link-block" });
    contexts.push(context);
    const indId = await createIndicator(context, `Ind ${context.prefix}`);

    const created = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
      .set(authHeader(context))
      .send({ type: "intermediate", name: "Z", kpiIndicatorId: indId });
    const factorId = created.body.id as number;

    const res = await request(app)
      .post(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/measurements`)
      .set(authHeader(context))
      .send({ value: 5, referenceDate: "2026-01-31" });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run artifacts/api-server/tests/routes/road-safety-indicator-link.integration.test.ts --project node-integration` (ajustar o nome do project se necessário — ver `vitest.config.ts`).
Expected: FAIL (kpiIndicatorId ignorado; measurement retorna 201).

- [ ] **Step 3: Importar `kpiIndicatorsTable` e serializar o campo**

No import de `@workspace/db` (topo do arquivo) adicionar `kpiIndicatorsTable`. Em `serializeFactor`, após `actionPlanRef: r.actionPlanRef ?? null,` adicionar:

```ts
    kpiIndicatorId: r.kpiIndicatorId ?? null,
```

- [ ] **Step 4: Helper de validação do vínculo (após `resolveResponsible`)**

```ts
/**
 * Valida que um kpiIndicatorId pertence à org. Retorna o id (ou null para
 * desvincular), ou `undefined` após enviar 400 — callers devem abortar.
 */
async function resolveIndicatorLink(
  kpiIndicatorId: number | null,
  orgId: number,
  res: import("express").Response,
): Promise<number | null | undefined> {
  if (kpiIndicatorId === null) return null;
  const [ind] = await db
    .select({ id: kpiIndicatorsTable.id })
    .from(kpiIndicatorsTable)
    .where(and(eq(kpiIndicatorsTable.id, kpiIndicatorId), eq(kpiIndicatorsTable.organizationId, orgId)));
  if (!ind) {
    res.status(400).json({ error: "kpiIndicatorId não corresponde a um indicador desta organização" });
    return undefined;
  }
  return ind.id;
}
```

- [ ] **Step 5: POST factor — resolver e gravar o vínculo**

No handler POST, após resolver `responsibleUserId` (e antes do `nextFactorCode`), adicionar:

```ts
    const kpiIndicatorId = await resolveIndicatorLink(
      body.data.kpiIndicatorId ?? null,
      params.data.orgId,
      res,
    );
    if (kpiIndicatorId === undefined) return;
```

No objeto `.values({...})`, adicionar (e ajustar `monitoringForm`):

```ts
        kpiIndicatorId,
        monitoringForm: kpiIndicatorId != null ? "indicator" : (body.data.monitoringForm ?? null),
```

(remover a linha antiga `monitoringForm: body.data.monitoringForm ?? null,`).

- [ ] **Step 6: PATCH factor — link/unlink**

No bloco de montagem do `updateData`, após o tratamento de `monitoringForm`, adicionar:

```ts
    if (d.kpiIndicatorId !== undefined) {
      const resolved = await resolveIndicatorLink(d.kpiIndicatorId, params.data.orgId, res);
      if (resolved === undefined) return;
      updateData.kpiIndicatorId = resolved;
      if (resolved != null) updateData.monitoringForm = "indicator";
    }
```

- [ ] **Step 7: POST measurement — bloquear fator vinculado**

Na consulta que carrega o fator antes de inserir a medição, trocar o select para incluir o vínculo e abortar se houver:

```ts
    const [factor] = await db
      .select({ id: roadSafetyFactorsTable.id, kpiIndicatorId: roadSafetyFactorsTable.kpiIndicatorId })
      .from(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.id, params.data.factorId),
          eq(roadSafetyFactorsTable.organizationId, params.data.orgId),
        ),
      );
    if (!factor) { res.status(404).json({ error: "Fator não encontrado" }); return; }
    if (factor.kpiIndicatorId != null) {
      res.status(409).json({
        error: "Este fator é monitorado por um indicador. Lance os valores no módulo Indicadores.",
      });
      return;
    }
```

- [ ] **Step 8: Rodar os testes — devem passar**

Run: `pnpm exec vitest run artifacts/api-server/tests/routes/road-safety-indicator-link.integration.test.ts`
Expected: PASS (4 testes). Se o ambiente não tiver DB de teste, registrar e validar via typecheck + revisão.

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/routes/road-safety/index.ts artifacts/api-server/tests/routes/road-safety-indicator-link.integration.test.ts
git commit -m "feat(road-safety): vínculo com indicador no backend (validação, monitoringForm, bloqueio de lançamento)"
```

---

### Task 4: Frontend client — resolução de valor/meta do indicador vinculado

**Files:**
- Modify: `artifacts/web/src/lib/road-safety-client.ts`
- Test: `artifacts/web/tests/lib/road-safety-client.unit.test.ts`

**Interfaces:**
- Consumes: `useKpiYearData` de `@/lib/kpi-client`; tipo `KpiYearRow`, `RoadSafetyFactor` de `@workspace/api-client-react`.
- Produces:
  - `type LinkedIndicatorInfo = { id: number; name: string; unit: string | null; measureUnit: string | null; direction: "up" | "down"; latestValue: number | null; latestMonth: number | null; goal: number | null }`
  - `buildLinkedIndicatorMap(rows: KpiYearRow[]): Map<number, LinkedIndicatorInfo>` (puro)
  - `useLinkedIndicators(orgId: number, year: number): Map<number, LinkedIndicatorInfo>`
  - `isLinkedToIndicator(f): boolean`, `factorCurrentValue(f, info?): number | null`, `factorGoalValue(f, info?): number | null`, `factorMeasureUnit(f, info?): string | null`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `artifacts/web/tests/lib/road-safety-client.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { KpiYearRow, RoadSafetyFactor } from "@workspace/api-client-react";
import {
  buildLinkedIndicatorMap,
  factorCurrentValue,
  factorGoalValue,
  factorMeasureUnit,
  isLinkedToIndicator,
} from "@/lib/road-safety-client";

function row(over: Partial<KpiYearRow> & { id: number }): KpiYearRow {
  return {
    indicator: {
      id: over.id, organizationId: 1, name: `Ind ${over.id}`, measurement: "",
      formulaVariables: [], formulaExpression: "", unit: "Corporativo", measureUnit: "%",
      direction: "down", periodicity: "monthly", norms: [], createdAt: "", updatedAt: "",
    },
    yearConfig: { id: 1, organizationId: 1, indicatorId: over.id, year: 2026, goal: 4, createdAt: "", updatedAt: "" },
    monthlyValues: over.monthlyValues ?? [],
    feedStatus: "fed",
  } as KpiYearRow;
}
const mv = (month: number, value: number | null) =>
  ({ month, value, monthlyValueId: null, justification: null, justificationsCount: 0, actionPlansCount: 0 }) as KpiYearRow["monthlyValues"][number];

describe("buildLinkedIndicatorMap", () => {
  it("pega o último mês não-nulo como valor atual e a meta do ano", () => {
    const map = buildLinkedIndicatorMap([
      row({ id: 7, monthlyValues: [mv(1, 5), mv(2, null), mv(3, 4.2)] }),
    ]);
    const info = map.get(7)!;
    expect(info.latestValue).toBe(4.2);
    expect(info.latestMonth).toBe(3);
    expect(info.goal).toBe(4);
    expect(info.measureUnit).toBe("%");
  });
  it("latestValue null quando não há mês preenchido", () => {
    const map = buildLinkedIndicatorMap([row({ id: 8, monthlyValues: [mv(1, null)] })]);
    expect(map.get(8)!.latestValue).toBeNull();
  });
});

describe("helpers de valor efetivo", () => {
  const linked = { kpiIndicatorId: 7, latestValue: 1, goal: 2, measureUnit: "x" } as unknown as RoadSafetyFactor;
  const manual = { kpiIndicatorId: null, latestValue: 9, goal: 8, measureUnit: "un" } as unknown as RoadSafetyFactor;
  const info = { id: 7, name: "I", unit: null, measureUnit: "%", direction: "down" as const, latestValue: 4.2, latestMonth: 3, goal: 4 };

  it("vinculado usa o indicador", () => {
    expect(isLinkedToIndicator(linked)).toBe(true);
    expect(factorCurrentValue(linked, info)).toBe(4.2);
    expect(factorGoalValue(linked, info)).toBe(4);
    expect(factorMeasureUnit(linked, info)).toBe("%");
  });
  it("não vinculado usa o próprio fator", () => {
    expect(isLinkedToIndicator(manual)).toBe(false);
    expect(factorCurrentValue(manual)).toBe(9);
    expect(factorGoalValue(manual)).toBe(8);
    expect(factorMeasureUnit(manual)).toBe("un");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run artifacts/web/tests/lib/road-safety-client.unit.test.ts --project web-unit`
Expected: FAIL (exports inexistentes).

- [ ] **Step 3: Implementar em `road-safety-client.ts`**

Adicionar imports no topo:

```ts
import { useMemo } from "react";
import type { KpiYearRow } from "@workspace/api-client-react";
import { useKpiYearData } from "@/lib/kpi-client";
```

Adicionar ao final do arquivo:

```ts
// ─── Vínculo com indicador (KPI) ─────────────────────────────────────────────

export type LinkedIndicatorInfo = {
  id: number;
  name: string;
  unit: string | null;
  measureUnit: string | null;
  direction: "up" | "down";
  latestValue: number | null;
  latestMonth: number | null;
  goal: number | null;
};

/** Mapa indicatorId → info, com o último mês preenchido como "valor atual". */
export function buildLinkedIndicatorMap(rows: KpiYearRow[]): Map<number, LinkedIndicatorInfo> {
  const map = new Map<number, LinkedIndicatorInfo>();
  for (const r of rows) {
    let latestValue: number | null = null;
    let latestMonth: number | null = null;
    for (const m of [...r.monthlyValues].sort((a, b) => a.month - b.month)) {
      if (m.value != null) {
        latestValue = m.value;
        latestMonth = m.month;
      }
    }
    map.set(r.indicator.id, {
      id: r.indicator.id,
      name: r.indicator.name,
      unit: r.indicator.unit ?? null,
      measureUnit: r.indicator.measureUnit ?? null,
      direction: r.indicator.direction,
      latestValue,
      latestMonth,
      goal: r.yearConfig.goal ?? null,
    });
  }
  return map;
}

export function useLinkedIndicators(orgId: number, year: number): Map<number, LinkedIndicatorInfo> {
  const { data: rows = [] } = useKpiYearData(orgId, year);
  return useMemo(() => buildLinkedIndicatorMap(rows), [rows]);
}

type LinkableFactor = Pick<RoadSafetyFactor, "kpiIndicatorId" | "latestValue" | "goal" | "measureUnit">;

export function isLinkedToIndicator(f: Pick<RoadSafetyFactor, "kpiIndicatorId">): boolean {
  return f.kpiIndicatorId != null;
}

export function factorCurrentValue(f: LinkableFactor, info?: LinkedIndicatorInfo | null): number | null {
  if (f.kpiIndicatorId != null && info) return info.latestValue;
  return f.latestValue ?? null;
}

export function factorGoalValue(f: LinkableFactor, info?: LinkedIndicatorInfo | null): number | null {
  if (f.kpiIndicatorId != null && info) return info.goal;
  return f.goal ?? null;
}

export function factorMeasureUnit(f: LinkableFactor, info?: LinkedIndicatorInfo | null): string | null {
  if (f.kpiIndicatorId != null && info) return info.measureUnit;
  return f.measureUnit ?? null;
}
```

> Nota: `latestValue` e `measureUnit` já existem em `RoadSafetyFactor` (campos computados/own). `kpiIndicatorId` veio do codegen (Task 2).

- [ ] **Step 4: Rodar os testes — devem passar**

Run: `pnpm exec vitest run artifacts/web/tests/lib/road-safety-client.unit.test.ts --project web-unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/lib/road-safety-client.ts artifacts/web/tests/lib/road-safety-client.unit.test.ts
git commit -m "feat(road-safety): resolução frontend do valor/meta do indicador vinculado"
```

---

### Task 5: Cadastro — seletor de indicador + bloqueio de meta/unidade

**Files:**
- Modify: `artifacts/web/src/pages/app/road-safety/_components/cadastro.tsx`

**Interfaces:**
- Consumes: `SearchableSelect`, `useKpiIndicators`, helpers da Task 4. Envia `kpiIndicatorId` no payload.

- [ ] **Step 1: Imports**

Adicionar:

```ts
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useKpiIndicators } from "@/lib/kpi-client";
```

E em `@/lib/road-safety-client`, incluir `type WithKpiLink` não é necessário — `kpiIndicatorId` já está no tipo gerado.

- [ ] **Step 2: Campo no `FormData` e `emptyForm`**

Em `type FormData`, adicionar `kpiIndicatorId: string;`. Em `emptyForm()`, adicionar `kpiIndicatorId: "",`.

- [ ] **Step 3: Prefill**

No `setForm({...})` do `useEffect`, adicionar:

```ts
      kpiIndicatorId: factor.kpiIndicatorId != null ? String(factor.kpiIndicatorId) : "",
```

- [ ] **Step 4: Buscar indicadores e montar opções**

Dentro do componente:

```ts
  const { data: indicators = [], isLoading: loadingIndicators } = useKpiIndicators(orgId);
  const indicatorOptions = useMemo(
    () =>
      indicators.map((i) => ({
        value: String(i.id),
        label: i.unit ? `${i.name} · ${i.unit}` : i.name,
      })),
    [indicators],
  );
  const linkedToIndicator = form.monitoringForm === "indicator" && form.kpiIndicatorId !== "";
```

- [ ] **Step 5: Render do seletor no Bloco B**

No Bloco B, logo após o `Field` "Forma de monitoramento", quando a forma for "indicator", renderizar o seletor:

```tsx
        {form.monitoringForm === "indicator" ? (
          <Field label="Indicador vinculado" full>
            <SearchableSelect
              value={form.kpiIndicatorId}
              onChange={(v) => set("kpiIndicatorId", v)}
              options={indicatorOptions}
              placeholder="Selecione um indicador do módulo Indicadores"
              searchPlaceholder="Buscar indicador..."
              isLoading={loadingIndicators}
              emptyMessage={
                indicators.length === 0
                  ? "Nenhum indicador cadastrado no módulo Indicadores."
                  : "Nenhum indicador encontrado"
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Vinculado: o valor atual, a unidade e a meta deste fator passam a vir do indicador. O lançamento manual fica desabilitado.
            </p>
          </Field>
        ) : null}
```

- [ ] **Step 6: Desabilitar Meta e Unidade quando vinculado**

Nos `Field` "Unidade de medida" e "Meta do período", passar `disabled={linkedToIndicator}` aos `Input` e, quando `linkedToIndicator`, mostrar o placeholder "Vem do indicador". Ex. para a Meta:

```tsx
          <Input
            type="number"
            value={form.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder={linkedToIndicator ? "Vem do indicador" : "Ex: 100"}
            disabled={linkedToIndicator}
            className={cn(linkedToIndicator && "bg-muted/50 text-muted-foreground")}
          />
```

(idem para "Unidade de medida").

- [ ] **Step 7: Incluir no payload do `handleSave`**

No objeto `payload`, adicionar:

```ts
      kpiIndicatorId: form.kpiIndicatorId ? Number(form.kpiIndicatorId) : null,
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add artifacts/web/src/pages/app/road-safety/_components/cadastro.tsx
git commit -m "feat(road-safety): seletor de indicador no cadastro do fator (SearchableSelect)"
```

---

### Task 6: Painel — exibir valor/meta do indicador vinculado

**Files:**
- Modify: `artifacts/web/src/pages/app/road-safety/_components/painel.tsx`

**Interfaces:**
- Consumes: `useLinkedIndicators`, `factorCurrentValue`, `factorGoalValue`, `factorMeasureUnit`, `isLinkedToIndicator` (Task 4).

- [ ] **Step 1: Imports e ícone**

```ts
import { AlertTriangle, Link2 } from "lucide-react";
import {
  // ...existentes...
  factorCurrentValue,
  factorGoalValue,
  factorMeasureUnit,
  isLinkedToIndicator,
  useLinkedIndicators,
} from "@/lib/road-safety-client";
```

- [ ] **Step 2: Carregar o mapa do ano corrente**

Dentro do componente:

```ts
  const currentYear = new Date().getFullYear();
  const linked = useLinkedIndicators(orgId, currentYear);
```

- [ ] **Step 3: Usar valores efetivos nas colunas**

No `filtered.map`, antes do `return`, resolver:

```ts
                const info = f.kpiIndicatorId != null ? linked.get(f.kpiIndicatorId) ?? null : null;
                const unit = factorMeasureUnit(f, info);
```

Trocar as células "Indicador atual" e "Meta":

```tsx
                    <TableCell className="tabular-nums">
                      <div className="flex items-center gap-1.5">
                        {fmt(factorCurrentValue(f, info), unit)}
                        {isLinkedToIndicator(f) && info ? (
                          <Link2
                            className="h-3 w-3 shrink-0 text-blue-500"
                            aria-label={`Vinculado ao indicador ${info.name}`}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {fmt(factorGoalValue(f, info), unit)}
                    </TableCell>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/road-safety/_components/painel.tsx
git commit -m "feat(road-safety): painel mostra valor/meta do indicador vinculado"
```

---

### Task 7: Lançamentos — fator vinculado remete ao módulo Indicadores

**Files:**
- Modify: `artifacts/web/src/pages/app/road-safety/_components/lancamentos.tsx`

**Interfaces:**
- Consumes: `useKpiIndicators` (nome do indicador), `useLocation` (wouter) para navegar a `/app/kpi/indicadores#ind-card-{id}`.

- [ ] **Step 1: Imports**

```ts
import { useLocation } from "wouter";
import { Link2 } from "lucide-react";
import { useKpiIndicators } from "@/lib/kpi-client";
```

- [ ] **Step 2: Resolver o indicador do fator selecionado**

Dentro do componente:

```ts
  const [, navigate] = useLocation();
  const { data: indicators = [] } = useKpiIndicators(orgId);
  const linkedIndicator =
    factor?.kpiIndicatorId != null
      ? indicators.find((i) => i.id === factor.kpiIndicatorId) ?? null
      : null;
```

- [ ] **Step 3: Substituir o formulário manual quando vinculado**

Envolver o bloco `{/* New launch */}` num condicional: se `factor && factor.kpiIndicatorId != null`, renderizar o painel informativo no lugar do formulário:

```tsx
      {factor && factor.kpiIndicatorId != null ? (
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Link2 className="h-4 w-4 text-blue-500" aria-hidden />
            Monitorado por indicador
          </div>
          <p className="text-sm text-muted-foreground">
            Este fator é monitorado pelo indicador{" "}
            <b className="text-foreground">
              {linkedIndicator ? linkedIndicator.name : `#${factor.kpiIndicatorId}`}
            </b>
            {linkedIndicator?.unit ? ` (${linkedIndicator.unit})` : ""}. Os lançamentos são feitos no módulo Indicadores.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate(`/app/kpi/indicadores#ind-card-${factor.kpiIndicatorId}`)}
          >
            Abrir nos Indicadores
          </Button>
        </div>
      ) : (
        /* ...formulário manual atual... */
      )}
```

(O lado direito "Histórico" pode permanecer; para fator vinculado não haverá medições manuais e mostrará o estado vazio — aceitável nesta fase.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/road-safety/_components/lancamentos.tsx
git commit -m "feat(road-safety): lançamento de fator vinculado remete ao módulo Indicadores"
```

---

### Task 8: Verificação final + diário + nota de DDL

**Files:** nenhum (verificação) + `docs/diario` via script.

- [ ] **Step 1: Typecheck + testes unitários + build**

Run:
```bash
pnpm typecheck
pnpm exec vitest run --project web-unit --project node-unit
pnpm build
```
Expected: tudo verde. (Integração precisa de DB de teste — rodar `pnpm test:integration` se disponível; senão, registrar.)

- [ ] **Step 2: Registrar a DDL de PROD (NÃO executar sem "go")**

```sql
ALTER TABLE road_safety_factors
  ADD COLUMN kpi_indicator_id integer
  REFERENCES kpi_indicators(id) ON DELETE SET NULL;
```

- [ ] **Step 3: Diário de bordo**

`python3 scripts/diario-add.py --modulo "Segurança Viária / Indicadores" --titulo "Vínculo de indicador no Fator de Desempenho" --file <entrada.md>`

## Self-Review

- **Cobertura da spec:** modelo de dados (T1), contrato (T2), backend persistência/validação/bloqueio (T3), resolução frontend (T4), cadastro/picker (T5), painel (T6), lançar (T7), deploy/DDL + diário (T8). ✔
- **Sem placeholders:** todos os passos têm código real. ✔
- **Consistência de tipos:** `kpiIndicatorId` (number|null) coerente entre schema, contrato, rota e frontend; helpers usam `LinkedIndicatorInfo` definido na T4 e consumido em T6. ✔
