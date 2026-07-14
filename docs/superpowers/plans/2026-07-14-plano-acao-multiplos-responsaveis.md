# Múltiplos responsáveis no Plano de Ação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um plano de ação passa a ter N responsáveis iguais (sem "principal"), todos recebendo cobrança, pendências e acesso à ficha.

**Architecture:** O escalar `action_plans.responsible_user_id` dá lugar à tabela de junção `action_plan_responsibles` (N:N, padrão de `unit_managers`). A coluna antiga vira **espelho de escrita** (representante = menor id), sem leitor, para que um rollback do deploy ainda encontre dado válido; o drop dela é follow-up. O contrato ganha `responsibles: [{userId,name}]` (leitura) e `responsibleUserIds: number[]` (escrita, substituição total do conjunto); os campos legados coexistem durante a migração e saem na Task 9, o que mantém **todo commit intermediário verde** no `pnpm typecheck`.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), Express 5, Zod, OpenAPI 3.1 + Orval, React 19 + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-plano-acao-multiplos-responsaveis-design.md`

## Global Constraints

- **Nunca rodar `pnpm db push`.** Ele aponta para a PROD e tenta dropar colunas de outras branches. Schema de teste: `pnpm test:integration:db:push`. Produção: DDL cirúrgico (Task 10).
- **Testes de integração exigem `TEST_ENV=integration`.** Sem essa variável o Vitest carrega o `.env` e bate no Neon de **produção**. Todo comando de integração neste plano já a inclui — não remova.
- **Nunca editar arquivos gerados** (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`). Mudança de contrato = editar `lib/api-spec/openapi.yaml` e rodar `pnpm --filter @workspace/api-spec codegen`.
- **Todo commit deve passar `pnpm typecheck`.** É por isso que os campos legados só saem na Task 9.
- Estilo: Prettier (2 espaços, aspas duplas, trailing commas). Componentes React em `PascalCase`, funções em `camelCase`. Comentários e mensagens de erro voltadas ao usuário em **PT-BR**.
- Não commitar nada além dos arquivos listados em cada task.

## File Structure

**Criados:**
- `artifacts/api-server/src/services/action-plans/responsibles.ts` — único ponto de acesso à junção (listar, substituir conjunto, checar pertinência, calcular o representante legado). Todo o resto do backend fala com a junção **só** por aqui.
- `artifacts/api-server/tests/services/action-plans/responsibles.integration.test.ts`
- `artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts`
- `artifacts/api-server/tests/services/action-plans/escalation-responsibles.integration.test.ts`
- `artifacts/web/tests/lib/format-responsibles.unit.test.ts`
- `scripts/sql/20260714_add_action_plan_responsibles.sql` — DDL + backfill idempotentes para a PROD.

**Modificados (responsabilidade de cada um):**
- `lib/db/src/schema/action-plans.ts` — declara a junção; marca a coluna antiga como espelho de escrita.
- `lib/api-spec/openapi.yaml` — contrato (fonte da verdade; gera Zod + hooks).
- `artifacts/api-server/src/routes/action-plans.ts` — autorização, filtro da listagem, create/update, log de auditoria.
- `artifacts/api-server/src/services/action-plans/serializers.ts` — payload de leitura.
- `artifacts/api-server/src/services/action-plans/notify-assignment.ts` — notifica **um destinatário por chamada** (o loop fica no chamador).
- `artifacts/api-server/src/services/action-plans/escalation.ts` — cobrança por (plano × responsável).
- `artifacts/api-server/src/services/pendencias/{types,aggregate}.ts` + `providers/action-plans.ts` — uma pendência por plano.
- `artifacts/web/src/lib/action-plans-client.ts` — `formatResponsibles` (usado por 3 telas).
- `artifacts/web/src/pages/app/planos-acao/[id].tsx`, `_components/{responsible-options,eficacia-panel,nova-acao-dialog,lista-screen,painel-operacional,comentarios-historico}.tsx|ts`, `artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx` — UI.

---

### Task 1: Schema da junção + serviço de responsáveis

**Files:**
- Modify: `lib/db/src/schema/action-plans.ts:1` (import) e `:186` (comentário na coluna antiga); nova tabela após `actionPlansTable`
- Create: `artifacts/api-server/src/services/action-plans/responsibles.ts`
- Test: `artifacts/api-server/tests/services/action-plans/responsibles.integration.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `actionPlanResponsiblesTable` (exportada de `@workspace/db`), colunas `id`, `organizationId`, `actionPlanId`, `userId`, `createdAt`.
  - `type PlanResponsible = { userId: number; name: string }`
  - `listResponsibleIds(planId: number): Promise<number[]>` — ordenado por id crescente.
  - `listResponsiblesByPlan(planIds: number[]): Promise<Map<number, PlanResponsible[]>>` — cada lista ordenada por **nome** (ordem de exibição).
  - `setPlanResponsibles(orgId: number, planId: number, userIds: number[]): Promise<void>` — substituição total, idempotente.
  - `isPlanResponsible(planId: number, userId: number): Promise<boolean>`
  - `legacyResponsibleId(userIds: number[]): number | null` — menor id, ou `null` se vazio (puro, sem DB).

- [ ] **Step 1: Subir o banco de teste e aplicar o schema atual**

```bash
pnpm test:integration:up
pnpm test:integration:db:push
```

Esperado: containers de pé e o push aplicando o schema **no banco de teste** (nunca na PROD).

- [ ] **Step 2: Escrever o teste que falha**

Crie `artifacts/api-server/tests/services/action-plans/responsibles.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { actionPlansTable, db } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import {
  isPlanResponsible,
  legacyResponsibleId,
  listResponsibleIds,
  listResponsiblesByPlan,
  setPlanResponsibles,
} from "../../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedPlan(ctx: TestOrgContext): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "test" },
      title: "Plano de teste",
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("action plan responsibles service", () => {
  it("substitui o conjunto: insere, remove e é idempotente", async () => {
    const ctx = await createTestContext({ seed: "ap-resp-set" });
    contexts.push(ctx);
    const other = await createTestUser(ctx, { suffix: "outro", role: "operator" });
    const planId = await seedPlan(ctx);

    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId, other.id]);
    expect(await listResponsibleIds(planId)).toEqual([ctx.userId, other.id].sort((a, b) => a - b));

    // rodar de novo com o MESMO conjunto não duplica nem apaga
    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId, other.id]);
    expect(await listResponsibleIds(planId)).toHaveLength(2);

    // substituição total: quem não está na lista sai
    await setPlanResponsibles(ctx.organizationId, planId, [other.id]);
    expect(await listResponsibleIds(planId)).toEqual([other.id]);

    // conjunto vazio remove todos (plano sem responsável continua válido)
    await setPlanResponsibles(ctx.organizationId, planId, []);
    expect(await listResponsibleIds(planId)).toEqual([]);
  });

  it("isPlanResponsible reconhece qualquer um do conjunto, não só o primeiro", async () => {
    const ctx = await createTestContext({ seed: "ap-resp-is" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const estranho = await createTestUser(ctx, { suffix: "estranho", role: "operator" });
    const planId = await seedPlan(ctx);

    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId, co.id]);

    expect(await isPlanResponsible(planId, ctx.userId)).toBe(true);
    expect(await isPlanResponsible(planId, co.id)).toBe(true);
    expect(await isPlanResponsible(planId, estranho.id)).toBe(false);
  });

  it("listResponsiblesByPlan agrupa por plano e ordena por nome", async () => {
    const ctx = await createTestContext({ seed: "ap-resp-group" });
    contexts.push(ctx);
    // createTestUser nomeia como `E2E <prefix> <suffix>` — o sufixo define a ordem alfabética.
    const zeca = await createTestUser(ctx, { suffix: "zeca", role: "operator" });
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planA = await seedPlan(ctx);
    const planB = await seedPlan(ctx);

    await setPlanResponsibles(ctx.organizationId, planA, [zeca.id, ana.id]);
    await setPlanResponsibles(ctx.organizationId, planB, [zeca.id]);

    const byPlan = await listResponsiblesByPlan([planA, planB]);
    expect(byPlan.get(planA)?.map((r) => r.userId)).toEqual([ana.id, zeca.id]);
    expect(byPlan.get(planB)?.map((r) => r.userId)).toEqual([zeca.id]);
    expect(byPlan.get(planA)?.[0].name).toContain("ana");
  });

  it("listResponsiblesByPlan com lista vazia não consulta o banco", async () => {
    expect(await listResponsiblesByPlan([])).toEqual(new Map());
  });

  it("legacyResponsibleId devolve o menor id, ou null quando vazio", () => {
    expect(legacyResponsibleId([9, 3, 7])).toBe(3);
    expect(legacyResponsibleId([])).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/responsibles.integration.test.ts
```

Esperado: FAIL — `Failed to resolve import ".../services/action-plans/responsibles"`.

- [ ] **Step 4: Declarar a tabela de junção no schema**

Em `lib/db/src/schema/action-plans.ts`, troque a linha 1 (o import ganha `unique`):

```ts
import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
```

Ainda em `lib/db/src/schema/action-plans.ts`, na definição de `actionPlansTable`, substitua a linha da coluna antiga (`responsibleUserId: integer("responsible_user_id")...`) por:

```ts
    /**
     * @deprecated Espelho de escrita, mantido só durante a migração para
     * `action_plan_responsibles`. NINGUÉM LÊ esta coluna — o backend obtém os
     * responsáveis pela junção. Ela continua sendo escrita (com o responsável de
     * menor id) para que um rollback do deploy ainda encontre dado válido.
     * Removida no follow-up, depois de validado em produção.
     */
    responsibleUserId: integer("responsible_user_id").references(() => usersTable.id, { onDelete: "set null" }),
```

E, logo **depois** do bloco `export const actionPlansTable = pgTable(...)` (antes de `actionPlanEvidencesTable`), acrescente:

```ts
/**
 * Responsáveis de um plano de ação (N:N). Conjunto PLANO: não existe "principal"
 * — todos recebem a cobrança automática, todos veem o plano em "Suas Pendências"
 * e todos alcançam a ficha mesmo sem o módulo `actionPlans`. Espelha o padrão de
 * `unit_managers`.
 *
 * O índice em `user_id` não é decoração: as consultas quentes (pendências,
 * escalonamento, filtro "Atribuídas a mim") entram por ele.
 */
export const actionPlanResponsiblesTable = pgTable(
  "action_plan_responsibles",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
    actionPlanId: integer("action_plan_id").notNull().references(() => actionPlansTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("action_plan_responsibles_plan_user_uq").on(table.actionPlanId, table.userId),
    index("action_plan_responsibles_user_idx").on(table.userId),
    index("action_plan_responsibles_org_idx").on(table.organizationId),
  ],
);

export type ActionPlanResponsible = typeof actionPlanResponsiblesTable.$inferSelect;
```

`lib/db/src/schema/index.ts` já reexporta `./action-plans` (linha 31) — nada a fazer lá.

- [ ] **Step 5: Escrever o serviço**

Crie `artifacts/api-server/src/services/action-plans/responsibles.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { actionPlanResponsiblesTable, db, usersTable } from "@workspace/db";

export type PlanResponsible = { userId: number; name: string };

/** Ids dos responsáveis de um plano, em ordem crescente (determinístico). */
export async function listResponsibleIds(planId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: actionPlanResponsiblesTable.userId })
    .from(actionPlanResponsiblesTable)
    .where(eq(actionPlanResponsiblesTable.actionPlanId, planId));
  return rows.map((r) => r.userId).sort((a, b) => a - b);
}

