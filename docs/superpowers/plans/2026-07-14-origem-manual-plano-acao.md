# Origem escolhível ao criar ação dentro do módulo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem cria uma ação dentro do próprio módulo de Gestão de Ações escolhe a origem num listbox (Melhoria de Processo — padrão, Corretiva, Não atendimento a requisito da norma), em vez de a ação nascer sempre com a origem genérica `manual`.

**Architecture:** As três origens entram como valores novos do enum `action_plan_source_module` (append-only). Como o filtro de origem, o badge da listagem, o badge da ficha, o resumo `bySourceModule` e o painel executivo já são dirigidos por esse enum, eles passam a funcionar sem código novo — só precisam de rótulo. O backend trata as três como origens livres (sem entidade a validar), igual a `manual`/`incident`/`rac`. No front, um campo "Origem" aparece só quando o diálogo é aberto pelo hub (sem `source`), e a escolha sugere o Tipo.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), Express 5, Zod, OpenAPI 3.1 + Orval, React 19, Vitest (`node-unit`, `web-unit`, `integration`), supertest, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-14-origem-manual-plano-acao-design.md`

## Global Constraints

- Valores do enum, exatos: `improvement`, `corrective`, `norm_requirement`.
- Rótulos exibidos, exatos: `Melhoria de Processo`, `Corretiva`, `Não atendimento a requisito da norma`.
- Origem padrão no diálogo: `improvement` (Melhoria de Processo).
- Sugestão de Tipo: `improvement` → Tipo `improvement`; `corrective` → Tipo `corrective`; `norm_requirement` → Tipo `corrective`. Sempre editável pelo usuário depois.
- `manual` **permanece** no enum e nos rótulos (5 planos legados na conta demo, org 3). Só **não** aparece no diálogo de criação. Não migrar dados.
- Nenhuma mudança no comportamento do diálogo quando aberto a partir de outro módulo (`source` presente).
- `pnpm typecheck` tem de passar (é o check obrigatório da main).
- Nunca rodar `pnpm --filter @workspace/db push` puro: aponta para a produção e arrasta drift de outras branches. Banco de teste: `pnpm test:integration:db:push`. Produção: DDL cirúrgica (Task 5).
- Testes de integração exigem `TEST_ENV=integration` (sem isso o Vitest carrega o `.env` de produção).
- `corrective` e `improvement` passam a existir em **dois enums diferentes**: `actionPlanTypeEnum` (campo "Tipo") e `actionPlanSourceModuleEnum` (campo "Origem"). São campos distintos, com tipos TS distintos.
- Não editar arquivos gerados (`lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`) — só regerar via codegen.

---

## File Structure

| Arquivo | Responsabilidade | Task |
| --- | --- | --- |
| `lib/db/src/schema/action-plans.ts` | Type + pgEnum das origens | 1 |
| `lib/api-spec/openapi.yaml` | Enum `ActionPlanSourceModule` no contrato | 1 |
| `artifacts/api-server/src/routes/action-plans.ts` | `SOURCE_MODULE_OWNER` (módulo dono de cada origem) | 1 |
| `artifacts/api-server/src/services/action-plans/validate-source.ts` | Origens livres não exigem entidade | 1 |
| `artifacts/api-server/tests/services/action-plans/validate-source.unit.test.ts` | **Criar** — teste da validação | 1 |
| `artifacts/api-server/src/services/action-plans/source-context.ts` | Rótulo de contexto por origem | 2 |
| `artifacts/api-server/tests/routes/action-plans-manual-origin.integration.test.ts` | **Criar** — POST + rótulo + filtro | 2 |
| `artifacts/web/src/pages/app/planos-acao/_components/manual-origin.ts` | **Criar** — opções da origem manual + Tipo sugerido (puro) | 3 |
| `artifacts/web/tests/pages/action-plan-manual-origin.unit.test.ts` | **Criar** — teste dos helpers | 3 |
| `artifacts/web/src/lib/action-plans-client.ts` | `SOURCE_MODULE_LABELS` das três origens | 3 |
| `artifacts/web/src/pages/app/planos-acao/_components/painel-executivo.tsx` | Cor de cada origem nova | 3 |
| `artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx` | Campo "Origem" + sugestão de Tipo + envio | 4 |
| `artifacts/web/tests/pages/nova-acao-dialog.unit.test.tsx` | **Criar** — teste do diálogo | 4 |

---

### Task 1: Origens novas no enum, no contrato, na permissão e na validação

Depois desta task o backend aceita criar um plano com as três origens novas. O TypeScript é o guarda-costas: `SOURCE_MODULE_OWNER` é um `Record` exaustivo — se faltar um valor, o build quebra.

**Files:**
- Modify: `lib/db/src/schema/action-plans.ts:15-26` (type) e `:121-133` (pgEnum)
- Modify: `lib/api-spec/openapi.yaml:18753-18755`
- Modify: `artifacts/api-server/src/routes/action-plans.ts:102-114`
- Modify: `artifacts/api-server/src/services/action-plans/validate-source.ts:77-83`
- Test: `artifacts/api-server/tests/services/action-plans/validate-source.unit.test.ts` (criar)

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: o type `ActionPlanSourceModule` (exportado de `@workspace/db`) passa a incluir `"improvement" | "corrective" | "norm_requirement"`. Todas as tasks seguintes dependem disso.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/tests/services/action-plans/validate-source.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateSourceRef } from "../../../src/services/action-plans/validate-source";

// As origens criadas dentro do próprio módulo são livres: não apontam para
// nenhuma entidade, então não há o que validar (mesmo caminho de `manual`).
describe("validateSourceRef — origens livres criadas no módulo", () => {
  it("aceita 'improvement' sem sourceRef vinculado a entidade", async () => {
    expect(await validateSourceRef(1, "improvement", {})).toBeNull();
  });

  it("aceita 'corrective' sem sourceRef vinculado a entidade", async () => {
    expect(await validateSourceRef(1, "corrective", {})).toBeNull();
  });

  it("aceita 'norm_requirement' sem sourceRef vinculado a entidade", async () => {
    expect(await validateSourceRef(1, "norm_requirement", {})).toBeNull();
  });

  it("aceita contexto livre em manualContext", async () => {
    expect(
      await validateSourceRef(1, "improvement", { manualContext: "Fila no recebimento" }),
    ).toBeNull();
  });

  it("continua exigindo a célula de origem quando a origem é 'kpi'", async () => {
    expect(await validateSourceRef(1, "kpi", {})).toBe(
      "sourceRef.kpiMonthlyValueId é obrigatório quando sourceModule=kpi",
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/validate-source.unit.test.ts`

