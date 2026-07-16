# Ponto focal + co-responsáveis no Plano de Ação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O plano de ação passa a ter um **ponto focal** (a coluna que já existe) mais **N co-responsáveis** (tabela de junção), todos cobrados e com acesso iguais.

**Architecture:** Puramente **aditivo**. `action_plans.responsible_user_id` já É o ponto focal — não muda tipo, nulabilidade nem significado, logo **não há migração de dados, não há contrato a quebrar e não há coluna a dropar**. Os co-responsáveis entram na tabela `action_plan_responsibles` (já criada, Task 1) e no contrato como campo novo ao lado do que existe.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), Express 5, Zod, OpenAPI 3.1 + Orval, React 19 + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-plano-acao-multiplos-responsaveis-design.md`

## Global Constraints

- **Nunca rodar `pnpm db push`.** Ele aponta para o Neon de **produção** e tenta dropar colunas de outras branches. Banco de teste: DDL cirúrgico (o `test:integration:db:push` também propõe dropar colunas de outras branches — o container é compartilhado).
- **Testes de integração exigem `TEST_ENV=integration`.** Sem isso o Vitest carrega o `.env` e bate na **produção**.
- **O container Postgres de integração é compartilhado entre worktrees.** Se `action_plan_responsibles` sumir no meio da suíte (erro `42P01`), outra sessão a dropou — reaplique o DDL da Task 8 e siga.
- **Nunca editar arquivos gerados** (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`). Mudança de contrato = editar `lib/api-spec/openapi.yaml` + `pnpm --filter @workspace/api-spec codegen`.
- **Invariante do domínio:** o **ponto focal não aparece** na lista de co-responsáveis. O conjunto de responsáveis é `[ponto focal, ...co-responsáveis]`. O servidor rejeita (400) o ponto focal na lista de co-responsáveis.
- **Co-responsável é cobrado como responsável:** e-mail de vencimento, "Suas Pendências" e acesso à ficha sem o módulo.
- Todo commit passa `pnpm typecheck`. Estilo: Prettier (2 espaços, aspas duplas, trailing commas). Comentários e mensagens de erro ao usuário em **PT-BR**.

## Estado atual (Task 1 — FEITA, commit `7ebb60b`)

Já existem e **não devem ser reescritos**:

- `lib/db/src/schema/action-plans.ts` — `actionPlanResponsiblesTable` (junção dos co-responsáveis) + o comentário na coluna `responsibleUserId` explicando que ela é o ponto focal.
- `artifacts/api-server/src/services/action-plans/responsibles.ts` — interface pública:
  - `type PlanCoResponsible = { userId: number; name: string }`
  - `listCoResponsibleIds(planId): Promise<number[]>` — ordem crescente
  - `listCoResponsiblesByPlan(planIds): Promise<Map<number, PlanCoResponsible[]>>` — ordenado por **nome**
  - `setPlanCoResponsibles(orgId, planId, userIds): Promise<void>` — substituição total, **numa transação**, idempotente
  - `isPlanCoResponsible(planId, userId): Promise<boolean>`
- `artifacts/api-server/tests/services/action-plans/responsibles.integration.test.ts` — 5 testes, passando.

---

### Task 2: Contrato OpenAPI + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (schemas `ActionPlan`, `ActionPlanListItem`, `CreateActionPlanBody`, `UpdateActionPlanBody`)
- Generated (não editar à mão): `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`

**Interfaces:**
- Produces (tipos gerados, consumidos das Tasks 3–7):
  - `ActionPlanCoResponsible = { userId: number; name: string }`
  - `ActionPlan.coResponsibles: ActionPlanCoResponsible[]` (obrigatório; `[]` quando não há)
  - `ActionPlanListItem.coResponsibles: ActionPlanCoResponsible[]` (obrigatório)
  - `CreateActionPlanBody.coResponsibleUserIds?: number[] | null`
  - `UpdateActionPlanBody.coResponsibleUserIds?: number[] | null`
- **Não mexer** em `responsibleUserId` / `responsibleUserName` — são o ponto focal e continuam como estão.
- **Não mexer** no query param `responsibleUserId` — o nome fica; só a semântica no servidor muda (Task 3).

- [ ] **Step 1: Declarar o schema do co-responsável**

Em `lib/api-spec/openapi.yaml`, imediatamente **antes** da linha `    ActionPlan:` (4 espaços de indentação, dentro de `components.schemas`), insira:

```yaml
    ActionPlanCoResponsible:
      type: object
      description: Co-responsável do plano — um dos "outros responsáveis", além do ponto focal.
      properties:
        userId:
          type: integer
        name:
          type: string
      required:
        - userId
        - name

```

- [ ] **Step 2: `coResponsibles` no `ActionPlan`**

No schema `ActionPlan`, logo **abaixo** da propriedade `responsibleUserName:` existente, insira:

```yaml
        coResponsibles:
          type: array
          description: Os outros responsáveis do plano, além do ponto focal (responsibleUserId). Vazio quando não há.
          items:
            $ref: "#/components/schemas/ActionPlanCoResponsible"
```

No bloco `required:` do `ActionPlan`, adicione `- coResponsibles` após `- priority`.

- [ ] **Step 3: `coResponsibles` no `ActionPlanListItem`**

Mesma edição no schema `ActionPlanListItem`: insira `coResponsibles` abaixo do `responsibleUserName:` dele e adicione `- coResponsibles` ao `required:` dele, após `- priority`.

- [ ] **Step 4: `coResponsibleUserIds` nos corpos de escrita**

Em `CreateActionPlanBody`, logo **abaixo** do `responsibleUserId:` dele, insira:

```yaml
        coResponsibleUserIds:
          type: array
          nullable: true
          description: Conjunto COMPLETO de co-responsáveis. Substitui o conjunto atual. Não pode conter o ponto focal.
          items:
            type: integer
```

Repita **exatamente** a mesma inserção em `UpdateActionPlanBody`.

- [ ] **Step 5: Regerar**

```bash
pnpm --filter @workspace/api-spec codegen
```

- [ ] **Step 6: Conferir que os tipos nasceram**

```bash
grep -n "coResponsibles" lib/api-zod/src/generated/types/actionPlan.ts lib/api-zod/src/generated/types/actionPlanListItem.ts
grep -n "coResponsibleUserIds" lib/api-zod/src/generated/types/createActionPlanBody.ts lib/api-zod/src/generated/types/updateActionPlanBody.ts
```

Esperado: `coResponsibles: ActionPlanCoResponsible[];` nos dois primeiros; `coResponsibleUserIds?: number[] | null;` nos dois últimos.

- [ ] **Step 7: Typecheck e commit**

`pnpm typecheck` passa: nada consome os campos novos ainda, e nada foi removido.

```bash
pnpm typecheck
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): coResponsibles no contrato de planos de ação"
```

---

