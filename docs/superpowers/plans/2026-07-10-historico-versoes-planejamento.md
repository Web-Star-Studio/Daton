# Histórico de versões do Planejamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda alteração do bloco Planejamento (5W2H + causa-raiz + 5 porquês) de um plano de ação fica registrada com autoria e valor anterior completo, e qualquer versão pode ser restaurada com um clique.

**Architecture:** O `action_plan_activity_log` já guarda `{from, to}` por campo. Tratamos o Planejamento como **um campo lógico único** (`fields.planning`), de modo que o `to` de qualquer entrada já é uma versão completa do bloco — restaurar é aplicar esse valor. Sem tabela nova, sem DDL. Na ficha, 5W2H e causa-raiz passam a ser uma etapa só ("Planejamento"), com o botão da IA e o de "Versões" no cabeçalho dela.

**Tech Stack:** TypeScript, Express 5, Drizzle (Postgres), Zod, React 19, TanStack Query, Vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-07-10-historico-versoes-planejamento-plano-acao-design.md`

## Global Constraints

- Prettier: indentação de 2 espaços, aspas duplas, trailing commas.
- Comentários de código em **inglês**; textos de UI e mensagens de erro em **PT-BR**.
  Alguns comentários nos trechos deste plano estão em PT-BR para o leitor humano —
  **traduza-os para inglês** ao escrever o código. Os textos de UI e as mensagens de
  erro entre aspas ficam como estão.
- `pnpm typecheck` precisa passar. É o único check obrigatório do CI.
- **Nunca** editar arquivos em `lib/api-zod/src/generated/` ou `lib/api-client-react/src/generated/` à mão. Regerar com codegen.
- O codegen do repo chama `ruby`, que **não existe** neste ambiente. Rodar os passos com `python3` (Task 3).
- Banco de integração: `postgresql://postgres:postgres@127.0.0.1:55432/daton_integration`. **Nunca** use a porta 3001 nem o `DATABASE_URL` do `.env` (aponta para a Neon de PRODUÇÃO).
- Testes de integração precisam de `.env.integration` (copiar de `.env.integration.example`).
- Nada de bloqueio otimista, nada de versionar campos fora do bloco. Ver "Fora de escopo" na spec.

## Desvios conscientes da spec

A spec previa `diffPlanningFields` no serviço do backend. Ele seria **código morto**: só o frontend exibe diff. A função vive apenas em `_components/planning-versions.ts` (Task 5). O backend expõe só `extractPlanning`, `normalizePlanning` e `planningChanged`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/action-plans.ts` | + `restoredFrom?` no ramo `diff` de `ActionPlanActivityChanges` (tipo, jsonb — sem DDL) |
| `artifacts/api-server/src/services/action-plans/planning.ts` | **novo.** Puro: extrair, normalizar e comparar o bloco |
| `artifacts/api-server/src/routes/action-plans.ts` | PATCH loga `planning`; novo endpoint de restaurar |
| `lib/api-spec/openapi.yaml` | contrato do endpoint de restaurar |
| `artifacts/web/src/pages/app/planos-acao/_components/planning-versions.ts` | **novo.** Puro: agrupar entradas em versões e diferenciar sub-campos |
| `artifacts/web/src/pages/app/planos-acao/_components/planning-versions-dialog.tsx` | **novo.** Lista de versões + restaurar |
| `artifacts/web/src/pages/app/planos-acao/_components/comentarios-historico.tsx` | descrever `planning` em palavras (senão imprime `[object Object]`) |
| `artifacts/web/src/pages/app/planos-acao/[id].tsx` | uma etapa "Planejamento" com os dois botões |

---

### Task 1: Serviço puro do bloco Planejamento

**Files:**
- Create: `artifacts/api-server/src/services/action-plans/planning.ts`
- Test: `artifacts/api-server/tests/services/action-plans/planning.unit.test.ts`

**Interfaces:**
- Consumes: `ActionPlan5W2H` de `@workspace/db`
- Produces: `PlanningBlock`, `extractPlanning(row)`, `normalizePlanning(block)`, `planningChanged(before, after)`

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/api-server/tests/services/action-plans/planning.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  extractPlanning,
  normalizePlanning,
  planningChanged,
} from "../../../src/services/action-plans/planning";

const row = {
  plan5w2h: { what: "Treinar", why: "Garantir conferência" },
  rootCause: "Falta de treinamento.",
  rootCauseWhys: ["Não foi conferido."],
  title: "irrelevante",
};

describe("extractPlanning", () => {
  it("keeps only the three planning fields", () => {
    expect(extractPlanning(row)).toEqual({
      plan5w2h: { what: "Treinar", why: "Garantir conferência" },
      rootCause: "Falta de treinamento.",
      rootCauseWhys: ["Não foi conferido."],
    });
  });
});

describe("normalizePlanning", () => {
  // O formulário manda `null` quando o bloco esvazia; o banco pode ter `{}` ou `[]`.
  // Tratar as duas formas como "vazio" evita versões fantasma no histórico.
  it("collapses empty shapes to null", () => {
    expect(normalizePlanning({ plan5w2h: {}, rootCause: "", rootCauseWhys: [] })).toEqual({
      plan5w2h: null,
      rootCause: null,
      rootCauseWhys: null,
    });
  });

  it("drops blank 5W2H fields and blank whys", () => {
    expect(
      normalizePlanning({
        plan5w2h: { what: "Treinar", why: "   " },
        rootCause: "  Causa  ",
        rootCauseWhys: ["  ", "Porque sim"],
      }),
    ).toEqual({
      plan5w2h: { what: "Treinar" },
      rootCause: "Causa",
      rootCauseWhys: ["Porque sim"],
    });
  });
});

describe("planningChanged", () => {
  const base = extractPlanning(row);

  it("is false for the same content", () => {
    expect(planningChanged(base, { ...base })).toBe(false);
  });

  it("ignores 5W2H key order", () => {
    const reordered = { ...base, plan5w2h: { why: "Garantir conferência", what: "Treinar" } };
    expect(planningChanged(base, reordered)).toBe(false);
  });

  it("treats null, empty object and empty array as the same emptiness", () => {
    const a = { plan5w2h: null, rootCause: null, rootCauseWhys: null };
    const b = { plan5w2h: {}, rootCause: "", rootCauseWhys: [] };
    expect(planningChanged(a, b)).toBe(false);
  });

  it("is true when a 5W2H field changes", () => {
    expect(planningChanged(base, { ...base, plan5w2h: { what: "Outra coisa" } })).toBe(true);
  });

  it("is true when the whys are reordered", () => {
    const a = { ...base, rootCauseWhys: ["a", "b"] };
    const b = { ...base, rootCauseWhys: ["b", "a"] };
    expect(planningChanged(a, b)).toBe(true);
  });

  it("is true when the root cause changes", () => {
    expect(planningChanged(base, { ...base, rootCause: "Outra causa" })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/planning.unit.test.ts
```
Esperado: FAIL com `Cannot find module '../../../src/services/action-plans/planning'`.

