# Catálogo de Métodos de verificação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a lista fixa em código do campo "Método de verificação" (Avaliação de eficácia do plano de ação) por um catálogo gerenciável por organização, criado/renomeado/desativado em Configurações → Sistema, com os 6 métodos atuais virando sementes.

**Architecture:** Cópia fiel do catálogo de normas (`regulatory_norms`, PR #149): tabela org-scoped `effectiveness_methods` (`label` + `active` + `sort_order`, unique case-insensitive por org); rotas GET/POST/PATCH (sem DELETE — remover é desativar); leitura para qualquer usuário autenticado, escrita só `org_admin`. `action_plans` ganha `effectiveness_method_id` (FK); a coluna enum `effectiveness_method` vira **legado** — permanece no banco, é serializada para exibição, mas nunca mais recebe escrita. Um script de backfill semeia os 6 padrões em cada organização e converte os planos existentes.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), Express 5, OpenAPI 3.1 + Orval (zod + React Query gerados), React 19 + Vite, Vitest + supertest.

## Global Constraints

- **Nunca editar arquivos gerados** (`lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*`). A fonte é `lib/api-spec/openapi.yaml`; rodar `pnpm --filter @workspace/api-spec codegen`.
- **Testes de integração exigem `TEST_ENV=integration`.** Sem isso o vitest carrega o `.env` e bate no **Neon de produção**.
- **Nunca rodar `pnpm --filter @workspace/db push` apontando para produção.** Schema do banco de teste: `pnpm test:integration:db:push`.
- Estilo: Prettier (2 espaços, aspas duplas, trailing commas). Rótulos e mensagens de erro em **PT-BR**; comentários e nomes de código em inglês, como no resto do repo.
- Rótulos-semente **verbatim** (idênticos aos de hoje, na ordem da tela):
  1. `Verificação por indicador` · 2. `Auditoria interna` · 3. `Inspeção física (campo)` · 4. `Verificação por treinamento` · 5. `Verificação por amostragem` · 6. `Redução de risco`
- Códigos legados do enum, na mesma ordem: `indicator`, `internal_audit`, `field_inspection`, `training`, `sampling`, `risk_reduction`.
- Todo commit deve passar `pnpm typecheck`.

---

### Task 1: Schema — tabela do catálogo + coluna no plano de ação

**Files:**
- Create: `lib/db/src/schema/effectiveness-methods.ts`
- Modify: `lib/db/src/schema/index.ts` (barrel)
- Modify: `lib/db/src/schema/action-plans.ts:139-146` (comentário de legado no enum) e `:191` (nova coluna)

**Interfaces:**
- Consumes: `organizationsTable` de `./organizations`
- Produces: `effectivenessMethodsTable`, `type EffectivenessMethod = typeof effectivenessMethodsTable.$inferSelect`, e a coluna `actionPlansTable.effectivenessMethodId` (`integer | null`)

- [ ] **Step 1: Criar o schema da tabela**

`lib/db/src/schema/effectiveness-methods.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Catálogo de métodos de verificação de eficácia, por organização. Substitui a
 * lista fixa do enum `action_plan_effectiveness_method` (mantido como legado).
 * Planos referenciam por id; `active=false` tira do seletor sem quebrar o que
 * já referencia — espelha `regulatory_norms`.
 */
export const effectivenessMethodsTable = pgTable(
  "effectiveness_methods",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("effectiveness_method_org_lower_label_unique").on(
      table.organizationId,
      sql`lower(${table.label})`,
    ),
  ],
);

export const insertEffectivenessMethodSchema = createInsertSchema(
  effectivenessMethodsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEffectivenessMethod = z.infer<
  typeof insertEffectivenessMethodSchema
>;
export type EffectivenessMethod =
  typeof effectivenessMethodsTable.$inferSelect;
```

- [ ] **Step 2: Exportar no barrel**

Em `lib/db/src/schema/index.ts`, adicionar a linha na posição alfabética (logo depois de `export * from "./employees";` — confira a vizinhança real do arquivo antes de inserir):

```ts
export * from "./effectiveness-methods";
```

- [ ] **Step 3: Adicionar a coluna em `action_plans`**

Em `lib/db/src/schema/action-plans.ts`, importar a tabela nova (junto dos outros imports de schema, ex. logo após o import de `organizations`):

```ts
import { effectivenessMethodsTable } from "./effectiveness-methods";
```

Marcar o enum como legado (linha ~139, acima de `export const actionPlanEffectivenessMethodEnum`):

```ts
/**
 * @deprecated Legado. O método de verificação virou catálogo por organização
 * (`effectiveness_methods` + `action_plans.effectiveness_method_id`). Mantido
 * para ler planos criados antes da migração — não dropar, não escrever mais.
 */
export const actionPlanEffectivenessMethodEnum = pgEnum("action_plan_effectiveness_method", [
```

E, na definição da tabela (linha ~191), deixar a coluna legada onde está e acrescentar a nova logo abaixo:

```ts
    /** @deprecated legado — só leitura, para planos anteriores ao catálogo. */
    effectivenessMethod: actionPlanEffectivenessMethodEnum("effectiveness_method"),
    effectivenessMethodId: integer("effectiveness_method_id").references(
      () => effectivenessMethodsTable.id,
      { onDelete: "set null" },
    ),
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (0 erros).

- [ ] **Step 5: Aplicar o schema no banco de teste**

Run: `pnpm test:integration:up && pnpm test:integration:db:push`
Expected: push aplica `effectiveness_methods` e a coluna `effectiveness_method_id` sem prompt destrutivo.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/effectiveness-methods.ts lib/db/src/schema/index.ts lib/db/src/schema/action-plans.ts
git commit -m "feat(db): tabela effectiveness_methods + action_plans.effectiveness_method_id"
```

---

### Task 2: Serviços — sementes e validação

**Files:**
- Test: `artifacts/api-server/tests/effectiveness-methods/defaults.unit.test.ts`
- Create: `artifacts/api-server/src/services/effectiveness-methods/defaults.ts`
- Create: `artifacts/api-server/src/services/effectiveness-methods/validate.ts`

**Interfaces:**
- Consumes: `db`, `effectivenessMethodsTable` de `@workspace/db`
- Produces:
  - `DEFAULT_EFFECTIVENESS_METHOD_LABELS: string[]` (6 rótulos, na ordem)
  - `LEGACY_METHOD_TO_LABEL: Record<string, string>` (código do enum → rótulo semente)
  - `ensureDefaultEffectivenessMethods(orgId: number): Promise<void>`
  - `assertEffectivenessMethodBelongsToOrg(orgId: number, id: number): Promise<boolean>`

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/api-server/tests/effectiveness-methods/defaults.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFECTIVENESS_METHOD_LABELS,
  LEGACY_METHOD_TO_LABEL,
} from "../../src/services/effectiveness-methods/defaults";