/** Responsáveis (id + nome) de vários planos numa consulta só, agrupados por
 *  plano e ordenados por NOME — a ordem em que a UI os exibe. */
export async function listResponsiblesByPlan(planIds: number[]): Promise<Map<number, PlanResponsible[]>> {
  const out = new Map<number, PlanResponsible[]>();
  if (planIds.length === 0) return out;

  const rows = await db
    .select({
      planId: actionPlanResponsiblesTable.actionPlanId,
      userId: actionPlanResponsiblesTable.userId,
      name: usersTable.name,
    })
    .from(actionPlanResponsiblesTable)
    .innerJoin(usersTable, eq(usersTable.id, actionPlanResponsiblesTable.userId))
    .where(inArray(actionPlanResponsiblesTable.actionPlanId, planIds));

  for (const r of rows) {
    const bucket = out.get(r.planId) ?? [];
    bucket.push({ userId: r.userId, name: r.name });
    out.set(r.planId, bucket);
  }
  for (const bucket of out.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }
  return out;
}

/** Substitui o conjunto inteiro de responsáveis do plano. Idempotente: rodar
 *  duas vezes com o mesmo conjunto não duplica nem apaga. */
export async function setPlanResponsibles(orgId: number, planId: number, userIds: number[]): Promise<void> {
  const desired = [...new Set(userIds)];
  const current = await listResponsibleIds(planId);

  const toRemove = current.filter((id) => !desired.includes(id));
  const toAdd = desired.filter((id) => !current.includes(id));

  if (toRemove.length > 0) {
    await db.delete(actionPlanResponsiblesTable).where(
      and(
        eq(actionPlanResponsiblesTable.actionPlanId, planId),
        inArray(actionPlanResponsiblesTable.userId, toRemove),
      ),
    );
  }
  if (toAdd.length > 0) {
    await db
      .insert(actionPlanResponsiblesTable)
      .values(toAdd.map((userId) => ({ organizationId: orgId, actionPlanId: planId, userId })))
      .onConflictDoNothing();
  }
}