Expected: FAIL. O TypeScript não conhece os valores novos — erro do tipo `Argument of type '"improvement"' is not assignable to parameter of type 'ActionPlanSourceModule'`.

- [ ] **Step 3: Adicionar os valores ao schema do banco**

Em `lib/db/src/schema/action-plans.ts`, o type (linhas 9-26) fica:

```ts
/**
 * Origin that spawned the action. The action module is the unified treatment
 * hub, so origins span every SGI source. Origins created inside the module
 * itself (no upstream entity) are the ones the user picks in the "Origem"
 * listbox: `improvement`, `corrective`, `norm_requirement`. `manual` is the
 * legacy value they replaced — still readable, never written by new actions.
 * The enum is append-only — adding values is a safe `push`.
 *
 * Careful: `improvement` and `corrective` also exist in `actionPlanTypeEnum`
 * (the "Tipo" field). Different columns, different TS types — the origin only
 * *suggests* the type in the dialog.
 */
export type ActionPlanSourceModule =
  | "kpi"
  | "swot"
  | "manual"
  | "improvement"
  | "corrective"
  | "norm_requirement"
  | "nonconformity"
  | "audit_finding"
  | "risk"
  | "training"
  | "environmental"
  | "road_safety"
  | "incident"
  | "rac";
```

E o pgEnum (linhas 121-133):