- [ ] **Step 3: Implementar**

Crie `artifacts/api-server/src/services/action-plans/planning.ts`:

```ts
import type { ActionPlan5W2H } from "@workspace/db";

/**
 * The block "Sugerir plano (IA)" writes, versioned as one logical field.
 *
 * The activity log stores per-field diffs and the only snapshot it keeps is the
 * creation one (code/title/sourceModule/status). Replaying diffs therefore cannot
 * rebuild "the block as of 12:34" — an entry that only touched the root cause says
 * nothing about the 5W2H at that instant. Storing the whole block in `from`/`to`
 * makes every entry's `to` a complete version, so restoring is just applying it.
 */
export interface PlanningBlock {
  plan5w2h: ActionPlan5W2H | null;
  rootCause: string | null;
  rootCauseWhys: string[] | null;
}

interface PlanningSource {
  plan5w2h?: ActionPlan5W2H | null;
  rootCause?: string | null;
  rootCauseWhys?: string[] | null;
}

export function extractPlanning(row: PlanningSource): PlanningBlock {
  return {
    plan5w2h: row.plan5w2h ?? null,
    rootCause: row.rootCause ?? null,
    rootCauseWhys: row.rootCauseWhys ?? null,
  };
}

/** `null`, `{}`, `""` and `[]` all mean "empty" — collapse them so an autosave that
 *  merely round-trips an empty block never shows up as a version. */
export function normalizePlanning(block: PlanningSource): PlanningBlock {
  const entries = Object.entries(block.plan5w2h ?? {}).filter(
    ([, value]) => typeof value === "string" && value.trim() !== "",
  );
  const plan5w2h = entries.length
    ? (Object.fromEntries(entries.map(([k, v]) => [k, (v as string).trim()])) as ActionPlan5W2H)
    : null;

  const rootCause = block.rootCause?.trim() || null;

  const whys = (block.rootCauseWhys ?? []).map((why) => why.trim()).filter(Boolean);

  return { plan5w2h, rootCause, rootCauseWhys: whys.length ? whys : null };
}

/** Deep equality with object keys sorted, so `{what, why}` equals `{why, what}`.
 *  Arrays stay order-sensitive: the 5 whys are a chain, not a set. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])]),
    );
  }
  return value ?? null;
}

export function planningChanged(before: PlanningSource, after: PlanningSource): boolean {
  return (
    JSON.stringify(canonical(normalizePlanning(before))) !==
    JSON.stringify(canonical(normalizePlanning(after)))
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/planning.unit.test.ts
```
Esperado: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/action-plans/planning.ts \
        artifacts/api-server/tests/services/action-plans/planning.unit.test.ts
git commit -m "feat(planos-acao): serviço puro do bloco Planejamento (extrair, normalizar, comparar)"
```

---

### Task 2: PATCH grava a versão do Planejamento

**Files:**
- Modify: `lib/db/src/schema/action-plans.ts` (tipo `ActionPlanActivityChanges`)
- Modify: `artifacts/api-server/src/routes/action-plans.ts` (`DIFF_FIELDS` e o bloco de log do PATCH)
- Test: `artifacts/api-server/tests/routes/action-plan-planning-log.integration.test.ts`

**Interfaces:**
- Consumes: `extractPlanning`, `planningChanged` (Task 1)
- Produces: entradas de log com `changes.fields.planning = { from: PlanningBlock, to: PlanningBlock }`

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/api-server/tests/routes/action-plan-planning-log.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { actionPlanActivityLogTable, actionPlansTable, db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
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

async function createPlan(organizationId: number): Promise<number> {
  const [plan] = await db
    .insert(actionPlansTable)
    .values({ organizationId, sourceModule: "manual", sourceRef: {}, title: "Plano" })
    .returning({ id: actionPlansTable.id });
  return plan.id;
}

async function planningEntries(planId: number) {
  const rows = await db
    .select()
    .from(actionPlanActivityLogTable)
    .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
    .orderBy(desc(actionPlanActivityLogTable.id));
  return rows.filter((row) => {
    const changes = row.changes as { kind?: string; fields?: Record<string, unknown> } | null;
    return changes?.kind === "diff" && changes.fields?.planning !== undefined;
  });
}

describe("planning version log", () => {
  it("records the whole block, before and after, when the 5W2H changes", async () => {
    const context = await createTestContext({ seed: "plan-log-5w2h" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ plan5w2h: { what: "Treinar" }, rootCause: "Falta de treinamento." })
      .expect(200);

    const [entry] = await planningEntries(planId);
    const planning = (entry.changes as { fields: { planning: { from: unknown; to: unknown } } })
      .fields.planning;

    expect(planning.from).toEqual({ plan5w2h: null, rootCause: null, rootCauseWhys: null });
    expect(planning.to).toEqual({
      plan5w2h: { what: "Treinar" },
      rootCause: "Falta de treinamento.",
      rootCauseWhys: null,
    });
  });

  it("does not record planning when the save did not touch the block", async () => {
    const context = await createTestContext({ seed: "plan-log-untouched" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ priority: "high" })
      .expect(200);

    expect(await planningEntries(planId)).toHaveLength(0);
  });

  /**
   * O log é priorizado: um if/else grava UMA entrada por save, e o ramo do buildDiff
   * só é alcançado no else. Sem uma entrada dedicada, um save que muda status e 5W2H
   * registraria só o status — e a versão do bloco sumiria.
   */
  it("records planning even when the same save also changed the status", async () => {
    const context = await createTestContext({ seed: "plan-log-with-status" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ status: "in_progress", plan5w2h: { what: "Treinar" } })
      .expect(200);

    const entries = await planningEntries(planId);
    expect(entries).toHaveLength(1);

    const all = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(
        and(
          eq(actionPlanActivityLogTable.actionPlanId, planId),
          eq(actionPlanActivityLogTable.action, "status_changed"),
        ),
      );
    expect(all).toHaveLength(1);
  });

  it("stops logging rootCause as a loose field", async () => {
    const context = await createTestContext({ seed: "plan-log-rootcause" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ rootCause: "Nova causa" })
      .expect(200);

    const rows = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));
    const loose = rows.filter((row) => {
      const changes = row.changes as { fields?: Record<string, unknown> } | null;
      return changes?.fields?.rootCause !== undefined;
    });

    expect(loose).toHaveLength(0);
    expect(await planningEntries(planId)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Suba o `.env.integration` se ainda não existe:

```bash
cp -n .env.integration.example .env.integration
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plan-planning-log.integration.test.ts
```
Esperado: FAIL — nenhuma entrada com `fields.planning`, e o teste do `rootCause` solto falha porque hoje ele é logado como campo.

- [ ] **Step 3: Estender o tipo do log**

Em `lib/db/src/schema/action-plans.ts`, troque o ramo `diff`:

```ts
export type ActionPlanActivityChanges =
  | { kind: "snapshot"; data: Record<string, unknown> }
  | {
      kind: "diff";
      fields: Record<string, { from: unknown; to: unknown }>;
      /** Set when the entry came from restoring an older planning version. */
      restoredFrom?: { activityId: number; at: string };
    }
  | { kind: "note"; message: string };