/** True quando o usuário é UM dos responsáveis do plano (não só "o" responsável). */
export async function isPlanResponsible(planId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: actionPlanResponsiblesTable.id })
    .from(actionPlanResponsiblesTable)
    .where(
      and(
        eq(actionPlanResponsiblesTable.actionPlanId, planId),
        eq(actionPlanResponsiblesTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Representante gravado no espelho legado `action_plans.responsible_user_id`.
 * Menor id = determinístico. Ninguém LÊ esse campo; ele só existe para que um
 * rollback do deploy encontre um responsável válido em cada plano.
 */
export function legacyResponsibleId(userIds: number[]): number | null {
  if (userIds.length === 0) return null;
  return [...userIds].sort((a, b) => a - b)[0];
}
```

- [ ] **Step 6: Aplicar o schema novo no banco de teste**

```bash
pnpm test:integration:db:push
```

Esperado: cria `action_plan_responsibles` **no banco de teste**.

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/responsibles.integration.test.ts
```

Esperado: PASS (5 testes).

- [ ] **Step 8: Typecheck e commit**

```bash
pnpm typecheck
git add lib/db/src/schema/action-plans.ts artifacts/api-server/src/services/action-plans/responsibles.ts artifacts/api-server/tests/services/action-plans/responsibles.integration.test.ts
git commit -m "feat(db): tabela action_plan_responsibles + serviço de responsáveis"
```

---

### Task 2: Contrato OpenAPI (aditivo) + codegen

Adiciona os campos novos **sem remover os legados** — nada quebra, e todo commit daqui até a Task 9 continua compilando. Os legados saem na Task 9.

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (schemas `ActionPlan`, `ActionPlanListItem`, `CreateActionPlanBody`, `UpdateActionPlanBody`)
- Generated (não editar à mão): `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`

**Interfaces:**
- Consumes: nada.
- Produces (tipos gerados, usados das Tasks 3–9):
  - `ActionPlanResponsible = { userId: number; name: string }`
  - `ActionPlan.responsibles: ActionPlanResponsible[]` (obrigatório, `[]` quando não há responsável)
  - `ActionPlanListItem.responsibles: ActionPlanResponsible[]` (obrigatório)
  - `CreateActionPlanBody.responsibleUserIds?: number[] | null`
  - `UpdateActionPlanBody.responsibleUserIds?: number[] | null`
  - O query param `responsibleUserId` **permanece com o mesmo nome** — sua semântica passa a ser "planos onde este usuário é **um dos** responsáveis".

- [ ] **Step 1: Declarar o schema do responsável**

Em `lib/api-spec/openapi.yaml`, imediatamente **antes** de `    ActionPlan:` (a linha `ActionPlan:` indentada com 4 espaços, dentro de `components.schemas`), insira:

```yaml
    ActionPlanResponsible:
      type: object
      description: Um dos responsáveis do plano. Conjunto plano — não há "principal".
      properties:
        userId:
          type: integer
        name:
          type: string
      required:
        - userId
        - name

```

- [ ] **Step 2: Adicionar `responsibles` ao `ActionPlan`**

No schema `ActionPlan`, logo **acima** da propriedade `responsibleUserId:` existente, insira:

```yaml
        responsibles:
          type: array
          description: Responsáveis do plano (todos iguais). Vazio quando não há nenhum.
          items:
            $ref: "#/components/schemas/ActionPlanResponsible"
```

E deixe as duas legadas com a marca de saída (substitua o par existente):

```yaml
        responsibleUserId:
          deprecated: true
          description: "Legado: representante do conjunto. Removido — use `responsibles`."
          type: ["integer", "null"]
        responsibleUserName:
          deprecated: true
          description: "Legado: nome do representante. Removido — use `responsibles`."
          type: ["string", "null"]
```

No bloco `required:` do `ActionPlan` (o que lista `id`, `organizationId`, …, `updatedAt`), adicione `- responsibles` após `- priority`.

- [ ] **Step 3: Adicionar `responsibles` ao `ActionPlanListItem`**

Mesma edição no schema `ActionPlanListItem`: insira `responsibles` acima do `responsibleUserId:` dele, marque as duas legadas como `deprecated: true` (com as mesmas descrições do passo anterior) e adicione `- responsibles` ao `required:` dele, após `- priority`.

- [ ] **Step 4: Adicionar `responsibleUserIds` aos corpos de escrita**

Em `CreateActionPlanBody`, logo **acima** do `responsibleUserId:` dele, insira:

```yaml
        responsibleUserIds:
          type: array
          nullable: true
          description: Conjunto COMPLETO de responsáveis. Substitui o conjunto atual.
          items:
            type: integer
```

E marque o legado do `CreateActionPlanBody`:

```yaml
        responsibleUserId:
          deprecated: true
          description: "Legado: equivale a `responsibleUserIds: [id]`. Removido."
          type: integer
          nullable: true
```

Repita exatamente as duas edições em `UpdateActionPlanBody`.

- [ ] **Step 5: Regerar o cliente**

```bash
pnpm --filter @workspace/api-spec codegen
```

Esperado: `lib/api-zod/src/generated/` e `lib/api-client-react/src/generated/` regravados.

- [ ] **Step 6: Conferir que os tipos nasceram**

```bash
grep -rn "responsibles" lib/api-zod/src/generated/types/actionPlan.ts lib/api-zod/src/generated/types/actionPlanListItem.ts
grep -rn "responsibleUserIds" lib/api-zod/src/generated/types/createActionPlanBody.ts lib/api-zod/src/generated/types/updateActionPlanBody.ts
```

Esperado: `responsibles: ActionPlanResponsible[];` nos dois primeiros e `responsibleUserIds?: number[] | null;` nos dois últimos.

- [ ] **Step 7: Typecheck e commit**

`pnpm typecheck` ainda passa porque nada consome os campos novos e os legados continuam lá.

```bash
pnpm typecheck
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): responsibles[] e responsibleUserIds[] no contrato de planos de ação"
```

---

### Task 3: Backend — leitura pela junção (serializer, GET, listagem, autorização)

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/serializers.ts`
- Modify: `artifacts/api-server/src/routes/action-plans.ts` (imports; `requirePlanAccess`; rota de listagem; `loadAndSerializePlan`)
- Test: `artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts` (criar)
- Test: `artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts` (estender)

**Interfaces:**
- Consumes: `listResponsiblesByPlan`, `isPlanResponsible`, `legacyResponsibleId` (Task 1); tipos gerados (Task 2).
- Produces: toda resposta de plano passa a carregar `responsibles: PlanResponsible[]` (ordenado por nome) **e**, temporariamente, `responsibleUserId`/`responsibleUserName` derivados do representante — é o que mantém o front compilando até a Task 7.

- [ ] **Step 1: Escrever os testes que falham**

Crie `artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { actionPlansTable, db } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";
import { setPlanResponsibles } from "../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedPlan(ctx: TestOrgContext, title = "Plano"): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("action plans — leitura com múltiplos responsáveis", () => {
  it("GET /:planId devolve todos os responsáveis, ordenados por nome", async () => {
    const ctx = await createTestContext({ seed: "ap-read-many", role: "org_admin" });
    contexts.push(ctx);
    const zeca = await createTestUser(ctx, { suffix: "zeca", role: "operator" });
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx);
    await setPlanResponsibles(ctx.organizationId, planId, [zeca.id, ana.id]);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.responsibles.map((r: { userId: number }) => r.userId)).toEqual([ana.id, zeca.id]);
  });

  it("GET /:planId devolve [] quando o plano não tem responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-read-none", role: "org_admin" });
    contexts.push(ctx);
    const planId = await seedPlan(ctx);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.responsibles).toEqual([]);
  });

  it("?responsibleUserId=X encontra o plano quando X é CO-responsável (não só o primeiro)", async () => {
    const ctx = await createTestContext({ seed: "ap-filter-co", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const doCo = await seedPlan(ctx, "Tem o co");
    const semCo = await seedPlan(ctx, "Não tem o co");
    await setPlanResponsibles(ctx.organizationId, doCo, [ctx.userId, co.id]);
    await setPlanResponsibles(ctx.organizationId, semCo, [ctx.userId]);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans?responsibleUserId=${co.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([doCo]);
    expect(res.body[0].responsibles).toHaveLength(2);
  });
});
```

E, em `artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts`, acrescente ao final do `describe` (antes do fechamento) o caso do co-responsável — note o import novo no topo do arquivo: `import { setPlanResponsibles } from "../../src/services/action-plans/responsibles";`

```ts
  it("allows a CO-responsible user even with no module at all", async () => {
    const context = await createTestContext({
      seed: "ap-detail-coresponsible",
      role: "operator",
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, { sourceModule: "manual" });
    // O usuário do contexto entra como SEGUNDO responsável — o acesso não pode
    // depender de ele ser "o primeiro".
    const outro = await createTestUser(context, { suffix: "primeiro", role: "operator" });
    await setPlanResponsibles(context.organizationId, planId, [outro.id, context.userId]);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });
```

Adicione `createTestUser` à lista de imports vinda de `../../../../tests/support/backend` nesse arquivo.

O teste existente `"allows the responsible user even with no module at all"` seeda o responsável pela **coluna antiga** (`createPlan({ responsibleUserId })`), que ninguém mais lê — ele passaria a testar nada. Troque o corpo dele para seedar pela junção:

```ts
  it("allows the responsible user even with no module at all", async () => {
    const context = await createTestContext({
      seed: "ap-detail-responsible",
      role: "operator",
    });
    contexts.push(context);
    const planId = await createPlan(context.organizationId, { sourceModule: "manual" });
    await setPlanResponsibles(context.organizationId, planId, [context.userId]);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts
```

Esperado: FAIL — `expected undefined to deeply equal [...]` (não existe `responsibles` no payload) e 403 no caso do co-responsável.

- [ ] **Step 3: Serializer emite `responsibles`**

Em `artifacts/api-server/src/services/action-plans/serializers.ts`, adicione o import do tipo no topo:

```ts
import type { PlanResponsible } from "./responsibles";
```

Troque a assinatura de `serializePlan` — o `extras` perde `responsibleUserName` e ganha `responsibles`:

```ts
export function serializePlan(
  p: DbActionPlan,
  sourceContext: SourceContext,
  extras: {
    responsibles: PlanResponsible[];
    createdByUserName: string | null;
    effectivenessEvaluatorUserName: string | null;
    evidences: ReturnType<typeof serializeEvidence>[];
  },
) {
```

E, dentro do objeto retornado, substitua o par `responsibleUserId` / `responsibleUserName` por:

```ts
    responsibles: extras.responsibles,
    // Legado — removido na limpeza do contrato. Derivado do representante (menor
    // id) só para o front continuar compilando durante a migração. O backend não
    // lê nenhum dos dois.
    responsibleUserId: legacyOf(extras.responsibles)?.userId ?? null,
    responsibleUserName: legacyOf(extras.responsibles)?.name ?? null,
```

E acrescente, no fim do arquivo:

```ts
/** Representante do conjunto para os campos legados do payload: o de menor id. */
function legacyOf(responsibles: PlanResponsible[]): PlanResponsible | null {
  if (responsibles.length === 0) return null;
  return [...responsibles].sort((a, b) => a.userId - b.userId)[0];
}
```

- [ ] **Step 4: `loadAndSerializePlan` lê a junção**

Em `artifacts/api-server/src/routes/action-plans.ts`, acrescente aos imports:

```ts
import { isPlanResponsible, listResponsiblesByPlan } from "../services/action-plans/responsibles";
```

e troque `import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";` por:

```ts
import { and, asc, desc, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
```

e acrescente `actionPlanResponsiblesTable,` à lista de imports vinda de `@workspace/db`.

Dentro de `loadAndSerializePlan`, troque o bloco `resolveUserNames([...])` e a chamada a `serializePlan` por:

```ts
  const userNameMap = await resolveUserNames([
    plan.createdByUserId,
    plan.effectivenessEvaluatorUserId,
    ...evidences.map((e) => e.uploadedByUserId),
  ]);
  const responsiblesByPlan = await listResponsiblesByPlan([plan.id]);
  const sourceContexts = await resolveSourceContexts(
    orgId,
    [{ id: plan.id, sourceModule: plan.sourceModule, sourceRef: plan.sourceRef }],
  );

  return serializePlan(plan, sourceContexts.get(plan.id) ?? { label: plan.sourceModule, kpi: null }, {
    responsibles: responsiblesByPlan.get(plan.id) ?? [],
    createdByUserName: plan.createdByUserId !== null ? (userNameMap.get(plan.createdByUserId) ?? null) : null,
    effectivenessEvaluatorUserName: plan.effectivenessEvaluatorUserId !== null
      ? (userNameMap.get(plan.effectivenessEvaluatorUserId) ?? null)
      : null,
    evidences: evidences.map((e) => serializeEvidence(
      e,
      e.uploadedByUserId !== null ? (userNameMap.get(e.uploadedByUserId) ?? null) : null,
    )),
  });
```

- [ ] **Step 5: `requirePlanAccess` consulta a junção**

Ainda em `artifacts/api-server/src/routes/action-plans.ts`, dentro de `requirePlanAccess()`, remova `responsibleUserId` do `select` e troque o cálculo de `allowed`:

```ts
    const [plan] = await db
      .select({
        sourceModule: actionPlansTable.sourceModule,
        effectivenessEvaluatorUserId: actionPlansTable.effectivenessEvaluatorUserId,
      })
      .from(actionPlansTable)
      .where(and(eq(actionPlansTable.id, planId), eq(actionPlansTable.organizationId, orgId)));
    if (!plan) { next(); return; }

    const userId = req.auth!.userId;
    // Ordem importa: os checks de módulo saem do cache de auth (30s), então o
    // curto-circuito evita a consulta à junção para quem já tem acesso pelo módulo.
    const allowed =
      plan.effectivenessEvaluatorUserId === userId ||
      (await userHasModuleAccess(req.auth!, "actionPlans")) ||
      (await userHasModuleAccess(req.auth!, SOURCE_MODULE_OWNER[plan.sourceModule])) ||
      (await isPlanResponsible(planId, userId));
    if (!allowed) { res.status(403).json({ error: "Sem acesso a este plano de ação" }); return; }
```

- [ ] **Step 6: Listagem — filtro por EXISTS e serialização em lote**

Na rota `GET /organizations/:orgId/action-plans`, troque o bloco do filtro:

```ts
  if (query.data.responsibleUserId !== undefined) {
    // "É UM DOS responsáveis" — o nome do parâmetro continua no singular, a
    // semântica é de pertinência ao conjunto.
    const responsibleUserId = query.data.responsibleUserId;
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(actionPlanResponsiblesTable)
          .where(
            and(
              eq(actionPlanResponsiblesTable.actionPlanId, actionPlansTable.id),
              eq(actionPlanResponsiblesTable.userId, responsibleUserId),
            ),
          ),
      ),
    );
  }
```

e, mais abaixo na mesma rota, troque `const userNameMap = await resolveUserNames(plans.map((p) => p.responsibleUserId));` por:

```ts
  const responsiblesByPlan = await listResponsiblesByPlan(planIds);
```

Por fim, no `res.json(plans.map((p) => ({...})))`, substitua o par de campos do responsável por:

```ts
    responsibles: responsiblesByPlan.get(p.id) ?? [],
    responsibleUserId: legacyListItem(responsiblesByPlan.get(p.id) ?? [])?.userId ?? null,
    responsibleUserName: legacyListItem(responsiblesByPlan.get(p.id) ?? [])?.name ?? null,
```

e acrescente, logo abaixo de `DIFF_FIELDS` (topo do arquivo), o helper:

```ts
/** Representante do conjunto para os campos legados do list item (menor id).
 *  Sai junto com eles na limpeza do contrato. */
function legacyListItem(responsibles: { userId: number; name: string }[]): { userId: number; name: string } | null {
  if (responsibles.length === 0) return null;
  return [...responsibles].sort((a, b) => a.userId - b.userId)[0];
}
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts
```

Esperado: PASS.

- [ ] **Step 8: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/services/action-plans/serializers.ts artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts
git commit -m "feat(api): planos de ação leem responsáveis da tabela de junção"
```

---

### Task 4: Backend — escrita (create/update), regra do avaliador, auditoria e notificação

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/notify-assignment.ts`
- Modify: `artifacts/api-server/src/routes/action-plans.ts` (POST create, PATCH update, `DIFF_FIELDS`)
- Test: `artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts` (estender)

**Interfaces:**
- Consumes: `setPlanResponsibles`, `listResponsibleIds`, `legacyResponsibleId` (Task 1); `resolveUserNames` (já existe).
- Produces:
  - `incomingResponsibleIds(body): number[] | undefined` — exportada de `services/action-plans/responsibles.ts`. `undefined` = o cliente não enviou o campo (PATCH parcial).
  - `notifyActionPlanAssignment(plan, recipientUserId, actorUserId)` — assinatura NOVA: o destinatário é explícito e `ActionPlanNotifyTarget` **não tem mais** `responsibleUserId`. O loop sobre os responsáveis fica no chamador.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao `describe` de `artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts`:

```ts
  it("POST cria com N responsáveis e espelha o representante na coluna legada", async () => {
    const ctx = await createTestContext({ seed: "ap-create-many", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });

    const res = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Ação com dois donos",
        responsibleUserIds: [ctx.userId, co.id],
      });

    expect(res.status).toBe(201);
    expect(res.body.responsibles).toHaveLength(2);

    const [row] = await db
      .select({ legacy: actionPlansTable.responsibleUserId })
      .from(actionPlansTable)
      .where(eq(actionPlansTable.id, res.body.id));
    expect(row.legacy).toBe(Math.min(ctx.userId, co.id));
  });

  it("PATCH substitui o conjunto inteiro (quem sai, sai) e aceita conjunto vazio", async () => {
    const ctx = await createTestContext({ seed: "ap-patch-set", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const planId = await seedPlan(ctx);
    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId]);

    const trocou = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ responsibleUserIds: [co.id] });
    expect(trocou.status).toBe(200);
    expect(trocou.body.responsibles.map((r: { userId: number }) => r.userId)).toEqual([co.id]);

    const esvaziou = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ responsibleUserIds: [] });
    expect(esvaziou.status).toBe(200);
    expect(esvaziou.body.responsibles).toEqual([]);
  });

  it("rejeita usuário de outra organização no conjunto", async () => {
    const ctx = await createTestContext({ seed: "ap-cross-org", role: "org_admin" });
    const alheio = await createTestContext({ seed: "ap-cross-org-b", role: "org_admin" });
    contexts.push(ctx, alheio);

    const res = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Ação",
        responsibleUserIds: [ctx.userId, alheio.userId],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("organização");
  });

  it("o avaliador da eficácia não pode ser NENHUM dos responsáveis", async () => {
    const ctx = await createTestContext({ seed: "ap-eval-indep", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });

    // no create: o avaliador é o segundo responsável → 400
    const criar = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Ação",
        responsibleUserIds: [ctx.userId, co.id],
        effectivenessEvaluatorUserId: co.id,
      });
    expect(criar.status).toBe(400);
    expect(criar.body.error).toContain("diferente");

    // no update: avaliador já designado, e alguém tenta torná-lo co-responsável → 400
    const planId = await seedPlan(ctx);
    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId]);
    await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ effectivenessEvaluatorUserId: co.id })
      .expect(200);

    const conflito = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ responsibleUserIds: [ctx.userId, co.id] });
    expect(conflito.status).toBe(400);
    expect(conflito.body.error).toContain("diferente");
  });

  it("registra a troca de responsáveis no histórico com NOMES, não ids", async () => {
    const ctx = await createTestContext({ seed: "ap-log-names", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const planId = await seedPlan(ctx);
    await setPlanResponsibles(ctx.organizationId, planId, [ctx.userId]);

    await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ responsibleUserIds: [ctx.userId, co.id] })
      .expect(200);

    const activity = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}/activity`)
      .set(authHeader(ctx));

    const entry = activity.body.find(
      (e: { changes?: { fields?: Record<string, unknown> } }) => e.changes?.fields?.responsibles,
    );
    expect(entry).toBeDefined();
    const { from, to } = entry.changes.fields.responsibles as { from: string[]; to: string[] };
    expect(from).toHaveLength(1);
    expect(to).toHaveLength(2);
    // nomes, não ids — o histórico é lido por auditor, não por programador
    expect(to.every((name) => typeof name === "string" && !/^\d+$/.test(name))).toBe(true);
  });
```

Acrescente `eq` ao import de `drizzle-orm` no topo do arquivo de teste:

```ts
import { eq } from "drizzle-orm";
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts
```

Esperado: FAIL nos 5 casos novos (o `responsibleUserIds` ainda é ignorado pela rota).

- [ ] **Step 3: `incomingResponsibleIds` no serviço**

Acrescente ao fim de `artifacts/api-server/src/services/action-plans/responsibles.ts`:

```ts
/**
 * Conjunto de responsáveis que veio no corpo da requisição.
 *
 * `undefined` significa "o cliente não mandou o campo" — num PATCH parcial isso
 * é diferente de "mandou vazio": o primeiro não mexe no conjunto, o segundo o
 * esvazia. Aceita também o formato legado (`responsibleUserId`) enquanto o front
 * migra; esse ramo sai na limpeza do contrato.
 */
export function incomingResponsibleIds(body: {
  responsibleUserIds?: number[] | null;
  responsibleUserId?: number | null;
}): number[] | undefined {
  if (body.responsibleUserIds !== undefined) {
    return body.responsibleUserIds === null ? [] : [...new Set(body.responsibleUserIds)];
  }
  if (body.responsibleUserId !== undefined) {
    return body.responsibleUserId === null ? [] : [body.responsibleUserId];
  }
  return undefined;
}
```

- [ ] **Step 4: `notify-assignment` recebe o destinatário explícito**

Em `artifacts/api-server/src/services/action-plans/notify-assignment.ts`, remova `responsibleUserId` da interface e mude a assinatura de `notifyActionPlanAssignment`:

```ts
export interface ActionPlanNotifyTarget {
  id: number;
  organizationId: number;
  code: string | null;
  title: string;
  dueDate: Date | null;
  effectivenessEvaluatorUserId?: number | null;
  effectivenessDueDate?: Date | null;
}

/**
 * Notifica UM responsável — in-app + e-mail — de que a ação passou a ser dele.
 * Um plano tem N responsáveis; quem chama itera sobre eles. Ver
 * {@link deliverAssignment} para o contrato de resiliência.
 */
export async function notifyActionPlanAssignment(
  plan: ActionPlanNotifyTarget,
  recipientUserId: number,
  actorUserId: number | null,
): Promise<void> {
  const ref = plan.code ? `${plan.code} — ` : "";
  const due = plan.dueDate ? ` Prazo: ${formatDateBR(plan.dueDate)}.` : "";
  await deliverAssignment({
    orgId: plan.organizationId,
    planId: plan.id,
    recipientUserId,
    actorUserId,
    type: "action_plan_assigned",
    title: `Ação atribuída a você: ${ref}${plan.title}`,
    description: `Você foi definido como responsável por esta ação.${due} Abra a ação para registrar o andamento e concluí-la.`,
    reason: "foi definido como responsável por esta ação",
  });
}
```

`notifyActionPlanEvaluatorAssignment` fica como está (o avaliador continua sendo um só).

- [ ] **Step 5: POST create sincroniza a junção**

Em `artifacts/api-server/src/routes/action-plans.ts`, acrescente ao import do serviço de responsáveis:

```ts
import {
  incomingResponsibleIds,
  isPlanResponsible,
  legacyResponsibleId,
  listResponsibleIds,
  listResponsiblesByPlan,
  setPlanResponsibles,
} from "../services/action-plans/responsibles";
```

Na rota POST, troque o laço de validação de usuários por:

```ts
  const responsibleIds = incomingResponsibleIds(body.data) ?? [];

  // Todo id referenciado precisa ser um usuário DESTA org (barra cross-tenant + erro de FK).
  for (const userId of [...responsibleIds, body.data.effectivenessEvaluatorUserId].filter(
    (v): v is number => typeof v === "number",
  )) {
    const ok = await assertUserBelongsToOrg(userId, params.data.orgId);
    if (!ok) {
      res.status(400).json({ error: "Responsável ou avaliador não corresponde a um usuário desta organização" });
      return;
    }
  }
```

e o bloco de independência do avaliador por:

```ts
  // Independência (ISO): quem verifica a eficácia não pode ser NENHUM dos responsáveis.
  if (
    body.data.effectivenessEvaluatorUserId != null &&
    responsibleIds.includes(body.data.effectivenessEvaluatorUserId)
  ) {
    res.status(400).json({ error: "O avaliador da eficácia deve ser diferente dos responsáveis pela ação." });
    return;
  }
```

No `db.insert(actionPlansTable).values({...})`, troque a linha `responsibleUserId: body.data.responsibleUserId ?? null,` por:

```ts
    responsibleUserId: legacyResponsibleId(responsibleIds), // espelho legado — ninguém lê
```

Logo **após** o `.returning()` (antes do `logActionPlanActivity` de `created`), acrescente:

```ts
  await setPlanResponsibles(params.data.orgId, row.id, responsibleIds);
```

E troque a notificação de atribuição:

```ts
  // Notifica cada responsável (e o avaliador) quando a ação já nasce atribuída.
  for (const userId of responsibleIds) {
    await notifyActionPlanAssignment(row, userId, req.auth!.userId);
  }
  await notifyActionPlanEvaluatorAssignment(row, req.auth!.userId);
```

- [ ] **Step 6: PATCH update sincroniza a junção**

Ainda em `artifacts/api-server/src/routes/action-plans.ts`, na rota PATCH:

**(a)** Logo depois do `if (!existing) { res.status(404)... }`, acrescente:

```ts
  const existingResponsibleIds = await listResponsibleIds(params.data.planId);
  const incomingIds = incomingResponsibleIds(body.data);
  const finalResponsibleIds = incomingIds ?? existingResponsibleIds;
```

**(b)** Troque o bloco `if (body.data.responsibleUserId !== undefined) { ... }` por:

```ts
  if (incomingIds !== undefined) {
    for (const userId of incomingIds) {
      const ok = await assertUserBelongsToOrg(userId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "Responsável não corresponde a um usuário desta organização" }); return; }
    }
    update.responsibleUserId = legacyResponsibleId(incomingIds); // espelho legado — ninguém lê
  }