```ts
export const actionPlanSourceModuleEnum = pgEnum("action_plan_source_module", [
  "kpi",
  "swot",
  "manual",
  "improvement",
  "corrective",
  "norm_requirement",
  "nonconformity",
  "audit_finding",
  "risk",
  "training",
  "environmental",
  "road_safety",
  "incident",
  "rac",
]);
```

- [ ] **Step 4: Adicionar os valores ao contrato OpenAPI**

Em `lib/api-spec/openapi.yaml:18753-18755`:

```yaml
    ActionPlanSourceModule:
      type: string
      enum: [kpi, swot, manual, improvement, corrective, norm_requirement, nonconformity, audit_finding, risk, training, environmental, road_safety, incident, rac]
```

- [ ] **Step 5: Regerar o cliente e as validações**

Run: `pnpm --filter @workspace/api-spec codegen`

Expected: regenera `lib/api-zod/src/generated/` e `lib/api-client-react/src/generated/`. Confirmar com:

`grep -c "norm_requirement" lib/api-zod/src/generated/api.ts lib/api-client-react/src/generated/api.schemas.ts`

Expected: contagem ≥ 1 em cada arquivo. (O codegen precisa de `python3` no PATH.)

- [ ] **Step 6: Mapear o módulo dono das origens novas**

Em `artifacts/api-server/src/routes/action-plans.ts:102-114`, o `Record` exaustivo passa a ser:

```ts
const SOURCE_MODULE_OWNER: Record<ActionPlanSourceModule, AppModule> = {
  kpi: "kpi",
  rac: "kpi",
  swot: "swot",
  nonconformity: "governance",
  audit_finding: "governance",
  risk: "governance",
  training: "employees",
  environmental: "environmental",
  road_safety: "roadSafety",
  incident: "roadSafety",
  manual: "actionPlans",
  improvement: "actionPlans",
  corrective: "actionPlans",
  norm_requirement: "actionPlans",
};
```

- [ ] **Step 7: Tratar as origens novas como livres na validação**

Em `artifacts/api-server/src/services/action-plans/validate-source.ts:77-83`:

```ts
    case "incident":
    case "manual":
    case "improvement":
    case "corrective":
    case "norm_requirement":
    case "rac":
      return null; // free-form / self-describing origins, no entity to validate
    default:
      return null;
  }
}
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/validate-source.unit.test.ts`

Expected: PASS — 5 testes.

- [ ] **Step 9: Rodar o typecheck**

Run: `pnpm typecheck`

Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add lib/db/src/schema/action-plans.ts lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/src/services/action-plans/validate-source.ts artifacts/api-server/tests/services/action-plans/validate-source.unit.test.ts
git commit -m "feat(acoes): origens improvement/corrective/norm_requirement no enum e no contrato"
```

---

### Task 2: Rótulo de contexto das origens novas (ficha e listagem)

Sem isto, a ficha e a listagem exibiriam a string crua do enum (`improvement`) como contexto de origem, porque `resolveOne` cai no `default`.

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/source-context.ts:259-274`
- Test: `artifacts/api-server/tests/routes/action-plans-manual-origin.integration.test.ts` (criar)