### Task 3: Backend — leitura e autorização

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/serializers.ts`
- Modify: `artifacts/api-server/src/routes/action-plans.ts` (imports, `requirePlanAccess`, listagem, `loadAndSerializePlan`)
- Test: `artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts` (criar)
- Test: `artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts` (estender)

**Interfaces:**
- Consumes: `listCoResponsiblesByPlan`, `isPlanCoResponsible` (Task 1); tipos gerados (Task 2).
- Produces: toda resposta de plano carrega `coResponsibles: PlanCoResponsible[]` (ordenado por nome). O filtro `?responsibleUserId=N` passa a significar "N é ponto focal **ou** co-responsável".

- [ ] **Step 1: Escrever os testes que falham**

Crie `artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts`:

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
import { setPlanCoResponsibles } from "../../src/services/action-plans/responsibles";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function seedPlan(
  ctx: TestOrgContext,
  opts: { title?: string; pontoFocal?: number | null } = {},
): Promise<number> {
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: opts.title ?? "Plano",
      responsibleUserId: opts.pontoFocal === undefined ? ctx.userId : opts.pontoFocal,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("planos de ação — leitura com co-responsáveis", () => {
  it("GET /:planId devolve os co-responsáveis ordenados por nome, sem o ponto focal", async () => {
    const ctx = await createTestContext({ seed: "ap-co-read", role: "org_admin" });
    contexts.push(ctx);
    const zeca = await createTestUser(ctx, { suffix: "zeca", role: "operator" });
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx); // ponto focal = ctx.userId
    await setPlanCoResponsibles(ctx.organizationId, planId, [zeca.id, ana.id]);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.responsibleUserId).toBe(ctx.userId); // o ponto focal segue onde estava
    expect(res.body.coResponsibles.map((r: { userId: number }) => r.userId)).toEqual([ana.id, zeca.id]);
  });

  it("GET /:planId devolve [] quando o plano não tem co-responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-co-none", role: "org_admin" });
    contexts.push(ctx);
    const planId = await seedPlan(ctx);

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    expect(res.body.coResponsibles).toEqual([]);
  });

  it("?responsibleUserId=X acha o plano tanto pelo ponto focal quanto pelo co-responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-co-filter", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const outro = await createTestUser(ctx, { suffix: "outro", role: "operator" });

    const comoFocal = await seedPlan(ctx, { title: "Focal", pontoFocal: co.id });
    const comoCo = await seedPlan(ctx, { title: "Co", pontoFocal: outro.id });
    await setPlanCoResponsibles(ctx.organizationId, comoCo, [co.id]);
    await seedPlan(ctx, { title: "Alheio", pontoFocal: outro.id });

    const res = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans?responsibleUserId=${co.id}`)
      .set(authHeader(ctx));

    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: number }) => p.id).sort((a: number, b: number) => a - b);
    expect(ids).toEqual([comoFocal, comoCo].sort((a, b) => a - b));
  });
});
```

E em `artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts`, acrescente ao topo o import `import { setPlanCoResponsibles } from "../../src/services/action-plans/responsibles";` (e `createTestUser` à lista vinda de `../../../../tests/support/backend`), e acrescente este caso ao final do `describe`:

```ts
  it("allows a CO-RESPONSIBLE user even with no module at all", async () => {
    const context = await createTestContext({
      seed: "ap-detail-coresponsible",
      role: "operator",
    });
    contexts.push(context);
    const outro = await createTestUser(context, { suffix: "focal", role: "operator" });
    // o ponto focal é OUTRA pessoa; o usuário do contexto é só co-responsável
    const planId = await createPlan(context.organizationId, {
      sourceModule: "manual",
      responsibleUserId: outro.id,
    });
    await setPlanCoResponsibles(context.organizationId, planId, [context.userId]);

    const response = await request(app)
      .get(`/api/organizations/${context.organizationId}/action-plans/${planId}`)
      .set(authHeader(context));

    expect(response.status).toBe(200);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts
```

Esperado: FAIL — `coResponsibles` não existe no payload; 403 no caso do co-responsável.

- [ ] **Step 3: Serializer emite `coResponsibles`**

Em `artifacts/api-server/src/services/action-plans/serializers.ts`, adicione o import:

```ts
import type { PlanCoResponsible } from "./responsibles";
```

No `extras` de `serializePlan`, acrescente o campo `coResponsibles: PlanCoResponsible[];` (mantendo `responsibleUserName`, que é o nome do ponto focal), e no objeto retornado, logo **abaixo** de `responsibleUserName: extras.responsibleUserName,`, acrescente:

```ts
    coResponsibles: extras.coResponsibles,
```

- [ ] **Step 4: `loadAndSerializePlan` carrega os co-responsáveis**

Em `artifacts/api-server/src/routes/action-plans.ts`, troque o import do drizzle para incluir `exists`:

```ts
import { and, asc, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
```

acrescente `actionPlanResponsiblesTable,` à lista de imports de `@workspace/db`, e acrescente:

```ts
import { isPlanCoResponsible, listCoResponsiblesByPlan } from "../services/action-plans/responsibles";
```

Dentro de `loadAndSerializePlan`, antes do `return serializePlan(...)`, acrescente:

```ts
  const coResponsiblesByPlan = await listCoResponsiblesByPlan([plan.id]);
```

e no objeto de `extras` passado a `serializePlan`, acrescente:

```ts
    coResponsibles: coResponsiblesByPlan.get(plan.id) ?? [],
```

- [ ] **Step 5: `requirePlanAccess` aceita o co-responsável**

Ainda em `routes/action-plans.ts`, dentro de `requirePlanAccess()`, troque o cálculo de `allowed`:

```ts
    const userId = req.auth!.userId;
    // Ordem importa: os checks de módulo saem do cache de auth (30s), então o
    // curto-circuito evita a consulta à junção para quem já entra pelo módulo.
    const allowed =
      plan.responsibleUserId === userId ||
      plan.effectivenessEvaluatorUserId === userId ||
      (await userHasModuleAccess(req.auth!, "actionPlans")) ||
      (await userHasModuleAccess(req.auth!, SOURCE_MODULE_OWNER[plan.sourceModule])) ||
      (await isPlanCoResponsible(planId, userId));
    if (!allowed) { res.status(403).json({ error: "Sem acesso a este plano de ação" }); return; }
```

- [ ] **Step 6: Listagem — filtro por pertinência e serialização em lote**

Na rota `GET /organizations/:orgId/action-plans`, troque o bloco do filtro por responsável:

```ts
  if (query.data.responsibleUserId !== undefined) {
    // "É responsável": ponto focal OU co-responsável. O nome do parâmetro segue no
    // singular; a semântica é de pertinência ao conjunto de responsáveis do plano.
    const responsibleUserId = query.data.responsibleUserId;
    conditions.push(
      or(
        eq(actionPlansTable.responsibleUserId, responsibleUserId),
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
      )!,
    );
  }
```

Logo depois de `const userNameMap = await resolveUserNames(plans.map((p) => p.responsibleUserId));`, acrescente:

```ts
  const coResponsiblesByPlan = await listCoResponsiblesByPlan(planIds);
```

e no `res.json(plans.map((p) => ({ ... })))`, logo **abaixo** da linha `responsibleUserName: ...`, acrescente:

```ts
    coResponsibles: coResponsiblesByPlan.get(p.id) ?? [],
```

- [ ] **Step 7: Rodar os testes**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts artifacts/api-server/tests/routes/action-plans-module-access.integration.test.ts
```

Esperado: PASS.

- [ ] **Step 8: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src artifacts/api-server/tests
git commit -m "feat(api): planos de ação leem e filtram por co-responsáveis"
```

---

### Task 4: Backend — escrita, regra do avaliador, auditoria e notificação

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/notify-assignment.ts`
- Modify: `artifacts/api-server/src/routes/action-plans.ts` (POST, PATCH, `DIFF_FIELDS`)
- Test: `artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts` (estender)

**Interfaces:**
- Consumes: `setPlanCoResponsibles`, `listCoResponsibleIds` (Task 1), `resolveUserNames` (já existe).
- Produces:
  - `notifyActionPlanCoResponsibleAssignment(plan, recipientUserId, actorUserId)` — nova, em `notify-assignment.ts`. `notifyActionPlanAssignment(plan, actorUserId)` **fica como está** (ela notifica o ponto focal, lendo `plan.responsibleUserId`).
  - Log de auditoria: campos `pontoFocal` (`{from,to}` com **nomes**) e `coResponsibles` (`{from,to}` com arrays de **nomes**).

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao `describe` de `artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts` (e acrescente `import { eq } from "drizzle-orm";` ao topo):

```ts
  it("POST cria com ponto focal + co-responsáveis", async () => {
    const ctx = await createTestContext({ seed: "ap-co-create", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });

    const res = await request(app)
      .post(`/api/organizations/${ctx.organizationId}/action-plans`)
      .set(authHeader(ctx))
      .send({
        sourceModule: "manual",
        sourceRef: { manualContext: "t" },
        title: "Ação com time",
        responsibleUserId: ctx.userId,
        coResponsibleUserIds: [ana.id, bruno.id],
      });

    expect(res.status).toBe(201);
    expect(res.body.responsibleUserId).toBe(ctx.userId);
    expect(res.body.coResponsibles).toHaveLength(2);
  });

  it("PATCH substitui o conjunto inteiro de co-responsáveis e aceita conjunto vazio", async () => {
    const ctx = await createTestContext({ seed: "ap-co-patch", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const planId = await seedPlan(ctx);
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id]);

    const trocou = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [bruno.id] });
    expect(trocou.status).toBe(200);
    expect(trocou.body.coResponsibles.map((r: { userId: number }) => r.userId)).toEqual([bruno.id]);

    const esvaziou = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [] });
    expect(esvaziou.status).toBe(200);
    expect(esvaziou.body.coResponsibles).toEqual([]);
  });

  it("rejeita o PONTO FOCAL na lista de co-responsáveis (ninguém é responsável duas vezes)", async () => {
    const ctx = await createTestContext({ seed: "ap-co-dup", role: "org_admin" });
    contexts.push(ctx);
    const planId = await seedPlan(ctx); // ponto focal = ctx.userId

    const res = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [ctx.userId] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ponto focal");
  });

  it("rejeita usuário de outra organização entre os co-responsáveis", async () => {
    const ctx = await createTestContext({ seed: "ap-co-org", role: "org_admin" });
    const alheio = await createTestContext({ seed: "ap-co-org-b", role: "org_admin" });
    contexts.push(ctx, alheio);
    const planId = await seedPlan(ctx);

    const res = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [alheio.userId] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("organização");
  });

  it("o avaliador da eficácia não pode ser o ponto focal NEM um co-responsável", async () => {
    const ctx = await createTestContext({ seed: "ap-co-eval", role: "org_admin" });
    contexts.push(ctx);
    const co = await createTestUser(ctx, { suffix: "co", role: "operator" });
    const planId = await seedPlan(ctx); // ponto focal = ctx.userId

    // designa o avaliador (admin pode)
    await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ effectivenessEvaluatorUserId: co.id })
      .expect(200);

    // agora tentar torná-lo co-responsável tem de falhar
    const conflito = await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [co.id] });

    expect(conflito.status).toBe(400);
    expect(conflito.body.error).toContain("diferente");
  });

  it("registra a troca de co-responsáveis no histórico com NOMES, não ids", async () => {
    const ctx = await createTestContext({ seed: "ap-co-log", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx);

    await request(app)
      .patch(`/api/organizations/${ctx.organizationId}/action-plans/${planId}`)
      .set(authHeader(ctx))
      .send({ coResponsibleUserIds: [ana.id] })
      .expect(200);

    const activity = await request(app)
      .get(`/api/organizations/${ctx.organizationId}/action-plans/${planId}/activity`)
      .set(authHeader(ctx));

    const entry = activity.body.find(
      (e: { changes?: { fields?: Record<string, unknown> } }) => e.changes?.fields?.coResponsibles,
    );
    expect(entry).toBeDefined();
    const { from, to } = entry.changes.fields.coResponsibles as { from: string[]; to: string[] };
    expect(from).toEqual([]);
    expect(to).toHaveLength(1);
    // nome, não id — o histórico é lido por auditor, não por programador
    expect(/^\d+$/.test(to[0])).toBe(false);
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts
```

Esperado: FAIL nos 6 casos novos (`coResponsibleUserIds` ainda é ignorado).

- [ ] **Step 3: Notificação do co-responsável**

Em `artifacts/api-server/src/services/action-plans/notify-assignment.ts`, acrescente (sem tocar em `notifyActionPlanAssignment`, que notifica o ponto focal):

```ts
/**
 * Notifica UM co-responsável — in-app + e-mail — de que foi vinculado ao plano.
 * Um plano tem N co-responsáveis; quem chama itera sobre eles. O texto é distinto
 * do ponto focal de propósito: quem lê precisa saber em que qualidade foi chamado.
 */
export async function notifyActionPlanCoResponsibleAssignment(
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
    title: `Você foi vinculado a uma ação: ${ref}${plan.title}`,
    description: `Você foi definido como co-responsável por esta ação.${due} Abra a ação para acompanhar e registrar o andamento.`,
    reason: "foi definido como co-responsável por esta ação",
  });
}
```

- [ ] **Step 4: POST create sincroniza os co-responsáveis**

Em `artifacts/api-server/src/routes/action-plans.ts`, amplie o import do serviço:

```ts
import {
  isPlanCoResponsible,
  listCoResponsibleIds,
  listCoResponsiblesByPlan,
  setPlanCoResponsibles,
} from "../services/action-plans/responsibles";
```

e o de notificações:

```ts
import {
  notifyActionPlanAssignment,
  notifyActionPlanCoResponsibleAssignment,
  notifyActionPlanEvaluatorAssignment,
} from "../services/action-plans/notify-assignment";
```

Na rota **POST**, logo após o `validateSourceRef`, acrescente a normalização e as validações:

```ts
  const coResponsibleIds = [...new Set(body.data.coResponsibleUserIds ?? [])];

  // Todo id referenciado tem de ser usuário DESTA org (barra cross-tenant + erro de FK).
  for (const userId of [
    body.data.responsibleUserId,
    ...coResponsibleIds,
    body.data.effectivenessEvaluatorUserId,
  ].filter((v): v is number => typeof v === "number")) {
    const ok = await assertUserBelongsToOrg(userId, params.data.orgId);
    if (!ok) {
      res.status(400).json({ error: "Responsável, co-responsável ou avaliador não corresponde a um usuário desta organização" });
      return;
    }
  }

  // Ninguém é responsável duas vezes: o ponto focal não entra na lista de co-responsáveis.
  if (body.data.responsibleUserId != null && coResponsibleIds.includes(body.data.responsibleUserId)) {
    res.status(400).json({ error: "O ponto focal não pode também constar como co-responsável." });
    return;
  }
```

**Remova** o laço antigo de validação de usuários (o `for (const [field, value] of [...] as const)`), que agora está coberto acima.

Troque o bloco de independência do avaliador por:

```ts
  // Independência (ISO): quem verifica a eficácia não pode ser NENHUM dos responsáveis.
  if (
    body.data.effectivenessEvaluatorUserId != null &&
    (body.data.effectivenessEvaluatorUserId === body.data.responsibleUserId ||
      coResponsibleIds.includes(body.data.effectivenessEvaluatorUserId))
  ) {
    res.status(400).json({ error: "O avaliador da eficácia deve ser diferente do ponto focal e dos co-responsáveis." });
    return;
  }
```

Logo **após** o `.returning()` do insert (antes do `logActionPlanActivity` de `created`):

```ts
  await setPlanCoResponsibles(params.data.orgId, row.id, coResponsibleIds);
```

E troque o bloco de notificações do fim da rota por:

```ts
  // Notifica quem já nasce vinculado.
  await notifyActionPlanAssignment(row, req.auth!.userId);
  for (const userId of coResponsibleIds) {
    await notifyActionPlanCoResponsibleAssignment(row, userId, req.auth!.userId);
  }
  await notifyActionPlanEvaluatorAssignment(row, req.auth!.userId);
```

- [ ] **Step 5: PATCH update sincroniza os co-responsáveis**

Na rota **PATCH**:

**(a)** logo depois do `if (!existing) { res.status(404)... }`:

```ts
  const existingCoIds = await listCoResponsibleIds(params.data.planId);
  const incomingCoIds =
    body.data.coResponsibleUserIds === undefined
      ? undefined
      : [...new Set(body.data.coResponsibleUserIds ?? [])];
  const finalCoIds = incomingCoIds ?? existingCoIds;
```

**(b)** logo depois do bloco `if (body.data.responsibleUserId !== undefined) { ... }` existente, acrescente a validação dos co-responsáveis:

```ts
  if (incomingCoIds !== undefined) {
    for (const userId of incomingCoIds) {
      const ok = await assertUserBelongsToOrg(userId, params.data.orgId);
      if (!ok) { res.status(400).json({ error: "Co-responsável não corresponde a um usuário desta organização" }); return; }
    }
  }

  // Ninguém é responsável duas vezes — qualquer dos dois lados pode estar mudando aqui.
  {
    const finalFocal = body.data.responsibleUserId !== undefined
      ? body.data.responsibleUserId
      : existing.responsibleUserId;
    if (finalFocal != null && finalCoIds.includes(finalFocal)) {
      res.status(400).json({ error: "O ponto focal não pode também constar como co-responsável." });
      return;
    }
  }
```

**(c)** troque o bloco de independência do avaliador (o `{ const effResponsible = ... }`) por:

```ts
  // Independência (ISO): o avaliador não pode ser o ponto focal nem um co-responsável.
  {
    const finalFocal = body.data.responsibleUserId !== undefined
      ? body.data.responsibleUserId
      : existing.responsibleUserId;
    const finalEvaluator = body.data.effectivenessEvaluatorUserId !== undefined
      ? body.data.effectivenessEvaluatorUserId
      : existing.effectivenessEvaluatorUserId;
    if (finalEvaluator != null && (finalEvaluator === finalFocal || finalCoIds.includes(finalEvaluator))) {
      res.status(400).json({ error: "O avaliador da eficácia deve ser diferente do ponto focal e dos co-responsáveis." });
      return;
    }
  }
```

**(d)** logo **após** o `const [row] = await db.update(actionPlansTable)...returning();`:

```ts
  if (incomingCoIds !== undefined) {
    await setPlanCoResponsibles(params.data.orgId, params.data.planId, incomingCoIds);
  }
```

**(e)** **Remova** `"responsibleUserId",` da constante `DIFF_FIELDS` (topo do arquivo) — ele passa a ser logado com nome, no bloco abaixo.

**(f)** Registre o diff dos responsáveis **fora** da cadeia priorizada — pelo mesmo motivo que o `planning`: aquela cadeia grava UMA entrada por save, então um save que mudasse status **e** responsáveis registraria só o status. Logo depois do bloco `if (planningChanged(existing, row)) { ... }`:

```ts
  // Nomes, não ids: o histórico é lido por auditor. `action_plan_activity_log` já
  // snapshota `userName` pelo mesmo motivo.
  {
    const focalChanged = row.responsibleUserId !== existing.responsibleUserId;
    const sortedFinalCo = [...finalCoIds].sort((a, b) => a - b);
    const coChanged = JSON.stringify(existingCoIds) !== JSON.stringify(sortedFinalCo);

    if (focalChanged || coChanged) {
      const nameMap = await resolveUserNames([
        existing.responsibleUserId,
        row.responsibleUserId,
        ...existingCoIds,
        ...sortedFinalCo,
      ]);
      const nameOf = (id: number) => nameMap.get(id) ?? `#${id}`;
      const fields: Record<string, { from: unknown; to: unknown }> = {};
      if (focalChanged) {
        fields.pontoFocal = {
          from: existing.responsibleUserId != null ? nameOf(existing.responsibleUserId) : null,
          to: row.responsibleUserId != null ? nameOf(row.responsibleUserId) : null,
        };
      }
      if (coChanged) {
        fields.coResponsibles = {
          from: existingCoIds.map(nameOf),
          to: sortedFinalCo.map(nameOf),
        };
      }
      await logActionPlanActivity({ ...logBase, action: "updated", changes: { kind: "diff", fields } });
    }
  }
```

**(g)** troque o bloco de notificação de reatribuição do fim da rota por:

```ts
  // Notifica o ponto focal se ele mudou, e só os co-responsáveis que ENTRARAM.
  if (row.responsibleUserId !== existing.responsibleUserId) {
    await notifyActionPlanAssignment(row, req.auth!.userId);
  }
  for (const userId of finalCoIds.filter((id) => !existingCoIds.includes(id))) {
    await notifyActionPlanCoResponsibleAssignment(row, userId, req.auth!.userId);
  }
  if (row.effectivenessEvaluatorUserId !== existing.effectivenessEvaluatorUserId) {
    await notifyActionPlanEvaluatorAssignment(row, req.auth!.userId);
  }
```

- [ ] **Step 6: Rodar os testes**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/action-plans-co-responsaveis.integration.test.ts
pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/action-plans/helpers.unit.test.ts
```

Esperado: PASS nos dois.

- [ ] **Step 7: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src artifacts/api-server/tests
git commit -m "feat(api): create/update sincronizam co-responsáveis; avaliador independente do conjunto"
```

---

### Task 5: Escalonamento cobra o ponto focal e os co-responsáveis

**Files:**
- Modify: `artifacts/api-server/src/services/action-plans/escalation.ts`
- Test: `artifacts/api-server/tests/services/action-plans/escalation-co-responsaveis.integration.test.ts` (criar)

**Interfaces:**
- Consumes: `actionPlanResponsiblesTable` (Task 1).
- Produces: `runActionPlanEscalationPass(orgId?)` mantém assinatura e o tipo `ActionPlanEscalationResult`. `scanned` conta **planos** (não pares); `alertsCreated`/`emailsSent` contam por destinatário.

A dedupe já é por **(plano + usuário + tipo + dia)** (`escalation.ts:112-126`) — nada a redesenhar: basta iterar sobre os destinatários.

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/api-server/tests/services/action-plans/escalation-co-responsaveis.integration.test.ts`:

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
import { setPlanCoResponsibles } from "../../../src/services/action-plans/responsibles";
import { runActionPlanEscalationPass } from "../../../src/services/action-plans/escalation";

// O e-mail é best-effort e depende do Resend; aqui só interessam as notificações in-app.
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

async function seedOverduePlan(ctx: TestOrgContext, pontoFocal: number | null): Promise<number> {
  const vencido = new Date();
  vencido.setDate(vencido.getDate() - 3);
  const [row] = await db
    .insert(actionPlansTable)
    .values({
      organizationId: ctx.organizationId,
      sourceModule: "manual",
      sourceRef: { manualContext: "t" },
      title: "Ação vencida",
      status: "open",
      dueDate: vencido,
      responsibleUserId: pontoFocal,
    })
    .returning({ id: actionPlansTable.id });
  return row.id;
}

describe("escalonamento com co-responsáveis", () => {
  it("cobra o ponto focal E os co-responsáveis; rodar duas vezes no mesmo dia não duplica", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-co", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const planId = await seedOverduePlan(ctx, ctx.userId);
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id, bruno.id]);

    const primeira = await runActionPlanEscalationPass(ctx.organizationId);
    expect(primeira.scanned).toBe(1); // UM plano, não três pares
    expect(primeira.alertsCreated).toBe(3); // ponto focal + 2 co-responsáveis

    const notifs = await db
      .select({ userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.organizationId, ctx.organizationId),
          eq(notificationsTable.relatedEntityId, planId),
          eq(notificationsTable.type, "action_plan_overdue"),
        ),
      );
    expect(notifs.map((n) => n.userId).sort((a, b) => a - b)).toEqual(
      [ctx.userId, ana.id, bruno.id].sort((a, b) => a - b),
    );

    const segunda = await runActionPlanEscalationPass(ctx.organizationId);
    expect(segunda.alertsCreated).toBe(0);
  });

  it("cobra o co-responsável mesmo quando o plano não tem ponto focal", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-nofocal", role: "org_admin" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedOverduePlan(ctx, null);
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id]);

    const result = await runActionPlanEscalationPass(ctx.organizationId);
    expect(result.scanned).toBe(1);
    expect(result.alertsCreated).toBe(1);
  });

  it("ignora plano sem ninguém a cobrar", async () => {
    const ctx = await createTestContext({ seed: "ap-esc-orfa", role: "org_admin" });
    contexts.push(ctx);
    await seedOverduePlan(ctx, null);

    const result = await runActionPlanEscalationPass(ctx.organizationId);
    expect(result.scanned).toBe(0);
    expect(result.alertsCreated).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/escalation-co-responsaveis.integration.test.ts
```

Esperado: FAIL — hoje só o ponto focal é cobrado (`alertsCreated` = 1, esperado 3).

- [ ] **Step 3: A varredura monta os destinatários**

Em `artifacts/api-server/src/services/action-plans/escalation.ts`, troque os imports:

```ts
import { and, eq, gte, inArray, isNotNull, isNull, lt, notInArray, or } from "drizzle-orm";
import { actionPlanResponsiblesTable, actionPlansTable, db, notificationsTable, usersTable } from "@workspace/db";
```

Dentro de `runActionPlanEscalationPass`, troque as `conditions` e a consulta (**sai** o `isNotNull(responsibleUserId)`: um plano sem ponto focal mas com co-responsável ainda tem quem cobrar):

```ts
  const conditions = [
    isNotNull(actionPlansTable.dueDate),
    lt(actionPlansTable.dueDate, todayStart),
    notInArray(actionPlansTable.status, ["completed", "cancelled"]),
  ];
  if (typeof orgId === "number") conditions.push(eq(actionPlansTable.organizationId, orgId));

  const rows = await db
    .select({
      id: actionPlansTable.id,
      organizationId: actionPlansTable.organizationId,
      code: actionPlansTable.code,
      title: actionPlansTable.title,
      dueDate: actionPlansTable.dueDate,
      responsibleUserId: actionPlansTable.responsibleUserId,
    })
    .from(actionPlansTable)
    .where(and(...conditions));

  // Destinatários = ponto focal + co-responsáveis. Um plano sem ninguém não é cobrável.
  const coRows = rows.length === 0 ? [] : await db
    .select({
      planId: actionPlanResponsiblesTable.actionPlanId,
      userId: actionPlanResponsiblesTable.userId,
    })
    .from(actionPlanResponsiblesTable)
    .where(inArray(actionPlanResponsiblesTable.actionPlanId, rows.map((r) => r.id)));

  const coByPlan = new Map<number, number[]>();
  for (const c of coRows) {
    const bucket = coByPlan.get(c.planId) ?? [];
    bucket.push(c.userId);
    coByPlan.set(c.planId, bucket);
  }

  const plans: PlanRow[] = [];
  for (const r of rows) {
    const recipients = [
      ...new Set([
        ...(r.responsibleUserId != null ? [r.responsibleUserId] : []),
        ...(coByPlan.get(r.id) ?? []),
      ]),
    ].sort((a, b) => a - b);
    if (recipients.length === 0) continue; // ninguém a cobrar
    plans.push({ ...r, recipients });
  }

  // `scanned` conta PLANOS, não pares — senão um plano com 3 donos viraria 3.
  result.scanned = plans.length;
  if (plans.length === 0) return result;
```

Troque o tipo `PlanRow` (ganha `recipients`; `responsibleUserId` deixa de ser usado no laço):

```ts
type PlanRow = {
  id: number;
  organizationId: number;
  code: string | null;
  title: string;
  dueDate: Date | null;
  responsibleUserId: number | null;
  /** Ponto focal + co-responsáveis, deduplicados. Nunca vazio. */
  recipients: number[];
};
```

Em `processOrg`, troque o laço externo para percorrer os destinatários de cada plano. Onde hoje está:

```ts
  for (const plan of plans) {
    if (!plan.responsibleUserId || !plan.dueDate) continue;
    let user = userCache.get(plan.responsibleUserId);
    ...
```

passe a ser um laço aninhado — o corpo (montar `title`/`description`, checar a dedupe, inserir a notificação, logar `escalated`, mandar o e-mail) fica **idêntico**, só trocando `plan.responsibleUserId` por `recipientId`:

```ts
  for (const plan of plans) {
    if (!plan.dueDate) continue;

    for (const recipientId of plan.recipients) {
      let user = userCache.get(recipientId);
      if (user === undefined) {
        const [u] = await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, recipientId))
          .limit(1);
        user = u ?? null;
        userCache.set(recipientId, user);
      }
      if (!user) continue;

      // ... (daqui para baixo, o corpo atual do laço, sem alteração:
      //      daysOverdue, title, description, dedupe, insert, logActionPlanActivity, sendOverdueEmail)
    }
  }
```

A passada de eficácia (`runActionPlanEffectivenessEscalationPass`) **não muda** — o avaliador continua sendo um só.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/action-plans/escalation-co-responsaveis.integration.test.ts
```

Esperado: PASS (3 testes).

- [ ] **Step 5: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/services/action-plans/escalation.ts artifacts/api-server/tests/services/action-plans/escalation-co-responsaveis.integration.test.ts
git commit -m "feat(api): escalonamento cobra ponto focal e co-responsáveis"
```

---

### Task 6: Suas Pendências — uma pendência por plano

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/types.ts`
- Modify: `artifacts/api-server/src/services/pendencias/providers/action-plans.ts`
- Modify: `artifacts/api-server/src/services/pendencias/aggregate.ts` (bloco `// Enrich responsibleName`, ~linhas 73-87)
- Test: `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts` (estender)

**Interfaces:**
- Produces: `Pendencia.responsibleUserIds?: number[]` — campo **opcional**. Só o provider de planos preenche; os outros três (kpi, nonconformity, regulatory_document) seguem sem ele e caem no fallback singular. `Pendencia.responsibleUserId` continua **obrigatório** e passa a significar "o responsável, dentro do escopo pedido, que explica esta linha estar aqui".

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao `describe` de `artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts` (acrescentando ao topo `createTestUser` ao import de `backend` e `import { setPlanCoResponsibles } from "../../../src/services/action-plans/responsibles";`):

```ts
  it("plano com ponto focal + 2 co-responsáveis vira UMA pendência (não três)", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-co" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const bruno = await createTestUser(ctx, { suffix: "bruno", role: "operator" });
    const planId = await seedPlan(ctx, { title: "Ação do time", status: "open", dueDate: new Date(2026, 5, 10) });
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id, bruno.id]);

    // escopo unit/org: o solicitante enxerga os três
    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ctx.userId, ana.id, bruno.id],
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`action_plan:${planId}`);
    expect(items[0].responsibleUserIds).toEqual([ctx.userId, ana.id, bruno.id].sort((a, b) => a - b));
  });

  it("no escopo 'mine', o co-responsável vê a ação mesmo sem ser o ponto focal", async () => {
    const ctx = await createTestContext({ seed: "pend-ap-co-mine" });
    contexts.push(ctx);
    const ana = await createTestUser(ctx, { suffix: "ana", role: "operator" });
    const planId = await seedPlan(ctx, { title: "Compartilhada", status: "open", dueDate: new Date(2026, 5, 10) });
    await setPlanCoResponsibles(ctx.organizationId, planId, [ana.id]);

    const items = await actionPlanPendenciaProvider.listPending({
      orgId: ctx.organizationId,
      responsibleUserIds: [ana.id], // escopo "mine" da co-responsável
      now: NOW,
      dueSoonDays: 7,
    });

    expect(items).toHaveLength(1);
    expect(items[0].responsibleUserId).toBe(ana.id); // o id que EXPLICA a linha estar aqui
    expect(items[0].responsibleUserIds).toEqual([ctx.userId, ana.id].sort((a, b) => a - b));
  });
```

O `seedPlan` já existente nesse arquivo grava `responsibleUserId: ctx.userId` — é o ponto focal, e continua correto. **Não o altere.**

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/action-plans-provider.integration.test.ts
```

Esperado: FAIL nos 2 casos novos (o co-responsável não é encontrado).

- [ ] **Step 3: Tipo `Pendencia` ganha o campo opcional**

Em `artifacts/api-server/src/services/pendencias/types.ts`, dentro de `export interface Pendencia`, troque as duas linhas do responsável por:

```ts
  /** O responsável, DENTRO do escopo pedido, que explica esta linha estar na lista. */
  responsibleUserId: number;
  /** Todos os responsáveis do item, quando ele admite mais de um (hoje: planos de
   *  ação — ponto focal + co-responsáveis). Ausente nos demais provedores, que caem
   *  no singular acima. */
  responsibleUserIds?: number[];
  responsibleName?: string;
```

- [ ] **Step 4: Provider emite uma pendência por plano**

Substitua **todo** o conteúdo de `artifacts/api-server/src/services/pendencias/providers/action-plans.ts` por:

```ts
import { and, eq, gte, inArray, lt, or, type SQL } from "drizzle-orm";
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
  responsibleUserId: number | null;
};