describe("effectiveness method defaults", () => {
  it("has the six seed labels, in screen order", () => {
    expect(DEFAULT_EFFECTIVENESS_METHOD_LABELS).toEqual([
      "Verificação por indicador",
      "Auditoria interna",
      "Inspeção física (campo)",
      "Verificação por treinamento",
      "Verificação por amostragem",
      "Redução de risco",
    ]);
  });

  it("maps every legacy enum code to a seed label", () => {
    expect(LEGACY_METHOD_TO_LABEL).toEqual({
      indicator: "Verificação por indicador",
      internal_audit: "Auditoria interna",
      field_inspection: "Inspeção física (campo)",
      training: "Verificação por treinamento",
      sampling: "Verificação por amostragem",
      risk_reduction: "Redução de risco",
    });
    // Todo código legado tem semente correspondente — senão o backfill perderia dados.
    for (const label of Object.values(LEGACY_METHOD_TO_LABEL)) {
      expect(DEFAULT_EFFECTIVENESS_METHOD_LABELS).toContain(label);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/effectiveness-methods/defaults.unit.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/effectiveness-methods/defaults'`.

- [ ] **Step 3: Implementar `defaults.ts`**

`artifacts/api-server/src/services/effectiveness-methods/defaults.ts`:

```ts
import { db, effectivenessMethodsTable } from "@workspace/db";

/** Os 6 métodos que eram fixos em código, na mesma ordem em que apareciam na tela. */
export const DEFAULT_EFFECTIVENESS_METHOD_LABELS = [
  "Verificação por indicador",
  "Auditoria interna",
  "Inspeção física (campo)",
  "Verificação por treinamento",
  "Verificação por amostragem",
  "Redução de risco",
];

/**
 * Código do enum legado (`action_plan_effectiveness_method`) → rótulo da semente.
 * Usado só pelo backfill e pela exibição de planos ainda não migrados.
 */
export const LEGACY_METHOD_TO_LABEL: Record<string, string> = {
  indicator: "Verificação por indicador",
  internal_audit: "Auditoria interna",
  field_inspection: "Inspeção física (campo)",
  training: "Verificação por treinamento",
  sampling: "Verificação por amostragem",
  risk_reduction: "Redução de risco",
};

/** Insere as sementes na org (idempotente). Usado no register e na migração. */
export async function ensureDefaultEffectivenessMethods(
  orgId: number,
): Promise<void> {
  for (let i = 0; i < DEFAULT_EFFECTIVENESS_METHOD_LABELS.length; i++) {
    await db
      .insert(effectivenessMethodsTable)
      .values({
        organizationId: orgId,
        label: DEFAULT_EFFECTIVENESS_METHOD_LABELS[i],
        sortOrder: i,
      })
      .onConflictDoNothing();
  }
}
```

- [ ] **Step 4: Implementar `validate.ts`**

`artifacts/api-server/src/services/effectiveness-methods/validate.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db, effectivenessMethodsTable } from "@workspace/db";

/** True se o método existe e pertence a esta organização. */
export async function assertEffectivenessMethodBelongsToOrg(
  orgId: number,
  id: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: effectivenessMethodsTable.id })
    .from(effectivenessMethodsTable)
    .where(
      and(
        eq(effectivenessMethodsTable.id, id),
        eq(effectivenessMethodsTable.organizationId, orgId),
      ),
    );
  return !!row;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/effectiveness-methods/defaults.unit.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/services/effectiveness-methods artifacts/api-server/tests/effectiveness-methods
git commit -m "feat(api): sementes e validação do catálogo de métodos de verificação"
```

---

### Task 3: Contrato — OpenAPI + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (tag ~linha 70; paths perto de `/organizations/{orgId}/norms` ~linha 9148; schemas perto de `RegulatoryNorm` ~linha 18718 e dos campos `effectivenessMethod` em `ActionPlan` ~18964, `CreateActionPlanBody` ~19150, `UpdateActionPlanBody` ~19242)
- Regenerated (não editar à mão): `lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*`

**Interfaces:**
- Produces (gerados pelo Orval, usados nas tasks 4–7):
  - zod: `ListEffectivenessMethodsParams`, `CreateEffectivenessMethodParams`, `CreateEffectivenessMethodBody`, `UpdateEffectivenessMethodParams`, `UpdateEffectivenessMethodBody`
  - React Query: `useListEffectivenessMethods(orgId, opts)`, `useCreateEffectivenessMethod()`, `useUpdateEffectivenessMethod()`, `getListEffectivenessMethodsQueryKey(orgId)`, `type EffectivenessMethod`
  - `ActionPlan.effectivenessMethodId`, `CreateActionPlanBody.effectivenessMethodId`, `UpdateActionPlanBody.effectivenessMethodId`

- [ ] **Step 1: Adicionar a tag**

Em `lib/api-spec/openapi.yaml`, logo depois da tag `norms`:

```yaml
  - name: effectiveness-methods
    description: Catálogo de métodos de verificação de eficácia da organização (usado na avaliação de eficácia dos planos de ação)
```

- [ ] **Step 2: Adicionar os paths**

Logo depois do bloco `/organizations/{orgId}/norms/{normId}` (antes de `/organizations/{orgId}/action-plans`):

```yaml
  /organizations/{orgId}/effectiveness-methods:
    get:
      operationId: listEffectivenessMethods
      tags: [effectiveness-methods]
      summary: List the organization's effectiveness verification method catalog
      parameters:
        - name: orgId
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: Effectiveness verification methods
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/EffectivenessMethod"
    post:
      operationId: createEffectivenessMethod
      tags: [effectiveness-methods]
      summary: Add a method to the organization's effectiveness verification method catalog
      parameters:
        - name: orgId
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateEffectivenessMethodBody"
      responses:
        "201":
          description: Method created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/EffectivenessMethod"
        "200":
          description: Existing method returned (idempotent hit on the same label)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/EffectivenessMethod"

  /organizations/{orgId}/effectiveness-methods/{methodId}:
    patch:
      operationId: updateEffectivenessMethod
      tags: [effectiveness-methods]
      summary: Update an effectiveness verification method (label, active flag or sort order)
      parameters:
        - name: orgId
          in: path
          required: true
          schema:
            type: integer
        - name: methodId
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateEffectivenessMethodBody"
      responses:
        "200":
          description: Method updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/EffectivenessMethod"
```

- [ ] **Step 3: Adicionar os schemas**

Logo depois de `UpdateRegulatoryNormBody` (antes de `ActionPlanSourceModule`):

```yaml
    EffectivenessMethod:
      type: object
      description: "Item do catálogo de métodos de verificação de eficácia da organização (referenciado pelos planos de ação)."
      required: [id, organizationId, label, active, sortOrder]
      properties:
        id:
          type: integer
        organizationId:
          type: integer
        label:
          type: string
        active:
          type: boolean
        sortOrder:
          type: integer

    CreateEffectivenessMethodBody:
      type: object
      required: [label]
      properties:
        label:
          type: string
          minLength: 1

    UpdateEffectivenessMethodBody:
      type: object
      properties:
        label:
          type: string
          minLength: 1
        active:
          type: boolean
        sortOrder:
          type: integer
```

- [ ] **Step 4: Migrar os campos do plano de ação**

Em `ActionPlan` (~18964), **manter** `effectivenessMethod` e marcá-lo deprecado, e acrescentar o id logo abaixo:

```yaml
        effectivenessMethod:
          deprecated: true
          description: "Legado: código fixo do método, anterior ao catálogo. Só leitura — use effectivenessMethodId."
          oneOf:
            - $ref: "#/components/schemas/ActionPlanEffectivenessMethod"
            - type: "null"
        effectivenessMethodId:
          type: ["integer", "null"]
```

Em `CreateActionPlanBody` (~19150) e `UpdateActionPlanBody` (~19242), **remover** o bloco `effectivenessMethod` (as 4 linhas `effectivenessMethod:` / `oneOf:` / `- $ref: ...` / `- type: "null"`) e pôr no lugar:

```yaml
        effectivenessMethodId:
          type: integer
          nullable: true
```

O schema `ActionPlanEffectivenessMethod` (~18761) **continua existindo** — `ActionPlan` ainda o referencia para o campo legado.

- [ ] **Step 5: Regenerar o client**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: regrava `lib/api-zod/src/generated/**` e `lib/api-client-react/src/generated/**`.

Conferir que os hooks nasceram:

Run: `grep -c "useListEffectivenessMethods\|useCreateEffectivenessMethod\|useUpdateEffectivenessMethod" lib/api-client-react/src/generated/api.ts`
Expected: ≥ 3.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL, **apenas** em `artifacts/web/src/pages/app/planos-acao/[id].tsx` e/ou `_components/eficacia-panel.tsx` e em `artifacts/api-server/src/routes/action-plans.ts` — os lugares que ainda escrevem `effectivenessMethod` no body. É o esperado: as tasks 5 e 6 corrigem. Se aparecer erro em qualquer outro arquivo, pare e investigue.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): rotas do catálogo de métodos de verificação + effectivenessMethodId no plano"
```

---

### Task 4: Rotas do catálogo + seed no registro de organização

**Files:**
- Test: `artifacts/api-server/tests/effectiveness-methods/effectiveness-methods.integration.test.ts`
- Create: `artifacts/api-server/src/routes/effectiveness-methods.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (import + mount, ao lado do `regulatoryNormsRouter`)
- Modify: `artifacts/api-server/src/routes/auth.ts:129` (chamar o ensure junto do `ensureDefaultNorms`)

**Interfaces:**
- Consumes: `ensureDefaultEffectivenessMethods` (Task 2); zod gerado (Task 3)
- Produces: rotas `GET|POST /api/organizations/:orgId/effectiveness-methods` e `PATCH /api/organizations/:orgId/effectiveness-methods/:methodId`

- [ ] **Step 1: Escrever o teste de integração que falha**

`artifacts/api-server/tests/effectiveness-methods/effectiveness-methods.integration.test.ts`:

```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../../tests/support/backend";
import {
  DEFAULT_EFFECTIVENESS_METHOD_LABELS,
  ensureDefaultEffectivenessMethods,
} from "../../src/services/effectiveness-methods/defaults";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => cleanupTestContext(context)));
});

describe("effectiveness methods API", () => {
  it("creates, lists, and is idempotent (case-insensitive)", async () => {
    const context = await createTestContext({ seed: "efic-create" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const created = await request(app).post(base).set(authHeader(context)).send({ label: "Checklist de campo" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      organizationId: context.organizationId,
      label: "Checklist de campo",
      active: true,
    });

    const duplicate = await request(app).post(base).set(authHeader(context)).send({ label: "checklist de campo" });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.id).toBe(created.body.id);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    expect(list.body.filter((m: { label: string }) => m.label === "Checklist de campo")).toHaveLength(1);
  });

  it("reactivates an inactive method instead of duplicating it", async () => {
    const context = await createTestContext({ seed: "efic-reactivate" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const created = await request(app).post(base).set(authHeader(context)).send({ label: "Reinspeção" });
    await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ active: false })
      .expect(200);

    // GET devolve ativos E inativos — o seletor filtra; a aba de gestão precisa ver.
    const beforeList = await request(app).get(base).set(authHeader(context));
    expect(beforeList.body.find((m: { id: number }) => m.id === created.body.id)?.active).toBe(false);

    const reactivated = await request(app).post(base).set(authHeader(context)).send({ label: "reinspeção" });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.id).toBe(created.body.id);
    expect(reactivated.body.active).toBe(true);
  });

  it("blocks non-admin from writing (403) but allows reading", async () => {
    const context = await createTestContext({ seed: "efic-gate" });
    contexts.push(context);
    const operator = await createTestUser(context, { role: "operator", suffix: "operador" });
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const write = await request(app).post(base).set(authHeader(operator)).send({ label: "X" });
    expect(write.status).toBe(403);

    const read = await request(app).get(base).set(authHeader(operator));
    expect(read.status).toBe(200);
  });

  it("renames and toggles active via PATCH, rejecting a case-insensitive collision", async () => {
    const context = await createTestContext({ seed: "efic-patch" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    const a = await request(app).post(base).set(authHeader(context)).send({ label: "Auditoria de processo" });
    const b = await request(app).post(base).set(authHeader(context)).send({ label: "Ensaio laboratorial" });

    const patch = await request(app)
      .patch(`${base}/${b.body.id}`)
      .set(authHeader(context))
      .send({ label: "Ensaio laboratorial (externo)", active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.label).toBe("Ensaio laboratorial (externo)");
    expect(patch.body.active).toBe(false);

    const collision = await request(app)
      .patch(`${base}/${b.body.id}`)
      .set(authHeader(context))
      .send({ label: "auditoria de processo" });
    expect(collision.status).toBe(409);
    expect(a.status).toBe(201);
  });

  it("seeds the default catalog for an organization, idempotently", async () => {
    const context = await createTestContext({ seed: "efic-defaults" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/effectiveness-methods`;

    await ensureDefaultEffectivenessMethods(context.organizationId);

    const list = await request(app).get(base).set(authHeader(context));
    expect(list.status).toBe(200);
    expect(list.body.map((m: { label: string }) => m.label)).toEqual(DEFAULT_EFFECTIVENESS_METHOD_LABELS);

    await ensureDefaultEffectivenessMethods(context.organizationId);
    const listAgain = await request(app).get(base).set(authHeader(context));
    expect(listAgain.body.map((m: { label: string }) => m.label)).toEqual(DEFAULT_EFFECTIVENESS_METHOD_LABELS);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/effectiveness-methods/effectiveness-methods.integration.test.ts`
Expected: FAIL — 404 nas rotas (ainda não montadas).

- [ ] **Step 3: Implementar as rotas**

`artifacts/api-server/src/routes/effectiveness-methods.ts`:

```ts
import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, effectivenessMethodsTable } from "@workspace/db";
import {
  CreateEffectivenessMethodBody,
  CreateEffectivenessMethodParams,
  ListEffectivenessMethodsParams,
  UpdateEffectivenessMethodBody,
  UpdateEffectivenessMethodParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

function serializeMethod(r: typeof effectivenessMethodsTable.$inferSelect) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    label: r.label,
    active: r.active,
    sortOrder: r.sortOrder,
  };
}

// ─── Catálogo de métodos de verificação de eficácia ─────────────────────────
// Leitura liberada a qualquer usuário autenticado da org (a ficha do plano
// precisa resolver o rótulo); escrita restrita a admins.

router.get("/organizations/:orgId/effectiveness-methods", requireAuth, async (req, res): Promise<void> => {
  const params = ListEffectivenessMethodsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  // Devolve ativos e inativos: o seletor filtra os ativos, mas a aba de gestão
  // precisa enxergar (e poder reativar) os inativos.
  const rows = await db.select().from(effectivenessMethodsTable)
    .where(eq(effectivenessMethodsTable.organizationId, params.data.orgId))
    .orderBy(asc(effectivenessMethodsTable.sortOrder), asc(effectivenessMethodsTable.label));

  res.json(rows.map(serializeMethod));
});

router.post("/organizations/:orgId/effectiveness-methods", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = CreateEffectivenessMethodParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = CreateEffectivenessMethodBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const label = body.data.label.trim();
  if (!label) { res.status(400).json({ error: "Informe o nome do método" }); return; }

  const findByLabel = async () => {
    const [row] = await db.select().from(effectivenessMethodsTable)
      .where(and(
        eq(effectivenessMethodsTable.organizationId, params.data.orgId),
        sql`lower(${effectivenessMethodsTable.label}) = lower(${label})`,
      ));
    return row;
  };

  // Idempotente por rótulo (case-insensitive). Se existir inativo, reativa em
  // vez de deixar o chamador preso: "recriar" um método removido o traz de volta.
  const existing = await findByLabel();
  if (existing) {
    if (!existing.active) {
      const [reactivated] = await db.update(effectivenessMethodsTable)
        .set({ active: true })
        .where(eq(effectivenessMethodsTable.id, existing.id))
        .returning();
      res.status(200).json(serializeMethod(reactivated));
      return;
    }
    res.status(200).json(serializeMethod(existing));
    return;
  }

  // Sob concorrência, duas requisições passam do SELECT acima; o índice único
  // funcional (org, lower(label)) impede a 2ª inserção — devolvemos a criada.
  const [inserted] = await db.insert(effectivenessMethodsTable).values({
    organizationId: params.data.orgId,
    label,
  }).onConflictDoNothing().returning();
  if (inserted) { res.status(201).json(serializeMethod(inserted)); return; }

  const raced = await findByLabel();
  if (raced) {
    if (!raced.active) {
      const [reactivated] = await db.update(effectivenessMethodsTable)
        .set({ active: true })
        .where(eq(effectivenessMethodsTable.id, raced.id))
        .returning();
      res.status(200).json(serializeMethod(reactivated));
      return;
    }
    res.status(200).json(serializeMethod(raced));
    return;
  }

  res.status(409).json({ error: "Não foi possível criar o método" });
});

router.patch("/organizations/:orgId/effectiveness-methods/:methodId", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = UpdateEffectivenessMethodParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

  const body = UpdateEffectivenessMethodBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [current] = await db.select().from(effectivenessMethodsTable)
    .where(and(
      eq(effectivenessMethodsTable.id, params.data.methodId),
      eq(effectivenessMethodsTable.organizationId, params.data.orgId),
    ));
  if (!current) { res.status(404).json({ error: "Método não encontrado" }); return; }

  const updateData: Record<string, unknown> = {};

  if (body.data.label !== undefined) {
    const label = body.data.label.trim();
    if (!label) { res.status(400).json({ error: "Informe o nome do método" }); return; }

    const [clash] = await db.select({ id: effectivenessMethodsTable.id }).from(effectivenessMethodsTable)
      .where(and(
        eq(effectivenessMethodsTable.organizationId, params.data.orgId),
        sql`lower(${effectivenessMethodsTable.label}) = lower(${label})`,
        sql`${effectivenessMethodsTable.id} <> ${params.data.methodId}`,
      ));
    if (clash) { res.status(409).json({ error: "Já existe um método com esse nome" }); return; }

    updateData.label = label;
  }
  if (body.data.active !== undefined) updateData.active = body.data.active;
  if (body.data.sortOrder !== undefined) updateData.sortOrder = body.data.sortOrder;

  try {
    const [row] = await db.update(effectivenessMethodsTable)
      .set(Object.keys(updateData).length > 0 ? updateData : { updatedAt: new Date() })
      .where(and(
        eq(effectivenessMethodsTable.id, params.data.methodId),
        eq(effectivenessMethodsTable.organizationId, params.data.orgId),
      ))
      .returning();

    res.json(serializeMethod(row));
  } catch (err: unknown) {
    // O SELECT de colisão acima não é atômico com este UPDATE — um rename
    // concorrente só colide aqui, no índice único. Sem isto, seria um 500.
    const code =
      (err as { cause?: { code?: string } } | undefined)?.cause?.code ??
      (err as { code?: string } | undefined)?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Já existe um método com esse nome" });
      return;
    }
    throw err;
  }
});