**Interfaces:**
- Consumes: `ActionPlanSourceModule` com os três valores novos (Task 1).
- Produces: `resolveSourceContexts()` devolve `label` = `"Melhoria de Processo · <contexto>"` / `"Corretiva · <contexto>"` / `"Não atendimento a requisito da norma · <contexto>"`; sem contexto livre, só o nome da origem.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/api-server/tests/routes/action-plans-manual-origin.integration.test.ts`. Ele cobre o caminho completo: POST com origem nova → 201, rótulo de contexto no GET, e filtro por origem.

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
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

describe("planos de ação criados dentro do módulo (origem escolhida)", () => {
  it("cria com origem 'improvement' sem entidade vinculada e devolve o rótulo da origem", async () => {
    const ctx = await createTestContext({ seed: "origem-improvement" });
    contexts.push(ctx);

    const created = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx.token))
      .send({
        sourceModule: "improvement",
        sourceRef: { manualContext: "Fila no recebimento de mercadorias" },
        title: "Reduzir tempo de recebimento",
        actionType: "improvement",
      });

    expect(created.status).toBe(201);
    expect(created.body.sourceModule).toBe("improvement");

    const detail = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${created.body.id}`)
      .set(authHeader(ctx.token));

    expect(detail.status).toBe(200);
    expect(detail.body.sourceContext.label).toBe(
      "Melhoria de Processo · Fila no recebimento de mercadorias",
    );
  });

  it("usa só o nome da origem quando não há contexto livre", async () => {
    const ctx = await createTestContext({ seed: "origem-sem-contexto" });
    contexts.push(ctx);

    const created = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx.token))
      .send({ sourceModule: "norm_requirement", sourceRef: {}, title: "Fechar lacuna da ISO 9001 9.1" });

    expect(created.status).toBe(201);

    const detail = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${created.body.id}`)
      .set(authHeader(ctx.token));

    expect(detail.body.sourceContext.label).toBe("Não atendimento a requisito da norma");
  });

  it("filtra a listagem por origem", async () => {
    const ctx = await createTestContext({ seed: "origem-filtro" });
    contexts.push(ctx);

    for (const [sourceModule, title] of [
      ["improvement", "Melhoria A"],
      ["corrective", "Corretiva B"],
    ] as const) {
      const res = await request(app)
        .post(`/api/organizations/${ctx.organizationId}/action-plans`)
        .set(authHeader(ctx.token))
        .send({ sourceModule, sourceRef: {}, title });
      expect(res.status).toBe(201);
    }

    const list = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans`)
      .query({ sourceModule: "corrective" })
      .set(authHeader(ctx.token));

    expect(list.status).toBe(200);
    expect(list.body.map((p: { title: string }) => p.title)).toEqual(["Corretiva B"]);
    expect(list.body[0].sourceContext.label).toBe("Corretiva");
  });
});
```

- [ ] **Step 2: Preparar o banco de teste e rodar o teste — confirmar que falha**

O enum novo precisa existir no banco de teste:

```bash
pnpm test:integration:up
pnpm test:integration:db:push
```

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-manual-origin.integration.test.ts`

Expected: FAIL nos dois primeiros testes — `sourceContext.label` volta `"improvement"` / `"norm_requirement"` (string crua do `default` de `resolveOne`) em vez do rótulo em português.

- [ ] **Step 3: Implementar os rótulos**

Em `artifacts/api-server/src/services/action-plans/source-context.ts`, dentro do `switch (r.sourceModule)` de `resolveOne`, logo depois do `case "manual"` (linha 263-266):

```ts
    case "improvement": {
      const ctx = typeof ref.manualContext === "string" ? ref.manualContext.trim() : "";
      return { label: ctx ? `Melhoria de Processo · ${truncate(ctx)}` : "Melhoria de Processo", kpi: null };
    }
    case "corrective": {
      const ctx = typeof ref.manualContext === "string" ? ref.manualContext.trim() : "";
      return { label: ctx ? `Corretiva · ${truncate(ctx)}` : "Corretiva", kpi: null };
    }
    case "norm_requirement": {
      const ctx = typeof ref.manualContext === "string" ? ref.manualContext.trim() : "";
      return {
        label: ctx ? `Não atendimento a requisito da norma · ${truncate(ctx)}` : "Não atendimento a requisito da norma",
        kpi: null,
      };
    }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-manual-origin.integration.test.ts`

Expected: PASS — 3 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/action-plans/source-context.ts artifacts/api-server/tests/routes/action-plans-manual-origin.integration.test.ts
git commit -m "feat(acoes): rotulo de contexto das origens criadas no modulo"
```

---

### Task 3: Front — opções da origem, Tipo sugerido, rótulos e cores

Toda a lógica que o diálogo vai usar sai como função pura, testável sem renderizar nada (mesmo padrão de `responsible-options.ts`, ao lado).

**Files:**
- Create: `artifacts/web/src/pages/app/planos-acao/_components/manual-origin.ts`
- Modify: `artifacts/web/src/lib/action-plans-client.ts:105-117`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/painel-executivo.tsx:13`
- Test: `artifacts/web/tests/pages/action-plan-manual-origin.unit.test.ts` (criar)

