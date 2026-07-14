# Aprendizagem — SP5 (Avaliação de eficácia + Minha área) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela de avaliação de eficácia (kanban + modal + "criar plano de ação" reutilizado) e Minha área (colaborador + gestor leve), reaproveitando endpoints/componentes existentes; único backend novo = expor `employeeId` no `/auth/me`.

**Architecture:** Sem tabelas novas. O kanban de eficácia lê `GET /employees/trainings` (que já calcula `effectivenessStatus`) e grava via o POST de review existente; "não eficaz" reusa `CriarAcaoButton`/`AcoesVinculadas` (origem `training`, já plugada). Minha área resolve o colaborador do usuário via `user.employeeId` (adicionado ao `/auth/me`) e reusa os endpoints por-colaborador.

**Tech Stack:** Express 5 + zod, OpenAPI + Orval (codegen via python3), React 19 + Wouter + TanStack Query, Vitest.

## Global Constraints

- **Reaproveitamento, sem tabelas novas.** Única mudança de contrato: `employeeId` (aditivo) no `User`/`/auth/me`.
- **Codegen sem ruby:** caminho python3 (ver SP1–SP4). Nunca editar gerados.
- **Permissão:** telas sob o módulo `employees` (nav já gateado); `/auth/me` já é `requireAuth`.
- **DB nunca em PROD:** sem `drizzle push` (sem schema novo). Testes contra o DB de integração docker (já no ar).
- **Reuso de origem de ação:** `CriarAcaoButton` prop `source={{ sourceModule: "training", sourceRef: { trainingId } }}`; `AcoesVinculadas` props `{ orgId, sourceModule: "training", refId: trainingId }` (verbatim de `treinamento-detalhe.tsx`).
- **Commits:** 1 por task. Push de backup ao fim.
- Prettier 2 espaços, aspas duplas, trailing commas; identificadores em inglês, UI em PT-BR.

**Pré-flight:** `pnpm typecheck` verde; DB de integração no ar.

---

## File Structure

- **Contrato/backend:** `lib/api-spec/openapi.yaml` (User + employeeId), `artifacts/api-server/src/routes/auth.ts` (GET /auth/me), gerados.
- **Frontend:** `pages/app/aprendizagem/eficacia/index.tsx`, `pages/app/aprendizagem/minha-area/index.tsx`, `App.tsx`, `AppLayout.tsx`.

---

### Task 1: Backend — expor `employeeId` no `/auth/me`

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (schema `User`) + gerados.
- Modify: `artifacts/api-server/src/routes/auth.ts` (handler `GET /auth/me`, ~linha 188).
- Test: `artifacts/api-server/tests/routes/auth-me-employee.integration.test.ts`

**Interfaces:**
- Produces: `User.employeeId` (integer, nullable) no contrato → `useAuth().user.employeeId` no frontend.

- [ ] **Step 1: Teste de integração (falha primeiro)**

Criar `artifacts/api-server/tests/routes/auth-me-employee.integration.test.ts` (supertest + `createTestContext`/`authHeader`). Casos: GET `/api/auth/me` retorna `employeeId` — nulo quando o usuário não tem vínculo; e, após ligar `users.employee_id` a um colaborador (update direto via `db`), retorna o id.
```ts
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import app from "../../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createTestContext,
  type TestOrgContext,
} from "../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("GET /auth/me employeeId", () => {
  it("retorna employeeId nulo e depois vinculado", async () => {
    const context = await createTestContext({ seed: "me-employee" });
    contexts.push(context);

    const before = await request(app).get("/api/auth/me").set(authHeader(context));
    expect(before.status).toBe(200);
    expect(before.body.user.employeeId ?? null).toBeNull();

    const emp = await createEmployee(context, { name: `Vinc ${context.prefix}` });
    await db
      .update(usersTable)
      .set({ employeeId: emp.id })
      .where(eq(usersTable.id, context.userId));

    const after = await request(app).get("/api/auth/me").set(authHeader(context));
    expect(after.body.user.employeeId).toBe(emp.id);
  });
});
```