export default router;
```

- [ ] **Step 4: Montar o router**

Em `artifacts/api-server/src/routes/index.ts`, importar ao lado do `regulatoryNormsRouter`:

```ts
import effectivenessMethodsRouter from "./effectiveness-methods";
```

E montar logo depois do `regulatoryNormsRouter` (final do arquivo, antes do `export default router;`):

```ts
// Sem requireModuleAccessForPaths: um org_admin pode não ter o módulo
// `actionPlans` e ainda assim precisa gerir o catálogo em Configurações —
// leitura livre a qualquer usuário autenticado da org; a gate admin na escrita
// vive na própria rota (requireRole("org_admin")).
router.use(requireAuth, requireCompletedOnboarding, effectivenessMethodsRouter);
```

- [ ] **Step 5: Semear no registro de organização**

Em `artifacts/api-server/src/routes/auth.ts`, importar o serviço junto do `ensureDefaultNorms` e chamar logo abaixo dele (linha ~129):

```ts
  await ensureDefaultNorms(org.id);
  await ensureDefaultEffectivenessMethods(org.id);
```

- [ ] **Step 6: Rodar e ver passar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/effectiveness-methods/effectiveness-methods.integration.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/effectiveness-methods.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/auth.ts artifacts/api-server/tests/effectiveness-methods
git commit -m "feat(api): CRUD do catálogo de métodos de verificação + seed no registro"
```