**Interfaces:**
- Consumes: `ActionPlanSourceModule`, `ActionPlanType` (de `@/lib/action-plans-client`).
- Produces:
  - `MANUAL_ORIGIN_OPTIONS: readonly ManualOriginModule[]` — `["improvement", "corrective", "norm_requirement"]`
  - `type ManualOriginModule = "improvement" | "corrective" | "norm_requirement"`
  - `DEFAULT_MANUAL_ORIGIN: ManualOriginModule` — `"improvement"`
  - `actionTypeForManualOrigin(origin: ManualOriginModule): ActionPlanType`
  - `SOURCE_MODULE_LABELS` ganha as três chaves.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/web/tests/pages/action-plan-manual-origin.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SOURCE_MODULE_LABELS } from "@/lib/action-plans-client";
import {
  DEFAULT_MANUAL_ORIGIN,
  MANUAL_ORIGIN_OPTIONS,
  actionTypeForManualOrigin,
} from "@/pages/app/planos-acao/_components/manual-origin";

describe("origens escolhíveis ao criar a ação dentro do módulo", () => {
  it("oferece exatamente as três origens, na ordem do listbox", () => {
    expect(MANUAL_ORIGIN_OPTIONS).toEqual(["improvement", "corrective", "norm_requirement"]);
  });

  it("usa Melhoria de Processo como padrão", () => {
    expect(DEFAULT_MANUAL_ORIGIN).toBe("improvement");
  });

  it("não oferece a origem legada 'manual'", () => {
    expect(MANUAL_ORIGIN_OPTIONS).not.toContain("manual");
  });

  it("tem rótulo em português para cada origem (usado no badge, no filtro e no painel)", () => {
    expect(SOURCE_MODULE_LABELS.improvement).toBe("Melhoria de Processo");
    expect(SOURCE_MODULE_LABELS.corrective).toBe("Corretiva");
    expect(SOURCE_MODULE_LABELS.norm_requirement).toBe("Não atendimento a requisito da norma");
    // A origem legada continua rotulada — 5 planos antigos ainda a usam.
    expect(SOURCE_MODULE_LABELS.manual).toBe("Manual");
  });
});