```

- [ ] **Step 4: Tirar `rootCause` da lista de campos soltos**

Em `artifacts/api-server/src/routes/action-plans.ts`, no `DIFF_FIELDS`, **remova** a linha `"rootCause",`. O comentário acima da constante passa a ser:

```ts
/** Tracked fields for the update activity diff (display labels handled client-side).
 *  The planning block (5W2H + root cause + whys) is logged separately, as one
 *  logical field — see `planning.ts`. */
```

- [ ] **Step 5: Logar o Planejamento fora da cadeia priorizada**

No mesmo arquivo, importe o serviço:

```ts
import { extractPlanning, planningChanged } from "../services/action-plans/planning";
```

E, no PATCH, **imediatamente antes** de `if (reopened) {`, insira:

```ts
  // Logged outside the prioritized chain below: that chain writes ONE entry per save,
  // so a save that changed both the status and the 5W2H would record only the status
  // and the block's version would vanish — the exact hole this feature closes.
  if (planningChanged(existing, row)) {
    await logActionPlanActivity({
      ...logBase,
      action: "updated",
      changes: {
        kind: "diff",
        fields: {
          planning: { from: normalizedPlanning(existing), to: normalizedPlanning(row) },
        },
      },
    });
  }
```

Adicione o helper junto de `currentUserName`, no topo do arquivo:

```ts
import { normalizePlanning } from "../services/action-plans/planning";

/** The block as it goes into the log: normalized, so an empty 5W2H reads as null
 *  whether the row holds `{}` or `null`. */
function normalizedPlanning(row: Parameters<typeof extractPlanning>[0]) {
  return normalizePlanning(extractPlanning(row));
}
```

(Junte os três símbolos num único `import { extractPlanning, normalizePlanning, planningChanged } from "../services/action-plans/planning";`.)

- [ ] **Step 6: Rodar os testes e confirmar que passam**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plan-planning-log.integration.test.ts
pnpm exec vitest run --project node-unit
pnpm -r --filter @workspace/api-server run typecheck
```
Esperado: 4 testes de integração PASS; `node-unit` sem regressão; typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/action-plans.ts \
        artifacts/api-server/src/routes/action-plans.ts \
        artifacts/api-server/tests/routes/action-plan-planning-log.integration.test.ts
git commit -m "feat(planos-acao): registrar cada versão do bloco Planejamento no log de atividade"
```

---

### Task 3: Contrato do endpoint de restaurar (OpenAPI + codegen)

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`

**Interfaces:**
- Produces: `RestoreActionPlanPlanningParams`, `RestoreActionPlanPlanningBody` (`@workspace/api-zod`); hook `useRestoreActionPlanPlanning` (`@workspace/api-client-react`)

- [ ] **Step 1: Adicionar o path**

Em `lib/api-spec/openapi.yaml`, logo **depois** do bloco `/organizations/{orgId}/action-plans/{planId}/activity:` (por volta da linha 9430), acrescente:

```yaml
  /organizations/{orgId}/action-plans/{planId}/planning/restore:
    post:
      tags: [action-plans]
      operationId: restoreActionPlanPlanning
      summary: Restaura o bloco Planejamento (5W2H + causa-raiz + porquês) de uma versão anterior
      description: >
        Aplica ao plano o conteúdo do bloco Planejamento registrado na entrada de
        atividade informada. Gera uma nova entrada no histórico; nunca apaga nada.
        Restaurar uma versão idêntica à atual é no-op.
      parameters:
        - name: orgId
          in: path
          required: true
          schema: { type: integer }
        - name: planId
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [activityId]
              properties:
                activityId:
                  type: integer
                  description: Id da entrada de atividade cuja versão será restaurada.
      responses:
        "200":
          description: Plano atualizado
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ActionPlanDetail"
        "403":
          description: Sem permissão de escrita
        "404":
          description: Entrada não encontrada, de outro plano, ou sem bloco Planejamento
        "409":
          description: Plano encerrado
```

⚠️ Confirme o nome do schema de resposta antes de colar: rode
`grep -n -A6 "action-plans/{planId}:" lib/api-spec/openapi.yaml | grep '\$ref'`
e use **exatamente** o `$ref` que o `GET` daquele path usa.

- [ ] **Step 2: Rodar o codegen**

O script do repo chama `ruby`, que não existe aqui. Rode os mesmos passos com `python3`:

```bash
cd lib/api-spec
python3 -c "import yaml,json,sys; json.dump(yaml.safe_load(open('./openapi.yaml')), sys.stdout, indent=2)" > ./.openapi.codegen.json
pnpm exec orval --config ./orval.config.ts
python3 - <<'PY'
p = "../api-zod/src/index.ts"
lines = open(p).readlines()
open(p, "w").writelines([l for l in lines if "./generated/types" not in l])
PY
rm -f ./.openapi.codegen.json
cd ../..
```

- [ ] **Step 3: Conferir que o diff do gerado é só o endpoint novo**

```bash
git diff --stat lib/api-zod lib/api-client-react
grep -rn "restoreActionPlanPlanning" lib/api-client-react/src/generated/api.ts | head -3
```
Esperado: só arquivos gerados mudaram, e o hook `useRestoreActionPlanPlanning` existe.

- [ ] **Step 4: Typecheck**

```bash
pnpm run typecheck:libs
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api): contrato do endpoint de restaurar o Planejamento"
```

---

### Task 4: Endpoint de restaurar

**Files:**
- Modify: `artifacts/api-server/src/routes/action-plans.ts`
- Test: `artifacts/api-server/tests/routes/action-plan-planning-restore.integration.test.ts`

**Interfaces:**
- Consumes: `normalizePlanning`, `extractPlanning`, `planningChanged` (Task 1); `requirePlanAccess()` e `requireWriteAccess()` (já existem no arquivo)
- Produces: `POST /organizations/:orgId/action-plans/:planId/planning/restore`

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/api-server/tests/routes/action-plan-planning-restore.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { actionPlanActivityLogTable, actionPlansTable, db } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

async function createPlan(organizationId: number): Promise<number> {
  const [plan] = await db
    .insert(actionPlansTable)
    .values({ organizationId, sourceModule: "manual", sourceRef: {}, title: "Plano" })
    .returning({ id: actionPlansTable.id });
  return plan.id;
}

async function lastPlanningActivityId(planId: number): Promise<number> {
  const rows = await db
    .select()
    .from(actionPlanActivityLogTable)
    .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
    .orderBy(desc(actionPlanActivityLogTable.id));
  const entry = rows.find((row) => {
    const changes = row.changes as { fields?: Record<string, unknown> } | null;
    return changes?.fields?.planning !== undefined;
  });
  if (!entry) throw new Error("nenhuma entrada de planejamento");
  return entry.id;
}

function restore(context: TestOrgContext, planId: number, activityId: number) {
  return request(app)
    .post(`/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`)
    .set(authHeader(context))
    .send({ activityId });
}

describe("restore planning version", () => {
  it("puts the block back exactly as the chosen version recorded it", async () => {
    const context = await createTestContext({ seed: "restore-happy" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);
    const patch = (body: object) =>
      request(app)
        .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
        .set(authHeader(context))
        .send(body)
        .expect(200);

    await patch({ plan5w2h: { what: "Versão A" }, rootCause: "Causa A" });
    const versionA = await lastPlanningActivityId(planId);
    await patch({ plan5w2h: { what: "Versão B" }, rootCause: "Causa B" });

    const response = await restore(context, planId, versionA).expect(200);
    expect(response.body.plan5w2h).toEqual({ what: "Versão A" });
    expect(response.body.rootCause).toBe("Causa A");

    const [row] = await db.select().from(actionPlansTable).where(eq(actionPlansTable.id, planId));
    expect(row.plan5w2h).toEqual({ what: "Versão A" });
  });

  it("logs the restore, referencing the version it came from", async () => {
    const context = await createTestContext({ seed: "restore-logs" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);
    const patch = (body: object) =>
      request(app)
        .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
        .set(authHeader(context))
        .send(body)
        .expect(200);

    await patch({ plan5w2h: { what: "Versão A" } });
    const versionA = await lastPlanningActivityId(planId);
    await patch({ plan5w2h: { what: "Versão B" } });

    await restore(context, planId, versionA).expect(200);

    const rows = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
      .orderBy(desc(actionPlanActivityLogTable.id));
    const changes = rows[0].changes as {
      fields: { planning: { from: unknown; to: unknown } };
      restoredFrom?: { activityId: number };
    };

    expect(changes.restoredFrom?.activityId).toBe(versionA);
    expect(changes.fields.planning.from).toMatchObject({ plan5w2h: { what: "Versão B" } });
    expect(changes.fields.planning.to).toMatchObject({ plan5w2h: { what: "Versão A" } });
  });

  it("is a no-op when the chosen version equals the current content", async () => {
    const context = await createTestContext({ seed: "restore-noop" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ plan5w2h: { what: "Única" } })
      .expect(200);
    const version = await lastPlanningActivityId(planId);

    const before = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));

    await restore(context, planId, version).expect(200);

    const after = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId));
    expect(after.length).toBe(before.length);
  });

  it("404s for an activity id that belongs to another plan", async () => {
    const context = await createTestContext({ seed: "restore-foreign" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);
    const otherPlanId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${otherPlanId}`)
      .set(authHeader(context))
      .send({ plan5w2h: { what: "De outro plano" } })
      .expect(200);
    const foreign = await lastPlanningActivityId(otherPlanId);

    await restore(context, planId, foreign).expect(404);
  });

  it("404s for an entry that carries no planning block", async () => {
    const context = await createTestContext({ seed: "restore-legacy" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ priority: "high" })
      .expect(200);

    const rows = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(eq(actionPlanActivityLogTable.actionPlanId, planId))
      .orderBy(desc(actionPlanActivityLogTable.id));

    await restore(context, planId, rows[0].id).expect(404);
  });

  it("409s on a closed plan and 403s for a read-only analyst", async () => {
    const context = await createTestContext({ seed: "restore-guards" });
    contexts.push(context);
    const planId = await createPlan(context.organizationId);

    await request(app)
      .patch(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context))
      .send({ plan5w2h: { what: "Versão A" } })
      .expect(200);
    const version = await lastPlanningActivityId(planId);

    const analyst = await createTestUser(context, { role: "analyst", suffix: "leitor" });
    await request(app)
      .post(`/api/organizations/${context.organizationId}/action-plans/${planId}/planning/restore`)
      .set({ Authorization: `Bearer ${analyst.token}` })
      .send({ activityId: version })
      .expect(403);

    await db
      .update(actionPlansTable)
      .set({ status: "completed", effectivenessResult: "effective" })
      .where(eq(actionPlansTable.id, planId));

    await restore(context, planId, version).expect(409);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plan-planning-restore.integration.test.ts
```
Esperado: FAIL — o endpoint responde 404 do Express (rota inexistente).

- [ ] **Step 3: Implementar o endpoint**

Em `artifacts/api-server/src/routes/action-plans.ts`, **depois** da rota `GET .../:planId/activity`, acrescente:

```ts
// ─── Restore a planning version ──────────────────────────────────────────────
// The chosen entry's `to` IS a complete snapshot of the block, so restoring is
// applying it. Never destructive: the restore itself becomes a new entry.

router.post(
  "/organizations/:orgId/action-plans/:planId/planning/restore",
  requireAuth,
  requirePlanAccess(),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);
    const planId = Number(req.params.planId);
    const activityId = Number((req.body as { activityId?: unknown })?.activityId);
    if (!Number.isInteger(activityId) || activityId <= 0) {
      res.status(400).json({ error: "activityId inválido" });
      return;
    }

    const [existing] = await db
      .select()
      .from(actionPlansTable)
      .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
    if (!existing) { res.status(404).json({ error: "Plano de ação não encontrado" }); return; }
    if (isActionPlanEncerrado(existing)) {
      res.status(409).json({ error: "Plano encerrado não pode ser editado." });
      return;
    }

    const [entry] = await db
      .select()
      .from(actionPlanActivityLogTable)
      .where(
        and(
          eq(actionPlanActivityLogTable.id, activityId),
          eq(actionPlanActivityLogTable.actionPlanId, planId),
          eq(actionPlanActivityLogTable.organizationId, orgId),
        ),
      );
    const changes = entry?.changes as
      | { kind?: string; fields?: { planning?: { to?: unknown } } }
      | null
      | undefined;
    const target = changes?.fields?.planning?.to as PlanningBlock | undefined;
    if (!target) {
      res.status(404).json({ error: "Versão do planejamento não encontrada" });
      return;
    }

    const restored = normalizePlanning(target);
    if (!planningChanged(existing, restored)) {
      const out = await loadAndSerializePlan(orgId, planId);
      res.json(out);
      return;
    }

    const [row] = await db
      .update(actionPlansTable)
      .set({
        plan5w2h: restored.plan5w2h,
        rootCause: restored.rootCause,
        rootCauseWhys: restored.rootCauseWhys,
        updatedAt: new Date(),
      })
      .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)))
      .returning();

    await logActionPlanActivity({
      orgId,
      actionPlanId: row.id,
      action: "updated",
      userId: req.auth!.userId,
      userName: await currentUserName(req.auth!.userId),
      changes: {
        kind: "diff",
        fields: { planning: { from: normalizedPlanning(existing), to: normalizedPlanning(row) } },
        restoredFrom: { activityId, at: entry.createdAt.toISOString() },
      },
    });

    res.json(await loadAndSerializePlan(orgId, planId));
  },
);
```

Ajuste os imports do arquivo: `PlanningBlock` vem de `../services/action-plans/planning`, e `actionPlanActivityLogTable` já é importado de `@workspace/db`.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plan-planning-restore.integration.test.ts
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes
pnpm -r --filter @workspace/api-server run typecheck
```
Esperado: 6 testes novos PASS; nenhuma regressão nas rotas; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/action-plans.ts \
        artifacts/api-server/tests/routes/action-plan-planning-restore.integration.test.ts
git commit -m "feat(planos-acao): endpoint para restaurar uma versão do Planejamento"
```

---

### Task 5: Agrupar entradas em versões (frontend, puro)

**Files:**
- Create: `artifacts/web/src/pages/app/planos-acao/_components/planning-versions.ts`
- Test: `artifacts/web/tests/pages/action-plan-planning-versions.unit.test.ts`

**Interfaces:**
- Consumes: entradas de `useActionPlanActivity` — `{ id, userId, userName, createdAt, changes }`
- Produces: `PlanningVersion`, `buildPlanningVersions(entries)`, `diffPlanningFields(from, to)`

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/web/tests/pages/action-plan-planning-versions.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPlanningVersions,
  diffPlanningFields,
} from "@/pages/app/planos-acao/_components/planning-versions";

function entry(
  id: number,
  minutes: number,
  userId: number,
  from: unknown,
  to: unknown,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    userId,
    userName: `Usuário ${userId}`,
    createdAt: `2026-07-10T12:${String(minutes).padStart(2, "0")}:00.000Z`,
    changes: { kind: "diff", fields: { planning: { from, to } }, ...extra },
  };
}

const empty = { plan5w2h: null, rootCause: null, rootCauseWhys: null };
const a = { plan5w2h: { what: "A" }, rootCause: null, rootCauseWhys: null };
const b = { plan5w2h: { what: "B" }, rootCause: null, rootCauseWhys: null };
const c = { plan5w2h: { what: "C" }, rootCause: null, rootCauseWhys: null };

describe("buildPlanningVersions", () => {
  it("returns versions newest first", () => {
    const versions = buildPlanningVersions([entry(1, 0, 7, empty, a), entry(2, 30, 7, a, b)]);

    expect(versions.map((v) => v.activityId)).toEqual([2, 1]);
  });

  /**
   * O autosave grava uma entrada por save; digitar em três pausas gera três entradas.
   * O log fica intacto (auditoria); a tela junta o que é obviamente a mesma sessão.
   */
  it("groups consecutive saves by the same author inside the 10-minute window", () => {
    const versions = buildPlanningVersions([
      entry(1, 0, 7, empty, a),
      entry(2, 3, 7, a, b),
      entry(3, 6, 7, b, c),
    ]);

    expect(versions).toHaveLength(1);
    expect(versions[0].activityId).toBe(3);
    expect(versions[0].to).toEqual(c);
    // O `from` é o do PRIMEIRO save do grupo: mostra o salto do que havia antes.
    expect(versions[0].from).toEqual(empty);
    expect(versions[0].createdAt).toBe("2026-07-10T12:00:00.000Z");
    expect(versions[0].saves).toBe(3);
  });

  it("does not group different authors", () => {
    const versions = buildPlanningVersions([entry(1, 0, 7, empty, a), entry(2, 1, 9, a, b)]);
    expect(versions).toHaveLength(2);
  });

  it("does not group saves further apart than the window", () => {
    const versions = buildPlanningVersions([entry(1, 0, 7, empty, a), entry(2, 45, 7, a, b)]);
    expect(versions).toHaveLength(2);
  });

  it("ignores entries without a planning block", () => {
    const legacy = {
      id: 9,
      userId: 7,
      userName: "Usuário 7",
      createdAt: "2026-07-10T12:00:00.000Z",
      changes: { kind: "diff", fields: { rootCause: { from: "x", to: "y" } } },
    };
    expect(buildPlanningVersions([legacy])).toEqual([]);
  });

  it("marks a version that came from a restore", () => {
    const versions = buildPlanningVersions([
      entry(5, 0, 7, b, a, { restoredFrom: { activityId: 1, at: "2026-07-10T11:00:00.000Z" } }),
    ]);
    expect(versions[0].restoredFrom?.activityId).toBe(1);
  });
});

describe("diffPlanningFields", () => {
  it("labels changed 5W2H fields, the root cause and the whys", () => {
    const changes = diffPlanningFields(
      { plan5w2h: { what: "A", how: "igual" }, rootCause: "Antes", rootCauseWhys: ["p1"] },
      { plan5w2h: { what: "B", how: "igual" }, rootCause: "Depois", rootCauseWhys: ["p1", "p2"] },
    );

    expect(changes).toEqual([
      { label: "O quê", before: "A", after: "B" },
      { label: "Causa raiz", before: "Antes", after: "Depois" },
      { label: "5 porquês", before: "p1", after: "p1 · p2" },
    ]);
  });

  it("shows an em dash for what did not exist before", () => {
    const changes = diffPlanningFields(
      { plan5w2h: null, rootCause: null, rootCauseWhys: null },
      { plan5w2h: { what: "Novo" }, rootCause: null, rootCauseWhys: null },
    );
    expect(changes).toEqual([{ label: "O quê", before: "—", after: "Novo" }]);
  });

  it("returns an empty list when nothing changed", () => {
    const same = { plan5w2h: { what: "A" }, rootCause: null, rootCauseWhys: null };
    expect(diffPlanningFields(same, { ...same })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-planning-versions.unit.test.ts
```
Esperado: FAIL com `Failed to resolve import ".../planning-versions"`.

- [ ] **Step 3: Implementar**

Crie `artifacts/web/src/pages/app/planos-acao/_components/planning-versions.ts`:

```ts
import type { ActionPlan5W2H } from "@/lib/action-plans-client";

export interface PlanningBlock {
  plan5w2h: ActionPlan5W2H | null;
  rootCause: string | null;
  rootCauseWhys: string[] | null;
}

export interface PlanningVersion {
  /** Activity entry to send to the restore endpoint — the LAST save of the group,
   *  because that is the one whose `to` holds the final content. */
  activityId: number;
  userId: number | null;
  userName: string | null;
  /** When the author started this run of edits (first save of the group). */
  createdAt: string;
  /** How many saves were folded into this version. */
  saves: number;
  from: PlanningBlock;
  to: PlanningBlock;
  restoredFrom?: { activityId: number; at: string };
}

interface ActivityEntryLike {
  id: number;
  userId: number | null;
  userName: string | null;
  createdAt: string;
  changes: unknown;
}

/** Consecutive saves by the same author within this window read as one version. */
const GROUP_WINDOW_MS = 10 * 60 * 1000;

const W2H_LABELS: Array<[keyof ActionPlan5W2H, string]> = [
  ["what", "O quê"],
  ["why", "Por quê"],
  ["where", "Onde"],
  ["who", "Quem"],
  ["when", "Quando"],
  ["how", "Como"],
  ["howMuch", "Quanto"],
];

function readPlanning(entry: ActivityEntryLike) {
  const changes = entry.changes as
    | {
        kind?: string;
        fields?: { planning?: { from: PlanningBlock; to: PlanningBlock } };
        restoredFrom?: { activityId: number; at: string };
      }
    | null
    | undefined;
  const planning = changes?.fields?.planning;
  if (!planning) return null;
  return { planning, restoredFrom: changes?.restoredFrom };
}

/**
 * Versions of the planning block, newest first.
 *
 * The autosave writes one activity entry per save, so typing the 5W2H in three
 * pauses leaves three entries. We never touch the log — an ISO audit trail should
 * stay intact — and instead fold what is obviously one editing run into a single
 * version at display time.
 */
export function buildPlanningVersions(entries: ActivityEntryLike[]): PlanningVersion[] {
  const planning = entries
    .map((entry) => ({ entry, read: readPlanning(entry) }))
    .filter((item): item is { entry: ActivityEntryLike; read: NonNullable<ReturnType<typeof readPlanning>> } =>
      item.read !== null,
    )
    .sort((a, b) => Date.parse(a.entry.createdAt) - Date.parse(b.entry.createdAt));

  const versions: PlanningVersion[] = [];
  for (const { entry, read } of planning) {
    const previous = versions[versions.length - 1];
    const sameAuthor = previous && previous.userId === entry.userId;
    const withinWindow =
      previous && Date.parse(entry.createdAt) - Date.parse(previous.createdAt) <= GROUP_WINDOW_MS;
    // A restore is a deliberate act — never fold it into the run before it.
    const foldable = sameAuthor && withinWindow && !read.restoredFrom && !previous.restoredFrom;

    if (foldable) {
      previous.activityId = entry.id;
      previous.to = read.planning.to;
      previous.saves += 1;
      continue;
    }

    versions.push({
      activityId: entry.id,
      userId: entry.userId,
      userName: entry.userName,
      createdAt: entry.createdAt,
      saves: 1,
      from: read.planning.from,
      to: read.planning.to,
      ...(read.restoredFrom ? { restoredFrom: read.restoredFrom } : {}),
    });
  }

  return versions.reverse();
}

function text(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : "—";
}

function whysText(whys: string[] | null): string {
  return whys?.length ? whys.join(" · ") : "—";
}

export interface PlanningFieldChange {
  label: string;
  before: string;
  after: string;
}

/** What changed between two versions of the block, ready to render. */
export function diffPlanningFields(from: PlanningBlock, to: PlanningBlock): PlanningFieldChange[] {
  const changes: PlanningFieldChange[] = [];

  for (const [key, label] of W2H_LABELS) {
    const before = from.plan5w2h?.[key] ?? null;
    const after = to.plan5w2h?.[key] ?? null;
    if ((before ?? "") !== (after ?? "")) {
      changes.push({ label, before: text(before), after: text(after) });
    }
  }

  if ((from.rootCause ?? "") !== (to.rootCause ?? "")) {
    changes.push({ label: "Causa raiz", before: text(from.rootCause), after: text(to.rootCause) });
  }

  const beforeWhys = whysText(from.rootCauseWhys);
  const afterWhys = whysText(to.rootCauseWhys);
  if (beforeWhys !== afterWhys) {
    changes.push({ label: "5 porquês", before: beforeWhys, after: afterWhys });
  }

  return changes;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-planning-versions.unit.test.ts
```
Esperado: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/planning-versions.ts \
        artifacts/web/tests/pages/action-plan-planning-versions.unit.test.ts
git commit -m "feat(planos-acao): agrupar entradas do log em versões do Planejamento"
```

---

### Task 6: Diálogo de versões

**Files:**
- Create: `artifacts/web/src/pages/app/planos-acao/_components/planning-versions-dialog.tsx`

**Interfaces:**
- Consumes: `buildPlanningVersions`, `diffPlanningFields` (Task 5); `useActionPlanActivity` de `@/lib/action-plans-client`; `useRestoreActionPlanPlanning` de `@workspace/api-client-react` (Task 3)
- Produces: `<PlanningVersionsDialog orgId planId canEdit open onOpenChange />` e `usePlanningVersionCount(orgId, planId)`

- [ ] **Step 1: Implementar o componente**

Crie `artifacts/web/src/pages/app/planos-acao/_components/planning-versions-dialog.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { useRestoreActionPlanPlanning } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import {
  getActionPlanActivityQueryKey,
  getActionPlanQueryKey,
  useActionPlanActivity,
} from "@/lib/action-plans-client";
import { buildPlanningVersions, diffPlanningFields } from "./planning-versions";

function whenText(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function usePlanningVersionCount(orgId: number, planId: number | null): number {
  const { data: activity = [] } = useActionPlanActivity(orgId, planId);
  return useMemo(() => buildPlanningVersions(activity).length, [activity]);
}

export function PlanningVersionsDialog({
  orgId,
  planId,
  canEdit,
  open,
  onOpenChange,
}: {
  orgId: number;
  planId: number;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: activity = [] } = useActionPlanActivity(orgId, planId);
  const versions = useMemo(() => buildPlanningVersions(activity), [activity]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const restore = useRestoreActionPlanPlanning();

  async function handleRestore(activityId: number, createdAt: string) {
    if (!window.confirm(`Restaurar o planejamento como estava em ${whenText(createdAt)}?`)) return;
    try {
      await restore.mutateAsync({ orgId, planId, data: { activityId } });
      // Targeted: the plan detail and its activity. A bare invalidateQueries()
      // would drop every cached query in the app.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getActionPlanQueryKey(orgId, planId) }),
        queryClient.invalidateQueries({ queryKey: getActionPlanActivityQueryKey(orgId, planId) }),
      ]);
      toast({ title: "Planejamento restaurado" });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Não foi possível restaurar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Versões do planejamento"
      description="Cada alteração do 5W2H, da causa raiz e dos 5 porquês fica registrada. Nada é perdido."
      size="lg"
    >
      {versions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Ainda não há versões registradas para este planejamento.
        </p>
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
          {versions.map((version, index) => {
            const changes = diffPlanningFields(version.from, version.to);
            const isCurrent = index === 0;
            return (
              <div key={version.activityId} className="rounded-lg border bg-card/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {version.userName ?? "Usuário removido"}
                      {isCurrent && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          versão atual
                        </Badge>
                      )}
                      {version.restoredFrom && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          restauração
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {whenText(version.createdAt)}
                      {version.saves > 1 && ` · ${version.saves} edições`}
                      {changes.length > 0 && ` · ${changes.map((c) => c.label).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(expanded === version.activityId ? null : version.activityId)}
                    >
                      {expanded === version.activityId ? "Ocultar" : "Ver mudanças"}
                    </Button>
                    {canEdit && !isCurrent && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        isLoading={restore.isPending}
                        onClick={() => void handleRestore(version.activityId, version.createdAt)}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Restaurar
                      </Button>
                    )}
                  </div>
                </div>

                {expanded === version.activityId && (
                  <dl className="mt-3 space-y-2 border-t pt-3">
                    {changes.length === 0 && (
                      <p className="text-xs text-muted-foreground">Sem diferença de conteúdo.</p>
                    )}
                    {changes.map((change) => (
                      <div key={change.label} className="text-xs">
                        <dt className="font-medium text-muted-foreground">{change.label}</dt>
                        <dd className="mt-0.5 grid gap-1 sm:grid-cols-2">
                          <span className="rounded bg-destructive/5 px-2 py-1 text-muted-foreground line-through">
                            {change.before}
                          </span>
                          <span className="rounded bg-primary/5 px-2 py-1">{change.after}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
```

⚠️ Antes de colar, confirme os nomes reais das query keys:
`grep -n "QueryKey" artifacts/web/src/lib/action-plans-client.ts | head`
— se o client não reexporta `getActionPlanQueryKey` / `getActionPlanActivityQueryKey`,
importe-as de `@workspace/api-client-react` ou adicione o reexport.

⚠️ Confirme também a assinatura do hook gerado:
`grep -n -A6 "export const useRestoreActionPlanPlanning" lib/api-client-react/src/generated/api.ts`
e ajuste o formato de `mutateAsync` (`{ orgId, planId, data }`) ao que o Orval gerou.

- [ ] **Step 2: Typecheck**

```bash
pnpm -r --filter @workspace/web run typecheck
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/planning-versions-dialog.tsx
git commit -m "feat(planos-acao): diálogo de versões do Planejamento, com restaurar"
```

---

### Task 6b: Histórico não pode imprimir "[object Object]"

**Files:**
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/comentarios-historico.tsx` (`describeChanges`, por volta da linha 37)
- Test: `artifacts/web/tests/pages/action-plan-describe-changes.unit.test.ts`

**Por quê:** hoje `describeChanges` monta `` `${field}: ${fmt(from)} → ${fmt(to)}` `` e `fmt` faz `String(v)`. Com o campo novo `planning`, cujo valor é um objeto, a aba "Comentários e histórico" passaria a exibir `planning: [object Object] → [object Object]`. A entrada precisa virar texto humano, e o diff detalhado continua no diálogo de versões.

**Interfaces:**
- Consumes: `diffPlanningFields` (Task 5)
- Produces: `describeChanges(entry)` — exportada para teste

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/web/tests/pages/action-plan-describe-changes.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeChanges } from "@/pages/app/planos-acao/_components/comentarios-historico";

const planning = {
  from: { plan5w2h: { what: "A" }, rootCause: null, rootCauseWhys: null },
  to: { plan5w2h: { what: "B" }, rootCause: "Nova causa", rootCauseWhys: null },
};

describe("describeChanges", () => {
  it("summarizes a planning version in words, never as [object Object]", () => {
    const text = describeChanges({ changes: { kind: "diff", fields: { planning } } });

    expect(text).toBe("Planejamento: O quê, Causa raiz");
    expect(text).not.toContain("[object Object]");
  });

  it("marks an entry that came from a restore", () => {
    const text = describeChanges({
      changes: {
        kind: "diff",
        fields: { planning },
        restoredFrom: { activityId: 3, at: "2026-07-10T12:00:00.000Z" },
      },
    });

    expect(text).toContain("Planejamento restaurado");
  });

  it("keeps rendering plain fields as before", () => {
    const text = describeChanges({
      changes: { kind: "diff", fields: { priority: { from: "medium", to: "high" } } },
    });

    expect(text).toBe("priority: medium → high");
  });

  it("still renders legacy loose rootCause entries", () => {
    const text = describeChanges({
      changes: { kind: "diff", fields: { rootCause: { from: "x", to: "y" } } },
    });

    expect(text).toBe("rootCause: x → y");
  });

  it("returns null when there is nothing to describe", () => {
    expect(describeChanges({ changes: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-describe-changes.unit.test.ts
```
Esperado: FAIL — `describeChanges` não é exportada, e imprimiria `[object Object]`.

- [ ] **Step 3: Implementar**

Em `comentarios-historico.tsx`, importe o diff e **exporte** a função, tratando `planning` à parte:

```tsx
import { diffPlanningFields, type PlanningBlock } from "./planning-versions";

export function describeChanges(entry: {
  changes: unknown;
}): string | null {
  const c = entry.changes as
    | {
        kind?: string;
        message?: string;
        fields?: Record<string, { from: unknown; to: unknown }>;
        restoredFrom?: { activityId: number; at: string };
      }
    | null
    | undefined;
  if (!c) return null;
  if (c.kind === "note" && c.message) return c.message;
  if (c.kind !== "diff" || !c.fields) return null;

  const parts: string[] = [];

  // The planning block is an object; `String(v)` would print "[object Object]".
  // Summarize it here and leave the before/after to the versions dialog.
  const planning = c.fields.planning as { from: PlanningBlock; to: PlanningBlock } | undefined;
  if (planning) {
    const labels = diffPlanningFields(planning.from, planning.to).map((change) => change.label);
    const prefix = c.restoredFrom ? "Planejamento restaurado" : "Planejamento";
    parts.push(labels.length ? `${prefix}: ${labels.join(", ")}` : prefix);
  }

  for (const [field, { from, to }] of Object.entries(c.fields)) {
    if (field === "planning") continue;
    parts.push(`${field}: ${fmt(from)} → ${fmt(to)}`);
  }

  return parts.length ? parts.join(" · ") : null;
}
```

Mantenha `fmt` como está. A chamada interna do componente continua usando `describeChanges(entry)` sem mudança.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-describe-changes.unit.test.ts
pnpm -r --filter @workspace/web run typecheck
```
Esperado: 5 testes PASS; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/planos-acao/_components/comentarios-historico.tsx \
        artifacts/web/tests/pages/action-plan-describe-changes.unit.test.ts
git commit -m "fix(planos-acao): descrever a versão do Planejamento no histórico em vez de [object Object]"
```

---

### Task 7: Uma etapa "Planejamento" na ficha

**Files:**
- Modify: `artifacts/web/src/pages/app/planos-acao/[id].tsx` (as duas `Section` do 5W2H e da causa raiz, por volta das linhas 620-651)

**Interfaces:**
- Consumes: `PlanningVersionsDialog`, `usePlanningVersionCount` (Task 6)

- [ ] **Step 1: Importar e criar o estado do diálogo**

No topo do arquivo, junto dos outros imports de `_components`:

```tsx
import { PlanningVersionsDialog, usePlanningVersionCount } from "./_components/planning-versions-dialog";
```

Dentro do componente, perto de `const [uploading, setUploading] = useState(false);`:

```tsx
  const [versionsOpen, setVersionsOpen] = useState(false);
  const planningVersionCount = usePlanningVersionCount(orgId, planId);
```

- [ ] **Step 2: Fundir as duas seções numa só**

Substitua o bloco que hoje vai de `<Section id="etapa-planejamento" title="Plano de ação (5W2H)"` até o fechamento de `</Section>` da seção "Causa raiz (5 porquês)" por:

```tsx
          <Section
            id="etapa-planejamento"
            title="Planejamento"
            action={
              <div className="flex items-center gap-1.5">
                {planningVersionCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVersionsOpen(true)}
                  >
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    Versões ({planningVersionCount})
                  </Button>
                )}
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={suggestDraft.isPending}
                    disabled={!form.description.trim() && !form.title.trim()}
                    onClick={() => void handleSuggest()}
                  >
                    {!suggestDraft.isPending && <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                    Sugerir plano (IA)
                  </Button>
                )}
              </div>
            }
          >
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Plano de ação (5W2H)
                </h4>
                <Plano5W2H value={form.plan5w2h} onChange={(v) => patch("plan5w2h", v)} readOnly={!canEdit} />
              </div>
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Causa raiz (5 porquês)
                </h4>
                <CausaRaiz
                  rootCause={form.rootCause}
                  whys={form.rootCauseWhys}
                  onChange={({ rootCause, whys }) => {
                    setForm((f) => ({ ...f, rootCause, rootCauseWhys: whys }));
                    setDirty(true);
                  }}
                  readOnly={!canEdit}
                />
              </div>
            </div>
          </Section>

          {planId && (
            <PlanningVersionsDialog
              orgId={orgId}
              planId={planId}
              canEdit={canEdit}
              open={versionsOpen}
              onOpenChange={setVersionsOpen}
            />
          )}
```

Note que o `title` explicativo do botão de IA **sumiu**: ele agora está dentro da etapa que de fato preenche, e não precisa mais se explicar.

Importe o ícone: acrescente `History` à lista de `lucide-react` no topo do arquivo.

- [ ] **Step 3: Typecheck e testes**

```bash
pnpm -r --filter @workspace/web run typecheck
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-planning-versions.unit.test.ts
```
Esperado: sem erros; 9 testes PASS.

- [ ] **Step 4: Commit**

```bash
git add "artifacts/web/src/pages/app/planos-acao/[id].tsx"
git commit -m "feat(planos-acao): 5W2H e causa raiz viram a etapa Planejamento, com versões"
```

---

### Task 8: Verificação em runtime

**Files:** nenhum. Este passo dirige o app.

- [ ] **Step 1: Ler a receita do repo**

Leia `.claude/skills/verify/SKILL.md`. Ela traz as portas, o `--browser=chromium` do playwright-cli, o `VITE_API_BASE_URL` **sem** `/api`, e o aviso de que a porta 3001 aponta para a Neon de PRODUÇÃO.

- [ ] **Step 2: Subir API e web contra o banco de integração**

```bash
cd artifacts/api-server
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/daton_integration" \
JWT_SECRET="verify-jwt-secret" PORT=3002 \
APP_BASE_URL="http://localhost:5199" CORS_ALLOWED_ORIGINS="http://localhost:5199" \
pnpm exec tsx src/index.ts &
cd ../web
VITE_API_BASE_URL="http://localhost:3002" pnpm exec vite --port 5199 --strictPort &
```

- [ ] **Step 3: Semear org, usuário e plano**

Crie `scripts/src/.tmp-seed-versoes.ts` (apague ao final):

```ts
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
const hash = await bcrypt.hash("Verify#12345", 10);
const { rows: [org] } = await pool.query(
  `INSERT INTO organizations (name,trade_name,legal_identifier,onboarding_status,auth_version)
   VALUES ('VERIFY VER LTDA','VERIFY VER','99999000555','completed',1) RETURNING id`);
await pool.query(
  `INSERT INTO users (name,email,password_hash,organization_id,role)
   VALUES ('ANA ADMIN','ana@ver.test',$1,$2,'org_admin')`, [hash, org.id]);
const { rows: [plan] } = await pool.query(
  `INSERT INTO action_plans (organization_id,code,source_module,source_ref,title,description,status,priority)
   VALUES ($1,'AC-2026-900','manual','{}'::jsonb,'Plano de teste','Problema qualquer.','open','medium')
   RETURNING id`, [org.id]);
console.log(`ORG=${org.id} PLAN=${plan.id}`);
await pool.end();
```

```bash
cd scripts
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/daton_integration" \
  pnpm exec tsx ./src/.tmp-seed-versoes.ts
rm -f ./src/.tmp-seed-versoes.ts
cd ..
```

Entre em `http://localhost:5199` com `ana@ver.test` / `Verify#12345` e abra o plano.

- [ ] **Step 4: Dirigir o fluxo**

No navegador:

1. Escrever "Versão A" no campo *O quê* → esperar o autosave → o botão **Versões (1)** aparece.
2. Trocar para "Versão B" → **Versões (2)**.
3. Abrir o diálogo, expandir a versão antiga, conferir que o antes/depois mostra `Versão A → Versão B`.
4. Clicar **Restaurar** na versão de "Versão A", confirmar.
5. O campo volta a "Versão A"; o diálogo agora tem 3 versões, a mais nova marcada como **restauração**.

- [ ] **Step 5: Conferir no banco**

```bash
docker exec -i feat-gestao-aprendizagem-postgres-1 psql -qtA -U postgres -d daton_integration -c \
  "SELECT id, action, left(changes::text, 80) FROM action_plan_activity_log ORDER BY id DESC LIMIT 4;"
```
Esperado: a entrada mais recente traz `restoredFrom` e o `to` com `Versão A`.

- [ ] **Step 6: Sondar as bordas**

- Restaurar a **versão atual** → nenhuma entrada nova no log.
- Concluir a ação (plano encerrado) → o botão **Restaurar** some; chamar o endpoint via `curl` responde **409**.
- Recarregar a página depois de restaurar → o conteúdo restaurado persiste (a linha de base do autosave foi reconstruída pela hidratação).

- [ ] **Step 7: Derrubar tudo e limpar**

Pare os servidores, apague a org de teste, e confirme que a porta 3001 nunca subiu.

- [ ] **Step 8: Suíte completa e commit final**

```bash
pnpm run typecheck:libs
pnpm -r --filter @workspace/api-server --filter @workspace/web run typecheck
pnpm exec vitest run --project node-unit
pnpm exec vitest run --project web-unit \
  artifacts/web/tests/pages/action-plan-planning-versions.unit.test.ts \
  artifacts/web/tests/pages/action-plan-describe-changes.unit.test.ts
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes
```
Esperado: tudo verde. (A suíte `web-unit` inteira estoura a heap neste ambiente — é
pré-existente, ver `.claude/skills/verify/SKILL.md`. Rode os arquivos afetados.)

Não há commit neste passo: a verificação não produz código. Registre o resultado no
relatório da tarefa (fluxo dirigido, saída do banco, sondagens das bordas).