---

### Task 5: Plano de ação passa a gravar `effectivenessMethodId`

**Files:**
- Test: `artifacts/api-server/tests/routes/action-plans.integration.test.ts` (acrescentar 1 caso; se o arquivo tiver outro nome, use o que existir em `tests/routes/` para planos de ação)
- Modify: `artifacts/api-server/src/routes/action-plans.ts` (POST ~:414, PATCH ~:570)
- Modify: `artifacts/api-server/src/services/action-plans/serializers.ts:90`

**Interfaces:**
- Consumes: `assertEffectivenessMethodBelongsToOrg` (Task 2); `CreateActionPlanBody.effectivenessMethodId` / `UpdateActionPlanBody.effectivenessMethodId` (Task 3)
- Produces: `ActionPlan.effectivenessMethodId` na resposta da API

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao describe existente de planos de ação em `artifacts/api-server/tests/routes/action-plans.integration.test.ts` (reaproveite os helpers de contexto já usados no arquivo; o corpo mínimo do POST de plano é `{ sourceModule: "manual", sourceRef: {}, title: "..." }`):

```ts
  it("round-trips effectivenessMethodId and rejects a method from another org", async () => {
    const context = await createTestContext({ seed: "ap-efic-method" });
    contexts.push(context);
    const other = await createTestContext({ seed: "ap-efic-other" });
    contexts.push(other);

    const method = await request(app)
      .post(`/api/organizations/${context.organizationId}/effectiveness-methods`)
      .set(authHeader(context))
      .send({ label: "Verificação por indicador" });
    expect(method.status).toBe(201);

    const foreign = await request(app)
      .post(`/api/organizations/${other.organizationId}/effectiveness-methods`)
      .set(authHeader(other))
      .send({ label: "Método da outra org" });
    expect(foreign.status).toBe(201);

    const base = `/api/organizations/${context.organizationId}/action-plans`;
    const created = await request(app).post(base).set(authHeader(context)).send({
      sourceModule: "manual",
      sourceRef: {},
      title: "Ação com método do catálogo",
      effectivenessMethodId: method.body.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.effectivenessMethodId).toBe(method.body.id);

    const fetched = await request(app).get(`${base}/${created.body.id}`).set(authHeader(context));
    expect(fetched.body.effectivenessMethodId).toBe(method.body.id);

    // Método de outra organização → 400 (não pode vazar entre tenants).
    const crossOrg = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ effectivenessMethodId: foreign.body.id });
    expect(crossOrg.status).toBe(400);

    // Limpar o método (null) é válido.
    const cleared = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ effectivenessMethodId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.effectivenessMethodId).toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans.integration.test.ts -t "effectivenessMethodId"`