```

**(c)** Troque o bloco de independência (o `{ const effResponsible = ... }`) por:

```ts
  // Independência (ISO): o avaliador não pode ser NENHUM dos responsáveis — qualquer
  // dos dois lados pode estar mudando nesta requisição.
  {
    const effEvaluator = body.data.effectivenessEvaluatorUserId !== undefined
      ? body.data.effectivenessEvaluatorUserId
      : existing.effectivenessEvaluatorUserId;
    if (effEvaluator != null && finalResponsibleIds.includes(effEvaluator)) {
      res.status(400).json({ error: "O avaliador da eficácia deve ser diferente dos responsáveis pela ação." });
      return;
    }
  }
```

**(d)** Logo **após** o `const [row] = await db.update(actionPlansTable)...returning();`, acrescente:

```ts
  if (incomingIds !== undefined) {
    await setPlanResponsibles(params.data.orgId, params.data.planId, incomingIds);
  }
```

**(e)** Remova `"responsibleUserId",` da constante `DIFF_FIELDS` (topo do arquivo) — ela agora é só o espelho, e logá-la registraria uma mudança que ninguém fez.

**(f)** Registre o diff dos responsáveis **fora** da cadeia priorizada — pelo mesmo motivo que o `planning`: aquela cadeia grava UMA entrada por save, então um save que mudasse status **e** responsáveis registraria só o status e a troca sumiria do histórico. Logo depois do bloco `if (planningChanged(existing, row)) { ... }`, acrescente:

```ts
  // Nomes, não ids: o histórico é lido por auditor. `action_plan_activity_log` já
  // snapshota `userName` pelo mesmo motivo.
  const responsiblesChanged =
    JSON.stringify(existingResponsibleIds) !== JSON.stringify([...finalResponsibleIds].sort((a, b) => a - b));
  if (responsiblesChanged) {
    const nameMap = await resolveUserNames([...existingResponsibleIds, ...finalResponsibleIds]);
    const nameOf = (id: number) => nameMap.get(id) ?? `#${id}`;
    await logActionPlanActivity({
      ...logBase,
      action: "updated",
      changes: {
        kind: "diff",
        fields: {
          responsibles: {
            from: existingResponsibleIds.map(nameOf),
            to: [...finalResponsibleIds].sort((a, b) => a - b).map(nameOf),
          },
        },
      },
    });
  }
```

**(g)** Troque a notificação de reatribuição — só quem **entrou** é notificado (quem já era responsável não recebe outro e-mail):

```ts
  // Notifica só quem ENTROU no conjunto (quem já era responsável não é re-pingado).
  for (const userId of finalResponsibleIds.filter((id) => !existingResponsibleIds.includes(id))) {
    await notifyActionPlanAssignment(row, userId, req.auth!.userId);
  }
  if (row.effectivenessEvaluatorUserId !== existing.effectivenessEvaluatorUserId) {
    await notifyActionPlanEvaluatorAssignment(row, req.auth!.userId);
  }
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts
```

Esperado: PASS (8 testes no arquivo novo).

- [ ] **Step 8: Rodar a suíte unitária do diff (garantir que nada quebrou)**

```bash
pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/helpers.unit.test.ts
```

Esperado: PASS. (O caso `responsibleUserId` em `buildDiff` continua válido — `buildDiff` é genérico; só deixamos de passar esse campo em `DIFF_FIELDS`.)

- [ ] **Step 9: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/services/action-plans/responsibles.ts artifacts/api-server/src/services/action-plans/notify-assignment.ts artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts
git commit -m "feat(api): create/update sincronizam o conjunto de responsáveis"
```

---