describe("actionTypeForManualOrigin", () => {
  it("sugere Melhoria para a origem Melhoria de Processo", () => {
    expect(actionTypeForManualOrigin("improvement")).toBe("improvement");
  });

  it("sugere Corretiva para a origem Corretiva", () => {
    expect(actionTypeForManualOrigin("corrective")).toBe("corrective");
  });

  it("sugere Corretiva para lacuna de requisito da norma", () => {
    expect(actionTypeForManualOrigin("norm_requirement")).toBe("corrective");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-manual-origin.unit.test.ts`

Expected: FAIL — o módulo `manual-origin` não existe (`Failed to resolve import`).

- [ ] **Step 3: Criar o módulo de origens manuais**

Criar `artifacts/web/src/pages/app/planos-acao/_components/manual-origin.ts`:

```ts
import type { ActionPlanType } from "@/lib/action-plans-client";

/**
 * Origens que o usuário escolhe quando a ação nasce dentro do próprio módulo
 * (o diálogo aberto pelo hub, sem origem imposta por outra tela). A origem
 * legada `manual` fica de fora: ainda é lida e rotulada, mas nunca mais gravada.
 */
export const MANUAL_ORIGIN_OPTIONS = ["improvement", "corrective", "norm_requirement"] as const;

export type ManualOriginModule = (typeof MANUAL_ORIGIN_OPTIONS)[number];

export const DEFAULT_MANUAL_ORIGIN: ManualOriginModule = "improvement";

/**
 * Tipo da ação que cada origem sugere. Só uma sugestão — o campo "Tipo" segue
 * editável — mas evita perguntar duas vezes quase a mesma coisa e acerta o
 * prefixo do código gerado (AM- para melhoria, AC- para corretiva).
 */
export function actionTypeForManualOrigin(origin: ManualOriginModule): ActionPlanType {
  return origin === "improvement" ? "improvement" : "corrective";
}
```

- [ ] **Step 4: Rotular as origens novas**

Em `artifacts/web/src/lib/action-plans-client.ts:105-117` (o mapa alimenta o badge da listagem, o badge da ficha, o filtro de origem e o painel executivo):

```ts
export const SOURCE_MODULE_LABELS: Record<string, string> = {
  kpi: "Indicador (KPI)",
  swot: "SWOT",
  improvement: "Melhoria de Processo",
  corrective: "Corretiva",
  norm_requirement: "Não atendimento a requisito da norma",
  manual: "Manual",
  nonconformity: "Não conformidade",
  audit_finding: "Auditoria",
  risk: "Risco/oportunidade",
  training: "Treinamento",
  environmental: "Ambiental (LAIA)",
  road_safety: "Segurança viária",
  incident: "Incidente",
  rac: "Análise Crítica",
};
```

`originLink()` não precisa de mudança: as três origens não têm tela de destino e caem no `default`, que já devolve `null`.

- [ ] **Step 5: Dar cor a cada origem no painel executivo**

Em `artifacts/web/src/pages/app/planos-acao/_components/painel-executivo.tsx:13`:

```ts
const SOURCE_COLORS: Record<string, string> = {
  kpi: "bg-blue-500",
  swot: "bg-violet-500",
  improvement: "bg-emerald-500",
  corrective: "bg-amber-500",
  norm_requirement: "bg-rose-500",
  manual: "bg-slate-400",
};
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-manual-origin.unit.test.ts`

Expected: PASS — 7 testes.

- [ ] **Step 7: Commit**

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/manual-origin.ts artifacts/web/src/lib/action-plans-client.ts artifacts/web/src/pages/app/planos-acao/_components/painel-executivo.tsx artifacts/web/tests/pages/action-plan-manual-origin.unit.test.ts
git commit -m "feat(acoes): opcoes, rotulos e cores das origens criadas no modulo"
```

---

### Task 4: Campo "Origem" no diálogo "Nova ação"

**Files:**
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx`
- Test: `artifacts/web/tests/pages/nova-acao-dialog.unit.test.tsx` (criar)

**Interfaces:**
- Consumes: `MANUAL_ORIGIN_OPTIONS`, `DEFAULT_MANUAL_ORIGIN`, `actionTypeForManualOrigin`, `type ManualOriginModule` (Task 3); `SOURCE_MODULE_LABELS` (Task 3).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Escrever o teste que falha**

Criar `artifacts/web/tests/pages/nova-acao-dialog.unit.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom não implementa scrollIntoView, usado pelo cmdk (SearchableSelect do responsável).
Element.prototype.scrollIntoView = vi.fn();

const mutateAsync = vi.fn(async () => ({ id: 77 }));

vi.mock("wouter", () => ({ useLocation: () => ["/planos-acao", vi.fn()] }));

vi.mock("@workspace/api-client-react", () => ({
  useListOrgUsers: () => ({ data: { users: [] } }),
  getListOrgUsersQueryKey: () => ["org-users"],
}));

vi.mock("@/lib/action-plans-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/action-plans-client")>();
  return {
    ...actual,
    useCreateActionPlanWithInvalidation: () => ({ mutateAsync, isPending: false }),
  };
});

import { NovaAcaoDialog } from "@/pages/app/planos-acao/_components/nova-acao-dialog";

beforeEach(() => {
  mutateAsync.mockClear();
});

describe("NovaAcaoDialog — criada dentro do módulo (sem origem imposta)", () => {
  it("grava a origem escolhida, com Melhoria de Processo como padrão", async () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();

    expect(screen.getByLabelText(/Origem/)).toHaveValue("improvement");

    await user.type(screen.getByLabelText(/Título/), "Reduzir fila no recebimento");
    await user.click(screen.getByRole("button", { name: "Criar ação" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0].data).toMatchObject({
      sourceModule: "improvement",
      actionType: "improvement",
      title: "Reduzir fila no recebimento",
    });
  });

  it("trocar a origem para Corretiva sugere o Tipo Corretiva", async () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Origem/), "corrective");

    expect(screen.getByLabelText(/Tipo/)).toHaveValue("corrective");
  });

  it("a sugestão não trava o Tipo: o usuário sobrescreve depois de escolher a origem", async () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Origem/), "norm_requirement");
    expect(screen.getByLabelText(/Tipo/)).toHaveValue("corrective");

    await user.selectOptions(screen.getByLabelText(/Tipo/), "preventive");
    await user.type(screen.getByLabelText(/Título/), "Lacuna 9.1");
    await user.click(screen.getByRole("button", { name: "Criar ação" }));

    expect(mutateAsync.mock.calls[0][0].data).toMatchObject({
      sourceModule: "norm_requirement",
      actionType: "preventive",
    });
  });

  it("não oferece a origem legada 'Manual'", () => {
    render(<NovaAcaoDialog orgId={2} open onOpenChange={vi.fn()} />);

    const origem = screen.getByLabelText(/Origem/);
    expect(origem).not.toHaveTextContent("Manual");
  });
});