Expected: FAIL — `effectivenessMethodId` volta `undefined` (a rota ainda não grava).

- [ ] **Step 3: Gravar no POST**

Em `artifacts/api-server/src/routes/action-plans.ts`, importar o validador no topo:

```ts
import { assertEffectivenessMethodBelongsToOrg } from "../services/effectiveness-methods/validate";
```

No POST, logo depois do bloco que valida `responsibleUserId`/`effectivenessEvaluatorUserId` (o `for` das linhas ~356-368):

```ts
  if (body.data.effectivenessMethodId != null) {
    const ok = await assertEffectivenessMethodBelongsToOrg(params.data.orgId, body.data.effectivenessMethodId);
    if (!ok) { res.status(400).json({ error: "Método de verificação inválido para esta organização" }); return; }
  }
```

E no `db.insert(actionPlansTable).values({...})`, trocar a linha `effectivenessMethod: body.data.effectivenessMethod ?? null,` por:

```ts
    effectivenessMethodId: body.data.effectivenessMethodId ?? null,
```

- [ ] **Step 4: Gravar no PATCH**

Trocar a linha `if (body.data.effectivenessMethod !== undefined) update.effectivenessMethod = body.data.effectivenessMethod;` (~:570) por:

```ts
  if (body.data.effectivenessMethodId !== undefined) {
    if (body.data.effectivenessMethodId !== null) {
      const ok = await assertEffectivenessMethodBelongsToOrg(params.data.orgId, body.data.effectivenessMethodId);
      if (!ok) { res.status(400).json({ error: "Método de verificação inválido para esta organização" }); return; }
    }
    update.effectivenessMethodId = body.data.effectivenessMethodId;
  }
```

- [ ] **Step 5: Serializar o novo campo**

Em `artifacts/api-server/src/services/action-plans/serializers.ts`, logo abaixo da linha `effectivenessMethod: p.effectivenessMethod ?? null,` (que **fica**, para os planos legados):

```ts
    effectivenessMethodId: p.effectivenessMethodId ?? null,
```

- [ ] **Step 6: Rodar e ver passar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans.integration.test.ts`
Expected: PASS (o novo caso + todos os que já existiam).

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/action-plans.ts artifacts/api-server/src/services/action-plans/serializers.ts artifacts/api-server/tests/routes/action-plans.integration.test.ts
git commit -m "feat(api): plano de ação grava o método de verificação por id do catálogo"
```

---

### Task 6: Front — client do catálogo e seletor da ficha

**Files:**
- Test: `artifacts/web/tests/lib/effectiveness-methods-client.unit.test.ts`
- Create: `artifacts/web/src/lib/effectiveness-methods-client.ts`
- Modify: `artifacts/web/src/lib/action-plans-client.ts:161-168` (renomear o Record para legado)
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/eficacia-panel.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/[id].tsx` (~:129 `emptyEfic`, ~:196 hidratação, ~:231 `buildPayload`, ~:752 render do painel)

**Interfaces:**
- Consumes: `useListEffectivenessMethods`, `getListEffectivenessMethodsQueryKey`, `type EffectivenessMethod` (Task 3)
- Produces:
  - `useAllEffectivenessMethods(orgId)` — catálogo completo (ativos + inativos)
  - `pickerMethodOptions(methods, selectedId): EffectivenessMethod[]` — puro; ativos **+** o inativo que o plano já referencia
  - `LEGACY_EFFECTIVENESS_METHOD_LABELS: Record<ActionPlanEffectivenessMethod, string>`
  - `EficaciaValue.methodId: string` (substitui `method`)

> **Nota de projeto:** o catálogo de normas expõe também `useActiveNorms` e
> `buildNormLabelMap`, mas aqui eles **não** teriam consumidor (o único seletor
> precisa do catálogo completo, e nenhuma outra tela exibe o método). Não
> copiar helpers sem uso — o que interessa testar é a regra do seletor.

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/web/tests/lib/effectiveness-methods-client.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickerMethodOptions } from "@/lib/effectiveness-methods-client";

const methods = [
  { id: 1, organizationId: 1, label: "Auditoria interna", active: true, sortOrder: 0 },
  { id: 2, organizationId: 1, label: "Método aposentado", active: false, sortOrder: 1 },
  { id: 3, organizationId: 1, label: "Outro aposentado", active: false, sortOrder: 2 },
];

describe("pickerMethodOptions", () => {
  it("offers only the active methods when nothing is selected", () => {
    expect(pickerMethodOptions(methods, null).map((m) => m.id)).toEqual([1]);
  });

  it("keeps the inactive method the plan already references, so the selection does not vanish", () => {
    expect(pickerMethodOptions(methods, 2).map((m) => m.id)).toEqual([1, 2]);
  });

  it("does not resurrect the other inactive methods", () => {
    expect(pickerMethodOptions(methods, 2).map((m) => m.id)).not.toContain(3);
  });

  it("preserves catalog order", () => {
    expect(pickerMethodOptions(methods, 3).map((m) => m.label)).toEqual([
      "Auditoria interna",
      "Outro aposentado",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/effectiveness-methods-client.unit.test.ts`
Expected: FAIL — módulo `@/lib/effectiveness-methods-client` não existe.

- [ ] **Step 3: Implementar o client**

`artifacts/web/src/lib/effectiveness-methods-client.ts`:

```ts
import {
  useListEffectivenessMethods,
  getListEffectivenessMethodsQueryKey,
  type EffectivenessMethod,
} from "@workspace/api-client-react";

/** Catálogo completo (ativos + inativos), para a ficha e para a tela de gestão. */
export function useAllEffectivenessMethods(orgId: number) {
  return useListEffectivenessMethods(orgId, {
    query: {
      enabled: !!orgId,
      queryKey: getListEffectivenessMethodsQueryKey(orgId),
    },
  });
}

/**
 * Opções do seletor: os métodos ativos MAIS o que este plano já referencia,
 * mesmo desativado. Sem essa união, desativar um método faria a seleção do
 * plano sumir da tela sem que ninguém tenha mexido no plano.
 */
export function pickerMethodOptions(
  methods: EffectivenessMethod[],
  selectedId: number | null,
): EffectivenessMethod[] {
  return methods.filter((m) => m.active || m.id === selectedId);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/effectiveness-methods-client.unit.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Rebatizar o mapa de rótulos como legado**

Em `artifacts/web/src/lib/action-plans-client.ts`, substituir o bloco das linhas 161-168 por:

```ts
/**
 * @deprecated Rótulos do enum legado, de antes do catálogo de métodos de
 * verificação. Usado só para exibir planos que ainda não foram migrados
 * (`effectivenessMethodId === null` e `effectivenessMethod` preenchido).
 * Nada novo deve ser escrito com estes códigos — ver `effectiveness-methods-client`.
 */
export const LEGACY_EFFECTIVENESS_METHOD_LABELS: Record<ActionPlanEffectivenessMethod, string> = {
  indicator: "Verificação por indicador",
  internal_audit: "Auditoria interna",
  field_inspection: "Inspeção física (campo)",
  training: "Verificação por treinamento",
  sampling: "Verificação por amostragem",
  risk_reduction: "Redução de risco",
};
```

- [ ] **Step 6: Trocar o seletor do painel de eficácia**

Em `artifacts/web/src/pages/app/planos-acao/_components/eficacia-panel.tsx`:

Imports — remover `EFFECTIVENESS_METHOD_LABELS` e `ActionPlanEffectivenessMethod` da lista importada de `@/lib/action-plans-client`, e acrescentar:

```ts
import { useMemo } from "react";
import type { EffectivenessMethod } from "@workspace/api-client-react";
import { pickerMethodOptions } from "@/lib/effectiveness-methods-client";
```

Trocar o tipo do valor e apagar a constante `METHOD_OPTIONS` (linha 28):

```ts
export type EficaciaValue = {
  /** id do método no catálogo da organização; "" = não definido. */
  methodId: string;
  dueDate: string;
  evaluatorUserId: string;
  before: string;
  after: string;
  result: ActionPlanEffectivenessResult | "";
  comment: string;
};
```

Acrescentar duas props na assinatura do componente (junto de `orgUsers`):

```ts
  /** Catálogo completo da org (ativos + inativos). */
  methods: EffectivenessMethod[];
  /** Rótulo do método legado, quando o plano é anterior ao catálogo. */
  legacyMethodLabel?: string | null;
```

Dentro do componente, antes do `return`:

```ts
  const selectedId = value.methodId ? Number(value.methodId) : null;
  const methodOptions = useMemo(
    () => pickerMethodOptions(methods, selectedId),
    [methods, selectedId],
  );
```

E o bloco do campo (linhas 67-79) vira:

```tsx
        <div className="space-y-1.5">
          <Label>Método de verificação</Label>
          <Select
            value={value.methodId}
            onChange={(e) => set("methodId", e.target.value)}
            disabled={readOnly}
          >
            <option value="">Selecione…</option>
            {methodOptions.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.label}</option>
            ))}
          </Select>
          {!value.methodId && legacyMethodLabel && (
            <p className="text-[11px] text-muted-foreground">
              Registrado antes do catálogo: {legacyMethodLabel}. Selecione o método equivalente para atualizar.
            </p>
          )}
        </div>
```

- [ ] **Step 7: Ligar a ficha ao catálogo**

Em `artifacts/web/src/pages/app/planos-acao/[id].tsx`:

Imports:

```ts
import { useAllEffectivenessMethods } from "@/lib/effectiveness-methods-client";
import { LEGACY_EFFECTIVENESS_METHOD_LABELS } from "@/lib/action-plans-client";
```

Junto dos outros hooks de dados (perto de `orgUsers`, ~:120):

```ts
  const { data: effectivenessMethods = [] } = useAllEffectivenessMethods(orgId);
```

`emptyEfic` (~:129):

```ts
  const emptyEfic: EficaciaValue = { methodId: "", dueDate: "", evaluatorUserId: "", before: "", after: "", result: "", comment: "" };
```

Hidratação (~:196), trocar `method: plan.effectivenessMethod ?? "",` por:

```ts
        methodId: plan.effectivenessMethodId != null ? String(plan.effectivenessMethodId) : "",
```

`buildPayload` (~:231), trocar `effectivenessMethod: f.efic.method || null,` por:

```ts
      effectivenessMethodId: f.efic.methodId ? Number(f.efic.methodId) : null,
```

Render (~:752), passar as duas props novas:

```tsx
            <EficaciaPanel
              value={form.efic}
              onChange={(v) => patch("efic", v)}
              orgUsers={orgUsers}
              methods={effectivenessMethods}
              legacyMethodLabel={plan.effectivenessMethod ? LEGACY_EFFECTIVENESS_METHOD_LABELS[plan.effectivenessMethod] : null}
              readOnly={!canEdit}
              canEvaluate={isAdmin || (plan.effectivenessEvaluatorUserId != null && plan.effectivenessEvaluatorUserId === user?.id)}
              canAssignEvaluator={isAdmin}
              responsibleUserId={form.responsibleUserId}
            />