### Task 5: Escalonamento cobra todos os responsáveis

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/escalation.ts`
- Test: `artifacts/api-server/tests/services/action-plans/escalation-responsibles.integration.test.ts` (criar)

**Interfaces:**
- Consumes: `actionPlanResponsiblesTable` (Task 1).
- Produces: `runActionPlanEscalationPass(orgId?)` mantém a assinatura e o tipo `ActionPlanEscalationResult`; `scanned` passa a contar **planos distintos** (não pares plano×responsável), `alertsCreated`/`emailsSent` contam por destinatário.

A dedupe já é por **(plano + usuário + tipo + dia)** (`escalation.ts:112-126`) — nada a redesenhar: basta iterar sobre os pares, e cada responsável ganha seu próprio controle de duplicata.

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/api-server/tests/services/action-plans/escalation-responsibles.integration.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { actionPlansTable, db, notificationsTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { setPlanResponsibles } from "../../../src/services/action-plans/responsibles";
import { runActionPlanEscalationPass } from "../../../src/services/action-plans/escalation";

// O envio de e-mail é best-effort e depende do Resend; aqui só nos interessam as
// notificações in-app, então o cliente é stubado.
vi.mock("../../../src/lib/resend", () => ({
  getResendClient: async () => ({
    client: { emails: { send: async () => ({ id: "stub" }) } },
    fromEmail: "test@daton.example",
  }),
}));

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("escalonamento de plano de ação com N responsáveis", () => {
  it("notifica TODOS os responsáveis e não duplica ao rodar duas vezes no mesmo dia", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-many", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });

    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 3);
    const [plan] = await db
      .insert(actionPlansTable)
      .values({
        organizationId: ctx.organizationId,
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Ação vencida",
        status: "open",
        dueDate: ontem,
      })
      .returning({ id: actionPlansTable.id });
    await setPlanResponsibles(ctx.organizationId, plan.id, [ctx.userId, co.id]);

    const primeira = await runActionPlanEscalationPass(ctx.organizationId);
    expect(primeira.scanned).toBe(1); // UM plano, não dois pares
    expect(primeira.alertsCreated).toBe(2); // um alerta por responsável

    const notifs = await db
      .select({ userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, ctx.organizationId),
          eq(notificationsTable.relatedEntityId, plan.id),
          eq(notificationsTable.type, "action_plan_overdue"),
        ),
      );
    expect(notifs.map((n) => n.userId).sort((a, b) => a - b)).toEqual([ctx.userId, co.id].sort((a, b) => a - b));

    // Idempotência no mesmo dia: a dedupe é por (plano + usuário + tipo + dia).
    const segunda = await runActionPlanEscalationPass(ctx.organizationId);
    expect(segunda.alertsCreated).toBe(0);
  });

  it("ignora plano sem nenhum responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-none", role: "org_admin" });
    contexts.push(ctx);
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 2);
    await db.insert(actionPlansTable).values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Órfã",
      status: "open",
      dueDate: ontem,
    });

    const result = await runActionPlanEscalationPass(ctx.organizationId);
    expect(result.scanned).toBe(0);
    expect(result.alertsCreated).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/escalation-responsibles.integration.test.ts
```

Esperado: FAIL — `expected 0 to be 2` em `alertsCreated` (a query ainda filtra pela coluna legada, que hoje só tem o representante… e o segundo responsável nunca é notificado).

- [ ] **Step 3: A varredura passa a percorrer pares (plano × responsável)**

Em `artifacts/api-server/src/services/action-plans/escalation.ts`, troque as duas primeiras linhas de import:

```ts
import { and, eq, gte, isNotNull, isNull, lt, notInArray, or } from "drizzle-orm";
import { actionPlanResponsiblesTable, actionPlansTable, db, notificationsTable, usersTable } from "@workspace/db";
```

Dentro de `runActionPlanEscalationPass`, troque o array `conditions` e a consulta:

```ts
  const conditions = [
    isNotNull(actionPlansTable.dueDate),
    lt(actionPlansTable.dueDate, todayStart),
    notInArray(actionPlansTable.status, ["completed", "cancelled"]),
  ];
  if (typeof orgId === "number") conditions.push(eq(actionPlansTable.organizationId, orgId));

  // Uma linha por (plano × responsável): o INNER JOIN já descarta o plano sem
  // nenhum responsável — não há a quem cobrar.
  const plans = await db
    .select({
      id: actionPlansTable.id,
      organizationId: actionPlansTable.organizationId,
      code: actionPlansTable.code,
      title: actionPlansTable.title,
      dueDate: actionPlansTable.dueDate,
      responsibleUserId: actionPlanResponsiblesTable.userId,
    })
    .from(actionPlansTable)
    .innerJoin(
      actionPlanResponsiblesTable,
      eq(actionPlanResponsiblesTable.actionPlanId, actionPlansTable.id),
    )
    .where(and(...conditions));

  // `scanned` conta PLANOS, não pares — senão um plano com 3 donos viraria 3.
  result.scanned = new Set(plans.map((p) => p.id)).size;
  if (plans.length === 0) return result;
```

E troque o tipo `PlanRow` (o `responsibleUserId` agora nunca é nulo):

```ts
type PlanRow = {
  id: number;
  organizationId: number;
  code: string | null;
  title: string;
  dueDate: Date | null;
  responsibleUserId: number;
};
```

Em `processOrg`, troque a guarda da primeira linha do laço:

```ts
    if (!plan.dueDate) continue;
```

(O `!plan.responsibleUserId` sai: o JOIN garante que existe.)

A passada de eficácia (`runActionPlanEffectivenessEscalationPass`) **não muda** — o avaliador continua sendo um só.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/escalation-responsibles.integration.test.ts
```

Esperado: PASS (2 testes).

- [ ] **Step 5: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/services/action-plans/escalation.ts artifacts/api-server/tests/services/action-plans/escalation-responsibles.integration.test.ts
git commit -m "feat(api): escalonamento cobra todos os responsáveis da ação"
```

---

### Task 6: Suas Pendências — uma pendência por plano

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/types.ts` (campo opcional novo)
- Modify: `artifacts/api-server/src/services/pendencias/providers/action-plans.ts`
- Modify: `artifacts/api-server/src/services/pendencias/aggregate.ts:73-87`
- Test: `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts` (reescrever o seed + acrescentar casos)

**Interfaces:**
- Consumes: `actionPlanResponsiblesTable` (Task 1).
- Produces: `Pendencia.responsibleUserIds?: number[]` — campo **opcional**. Só o provider de planos o preenche; os outros três (kpi, nonconformity, regulatory_document) seguem sem ele e caem no fallback singular. `Pendencia.responsibleUserId` continua **obrigatório** e passa a significar "o responsável, dentro do escopo pedido, que explica esta linha estar aqui" (o de menor id entre os que casam).

- [ ] **Step 1: Escrever os testes que falham**

Em `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts`, troque o `seedPlan` (que hoje grava na coluna legada) e acrescente os casos novos. O arquivo inteiro fica:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, actionPlansTable } from "@workspace/db";
import {
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../../tests/support/backend";
import { setPlanResponsibles } from "../../../src/services/action-plans/responsibles";
import { actionPlanPendenciaProvider } from "../../../src/services/pendencias/providers/action-plans";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

const NOW = new Date(2026, 5, 15);

async function seedPlan(
  ctx: TestOrgContext,
  overrides: {
    title: string;
    status: "open" | "in_progress" | "completed" | "cancelled";
    dueDate: Date | null;
    responsibleIds?: number[];
    closedAt?: Date | null;
  },
) {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "test" },
      title: overrides.title,
      status: overrides.status,
      dueDate: overrides.dueDate,
      closedAt: overrides.closedAt ?? null,
    })
    .returning({ id: actionPlansTable.id });
  await setPlanResponsibles(ctx.organizationId, row.id, overrides.responsibleIds ?? [ctx.userId]);
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
    expect(byId.get(`action_plan:${overdueId}`)?.link.route).toBe(`/planos-acao/${overdueId}`);
    expect(byId.get(`action_plan:${overdueId}`)?.source).toBe("action_plan");
  });

  it("listCompletedToday returns plans closed today", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-done" });
    contexts.push(ctx);
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const doneId = await seedPlan(ctx, {
      title: "Encerrado hoje",
      status: "completed",
      dueDate: null,
      closedAt: new Date(2026, 5, 15, 9, 0, 0),
    });
    await seedPlan(ctx, {
      title: "Encerrado ontem",
      status: "completed",
      dueDate: null,
      closedAt: new Date(2026, 5, 14, 9, 0, 0),
    });

    const items = await actionPlanPendenciaProvider.listCompletedToday!({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId],
      now,
      dueSoonDays: 7,
    });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`action_plan:${doneId}`);
    expect(items[0].statusLabel).toBe("Encerrado hoje");
    expect(items[0].urgency).toBe("no_due");
  });

  it("um plano com 3 responsáveis vira UMA pendência no escopo da filial (não três)", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-dedupe" });
    contexts.push(ctx);
    const b = await createTestUser(ctx, { suffix: "bb", role: "operator" });
    const c = await createTestUser(ctx, { suffix: "cc", role: "operator" });
    const planId = await seedPlan(ctx, {
      title: "Ação de três",
      status: "open",
      dueDate: new Date(2026, 5, 10),
      responsibleIds: [ctx.userId, b.id, c.id],
    });

    // escopo "unit"/"org": o solicitante enxerga os três responsáveis
    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId, b.id, c.id],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`action_plan:${planId}`);
    expect(items[0].responsibleUserIds).toEqual([ctx.userId, b.id, c.id].sort((x, y) => x - y));
  });

  it("no escopo 'mine', o co-responsável vê a ação e responsibleUserIds traz o time todo", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-mine" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const planId = await seedPlan(ctx, {
      title: "Ação compartilhada",
      status: "open",
      dueDate: new Date(2026, 5, 10),
      responsibleIds: [ctx.userId, co.id],
    });

    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [co.id], // escopo "mine" do CO-responsável
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`action_plan:${planId}`);
    // o id que EXPLICA a linha estar aqui é o do próprio solicitante
    expect(items[0].responsibleUserId).toBe(co.id);
    // ...mas a ficha mostra o time inteiro
    expect(items[0].responsibleUserIds).toEqual([ctx.userId, co.id].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts
```

Esperado: FAIL — os dois primeiros testes agora retornam 0 itens (o seed não escreve mais a coluna legada que o provider consulta).

- [ ] **Step 3: Tipo `Pendencia` ganha o campo opcional**

Em `artifacts/api-server/src/services/pendencias/types.ts`, dentro de `export interface Pendencia`, troque as duas linhas do responsável por:

```ts
  /** O responsável, DENTRO do escopo pedido, que explica esta linha estar na lista. */
  responsibleUserId: number;
  /** Todos os responsáveis do item, quando ele admite mais de um (hoje: planos de
   *  ação). Ausente nos demais provedores — o agregador cai no singular acima. */
  responsibleUserIds?: number[];
  responsibleName?: string;
```

- [ ] **Step 4: Provider emite uma pendência por plano**

Substitua **todo** o conteúdo de `artifacts/api-server/src/services/pendencias/providers/action-plans.ts` por:

```ts
import { and, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { db, actionPlanResponsiblesTable, actionPlansTable } from "@workspace/db";
import {
  classifyUrgency,
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

/** Janela [início do dia de `now`, início do dia seguinte) para filtrar "hoje". */
export function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
};

type PlanRow = {
  id: number;
  code: string | null;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  closedAt: Date | null;
};

/**
 * Planos com AO MENOS UM responsável dentro do escopo, com TODOS os responsáveis
 * de cada um. Duas consultas de propósito: a primeira decide quais planos entram
 * (pertinência ao escopo), a segunda descreve quem responde por eles — misturar
 * as duas num JOIN só traria apenas os responsáveis do escopo, e a UI mostraria
 * um time incompleto.
 */
async function loadScopedPlans(
  ctx: PendenciaProviderContext,
  statuses: ("open" | "in_progress" | "completed" | "cancelled")[],
  extraConditions: SQL[] = [],
): Promise<{ plans: PlanRow[]; responsiblesByPlan: Map<number, number[]> }> {
  const matched = await db
    .selectDistinct({ id: actionPlanResponsiblesTable.actionPlanId })
    .from(actionPlanResponsiblesTable)
    .innerJoin(actionPlansTable, eq(actionPlansTable.id, actionPlanResponsiblesTable.actionPlanId))
    .where(
      and(
        eq(actionPlansTable.organizationId, ctx.orgId),
        inArray(actionPlanResponsiblesTable.userId, ctx.responsibleUserIds),
        inArray(actionPlansTable.status, statuses),
        ...extraConditions,
      ),
    );

  const planIds = matched.map((m) => m.id);
  if (planIds.length === 0) return { plans: [], responsiblesByPlan: new Map() };

  const plans = await db
    .select({
      id: actionPlansTable.id,
      code: actionPlansTable.code,
      title: actionPlansTable.title,
      status: actionPlansTable.status,
      priority: actionPlansTable.priority,
      dueDate: actionPlansTable.dueDate,
      closedAt: actionPlansTable.closedAt,
    })
    .from(actionPlansTable)
    .where(inArray(actionPlansTable.id, planIds));

  const respRows = await db
    .select({
      planId: actionPlanResponsiblesTable.actionPlanId,
      userId: actionPlanResponsiblesTable.userId,
    })
    .from(actionPlanResponsiblesTable)
    .where(inArray(actionPlanResponsiblesTable.actionPlanId, planIds));

  const responsiblesByPlan = new Map<number, number[]>();
  for (const r of respRows) {
    const bucket = responsiblesByPlan.get(r.planId) ?? [];
    bucket.push(r.userId);
    responsiblesByPlan.set(r.planId, bucket);
  }
  for (const bucket of responsiblesByPlan.values()) bucket.sort((a, b) => a - b);

  return { plans, responsiblesByPlan };
}

/** O responsável que EXPLICA a linha estar na lista do solicitante: o menor id
 *  entre os que casam com o escopo. Determinístico. */
function matchedResponsible(all: number[], scope: number[]): number {
  const inScope = all.filter((id) => scope.includes(id));
  return (inScope.length > 0 ? inScope : all)[0];
}

export const actionPlanPendenciaProvider: PendenciaProvider = {
  source: "action_plan",

  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { plans, responsiblesByPlan } = await loadScopedPlans(ctx, ["open", "in_progress"]);

    return plans.map((p): Pendencia => {
      const all = responsiblesByPlan.get(p.id) ?? [];
      const dueIso = p.dueDate ? p.dueDate.toISOString() : null;
      return {
        id: `action_plan:${p.id}`,
        source: "action_plan",
        sourceLabel: SOURCE_LABELS.action_plan,
        title: p.title,
        subtitle: p.code ?? undefined,
        statusLabel: STATUS_LABELS[p.status] ?? p.status,
        dueDate: dueIso,
        urgency: classifyUrgency(dueIso, ctx.now, ctx.dueSoonDays),
        responsibleUserId: matchedResponsible(all, ctx.responsibleUserIds),
        responsibleUserIds: all,
        link: { route: `/planos-acao/${p.id}`, ctaLabel: "Ver plano" },
        meta: { code: p.code, priority: p.priority, status: p.status },
      };
    });
  },

  async listCompletedToday(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];
    const { start, end } = dayBounds(ctx.now);
    const { plans, responsiblesByPlan } = await loadScopedPlans(
      ctx,
      ["completed", "cancelled"],
      [gte(actionPlansTable.closedAt, start), lt(actionPlansTable.closedAt, end)],
    );

    return plans.map((p): Pendencia => {
      const all = responsiblesByPlan.get(p.id) ?? [];
      return {
        id: `action_plan:${p.id}`,
        source: "action_plan",
        sourceLabel: SOURCE_LABELS.action_plan,
        title: p.title,
        subtitle: p.code ?? undefined,
        statusLabel: "Encerrado hoje",
        dueDate: p.closedAt ? p.closedAt.toISOString() : null,
        urgency: "no_due",
        responsibleUserId: matchedResponsible(all, ctx.responsibleUserIds),
        responsibleUserIds: all,
        link: { route: `/planos-acao/${p.id}`, ctaLabel: "Ver plano" },
        meta: { code: p.code, status: p.status, completed: true },
      };
    });
  },
};
```

- [ ] **Step 5: O agregador compõe o nome de N responsáveis**

Em `artifacts/api-server/src/services/pendencias/aggregate.ts`, substitua o bloco `// Enrich responsibleName ...` (linhas ~73-87) por:

```ts
  // Enrich responsibleName (needed by the unit/org scopes). Um item pode ter mais
  // de um responsável (planos de ação) — aí o rótulo vira "Maria Silva +2".
  const ids = [
    ...new Set(
      [...items, ...completedToday].flatMap((i) => i.responsibleUserIds ?? [i.responsibleUserId]),
    ),
  ];
  if (ids.length > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.organizationId, ctx.orgId), inArray(usersTable.id, ids)));
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const item of [...items, ...completedToday]) {
      item.responsibleName = composeResponsibleName(item, nameById);
    }
  }
```

E acrescente, no fim do arquivo:

```ts
/** "Maria Silva" para um; "Maria Silva +2" para três. Ordem alfabética para o
 *  rótulo não dançar entre requisições. */
function composeResponsibleName(
  item: Pendencia,
  nameById: Map<number, string>,
): string | undefined {
  const ids = item.responsibleUserIds ?? [item.responsibleUserId];
  const names = ids
    .map((id) => nameById.get(id))
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (names.length === 0) return undefined;
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}
```

Se `Pendencia` ainda não estiver importado em `aggregate.ts`, acrescente-o ao import de `./types`.

- [ ] **Step 6: Rodar os testes e confirmar que passam**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/
```

Esperado: PASS (provider + aggregate + rotas de pendências).

- [ ] **Step 7: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/services/pendencias artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts
git commit -m "feat(pendencias): plano com N responsáveis vira UMA pendência"
```

---

### Task 7: Frontend — formulários (ficha, nova ação, KPI) e opções do avaliador

**Files:**
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/responsible-options.ts`
- Modify: `artifacts/web/src/pages/app/planos-acao/[id].tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/eficacia-panel.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx`
- Modify: `artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx`
- Test: `artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts` (reescrever)

**Interfaces:**
- Consumes: `ActionPlan.responsibles` e `UpdateActionPlanBody.responsibleUserIds` (Task 2); backend das Tasks 3–4.
- Produces: `buildResponsibleOptions(orgUsers, responsibles): SearchableMultiSelectOption[]` — assinatura NOVA (dois argumentos, valores `number`).

- [ ] **Step 1: Reescrever o teste de `buildResponsibleOptions`**

Substitua **todo** o conteúdo de `artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts` por:

```ts
import { describe, expect, it } from "vitest";
import { buildResponsibleOptions } from "@/pages/app/planos-acao/_components/responsible-options";

const ORG_USERS = [
  { id: 1, name: "Ana" },
  { id: 2, name: "Bruno" },
];