describe("NovaAcaoDialog — aberto a partir de outro módulo", () => {
  it("não mostra o campo Origem e mantém a origem imposta pelo chamador", async () => {
    render(
      <NovaAcaoDialog
        orgId={2}
        open
        onOpenChange={vi.fn()}
        source={{ sourceModule: "kpi", sourceRef: { kpiMonthlyValueId: 9 }, originLabel: "Indicador X · Mai/2026" }}
      />,
    );
    const user = userEvent.setup();

    expect(screen.queryByLabelText(/Origem \*/)).toBeNull();

    await user.type(screen.getByLabelText(/Título/), "Tratar desvio do indicador");
    await user.click(screen.getByRole("button", { name: "Criar ação" }));

    expect(mutateAsync.mock.calls[0][0].data).toMatchObject({
      sourceModule: "kpi",
      actionType: "corrective",
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/nova-acao-dialog.unit.test.tsx`

Expected: FAIL — não existe campo com label "Origem" no diálogo aberto sem `source` (`Unable to find a label with the text of: /Origem/`).

- [ ] **Step 3: Implementar o campo Origem no diálogo**

Em `artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx`:

Importar os helpers (junto dos imports já existentes de `./gut-input`):

```ts
import {
  DEFAULT_MANUAL_ORIGIN,
  MANUAL_ORIGIN_OPTIONS,
  actionTypeForManualOrigin,
  type ManualOriginModule,
} from "./manual-origin";
```

`FormState` (linhas 41-49) ganha a origem escolhida:

```ts
type FormState = {
  title: string;
  description: string;
  /** Origem escolhida pelo usuário — só usada quando a ação nasce no módulo (sem `source`). */
  manualOrigin: ManualOriginModule;
  actionType: ActionPlanType;
  priority: ActionPlanPriority;
  responsibleUserId: string;
  dueDate: string;
  gut: { gravity: number | null; urgency: number | null; tendency: number | null };
};
```

`initialForm` (linhas 51-61) parte da origem padrão e do Tipo que ela sugere:

```ts
function initialForm(source?: ActionSource): FormState {
  return {
    title: source?.defaultTitle ?? "",
    description: source?.defaultDescription ?? "",
    manualOrigin: DEFAULT_MANUAL_ORIGIN,
    actionType: source ? "corrective" : actionTypeForManualOrigin(DEFAULT_MANUAL_ORIGIN),
    priority: "medium",
    responsibleUserId: "",
    dueDate: "",
    gut: { gravity: null, urgency: null, tendency: null },
  };
}
```

No `submit` (linha 94), a origem passa a vir do formulário quando não há `source`:

```ts
    const sourceModule = source?.sourceModule ?? form.manualOrigin;
```

(a linha seguinte, que monta o `sourceRef` com `manualContext`, fica como está.)

No JSX, logo antes do campo "Título \*" (linha 135), o listbox — renderizado só quando a ação nasce no módulo:

```tsx
        {!source && (
          <div className="space-y-1.5">
            <Label htmlFor="nova-acao-origem">Origem *</Label>
            <Select
              id="nova-acao-origem"
              value={form.manualOrigin}
              onChange={(e) => {
                const manualOrigin = e.target.value as ManualOriginModule;
                setForm((f) => ({ ...f, manualOrigin, actionType: actionTypeForManualOrigin(manualOrigin) }));
              }}
            >
              {MANUAL_ORIGIN_OPTIONS.map((o) => (
                <option key={o} value={o}>{SOURCE_MODULE_LABELS[o]}</option>
              ))}
            </Select>
          </div>
        )}
```

E os campos "Título" e "Tipo" ganham `htmlFor`/`id` para o teste (e para acessibilidade) — no "Título" (linhas 135-138):

```tsx
        <div className="space-y-1.5">
          <Label htmlFor="nova-acao-titulo">Título *</Label>
          <Input id="nova-acao-titulo" autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Revisar EPIs na linha de produção" />
        </div>
```

e no "Tipo" (linhas 144-149):

```tsx
          <div className="space-y-1.5">
            <Label htmlFor="nova-acao-tipo">Tipo</Label>
            <Select id="nova-acao-tipo" value={form.actionType} onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as ActionPlanType }))}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/nova-acao-dialog.unit.test.tsx`

Expected: PASS — 5 testes.

- [ ] **Step 5: Rodar a suíte inteira e o typecheck**

Run: `pnpm typecheck && pnpm test:unit`

Expected: sem erros; nenhuma regressão nos testes existentes de planos de ação.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx artifacts/web/tests/pages/nova-acao-dialog.unit.test.tsx
git commit -m "feat(acoes): escolher a origem ao criar acao dentro do modulo"
```

---

### Task 5: Aplicar o enum na produção (só depois do merge, com aval explícito)

O código já está pronto para o valor novo, mas **o banco de produção precisa conhecê-lo antes do deploy da API** — senão o INSERT com `sourceModule='improvement'` estoura (`invalid input value for enum`). `ALTER TYPE ... ADD VALUE` é aditivo: não reescreve linhas, não bloqueia leitura, e é o mesmo caminho já usado para o enum em outras entregas.

**Files:**
- Nenhum arquivo do repo. Operação de banco.

**Interfaces:**
- Consumes: enum `action_plan_source_module` já com os valores novos no schema Drizzle (Task 1).
- Produces: produção apta a gravar as origens novas.

- [ ] **Step 1: Confirmar com o usuário antes de tocar na produção**

Perguntar explicitamente se pode aplicar a DDL na produção (Neon). Não aplicar sem "pode aplicar".

- [ ] **Step 2: Aplicar a DDL (idempotente)**

Rodar contra o `DATABASE_URL` de produção:

```sql
ALTER TYPE action_plan_source_module ADD VALUE IF NOT EXISTS 'improvement';
ALTER TYPE action_plan_source_module ADD VALUE IF NOT EXISTS 'corrective';
ALTER TYPE action_plan_source_module ADD VALUE IF NOT EXISTS 'norm_requirement';
```

Não usar `pnpm --filter @workspace/db push` (arrastaria drift de outras branches).

- [ ] **Step 3: Verificar**

```sql
SELECT enumlabel FROM pg_enum
 WHERE enumtypid = 'action_plan_source_module'::regtype
 ORDER BY enumsortorder;
```

Expected: a lista contém `improvement`, `corrective` e `norm_requirement`, e continua contendo `manual`.

- [ ] **Step 4: Conferir que os 5 planos legados seguem intactos**

```sql
SELECT source_module, count(*) FROM action_plans GROUP BY 1 ORDER BY 2 DESC;
```

Expected: `swot` 18, `manual` 5, `nonconformity` 1 (nada migrado — decisão da spec).

---

## Ordem e dependências

Task 1 → Task 2 → Task 3 → Task 4 são sequenciais (cada uma consome tipos da anterior). Task 5 é operacional e só roda depois do merge, com aval explícito.