/**
 * Planos com AO MENOS UM responsável (ponto focal ou co-responsável) dentro do
 * escopo, já com TODOS os responsáveis de cada um.
 *
 * Duas consultas de propósito: a primeira decide quais planos entram (pertinência
 * ao escopo), a segunda descreve quem responde por eles. Um JOIN só traria apenas
 * os responsáveis do escopo, e a UI mostraria um time incompleto.
 */
async function loadScopedPlans(
  ctx: PendenciaProviderContext,
  statuses: ("open" | "in_progress" | "completed" | "cancelled")[],
  extraConditions: SQL[] = [],
): Promise<{ plans: PlanRow[]; coByPlan: Map<number, number[]> }> {
  const scopeMatch = or(
    inArray(actionPlansTable.responsibleUserId, ctx.responsibleUserIds),
    inArray(actionPlansTable.id, 
      db
        .select({ id: actionPlanResponsiblesTable.actionPlanId })
        .from(actionPlanResponsiblesTable)
        .where(inArray(actionPlanResponsiblesTable.userId, ctx.responsibleUserIds)),
    ),
  )!;

  const plans = await db
    .select({
      id: actionPlansTable.id,
      code: actionPlansTable.code,
      title: actionPlansTable.title,
      status: actionPlansTable.status,
      priority: actionPlansTable.priority,
      dueDate: actionPlansTable.dueDate,
      closedAt: actionPlansTable.closedAt,
      responsibleUserId: actionPlansTable.responsibleUserId,
    })
    .from(actionPlansTable)
    .where(
      and(
        eq(actionPlansTable.organizationId, ctx.orgId),
        inArray(actionPlansTable.status, statuses),
        scopeMatch,
        ...extraConditions,
      ),
    );

  if (plans.length === 0) return { plans: [], coByPlan: new Map() };

  const coRows = await db
    .select({
      planId: actionPlanResponsiblesTable.actionPlanId,
      userId: actionPlanResponsiblesTable.userId,
    })
    .from(actionPlanResponsiblesTable)
    .where(inArray(actionPlanResponsiblesTable.actionPlanId, plans.map((p) => p.id)));

  const coByPlan = new Map<number, number[]>();
  for (const r of coRows) {
    const bucket = coByPlan.get(r.planId) ?? [];
    bucket.push(r.userId);
    coByPlan.set(r.planId, bucket);
  }

  return { plans, coByPlan };
}