```

- [ ] **Step 8: Conferir que não sobrou nenhum uso antigo**

Run: `grep -rn "EFFECTIVENESS_METHOD_LABELS\|efic.method\b\|effectivenessMethod\b" artifacts/web/src | grep -v LEGACY`
Expected: nenhuma linha que **escreva** `effectivenessMethod` (só a leitura do legado no `legacyMethodLabel`). Se `EficaciaPanel` for usado em outro arquivo além de `[id].tsx`, atualize-o também (mesmas props).

- [ ] **Step 9: Typecheck + testes web**

Run: `pnpm typecheck && pnpm exec vitest run --project web-unit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add artifacts/web/src/lib/effectiveness-methods-client.ts artifacts/web/src/lib/action-plans-client.ts artifacts/web/src/pages/app/planos-acao artifacts/web/tests/lib/effectiveness-methods-client.unit.test.ts
git commit -m "feat(web): seletor de método de verificação lê o catálogo da organização"
```

---

### Task 7: Aba "Métodos de verificação" em Configurações → Sistema

**Files:**
- Create: `artifacts/web/src/components/settings/EffectivenessMethodsSettingsSection.tsx`
- Modify: `artifacts/web/src/pages/app/configuracoes/sistema.tsx:14` (`SystemTab`), `:68` (trigger), `:79-82` (content)

**Interfaces:**
- Consumes: `useAllEffectivenessMethods` (Task 6); `useCreateEffectivenessMethod`, `useUpdateEffectivenessMethod`, `getListEffectivenessMethodsQueryKey`, `type EffectivenessMethod` (Task 3)
- Produces: `<EffectivenessMethodsSettingsSection />`

- [ ] **Step 1: Criar a seção**

`artifacts/web/src/components/settings/EffectivenessMethodsSettingsSection.tsx` — mesma estrutura de `OrganizationNormsSettingsSection.tsx` (criar, renomear inline, `Switch` de ativo), trocando o domínio:

```tsx
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useAllEffectivenessMethods } from "@/lib/effectiveness-methods-client";
import {
  useCreateEffectivenessMethod,
  useUpdateEffectivenessMethod,
  getListEffectivenessMethodsQueryKey,
  type EffectivenessMethod,
} from "@workspace/api-client-react";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "data" in err) {
    const message = (err as { data?: { error?: string } }).data?.error;
    if (message) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function MethodRow({
  method,
  orgId,
  onChanged,
}: {
  method: EffectivenessMethod;
  orgId: number;
  onChanged: () => void;
}) {
  const updateMut = useUpdateEffectivenessMethod();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(method.label);

  const startEditing = () => {
    setLabel(method.label);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setLabel(method.label);
    setIsEditing(false);
  };

  const saveLabel = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === method.label) {
      setIsEditing(false);
      return;
    }
    try {
      await updateMut.mutateAsync({ orgId, methodId: method.id, data: { label: trimmed } });
      onChanged();
      setIsEditing(false);
    } catch (err) {
      toast({
        title: "Erro ao renomear método",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const toggleActive = async () => {
    try {
      await updateMut.mutateAsync({ orgId, methodId: method.id, data: { active: !method.active } });
      onChanged();
    } catch (err) {
      toast({
        title: "Erro ao atualizar método",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label="Novo nome do método"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveLabel();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              className="h-8"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={saveLabel}
              isLoading={updateMut.isPending}
              aria-label="Salvar"
              title="Salvar"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={cancelEditing}
              aria-label="Cancelar"
              title="Cancelar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={
                method.active
                  ? "truncate text-[13px] font-medium text-foreground"
                  : "truncate text-[13px] text-muted-foreground"
              }
            >
              {method.label}
            </span>
            {!method.active && (
              <Badge variant="neutral" className="text-[10px]">
                Inativo
              </Badge>
            )}
            <button
              type="button"
              onClick={startEditing}
              className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              title="Renomear"
              aria-label="Renomear"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {method.active ? "Ativo" : "Inativo"}
        </span>
        <Switch
          checked={method.active}
          disabled={updateMut.isPending}
          onCheckedChange={toggleActive}
          aria-label={method.active ? "Desativar método" : "Ativar método"}
        />
      </div>
    </div>
  );
}

export function EffectivenessMethodsSettingsSection() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const { data: methods = [], isLoading } = useAllEffectivenessMethods(orgId ?? 0);
  const createMut = useCreateEffectivenessMethod();
  const [newLabel, setNewLabel] = useState("");

  const invalidate = () => {
    if (!orgId) return;
    queryClient.invalidateQueries({
      queryKey: getListEffectivenessMethodsQueryKey(orgId),
    });
  };

  const handleCreate = async () => {
    if (!orgId) return;
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    try {
      await createMut.mutateAsync({ orgId, data: { label: trimmed } });
      setNewLabel("");
      invalidate();
    } catch (err) {
      toast({
        title: "Erro ao adicionar método",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  if (!orgId) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground">Métodos de verificação</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Catálogo de métodos usados na avaliação de eficácia dos planos de ação.
          Eles alimentam o seletor "Método de verificação" da ficha da ação —
          desative em vez de excluir para preservar as ações que já usam o método.
        </p>
      </div>

      <div className="mt-5 flex items-end gap-2">
        <div className="max-w-sm flex-1">
          <Label htmlFor="new-effectiveness-method-label">Novo método</Label>
          <Input
            id="new-effectiveness-method-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="Ex.: Reinspeção em campo"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          isLoading={createMut.isPending}
          disabled={!newLabel.trim()}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : methods.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            Nenhum método cadastrado ainda.
          </div>
        ) : (
          <div>
            {methods.map((method) => (
              <MethodRow
                key={method.id}
                method={method}
                orgId={orgId}
                onChanged={invalidate}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Registrar a aba**

Em `artifacts/web/src/pages/app/configuracoes/sistema.tsx`:

```ts
import { EffectivenessMethodsSettingsSection } from "@/components/settings/EffectivenessMethodsSettingsSection";

type SystemTab = "users" | "norms" | "effectiveness-methods" | "appearance";
```

No `<TabsList>`, depois da trigger de Normas:

```tsx
          {isOrgAdmin && <TabsTrigger value="effectiveness-methods">Métodos de verificação</TabsTrigger>}
```

E, depois do `<TabsContent value="norms">`:

```tsx
        {isOrgAdmin && (
          <TabsContent value="effectiveness-methods">
            <EffectivenessMethodsSettingsSection />
          </TabsContent>
        )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/web/src/components/settings/EffectivenessMethodsSettingsSection.tsx artifacts/web/src/pages/app/configuracoes/sistema.tsx
git commit -m "feat(web): aba Métodos de verificação em Configurações → Sistema"
```

---

### Task 8: Script de backfill (organizações existentes)

**Files:**
- Create: `scripts/src/migrate/effectiveness-methods-backfill.ts`
- Modify: `scripts/package.json` (script `backfill-effectiveness-methods`, ao lado de `backfill-norms-catalog`)

**Interfaces:**
- Consumes: `pool` de `@workspace/db`
- Produces: comando `pnpm --filter @workspace/scripts backfill-effectiveness-methods [--commit]`

- [ ] **Step 1: Escrever o script**

`scripts/src/migrate/effectiveness-methods-backfill.ts`:

```ts
/**
 * Backfill (Catálogo de Métodos de verificação): traz organizações existentes
 * para o catálogo por-org `effectiveness_methods`.
 *
 *  1) Seed: garante os 6 métodos padrão em toda organização (idempotente).
 *  2) Planos: para `action_plans` com `effectiveness_method` (enum legado)
 *     preenchido e `effectiveness_method_id` ainda nulo, aponta o id do método
 *     correspondente no catálogo daquela org.
 *
 * Não-destrutivo: só INSERT ... ON CONFLICT DO NOTHING e UPDATE (nunca DELETE);
 * a coluna legada `effectiveness_method` não é apagada.
 *
 * SEM --commit: dry-run — calcula e imprime contagens, não grava nada.
 * COM --commit: aplica de verdade, uma transação por organização.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts backfill-effectiveness-methods           → dry-run
 *   pnpm --filter @workspace/scripts backfill-effectiveness-methods --commit  → aplica
 */
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

const COMMIT = process.argv.includes("--commit");

// Duplicado de propósito (api-server/src/services/effectiveness-methods/defaults.ts):
// `scripts/` não depende do build do api-server. Mantenha os dois em sincronia.
const DEFAULT_LABELS = [
  "Verificação por indicador",
  "Auditoria interna",
  "Inspeção física (campo)",
  "Verificação por treinamento",
  "Verificação por amostragem",
  "Redução de risco",
];

const LEGACY_METHOD_TO_LABEL: Record<string, string> = {
  indicator: "Verificação por indicador",
  internal_audit: "Auditoria interna",
  field_inspection: "Inspeção física (campo)",
  training: "Verificação por treinamento",
  sampling: "Verificação por amostragem",
  risk_reduction: "Redução de risco",
};

type OrgRow = { id: number };
type MethodRow = { id: number; label: string };
type PlanRow = { id: number; effectiveness_method: string | null };

async function loadPlansToMigrate(orgId: number): Promise<PlanRow[]> {
  const { rows } = await pool.query<PlanRow>(
    `SELECT id, effectiveness_method FROM action_plans
      WHERE organization_id = $1
        AND effectiveness_method IS NOT NULL
        AND effectiveness_method_id IS NULL`,
    [orgId],
  );
  return rows;
}

async function applyOrg(client: PoolClient, orgId: number): Promise<{ updated: number; unknown: string[] }> {
  // 1) Seed dos 6 métodos padrão (idempotente pelo índice único funcional).
  for (let i = 0; i < DEFAULT_LABELS.length; i++) {
    await client.query(
      `INSERT INTO effectiveness_methods (organization_id, label, sort_order)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [orgId, DEFAULT_LABELS[i], i],
    );
  }

  // 2) Mapa lower(label) → id.
  const { rows: methodRows } = await client.query<MethodRow>(
    `SELECT id, label FROM effectiveness_methods WHERE organization_id = $1`,
    [orgId],
  );
  const byLabel = new Map(methodRows.map((m) => [m.label.toLowerCase(), m.id]));

  // 3) Planos legados → id do catálogo.
  const { rows: plans } = await client.query<PlanRow>(
    `SELECT id, effectiveness_method FROM action_plans
      WHERE organization_id = $1
        AND effectiveness_method IS NOT NULL
        AND effectiveness_method_id IS NULL`,
    [orgId],
  );

  let updated = 0;
  const unknown: string[] = [];
  for (const plan of plans) {
    const code = plan.effectiveness_method!;
    const label = LEGACY_METHOD_TO_LABEL[code];
    const id = label ? byLabel.get(label.toLowerCase()) : undefined;
    if (id == null) {
      unknown.push(code);
      continue;
    }
    const result = await client.query(
      `UPDATE action_plans SET effectiveness_method_id = $1
        WHERE id = $2 AND effectiveness_method_id IS NULL`,
      [id, plan.id],
    );
    updated += result.rowCount ?? 0;
  }

  return { updated, unknown };
}

async function main(): Promise<void> {
  console.log(COMMIT ? "=== APLICANDO (--commit) ===" : "=== DRY-RUN (sem --commit) ===");

  const { rows: orgs } = await pool.query<OrgRow>(`SELECT id FROM organizations ORDER BY id`);
  let totalPlans = 0;
  let failures = 0;
  const allUnknown = new Set<string>();

  for (const { id: orgId } of orgs) {
    if (!COMMIT) {
      const { rows: existing } = await pool.query<MethodRow>(
        `SELECT id, label FROM effectiveness_methods WHERE organization_id = $1`,
        [orgId],
      );
      const have = new Set(existing.map((m) => m.label.toLowerCase()));
      const missing = DEFAULT_LABELS.filter((l) => !have.has(l.toLowerCase())).length;
      const plans = await loadPlansToMigrate(orgId);
      totalPlans += plans.length;
      if (missing || plans.length) {
        console.log(`Org ${orgId}: métodos padrão a criar=${missing} · planos a migrar=${plans.length}`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await applyOrg(client, orgId);
      await client.query("COMMIT");
      totalPlans += result.updated;
      for (const code of result.unknown) allUnknown.add(code);
      if (result.updated) console.log(`Org ${orgId}: planos migrados=${result.updated}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      failures++;
      console.error(`Org ${orgId}: falhou, revertido (ROLLBACK). Erro:`, err);
    } finally {
      client.release();
    }
  }

  console.log("");
  console.log("=== Totais ===");
  console.log(`Organizações processadas: ${orgs.length}`);
  console.log(COMMIT ? `Planos migrados: ${totalPlans}` : `Planos que SERIAM migrados: ${totalPlans}`);
  if (allUnknown.size > 0) {
    console.warn(`Códigos legados sem método correspondente (ignorados): ${[...allUnknown].join(", ")}`);
  }
  if (!COMMIT) {
    console.log("\n*** DRY-RUN — nada foi gravado. Rode novamente com --commit para aplicar. ***");
  }
  if (failures > 0) {
    console.error(`\n${failures} organização(ões) falharam e foram revertidas.`);
    process.exitCode = 1;
  }
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    pool.end();
    process.exit(1);
  });
```

- [ ] **Step 2: Registrar o comando**

Em `scripts/package.json`, ao lado de `"backfill-norms-catalog"`:

```json
    "backfill-effectiveness-methods": "tsx --env-file ../.env ./src/migrate/effectiveness-methods-backfill.ts",
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

⚠️ **Não executar o script agora.** `../.env` aponta para o **Neon de produção**. A execução (dry-run e depois `--commit`) é feita na etapa de deploy, com autorização explícita do usuário.

- [ ] **Step 4: Commit**

```bash
git add scripts/src/migrate/effectiveness-methods-backfill.ts scripts/package.json
git commit -m "chore(scripts): backfill do catálogo de métodos de verificação (dry-run + --commit)"
```

---

### Task 9: Verificação final

**Files:** nenhum (só execução)

- [ ] **Step 1: Typecheck do monorepo**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Suíte unitária**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 3: Suíte de integração**

Run: `TEST_ENV=integration pnpm test:integration`
Expected: PASS (inclui os novos testes do catálogo e do plano de ação).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Abrir o PR (draft)**

```bash
git push -u origin HEAD
gh pr create --draft --title "feat: catálogo gerenciável de métodos de verificação (eficácia do plano de ação)" --body "..."
```

O corpo do PR deve listar: o que muda para o usuário, a DDL de produção pendente (`effectiveness_methods` + `action_plans.effectiveness_method_id`) e o backfill (`backfill-effectiveness-methods --commit`), ambos a aplicar **com autorização explícita**.

---

## Pendências de deploy (fora do código, exigem autorização explícita)

1. **DDL no Neon de produção** (cirúrgica, nunca `drizzle-kit push` puro):
   `CREATE TABLE effectiveness_methods (...)` + índice único funcional + `ALTER TABLE action_plans ADD COLUMN effectiveness_method_id integer REFERENCES effectiveness_methods(id) ON DELETE SET NULL`.
2. **Backfill**: `pnpm --filter @workspace/scripts backfill-effectiveness-methods` (dry-run) e depois `--commit`.
3. Conferir na Gabardo (org 2) que os 6 métodos apareceram em Configurações → Sistema → Métodos de verificação e que as ações antigas mantiveram o método.