- [ ] **Step 2: Rodar — deve falhar.**
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/auth-me-employee.integration.test.ts`
Expected: FAIL (employeeId ausente/undefined).

- [ ] **Step 3: Adicionar `employeeId` ao schema `User`** no `openapi.yaml` (localizar `    User:` — o schema usado pela resposta de `getMe`) — adicionar às `properties`:
```yaml
        employeeId:
          type: integer
          nullable: true
```
(Não é `required`.)

- [ ] **Step 4: Incluir `employeeId` na resposta do handler**

Em `artifacts/api-server/src/routes/auth.ts`, no handler `GET /auth/me` (~188), garantir que o objeto `user` retornado inclua `employeeId` da linha de `usersTable` (o handler já carrega o usuário por `userId`; adicionar `employeeId: user.employeeId ?? null` ao objeto de resposta — ler o handler e incluir o campo na serialização do user).

- [ ] **Step 5: Codegen (python3)**
```bash
cd lib/api-spec
python3 -c 'import yaml; yaml.safe_load(open("openapi.yaml"))'
python3 -c 'import yaml,json; json.dump(yaml.safe_load(open("openapi.yaml")), open(".openapi.codegen.json","w"), indent=2)'
pnpm exec orval --config ./orval.config.ts
python3 -c 'p="../api-zod/src/index.ts"; ls=[l for l in open(p) if "./generated/types" not in l]; open(p,"w").write("".join(ls))'
rm -f .openapi.codegen.json
cd ../..
```

- [ ] **Step 6: Rodar — deve passar.** Vitest do Step 1 → PASS.
- [ ] **Step 7: Typecheck + commit**
```bash
pnpm typecheck:libs && pnpm --filter @workspace/api-server typecheck
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/auth.ts artifacts/api-server/tests/routes/auth-me-employee.integration.test.ts
git commit -m "feat(aprendizagem): expor employeeId no /auth/me (para a Minha área)"
```

---

### Task 2: Frontend — tela Avaliação de eficácia (kanban + modal + ação) + rota/menu

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/eficacia/index.tsx`
- Modify: `artifacts/web/src/App.tsx`, `artifacts/web/src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `useListOrganizationTrainings` (params `status`, `effectivenessStatus`), `useCreateTrainingEffectivenessReview` (mutation `{ orgId, empId, trainId, data }`), `getListOrganizationTrainingsQueryKey` (existentes); `CriarAcaoButton` + `AcoesVinculadas` de `@/pages/app/planos-acao/_components/*`.

- [ ] **Step 1: Página** — mirror estrutural de `pages/app/aprendizagem/obrigatoriedades/index.tsx`: `usePageTitle("Avaliação de eficácia")`. Carregar treinos concluídos via `useListOrganizationTrainings(orgId, { status: "concluido" }, { query: { enabled, queryKey } })`. Derivar 3 colunas por `effectivenessStatus` do item: **Pendentes** (`pending`), **Em avaliação** (sem review mas com sinalização parcial — se não houver estado parcial no dado, colapsar Pendentes/Concluídas em 2 colunas), **Concluídas** (`effective`/`ineffective`). Cards com nome do colaborador + treino + status. **Indicadores** (cards): pendentes, eficazes, não eficazes, avaliadas.
  - **Modal de avaliação** (ao clicar num card pendente): critérios Kirkpatrick (selects 1–5 para comportamento/resultado/transferência) + comentário; ao salvar, computar `score` (média×escala), `isEffective` (veredito ≥ limite), `resultLevel`, e chamar `useCreateTrainingEffectivenessReview.mutateAsync({ orgId, empId: card.employeeId, trainId: card.id, data: { evaluationDate: hoje, score, isEffective, resultLevel, comments } })`; invalidar `getListOrganizationTrainingsQueryKey`.
  - **Card "não eficaz":** renderizar `<AcoesVinculadas orgId={orgId} sourceModule="training" refId={card.id} />` e `<CriarAcaoButton orgId={orgId} source={{ sourceModule: "training", sourceRef: { trainingId: card.id } }} />`.

- [ ] **Step 2: Rota** — `App.tsx`: import + rotas `/aprendizagem/eficacia` e `/app/aprendizagem/eficacia` (mirror).
- [ ] **Step 3: Nav + breadcrumb + módulo** — `AppLayout.tsx`: item `{ href: "/aprendizagem/eficacia", label: "Avaliação de eficácia" }`; branch de breadcrumb; entrada `{ prefix: "/aprendizagem/eficacia", module: "employees" }`.
- [ ] **Step 4: Typecheck + build** — `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build` → sem erros.
- [ ] **Step 5: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/eficacia artifacts/web/src/App.tsx artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(aprendizagem): tela Avaliação de eficácia (kanban + modal + plano de ação) + rota e menu"
```

---

### Task 3: Frontend — tela Minha área (colaborador + gestor leve) + rota/menu

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/minha-area/index.tsx`
- Modify: `artifacts/web/src/App.tsx`, `artifacts/web/src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `useAuth().user.employeeId` (Task 1); `useGetEmployee(orgId, employeeId)` (detalhe: dados + competências), `useListOrganizationTrainings(orgId, { employeeId })` (meus treinos), e `useListOrganizationTrainings(orgId, { unitId, effectivenessStatus: "pending" })` (gestor leve por filial). `getGetEmployeeQueryKey`, `getListOrganizationTrainingsQueryKey`.

- [ ] **Step 1: Página** — `usePageTitle("Minha área")`. Resolver `const employeeId = useAuth().user?.employeeId`. Se nulo → estado vazio ("Sua conta não está vinculada a um colaborador."). Senão:
  - **Colaborador:** cabeçalho (dados do colaborador via `useGetEmployee`), **meus treinamentos** (`useListOrganizationTrainings(orgId, { employeeId })`, com status/validade), **minhas competências** (do detalhe do colaborador), e **avaliações de eficácia pendentes** (dos meus treinos com `effectivenessStatus="pending"`).
  - **Gestor (toggle leve):** se o colaborador tem `unitId`, mostrar pendências da filial: `useListOrganizationTrainings(orgId, { unitId: employee.unitId, effectivenessStatus: "pending" })` — lista resumida.
  - Reusar os badges/cards/patterns das telas existentes do módulo.

- [ ] **Step 2: Rota** — `App.tsx`: import + rotas `/aprendizagem/minha-area` e `/app/aprendizagem/minha-area`.
- [ ] **Step 3: Nav + breadcrumb + módulo** — `AppLayout.tsx`: item `{ href: "/aprendizagem/minha-area", label: "Minha área" }`; breadcrumb; `{ prefix: "/aprendizagem/minha-area", module: "employees" }`.
- [ ] **Step 4: Typecheck + build** → sem erros.
- [ ] **Step 5: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/minha-area artifacts/web/src/App.tsx artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(aprendizagem): tela Minha área (colaborador + gestor leve) + rota e menu"
```

---

### Task 4: Verificação final do SP5

- [ ] **Step 1: Typecheck completo** — `pnpm typecheck` → verde.
- [ ] **Step 2: Build web** — `pnpm --filter @workspace/web build` → ok.
- [ ] **Step 3: Testes** — `TEST_ENV=integration pnpm exec vitest run --project integration` para: auth-me-employee **+ regressão** (todos os testes SP1–SP4 + employees) → verdes.
- [ ] **Step 4: Conferir DoD (spec §9).** Registrar o que fica para o smoke pré-PR.

---

## Self-review

- **Cobertura do spec:** §3 backend employeeId (Task 1) ✓; §4 tela eficácia + kanban + modal + ação reutilizada (Task 2) ✓; §5 Minha área colaborador+gestor leve (Task 3) ✓; §6 bridge (Global Constraints) ✓; §7 testes (Tasks 1,4) ✓. Itens adiados (§10) — nenhuma task os implementa (correto).
- **Placeholders:** Task 1 com código verbatim; telas usam mirror de arquivos concretos + props verbatim de `treinamento-detalhe.tsx`; a decisão "colapsar em 2 colunas se não houver estado parcial" é explícita, não um TBD.
- **Consistência de nomes:** `user.employeeId` (Task 1) consumido na Task 3; `useListOrganizationTrainings`/`useCreateTrainingEffectivenessReview` (existentes) consumidos nas Tasks 2/3; `CriarAcaoButton source={{ sourceModule:"training", sourceRef:{ trainingId } }}` e `AcoesVinculadas refId={trainingId}` consistentes com o uso real.