/** Todos os responsáveis do plano: ponto focal + co-responsáveis, deduplicados e ordenados. */
function allResponsibles(plan: PlanRow, coByPlan: Map<number, number[]>): number[] {
  return [
    ...new Set([
      ...(plan.responsibleUserId != null ? [plan.responsibleUserId] : []),
      ...(coByPlan.get(plan.id) ?? []),
    ]),
  ].sort((a, b) => a - b);
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
    const { plans, coByPlan } = await loadScopedPlans(ctx, ["open", "in_progress"]);

    return plans.map((p): Pendencia => {
      const all = allResponsibles(p, coByPlan);
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
    const { plans, coByPlan } = await loadScopedPlans(
      ctx,
      ["completed", "cancelled"],
      [gte(actionPlansTable.closedAt, start), lt(actionPlansTable.closedAt, end)],
    );

    return plans.map((p): Pendencia => {
      const all = allResponsibles(p, coByPlan);
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

Em `artifacts/api-server/src/services/pendencias/aggregate.ts`, substitua o bloco `// Enrich responsibleName ...` (~linhas 73-87) por:

```ts
  // Enrich responsibleName (needed by the unit/org scopes). Um item pode ter mais de
  // um responsável (planos de ação: ponto focal + co-responsáveis) — aí o rótulo
  // vira "Maria Silva +2".
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

E acrescente, no fim do arquivo (importando `type Pendencia` de `./types` se ainda não estiver):

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

- [ ] **Step 6: Rodar a suíte de pendências**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/ artifacts/api-server/tests/routes/pendencias.integration.test.ts
```

Esperado: PASS.

- [ ] **Step 7: Typecheck e commit**

```bash
pnpm typecheck
git add artifacts/api-server/src/services/pendencias artifacts/api-server/tests/services/pendencias
git commit -m "feat(pendencias): co-responsável vê o plano; uma pendência por plano"
```

---

### Task 7: Frontend

**Files:**
- Modify: `artifacts/web/src/lib/action-plans-client.ts` (helper `formatResponsibles`)
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/responsible-options.ts`
- Modify: `artifacts/web/src/pages/app/planos-acao/[id].tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/eficacia-panel.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/lista-screen.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/painel-operacional.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/comentarios-historico.tsx`
- Modify: `artifacts/web/src/pages/app/planos-acao/_components/nova-acao-dialog.tsx` (**só o rótulo**)
- Modify: `artifacts/web/src/components/kpi/cell-red-actions-dialog.tsx` (**só o rótulo** + exibição)
- Test: `artifacts/web/tests/lib/format-responsibles.unit.test.ts` (criar)
- Test: `artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts` (estender)

**Interfaces:**
- Consumes: `ActionPlan.coResponsibles`, `ActionPlanListItem.coResponsibles`, `UpdateActionPlanBody.coResponsibleUserIds` (Task 2).
- Produces:
  - `formatResponsibles(pontoFocalName, coResponsibles): string | null` — exportada de `@/lib/action-plans-client`.
  - `buildCoResponsibleOptions(orgUsers, coResponsibles, excludeUserId): SearchableMultiSelectOption[]` — em `responsible-options.ts`, ao lado do `buildResponsibleOptions` existente (que **continua** servindo ao seletor do ponto focal e **não muda**).

**Os diálogos de criação NÃO ganham campo de co-responsável** (decisão de UX da spec §7): o plano nasce com o ponto focal; os co-responsáveis entram na ficha. Nesses dois arquivos, só o rótulo "Responsável" vira "Ponto focal".

- [ ] **Step 1: Escrever os testes que falham**

Crie `artifacts/web/tests/lib/format-responsibles.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatResponsibles } from "@/lib/action-plans-client";

describe("formatResponsibles", () => {
  it("devolve null quando não há ninguém", () => {
    expect(formatResponsibles(null, [])).toBeNull();
    expect(formatResponsibles(undefined, undefined)).toBeNull();
  });

  it("devolve só o ponto focal quando não há co-responsável", () => {
    expect(formatResponsibles("Maria Silva", [])).toBe("Maria Silva");
  });

  it("resume com +N quando há co-responsáveis", () => {
    expect(
      formatResponsibles("Maria Silva", [
        { userId: 2, name: "João Souza" },
        { userId: 3, name: "Ana Costa" },
      ]),
    ).toBe("Maria Silva +2");
  });

  it("sem ponto focal, mostra o primeiro co-responsável", () => {
    expect(
      formatResponsibles(null, [
        { userId: 2, name: "João Souza" },
        { userId: 3, name: "Ana Costa" },
      ]),
    ).toBe("João Souza +1");
  });
});
```

E acrescente ao `describe` de `artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts` (mantendo os testes existentes de `buildResponsibleOptions` intactos, e importando `buildCoResponsibleOptions` do mesmo módulo):

```ts
describe("buildCoResponsibleOptions", () => {
  const ORG = [
    { id: 1, name: "Ana" },
    { id: 2, name: "Bruno" },
    { id: 3, name: "Carla" },
  ];

  it("exclui o ponto focal das opções (ninguém é responsável duas vezes)", () => {
    const options = buildCoResponsibleOptions(ORG, [], 2);
    expect(options.map((o) => o.value)).toEqual([1, 3]);
  });

  it("semeia co-responsáveis ausentes da lista da org (operador sem permissão de listar)", () => {
    const options = buildCoResponsibleOptions([], [{ userId: 9, name: "Diego" }], null);
    expect(options).toEqual([{ value: 9, label: "Diego" }]);
  });

  it("não duplica co-responsável que já está na lista da org", () => {
    const options = buildCoResponsibleOptions(ORG, [{ userId: 3, name: "Carla" }], null);
    expect(options.map((o) => o.value)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/lib/format-responsibles.unit.test.ts artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts
```

Esperado: FAIL — `formatResponsibles` e `buildCoResponsibleOptions` não existem.

- [ ] **Step 3: `formatResponsibles`**

Acrescente ao fim de `artifacts/web/src/lib/action-plans-client.ts`:

```ts
/**
 * Rótulo curto do conjunto de responsáveis do plano: o ponto focal, mais "+N"
 * quando há co-responsáveis. Mesma convenção do rótulo de "Suas Pendências" — as
 * duas telas mostram a mesma coisa.
 */
export function formatResponsibles(
  pontoFocalName: string | null | undefined,
  coResponsibles: Array<{ userId: number; name: string }> | null | undefined,
): string | null {
  const co = coResponsibles ?? [];
  const primary = pontoFocalName ?? co[0]?.name ?? null;
  if (!primary) return null;
  const extras = pontoFocalName ? co.length : Math.max(0, co.length - 1);
  return extras > 0 ? `${primary} +${extras}` : primary;
}
```

- [ ] **Step 4: `buildCoResponsibleOptions`**

Acrescente ao fim de `artifacts/web/src/pages/app/planos-acao/_components/responsible-options.ts` (sem tocar em `buildResponsibleOptions`, que serve ao ponto focal):

```ts
import type { SearchableMultiSelectOption } from "@/components/ui/searchable-multi-select";

/**
 * Opções do seletor de "Co-responsáveis".
 *
 * Exclui o ponto focal: ninguém é responsável duas vezes (o servidor rejeita, e o
 * seletor não deve nem oferecer). E semeia os co-responsáveis atuais quando
 * `orgUsers` volta vazia — só admin e gerente podem listar os usuários da org, então
 * o operador que abre o plano dele veria um seletor vazio sem isso.
 */
export function buildCoResponsibleOptions(
  orgUsers: Array<{ id: number; name: string }>,
  coResponsibles: Array<{ userId: number; name: string }>,
  pontoFocalUserId: number | null,
): SearchableMultiSelectOption[] {
  const options = orgUsers
    .filter((user) => user.id !== pontoFocalUserId)
    .map((user) => ({ value: user.id, label: user.name }));

  const known = new Set(options.map((option) => option.value));
  const missing = coResponsibles
    .filter((r) => !known.has(r.userId) && r.userId !== pontoFocalUserId)
    .map((r) => ({ value: r.userId, label: r.name || "Co-responsável" }));

  return [...missing, ...options];
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/lib/format-responsibles.unit.test.ts artifacts/web/tests/pages/action-plan-responsible-options.unit.test.ts
```

Esperado: PASS.

- [ ] **Step 6: Ficha do plano (`[id].tsx`)**

**(a)** acrescente aos imports:

```ts
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { buildCoResponsibleOptions, buildResponsibleOptions } from "./_components/responsible-options";
```

**(b)** no `useState` do `form`, logo abaixo de `responsibleUserId: "",`, acrescente:

```ts
    coResponsibleUserIds: [] as number[],
```

**(c)** na hidratação (`const hydrated: typeof form = {`), logo abaixo da linha do `responsibleUserId`, acrescente:

```ts
      coResponsibleUserIds: plan.coResponsibles.map((r) => r.userId),
```

**(d)** em `buildPayload`, logo abaixo da linha do `responsibleUserId`, acrescente:

```ts
      coResponsibleUserIds: f.coResponsibleUserIds,
```

**(e)** troque o rótulo do campo existente de `<Label>Responsável</Label>` para `<Label>Ponto focal</Label>` (o `<SearchableSelect>` dele **não muda**), e logo **depois** desse bloco `<div className="space-y-1.5">…</div>`, acrescente o campo novo:

```tsx
                <div className="space-y-1.5">
                  <Label>Co-responsáveis</Label>
                  <SearchableMultiSelect
                    options={buildCoResponsibleOptions(
                      orgUsers,
                      plan.coResponsibles,
                      form.responsibleUserId ? Number(form.responsibleUserId) : null,
                    )}
                    selected={form.coResponsibleUserIds}
                    onToggle={(id) =>
                      patch(
                        "coResponsibleUserIds",
                        form.coResponsibleUserIds.includes(id)
                          ? form.coResponsibleUserIds.filter((v) => v !== id)
                          : [...form.coResponsibleUserIds, id],
                      )
                    }
                    placeholder="Ninguém além do ponto focal"
                    searchPlaceholder="Buscar usuário..."
                    emptyMessage="Nenhum usuário encontrado"
                    disabled={!canEdit}
                  />
                </div>
```

**(f)** na chamada do `<EficaciaPanel>`, acrescente a prop:

```tsx
              coResponsibleUserIds={form.coResponsibleUserIds}
```

O `diffActionPlanPayload` já compara arrays estruturalmente (`payload-diff.ts:9-11`), então o autosave só manda `coResponsibleUserIds` quando o conjunto muda de fato. Nada a fazer lá.

- [ ] **Step 7: `EficaciaPanel` exclui o ponto focal E os co-responsáveis**

Em `_components/eficacia-panel.tsx`, acrescente a prop `coResponsibleUserIds = [],` (com o tipo `coResponsibleUserIds?: number[];` e o comentário `/** Co-responsáveis — também não podem avaliar a própria eficácia (ISO). */`), e troque o filtro das opções do avaliador:

```tsx
            options={orgUsers
              .filter(
                (u) =>
                  String(u.id) !== responsibleUserId &&
                  !coResponsibleUserIds.includes(u.id) &&
                  u.role !== "analyst",
              )
              .map((u) => ({ value: String(u.id), label: u.name }))}
```

- [ ] **Step 8: Listagem, painel e histórico**

Em `_components/lista-screen.tsx`:
- acrescente `formatResponsibles,` ao import de `@/lib/action-plans-client`
- na busca textual, troque o array por:

```ts
      [p.title, p.code, p.responsibleUserName, ...p.coResponsibles.map((r) => r.name), p.sourceContext?.label]
```

- troque o cabeçalho `<TableHead>Responsável</TableHead>` por `<TableHead>Responsáveis</TableHead>`
- troque a célula por:

```tsx
                    <TableCell className="text-sm">
                      {formatResponsibles(p.responsibleUserName, p.coResponsibles) ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
```

Em `_components/painel-operacional.tsx`: acrescente `formatResponsibles` ao import de `@/lib/action-plans-client` e troque a linha do alerta por:

```tsx
          {formatResponsibles(p.responsibleUserName, p.coResponsibles)
            ? ` · ${formatResponsibles(p.responsibleUserName, p.coResponsibles)}`
            : ""}
```

Em `_components/comentarios-historico.tsx`: acrescente perto do topo, junto às outras constantes do módulo:

```ts
/** O log grava a chave crua do campo; a tela é lida por auditor, não por
 *  programador. Traduzimos o que esta entrega toca. */
const FIELD_LABELS: Record<string, string> = {
  pontoFocal: "Ponto focal",
  coResponsibles: "Co-responsáveis",
};
```

e troque o laço que monta as partes do diff:

```ts
  for (const [field, { from, to }] of Object.entries(c.fields)) {
    if (field === "planning") continue;
    parts.push(`${FIELD_LABELS[field] ?? field}: ${fmt(from)} → ${fmt(to)}`);
  }
```

`fmt` já junta arrays com `", "`, então sai **"Co-responsáveis: — → Maria Silva, João Souza"**.

- [ ] **Step 9: Rótulos dos diálogos de criação**

Em `_components/nova-acao-dialog.tsx` e em `components/kpi/cell-red-actions-dialog.tsx`, troque **apenas** o rótulo `<Label>Responsável</Label>` por `<Label>Ponto focal</Label>`. **Não acrescente** campo de co-responsável nesses diálogos (spec §7).

Em `cell-red-actions-dialog.tsx`, na lista de planos existentes da célula (~linha 367), troque a exibição do responsável para incluir os co-responsáveis (acrescentando `formatResponsibles` ao import de `@/lib/action-plans-client`):

```tsx
            {formatResponsibles(plan.responsibleUserName, plan.coResponsibles) && (
              <span className="text-[11px] text-muted-foreground truncate">
                {formatResponsibles(plan.responsibleUserName, plan.coResponsibles)}
              </span>
            )}
```

- [ ] **Step 10: Typecheck, suíte web e commit**

```bash
pnpm typecheck
pnpm exec vitest run --project web-unit
git add artifacts/web/src artifacts/web/tests
git commit -m "feat(web): ponto focal + co-responsáveis na ficha, listagem e histórico"
```

---

### Task 8: DDL de produção (escrever; **não** aplicar sem autorização)

**Files:**
- Create: `scripts/sql/20260714_add_action_plan_responsibles.sql`

> **Nunca rode `pnpm db push` contra a produção.** Este arquivo é aplicado à mão, e **só** com autorização explícita do usuário.

- [ ] **Step 1: Escrever o script**

Crie `scripts/sql/20260714_add_action_plan_responsibles.sql`:

```sql
-- Co-responsáveis do plano de ação (spec 2026-07-14).
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
--
-- SEM BACKFILL, de propósito: `action_plans.responsible_user_id` já contém o ponto
-- focal de cada plano e continua com o mesmo significado. Esta tabela nasce vazia e
-- guarda apenas os CO-responsáveis. O código antigo a ignora, então a ordem de
-- deploy não é crítica.

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
```

- [ ] **Step 2: Provar a idempotência contra o banco de TESTE (nunca a produção)**

A tabela já existe lá; o valor é provar que rodar por cima não quebra:

```bash
docker exec -i daton-postgres-1 psql -U postgres -d daton_integration < scripts/sql/20260714_add_action_plan_responsibles.sql
```

Esperado: `CREATE TABLE` / `CREATE INDEX` sem erro (ou `NOTICE: relation already exists, skipping`). Se falhar com "already exists" **sem** ser NOTICE, falta um `IF NOT EXISTS` — corrija e repita.

- [ ] **Step 3: Commit**

```bash
git add scripts/sql/20260714_add_action_plan_responsibles.sql
git commit -m "chore(db): DDL de action_plan_responsibles para a produção"
```

- [ ] **Step 4: Parar e pedir autorização**

**NÃO aplique nada na produção.** Relate ao usuário que o script está pronto e que aplicá-lo exige o **go** explícito dele.

---

## Encerramento

- [ ] **Suíte completa**

```bash
pnpm typecheck
pnpm test:unit
TEST_ENV=integration pnpm test:integration
```

- [ ] **Diário de bordo** (obrigatório pelo CLAUDE.md)

Registrar em PT-BR, com fidelidade: o que foi entregue, o impacto (cobrança, pendências, acesso e eficácia passam a considerar o co-responsável), o que ficou pendente (**DDL de produção não aplicada**) e as validações rodadas.

- [ ] **PR draft**

```bash
git push -u origin HEAD
gh pr create --draft --title "feat: plano de ação com ponto focal + co-responsáveis"
```

O corpo do PR deve avisar, em destaque, que **a DDL de produção não foi aplicada** e depende de autorização, e que a próxima etapa (ações-item) vai migrar o vínculo dos co-responsáveis do plano para as ações.