describe("buildResponsibleOptions", () => {
  it("mapeia os usuários da org quando a lista está disponível", () => {
    expect(buildResponsibleOptions(ORG_USERS, [])).toEqual([
      { value: 1, label: "Ana" },
      { value: 2, label: "Bruno" },
    ]);
  });

  it("semeia TODOS os responsáveis quando a lista da org volta vazia (operador sem permissão)", () => {
    const options = buildResponsibleOptions(
      [],
      [
        { userId: 7, name: "Carla" },
        { userId: 9, name: "Diego" },
      ],
    );
    expect(options).toEqual([
      { value: 7, label: "Carla" },
      { value: 9, label: "Diego" },
    ]);
  });

  it("não duplica um responsável que já está na lista da org", () => {
    const options = buildResponsibleOptions(ORG_USERS, [{ userId: 2, name: "Bruno" }]);
    expect(options).toEqual([
      { value: 1, label: "Ana" },
      { value: 2, label: "Bruno" },
    ]);
  });

  it("mistura: semeia só quem falta", () => {
    const options = buildResponsibleOptions(ORG_USERS, [
      { userId: 2, name: "Bruno" },
      { userId: 7, name: "Carla" },
    ]);
    expect(options).toEqual([
      { value: 7, label: "Carla" },
      { value: 1, label: "Ana" },
      { value: 2, label: "Bruno" },
    ]);
  });

  it("sem responsáveis e sem usuários, devolve lista vazia", () => {
    expect(buildResponsibleOptions([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts
```

Esperado: FAIL (a assinatura antiga tem 3 argumentos e devolve `value: string`).

- [ ] **Step 3: Reescrever `responsible-options.ts`**

Substitua **todo** o conteúdo de `artifacts/web/src/pages/app/planos-acao/_components/responsible-options.ts` por:

```ts
import type { SearchableMultiSelectOption } from "@/components/ui/searchable-multi-select";

/**
 * Opções do seletor de "Responsáveis" de um plano.
 *
 * Só admin e gerente podem ler a lista de usuários da org, então `orgUsers` volta
 * VAZIA para o operador que abre o plano atribuído a ele (via "Suas Pendências" ou
 * "Ações vinculadas" na tela de origem). O payload do plano já carrega os nomes em
 * `responsibles`, então semeamos o seletor com eles — senão o campo cairia no
 * placeholder e o operador não veria quem responde pela ação.
 */
export function buildResponsibleOptions(
  orgUsers: Array<{ id: number; name: string }>,
  responsibles: Array<{ userId: number; name: string }>,
): SearchableMultiSelectOption[] {
  const options = orgUsers.map((user) => ({ value: user.id, label: user.name }));
  const known = new Set(options.map((option) => option.value));

  const missing = responsibles
    .filter((r) => !known.has(r.userId))
    .map((r) => ({ value: r.userId, label: r.name || "Responsável atual" }));

  return [...missing, ...options];
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts
```

Esperado: PASS (5 testes).

- [ ] **Step 5: Ficha do plano (`[id].tsx`)**

Em `artifacts/web/src/pages/app/planos-acao/[id].tsx`:

**(a)** troque o import do seletor:

```ts
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
```

(mantenha `SearchableSelect` importado — ele ainda é usado em outros campos da ficha; se o typecheck acusar import não usado, remova-o.)

**(b)** no `useState` do `form`, troque `responsibleUserId: "",` por:

```ts
    responsibleUserIds: [] as number[],
```

**(c)** na hidratação (`const hydrated: typeof form = {`), troque a linha do responsável por:

```ts
      responsibleUserIds: plan.responsibles.map((r) => r.userId),
```

**(d)** em `buildPayload`, troque a linha do responsável por:

```ts
      responsibleUserIds: f.responsibleUserIds,
```

**(e)** troque o campo do formulário (o bloco `<Label>Responsável</Label>` + `<SearchableSelect>`) por:

```tsx
                <div className="space-y-1.5">
                  <Label>Responsáveis</Label>
                  <SearchableMultiSelect
                    options={buildResponsibleOptions(orgUsers, plan.responsibles)}
                    selected={form.responsibleUserIds}
                    onToggle={(id) =>
                      patch(
                        "responsibleUserIds",
                        form.responsibleUserIds.includes(id)
                          ? form.responsibleUserIds.filter((v) => v !== id)
                          : [...form.responsibleUserIds, id],
                      )
                    }
                    placeholder="Selecione"
                    searchPlaceholder="Buscar usuário..."
                    emptyMessage="Nenhum usuário encontrado"
                    disabled={!canEdit}
                  />
                </div>
```

**(f)** na chamada do `<EficaciaPanel>`, troque a prop:

```tsx
              responsibleUserIds={form.responsibleUserIds}
```

O `diffActionPlanPayload` já compara arrays estruturalmente (`payload-diff.ts:9-11`), então o autosave só manda `responsibleUserIds` quando o conjunto realmente mudou — nada a fazer lá.

- [ ] **Step 6: `EficaciaPanel` exclui TODOS os responsáveis**

Em `artifacts/web/src/pages/app/planos-acao/_components/eficacia-panel.tsx`, troque a prop e o filtro:

```ts
  responsibleUserIds = [],
}: {
  value: EficaciaValue;
  onChange: (next: EficaciaValue) => void;
  orgUsers: { id: number; name: string; role?: string }[];
  readOnly?: boolean;
  /** Only the designated evaluator (or an admin) may issue the verdict. */
  canEvaluate?: boolean;
  /** Only an SGI admin may (re)designate the evaluator. */
  canAssignEvaluator?: boolean;
  /** Responsáveis da ação — nenhum deles pode avaliar a própria eficácia (ISO). */
  responsibleUserIds?: number[];
}) {
```

e, no `<SearchableSelect>` do avaliador:

```tsx
            options={orgUsers
              .filter((u) => !responsibleUserIds.includes(u.id) && u.role !== "analyst")
              .map((u) => ({ value: String(u.id), label: u.name }))}
```

- [ ] **Step 7: Diálogo "Nova ação"**

Em `artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx`:

**(a)** troque o import `SearchableSelect` por `SearchableMultiSelect`:

```ts
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
```

**(b)** no `type FormState`, troque `responsibleUserId: string;` por `responsibleUserIds: number[];`

**(c)** em `initialForm`, troque `responsibleUserId: "",` por `responsibleUserIds: [],`

**(d)** no payload do `createPlan.mutateAsync`, troque a linha por:

```ts
          responsibleUserIds: form.responsibleUserIds,
```

**(e)** troque o campo:

```tsx
          <div className="space-y-1.5">
            <Label>Responsáveis</Label>
            <SearchableMultiSelect
              options={orgUsers.map((u) => ({ value: u.id, label: u.name }))}
              selected={form.responsibleUserIds}
              onToggle={(id) =>
                setForm((f) => ({
                  ...f,
                  responsibleUserIds: f.responsibleUserIds.includes(id)
                    ? f.responsibleUserIds.filter((v) => v !== id)
                    : [...f.responsibleUserIds, id],
                }))
              }
              placeholder="Selecione"
              searchPlaceholder="Buscar usuário..."
              emptyMessage="Nenhum usuário encontrado"
            />
          </div>
```

- [ ] **Step 8: Diálogo de célula vermelha do KPI**

Em `artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx`, aplique as mesmas cinco trocas:

**(a)** import: `import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";`

**(b)** `type PlanFormState`: `responsibleUserIds: number[];` (no lugar de `responsibleUserId: string;`)

**(c)** `emptyForm()`: `responsibleUserIds: [],`

**(d)** no `handleSubmit`, remova a linha `const responsibleUserId = form.responsibleUserId ? Number(form.responsibleUserId) : null;` e troque, no payload, `responsibleUserId,` por `responsibleUserIds: form.responsibleUserIds,`

**(e)** o campo do formulário:

```tsx
        <div className="space-y-1.5">
          <Label>Responsáveis</Label>
          <SearchableMultiSelect
            options={orgUsers.map((u) => ({ value: u.id, label: u.name }))}
            selected={form.responsibleUserIds}
            onToggle={(id) =>
              setForm((f) => ({
                ...f,
                responsibleUserIds: f.responsibleUserIds.includes(id)
                  ? f.responsibleUserIds.filter((v) => v !== id)
                  : [...f.responsibleUserIds, id],
              }))
            }
            placeholder="Selecione os responsáveis"
            searchPlaceholder="Buscar usuário..."
            emptyMessage={
              orgUsers.length === 0
                ? "Nenhum usuário com conta. Cadastre em Configurações → Usuários."
                : "Nenhum usuário encontrado"
            }
          />
        </div>
```

A lista de planos existentes desse diálogo (linha ~367, `plan.responsibleUserName`) ainda usa o campo legado — ela é tratada na Task 8.

- [ ] **Step 9: Typecheck e commit**

```bash
pnpm typecheck
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts
git add artifacts/web/src/pages/app/planos-acao artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts
git commit -m "feat(web): formulários de plano de ação com múltiplos responsáveis"
```

---

### Task 8: Frontend — leitura (listagem, painel, histórico)

**Files:**
- Modify: `artifacts/web/src/lib/action-plans-client.ts` (novo helper `formatResponsibles`)
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/lista-screen.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/painel-operacional.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/comentarios-historico.tsx`
- Modify: `artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx` (linha ~367)
- Test: `artifacts/web/tests/lib/format-responsibles.unit.test.ts` (criar)

**Interfaces:**
- Consumes: `ActionPlanListItem.responsibles` (Task 2), backend da Task 3.
- Produces: `formatResponsibles(responsibles): string | null` — exportada de `@/lib/action-plans-client`. Um nome quando há um; `"Maria Silva +2"` quando há três; `null` quando não há nenhum. Mesma convenção do rótulo de Suas Pendências (Task 6).

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/web/tests/lib/format-responsibles.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatResponsibles } from "@/lib/action-plans-client";

describe("formatResponsibles", () => {
  it("devolve null quando não há responsável", () => {
    expect(formatResponsibles([])).toBeNull();
    expect(formatResponsibles(undefined)).toBeNull();
  });

  it("devolve o nome quando há um só", () => {
    expect(formatResponsibles([{ userId: 1, name: "Maria Silva" }])).toBe("Maria Silva");
  });

  it("resume com +N quando há vários", () => {
    expect(
      formatResponsibles([
        { userId: 1, name: "Maria Silva" },
        { userId: 2, name: "João Souza" },
        { userId: 3, name: "Ana Costa" },
      ]),
    ).toBe("Maria Silva +2");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/lib/format-responsibles.unit.test.ts
```

Esperado: FAIL — `formatResponsibles` não é exportado.

- [ ] **Step 3: Implementar o helper**

Acrescente ao fim de `artifacts/web/src/lib/action-plans-client.ts`:

```ts
/**
 * Rótulo curto do conjunto de responsáveis: "Maria Silva" para um, "Maria Silva
 * +2" para três. A lista já chega do servidor ordenada por nome. Mesma convenção
 * do rótulo de "Suas Pendências" — os dois lugares mostram a mesma coisa.
 */
export function formatResponsibles(
  responsibles: Array<{ userId: number; name: string }> | undefined,
): string | null {
  if (!responsibles || responsibles.length === 0) return null;
  if (responsibles.length === 1) return responsibles[0].name;
  return `${responsibles[0].name} +${responsibles.length - 1}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/lib/format-responsibles.unit.test.ts
```

Esperado: PASS (3 testes).

- [ ] **Step 5: Listagem — coluna e busca**

Em `artifacts/web/src/pages/app/planos-acao/_components/lista-screen.tsx`:

**(a)** acrescente `formatResponsibles,` à lista de imports vinda de `@/lib/action-plans-client`.

**(b)** na busca textual, troque o array por:

```ts
    return plans.filter((p) =>
      [p.title, p.code, ...p.responsibles.map((r) => r.name), p.sourceContext?.label]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
```

**(c)** troque o cabeçalho da coluna:

```tsx
                <TableHead>Responsáveis</TableHead>
```

**(d)** troque a célula:

```tsx
                    <TableCell className="text-sm">
                      {formatResponsibles(p.responsibles) ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
```

O filtro "Atribuídas a mim" e o `<Select>` de responsável **não mudam** — o query param manteve nome e passou a significar pertinência ao conjunto (Task 3).

- [ ] **Step 6: Painel operacional**

Em `artifacts/web/src/pages/app/planos-acao/_components/painel-operacional.tsx`, acrescente `formatResponsibles` ao import de `@/lib/action-plans-client` e troque a linha do alerta:

```tsx
          {formatResponsibles(p.responsibles) ? ` · ${formatResponsibles(p.responsibles)}` : ""}
```

- [ ] **Step 7: Histórico legível**

Em `artifacts/web/src/pages/app/planos-acao/_components/comentarios-historico.tsx`, acrescente perto do topo (junto às outras constantes do módulo):

```ts
/** O log grava a chave crua do campo; a tela é lida por auditor, não por
 *  programador. Traduzimos o que esta entrega toca — os demais campos seguem
 *  crus até alguém precisar deles. */
const FIELD_LABELS: Record<string, string> = {
  responsibles: "Responsáveis",
};
```

e troque o laço que monta as partes do diff:

```ts
  for (const [field, { from, to }] of Object.entries(c.fields)) {
    if (field === "planning") continue;
    parts.push(`${FIELD_LABELS[field] ?? field}: ${fmt(from)} → ${fmt(to)}`);
  }
```

`fmt` já junta arrays com `", "` (`comentarios-historico.tsx:72`), então a entrada sai como **"Responsáveis: Maria Silva → Maria Silva, João Souza"**.

- [ ] **Step 8: Lista de planos do diálogo de KPI**

Em `artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx`, acrescente `formatResponsibles` ao import de `@/lib/action-plans-client` e troque o trecho que exibe o responsável de um plano existente (~linha 367):

```tsx
            {formatResponsibles(plan.responsibles) && (
              <span className="text-[11px] text-muted-foreground truncate">
                {formatResponsibles(plan.responsibles)}
              </span>
            )}
```

- [ ] **Step 9: Typecheck, suíte web e commit**

```bash
pnpm typecheck
pnpm exec vitest run --project web-unit
git add artifacts/web/src/lib/action-plans-client.ts artifacts/web/src/pages/app/planos-acao artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx artifacts/web/tests/lib/format-responsibles.unit.test.ts
git commit -m "feat(web): listagem, painel e histórico exibem N responsáveis"
```

---

### Task 9: Limpeza — os campos legados saem do contrato

Nesta altura, **nada** no repositório lê `responsibleUserId` / `responsibleUserName` do payload nem envia `responsibleUserId` no corpo. Removê-los do contrato é o passo que torna o modelo honesto. A coluna do banco **permanece** (espelho de escrita) — quem sai daqui é só o contrato HTTP.

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/services/action-plans/serializers.ts`
- Modify: `artifacts/api-server/src/routes/action-plans.ts`
- Modify: `artifacts/api-server/src/services/action-plans/responsibles.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1–8.
- Produces: contrato final — `responsibles[]` na leitura, `responsibleUserIds[]` na escrita, e nada mais.

- [ ] **Step 1: Confirmar que ninguém mais usa os campos legados**

```bash
grep -rn "responsibleUserName\|responsibleUserId" artifacts/web/src artifacts/api-server/src --include=*.ts --include=*.tsx | grep -v "responsibleUserIds" | grep -v "src/services/action-plans/responsibles.ts" | grep -v "legacyResponsibleId\|legacyListItem\|legacyOf"
```

Esperado: apenas as ocorrências do **espelho de escrita** (`update.responsibleUserId = legacyResponsibleId(...)`, o `values({ responsibleUserId: ... })` do create) e a query-param `responsibleUserId` da listagem — que **fica**. Se aparecer algo mais, o consumidor foi esquecido: volte e migre-o antes de seguir.

- [ ] **Step 2: Remover do OpenAPI**

Em `lib/api-spec/openapi.yaml`, apague as propriedades `responsibleUserId` e `responsibleUserName` dos schemas `ActionPlan` e `ActionPlanListItem`, e a propriedade `responsibleUserId` de `CreateActionPlanBody` e `UpdateActionPlanBody`.

**Não toque** no parâmetro de query `responsibleUserId` da operação `listActionPlans` — ele permanece (significa "é um dos responsáveis").

- [ ] **Step 3: Regerar**

```bash
pnpm --filter @workspace/api-spec codegen
```

- [ ] **Step 4: Remover a emissão legada do serializer**

Em `artifacts/api-server/src/services/action-plans/serializers.ts`, apague as duas linhas `responsibleUserId:` / `responsibleUserName:` do objeto de `serializePlan` e apague a função `legacyOf`.

- [ ] **Step 5: Remover a emissão legada da listagem**

Em `artifacts/api-server/src/routes/action-plans.ts`, apague as duas linhas `responsibleUserId:` / `responsibleUserName:` do `res.json(plans.map(...))` e apague a função `legacyListItem`.

- [ ] **Step 6: Remover o ramo legado de entrada**

Em `artifacts/api-server/src/services/action-plans/responsibles.ts`, simplifique `incomingResponsibleIds` (o formato legado não existe mais no contrato):

```ts
/**
 * Conjunto de responsáveis que veio no corpo da requisição.
 *
 * `undefined` significa "o cliente não mandou o campo" — num PATCH parcial isso é
 * diferente de "mandou vazio": o primeiro não mexe no conjunto, o segundo o esvazia.
 */
export function incomingResponsibleIds(body: {
  responsibleUserIds?: number[] | null;
}): number[] | undefined {
  if (body.responsibleUserIds === undefined) return undefined;
  return body.responsibleUserIds === null ? [] : [...new Set(body.responsibleUserIds)];
}
```

`legacyResponsibleId` **permanece** — ela alimenta o espelho de escrita no banco, que só sai no follow-up.

- [ ] **Step 7: Rodar tudo**

```bash
pnpm typecheck
pnpm test:unit
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-responsibles.integration.test.ts artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts artifacts/api-server/tests/services/action-plans artifacts/api-server/tests/services/pendencias
```

Esperado: PASS em tudo.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src
git commit -m "refactor(api): remove responsibleUserId/Name do contrato de planos de ação"
```

---

### Task 10: DDL de produção (escrever; **não** aplicar sem autorização)

**Files:**
- Create: `scripts/sql/20260714_add_action_plan_responsibles.sql`

**Interfaces:**
- Consumes: schema da Task 1.
- Produces: o SQL idempotente que cria a junção e faz o backfill na PROD, mais a consulta de paridade.

> **Nunca rode `pnpm db push` contra a produção.** Ele aponta para o Neon de PROD e tenta dropar colunas de outras branches. Este arquivo é aplicado à mão, e **só** com autorização explícita do usuário.

- [ ] **Step 1: Escrever o script**

Crie `scripts/sql/20260714_add_action_plan_responsibles.sql`:

```sql
-- Múltiplos responsáveis no plano de ação (spec 2026-07-14).
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
--
-- Ordem de deploy:
--   1. aplicar este script  (o código ANTIGO segue rodando: ignora a tabela nova)
--   2. subir o código novo  (lê a junção; escreve junção + espelho legado)
--   3. rodar a verificação de paridade no fim deste arquivo
--   4. FOLLOW-UP (outro dia, depois de validado): dropar action_plans.responsible_user_id

CREATE TABLE IF NOT EXISTS action_plan_responsibles (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations (id),
  action_plan_id  integer NOT NULL REFERENCES action_plans (id) ON DELETE CASCADE,
  user_id         integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS action_plan_responsibles_plan_user_uq
  ON action_plan_responsibles (action_plan_id, user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_user_idx
  ON action_plan_responsibles (user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_org_idx
  ON action_plan_responsibles (organization_id);

-- Backfill: uma linha por plano que já tem responsável.
INSERT INTO action_plan_responsibles (organization_id, action_plan_id, user_id)
SELECT organization_id, id, responsible_user_id
FROM action_plans
WHERE responsible_user_id IS NOT NULL
ON CONFLICT (action_plan_id, user_id) DO NOTHING;

-- ─── Verificação de paridade (rodar DEPOIS do deploy do código novo) ─────────
-- `antigos` e `migrados` têm de bater. Só então o drop da coluna fica liberado.
--
-- SELECT
--   (SELECT count(*) FROM action_plans WHERE responsible_user_id IS NOT NULL) AS antigos,
--   (SELECT count(DISTINCT action_plan_id) FROM action_plan_responsibles)     AS migrados;
```

- [ ] **Step 2: Ensaiar o script contra o banco de TESTE (nunca a PROD)**

O banco de teste já tem a tabela (veio do `test:integration:db:push` na Task 1), então o valor aqui é provar a **idempotência** — que rodar o script por cima de um schema que já existe não quebra:

```bash
TEST_ENV=integration pnpm exec tsx -e "
import { db } from '@workspace/db';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
const ddl = readFileSync('scripts/sql/20260714_add_action_plan_responsibles.sql', 'utf8');
await db.execute(sql.raw(ddl));
console.log('DDL aplicada sem erro (idempotente)');
process.exit(0);
"
```

Esperado: `DDL aplicada sem erro (idempotente)`. Se falhar com "already exists", algum `IF NOT EXISTS` está faltando — corrija e repita.

- [ ] **Step 3: Commit**

```bash
git add scripts/sql/20260714_add_action_plan_responsibles.sql
git commit -m "chore(db): DDL + backfill de action_plan_responsibles para a produção"
```

- [ ] **Step 4: Parar e pedir autorização**

**NÃO aplique nada na produção.** Relate ao usuário:
- que o script está pronto em `scripts/sql/20260714_add_action_plan_responsibles.sql`;
- que a aplicação na PROD exige o **go** explícito dele;
- que a ordem é: DDL → deploy do código → consulta de paridade → (outro dia) drop da coluna.

---

## Encerramento

- [ ] **Suíte completa**

```bash
pnpm typecheck
pnpm test:unit
TEST_ENV=integration pnpm test:integration
```

- [ ] **Diário de bordo** (obrigatório pelo CLAUDE.md — registrar entregas significativas)

```bash
python3 scripts/diario-add.py --modulo "Gestão de Ações" --titulo "Plano de ação com múltiplos responsáveis" <<'EOF'
A cliente revalidou a regra: uma ação pode ter mais de um responsável. O campo
único deu lugar a um conjunto de responsáveis iguais — não há "principal".

O que muda na operação: a cobrança automática (e-mail e alerta de ação vencida)
passa a chegar a todos os responsáveis; a ação aparece na lista de pendências de
cada um deles; todos alcançam a ficha, mesmo sem permissão no módulo; e o filtro
"Atribuídas a mim" traz a ação para qualquer um do grupo. O avaliador da eficácia
segue tendo de ser alguém de fora — agora, de fora do grupo inteiro.

Como brinde, o histórico da ação deixou de exibir identificadores crus
("responsibleUserId: 3 → 7") e passou a mostrar nomes.

Pendente: a estrutura de dados de PRODUÇÃO ainda NÃO foi aplicada (script pronto,
aguardando autorização), e a coluna antiga segue no banco como rede de segurança
para rollback — seu descarte é follow-up.

Validações: pnpm typecheck, pnpm test:unit e a suíte de integração (planos de
ação, escalonamento e pendências) passando.
EOF
```

Ajuste o texto ao que **de fato** foi entregue — se alguma task ficou pelo caminho, o diário tem de dizer isso. Não inflar nem omitir.

- [ ] **PR draft**

```bash
git push -u origin HEAD
gh pr create --draft --title "feat: plano de ação com múltiplos responsáveis" --body "$(cat <<'EOF'
Fecha a regra revalidada pela cliente: um plano de ação passa a ter N responsáveis
iguais (sem "principal").

## O que muda
- `action_plans.responsible_user_id` (escalar) → `action_plan_responsibles` (N:N).
- Contrato: `responsibles: [{userId,name}]` na leitura, `responsibleUserIds: number[]`
  na escrita (substituição total do conjunto).
- Os cinco mecanismos acoplados ao responsável passam a considerar o conjunto:
  autorização da ficha, Suas Pendências, escalonamento/e-mail, filtro "Atribuídas a
  mim" e a independência do avaliador de eficácia (que agora não pode ser **nenhum**
  dos responsáveis).
- O histórico deixa de mostrar IDs crus e passa a mostrar nomes.

## ⚠️ Migração de produção NÃO aplicada
`scripts/sql/20260714_add_action_plan_responsibles.sql` está pronto (idempotente:
cria a tabela + backfill), mas **não foi executado**. Ordem: DDL → deploy → consulta
de paridade → (follow-up) drop de `action_plans.responsible_user_id`, que até lá
segue como espelho de escrita para rollback.

## Impacto de comportamento
Um plano em que a mesma pessoa é avaliadora da eficácia e vira co-responsável passa a
ser rejeitado no save (400). É a regra ISO de independência da verificação —
intencional, não bug.

Spec: `docs/superpowers/specs/2026-07-14-plano-acao-multiplos-responsaveis-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
