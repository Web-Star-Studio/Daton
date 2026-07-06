# Aprendizagem — SP2 (Obrigatoriedades — motor de auto-vínculo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelar obrigatoriedades (regra cargo × item do catálogo) e um motor que gera os treinamentos pendentes do colaborador na admissão e na mudança de cargo, aproveitando os concluídos válidos, com tela de gestão e preview no cadastro.

**Architecture:** Nova tabela `training_requirements` + colunas `employee_trainings.dueDate`/`requirementId`. Serviço `applyTrainingRequirements` (resolve cargo→positionId, aplica regras por escopo, aproveita/dedup, gera pendentes via snapshot do catálogo) chamado no POST employees (na tx) e no PATCH employees (mudança de cargo). CRUD + preview no `openapi.yaml` → Orval. Telas reusam os padrões do SP1.

**Tech Stack:** Drizzle/Postgres, Express 5 + zod, OpenAPI + Orval (codegen via python3), React 19 + Wouter + TanStack Query, Vitest (integration + web-unit).

## Global Constraints

- **Bridge, sem migração:** tabela nova; colunas nullable; sem backfill de colaboradores existentes.
- **Permissão:** routers novos sob módulo **`employees`** (`requireModuleAccessForPaths`).
- **Codegen sem ruby:** usar o caminho python3 (ver SP1). Nunca editar gerados.
- **FK p/ evitar ciclo:** `employee_trainings.requirementId` é integer simples no schema; FK real via DDL (`ON DELETE SET NULL`). `training_requirements.positionId`/`catalogItemId` podem ser `.references()` diretas (sem ciclo).
- **DB nunca em PROD:** `drizzle push`/testes contra o DB de integração docker (`:55432`, já no ar via `pnpm test:integration:up` + `pnpm test:integration:db:push`). Aplicar DDL da FK no DB de teste.
- **Commits:** 1 por task (autorizado). Push de backup ao fim (sem PR).
- Prettier 2 espaços, aspas duplas, trailing commas; identificadores em inglês, UI em PT-BR.

**Pré-flight:** `pnpm typecheck` verde; DB de integração no ar com schema do SP1 aplicado.

---

## File Structure

- **DB:** modificar `lib/db/src/schema/learning-catalog.ts` (+ `trainingRequirementsTable`), `lib/db/src/schema/employees.ts` (+ 2 colunas em `employeeTrainingsTable`).
- **Contrato:** `lib/api-spec/openapi.yaml` (paths/schemas training-requirements + preview; dueDate/requirementId em training; autoLinkedTrainings em Employee) + gerados.
- **Backend:** `artifacts/api-server/src/routes/training-requirements.ts` (CRUD + preview), `artifacts/api-server/src/services/aprendizagem/requirements-engine.ts` (motor), `routes/index.ts` (mount), `routes/employees.ts` (ganchos), testes em `tests/routes/` e `tests/services/`.
- **Frontend:** `pages/app/aprendizagem/obrigatoriedades/index.tsx` (tela), `App.tsx` + `AppLayout.tsx` (rota/menu), `pages/app/aprendizagem/colaboradores/index.tsx` (preview no stepper + toast).

---

### Task 1: Schema — training_requirements + colunas em employee_trainings

**Files:**
- Modify: `lib/db/src/schema/learning-catalog.ts`, `lib/db/src/schema/employees.ts`

**Interfaces:**
- Produces: `trainingRequirementsTable`, tipo `TrainingRequirement`; colunas `employeeTrainingsTable.dueDate`, `employeeTrainingsTable.requirementId`.

- [ ] **Step 1: Adicionar `trainingRequirementsTable` em `learning-catalog.ts`**

Adicionar imports necessários (`positionsTable` de `./departments`) e a tabela. `filialUnitIds` como jsonb com default `[]`:
```ts
import { positionsTable } from "./departments";
// ... (trainingCatalogTable, competencyCatalogTable já existentes acima) ...

export const trainingRequirementsTable = pgTable("training_requirements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  positionId: integer("position_id")
    .notNull()
    .references(() => positionsTable.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .references(() => trainingCatalogTable.id, { onDelete: "cascade" }),
  deadlineType: text("deadline_type").notNull().default("rh"),
  deadlineDays: integer("deadline_days"),
  scope: text("scope").notNull().default("geral"),
  filialUnitIds: jsonb("filial_unit_ids")
    .notNull()
    .default(sql`'[]'::jsonb`)
    .$type<number[]>(),
  recurrence: text("recurrence").notNull().default("nao_repete"),
  isCritical: boolean("is_critical").notNull().default(false),
  norm: text("norm"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type TrainingRequirement = typeof trainingRequirementsTable.$inferSelect;
```
(Adicionar `jsonb` ao import de `drizzle-orm/pg-core` no topo do arquivo se ainda não estiver.)

- [ ] **Step 2: Colunas em `employeeTrainingsTable`**

Em `lib/db/src/schema/employees.ts`, junto às colunas adicionadas no SP1 (após `catalogItemId`):
```ts
  dueDate: date("due_date"),
  requirementId: integer("requirement_id"),
```
(`date` já está importado; `integer` também. `requirementId` plain integer — FK por DDL no Step 4.)

- [ ] **Step 3: Typecheck libs**

Run: `pnpm typecheck:libs`
Expected: sem erros.

- [ ] **Step 4: Aplicar no DB de teste + FK por DDL**

```bash
pnpm test:integration:db:push
docker exec feat-gestao-aprendizagem-postgres-1 psql -U postgres -d daton_integration -c "ALTER TABLE employee_trainings ADD CONSTRAINT employee_trainings_requirement_fk FOREIGN KEY (requirement_id) REFERENCES training_requirements(id) ON DELETE SET NULL;"
```
Expected: push aplica `training_requirements` + as 2 colunas; DDL cria a FK. (Confirmar com `\d training_requirements` se necessário.)

- [ ] **Step 5: Commit**
```bash
git add lib/db/src/schema/learning-catalog.ts lib/db/src/schema/employees.ts
git commit -m "feat(aprendizagem): schema training_requirements + employee_trainings.due_date/requirement_id"
```

---

### Task 2: OpenAPI training-requirements + dueDate/requirementId/autoLinked + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml` + gerados.

**Interfaces:**
- Produces: hooks `useListTrainingRequirements`, `useCreateTrainingRequirement`, `useUpdateTrainingRequirement`, `useDeleteTrainingRequirement`, `usePreviewTrainingRequirements`; schemas `TrainingRequirement`, `Create/UpdateTrainingRequirementBody`, `TrainingRequirementPreview`. `EmployeeTraining` ganha `dueDate?`/`requirementId?`; `Employee` ganha `autoLinkedTrainings?`.

- [ ] **Step 1: Tag + schemas + paths**

Adicionar tag `training-requirements`. Schemas:
- `TrainingRequirement` (`id, organizationId, positionId, catalogItemId, deadlineType, deadlineDays?, scope, filialUnitIds (array integer), recurrence, isCritical, norm?, notes?, createdAt, updatedAt`; required: id, organizationId, positionId, catalogItemId, deadlineType, scope, recurrence, isCritical, createdAt, updatedAt).
- `CreateTrainingRequirementBody` (positionId, catalogItemId, deadlineType, deadlineDays?, scope?, filialUnitIds?, recurrence?, isCritical?, norm?, notes?; required: positionId, catalogItemId, deadlineType).
- `UpdateTrainingRequirementBody` (todos opcionais).
- `TrainingRequirementPreview` (`{ requirements: TrainingRequirement[] }`).

Paths (operationIds explícitos; mirror dos paths de training-catalog do SP1):
- `GET /organizations/{orgId}/training-requirements` — `listTrainingRequirements`; query `positionId?, deadlineType?, scope?`; resposta `{ data: TrainingRequirement[] }`.
- `POST /organizations/{orgId}/training-requirements` — `createTrainingRequirement` → 201 `TrainingRequirement`.
- `PATCH /organizations/{orgId}/training-requirements/{id}` — `updateTrainingRequirement` → 200.
- `DELETE /organizations/{orgId}/training-requirements/{id}` — `deleteTrainingRequirement` → 204.
- `GET /organizations/{orgId}/training-requirements/preview` — `previewTrainingRequirements`; query `position` (string, nome do cargo), `unitId?` (integer); resposta `TrainingRequirementPreview`.

- [ ] **Step 2: Estender schemas existentes**

- `EmployeeTraining`: adicionar `dueDate` (string, nullable) e `requirementId` (integer, nullable) às properties.
- `Employee`: adicionar `autoLinkedTrainings` (object, opcional) com `{ generated: integer, reused: integer }`.

- [ ] **Step 3: Codegen (python3)**
```bash
cd lib/api-spec
python3 -c 'import yaml; yaml.safe_load(open("openapi.yaml"))'
python3 -c 'import yaml,json; json.dump(yaml.safe_load(open("openapi.yaml")), open(".openapi.codegen.json","w"), indent=2)'
pnpm exec orval --config ./orval.config.ts
python3 -c 'p="../api-zod/src/index.ts"; ls=[l for l in open(p) if "./generated/types" not in l]; open(p,"w").write("".join(ls))'
rm -f .openapi.codegen.json
cd ../..
```
- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck:libs && pnpm --filter @workspace/web typecheck`
Expected: sem erros. Hooks `useListTrainingRequirements` etc. existem.

- [ ] **Step 5: Commit**
```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(aprendizagem): contrato OpenAPI training-requirements + dueDate/requirementId/autoLinked + codegen"
```

---

### Task 3: Backend CRUD training-requirements + preview + mount + testes

**Files:**
- Create: `artifacts/api-server/src/routes/training-requirements.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/tests/routes/training-requirements.integration.test.ts`

**Interfaces:**
- Consumes: `trainingRequirementsTable`, `positionsTable`, `trainingCatalogTable`; zod gerado.
- Produces: rotas `/organizations/:orgId/training-requirements` (+ `/preview`).

- [ ] **Step 1: Teste de integração (falha primeiro)**

Mirror do teste de `training-catalog` (supertest + `createTestContext`/`authHeader`/`cleanupTestContext`; `createPosition` p/ ter um cargo; criar um item de catálogo via API). Cobrir: CRUD (create/list/update/delete) e **preview** — criar regra geral p/ um cargo, depois `GET .../training-requirements/preview?position=<nome do cargo>` retorna a regra. Arquivo `training-requirements.integration.test.ts`.

- [ ] **Step 2: Rodar — deve falhar (404).**
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/training-requirements.integration.test.ts` → FAIL.

- [ ] **Step 3: Implementar o router**

Criar `routes/training-requirements.ts` espelhando `routes/training-catalog.ts` (SP1) — mesmo estilo de handlers (zod params/body gerados, `requireWriteAccess()`, escopo por org, `serialize` com datas iso e `filialUnitIds` como array). Handlers: list (filtros positionId/deadlineType/scope), create, update, delete. **Preview** (`GET .../preview`): resolver `position` (nome) → `positionId` via `positionsTable` (nome+org); se não achar, `{ requirements: [] }`; senão carregar regras do `positionId` filtrando escopo (geral, ou filial cujo `filialUnitIds` contenha o `unitId` da query) e retornar `{ requirements }`.

- [ ] **Step 4: Montar sob módulo employees** (mirror dos mounts do SP1, em `routes/index.ts`):
```ts
import trainingRequirementsRouter from "./training-requirements";
// ...
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/training-requirements(?:\/|$)/,
  ]),
  trainingRequirementsRouter,
);
```

- [ ] **Step 5: Rodar — deve passar.** Vitest do Step 1 → PASS.
- [ ] **Step 6: Typecheck + commit**
```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/routes/training-requirements.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/tests/routes/training-requirements.integration.test.ts
git commit -m "feat(aprendizagem): rota CRUD + preview de training-requirements + testes"
```

---

### Task 4: Motor `applyTrainingRequirements` (serviço) + testes

**Files:**
- Create: `artifacts/api-server/src/services/aprendizagem/requirements-engine.ts`
- Create: `artifacts/api-server/tests/services/requirements-engine.integration.test.ts`

**Interfaces:**
- Consumes: `employeesTable`, `positionsTable`, `trainingRequirementsTable`, `trainingCatalogTable`, `employeeTrainingsTable`.
- Produces: `applyTrainingRequirements(args: { orgId: number; employeeId: number; database: typeof db | tx }) => Promise<{ generated: number; reused: number }>`.

- [ ] **Step 1: Teste de integração (falha primeiro)**

Criar `tests/services/requirements-engine.integration.test.ts`. Importar `db` + tabelas e a função `applyTrainingRequirements`. Casos:
1. **Gera + dueDate fixo:** criar cargo (`createPosition`), item de catálogo (insert direto em `trainingCatalogTable`), regra `deadlineType='fixo', deadlineDays=30, scope='geral'`; criar colaborador (`createEmployee` com `position` = nome do cargo, `admissionDate='2026-01-10'`); chamar `applyTrainingRequirements({ orgId, employeeId, database: db })`; esperar `generated===1`, e um `employee_training` pendente com `catalogItemId`/`requirementId` setados e `dueDate==='2026-02-09'` (10/01 + 30 dias).
2. **Aproveitamento:** com a mesma regra, inserir antes um `employee_training` concluído válido daquele `catalogItemId` (`status='concluido'`, `expirationDate` futura); chamar; esperar `reused===1, generated===0` e nenhum novo pendente.
3. **Idempotência:** chamar 2x; o 2º não duplica (`generated===0` na 2ª).
4. **Escopo filial:** regra `scope='filial', filialUnitIds=[U]`; colaborador na unidade U → gera; colaborador em outra unidade → não gera.

- [ ] **Step 2: Rodar — deve falhar (módulo inexistente).**
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/requirements-engine.integration.test.ts` → FAIL (import não resolve).

- [ ] **Step 3: Implementar o motor**

```ts
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db as defaultDb,
  employeesTable,
  positionsTable,
  trainingRequirementsTable,
  trainingCatalogTable,
  employeeTrainingsTable,
} from "@workspace/db";

type Database = typeof defaultDb;

function addDaysIso(isoDate: string, days: number): string | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function applyTrainingRequirements(args: {
  orgId: number;
  employeeId: number;
  database: Database;
}): Promise<{ generated: number; reused: number }> {
  const { orgId, employeeId, database } = args;
  const [emp] = await database
    .select()
    .from(employeesTable)
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.organizationId, orgId)));
  if (!emp || !emp.position) return { generated: 0, reused: 0 };

  const [position] = await database
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.organizationId, orgId), eq(positionsTable.name, emp.position)));
  if (!position) return { generated: 0, reused: 0 };

  const rules = await database
    .select()
    .from(trainingRequirementsTable)
    .where(and(
      eq(trainingRequirementsTable.organizationId, orgId),
      eq(trainingRequirementsTable.positionId, position.id),
    ));

  // treinos atuais do colaborador (p/ aproveitamento e dedup)
  const existing = await database
    .select()
    .from(employeeTrainingsTable)
    .where(eq(employeeTrainingsTable.employeeId, employeeId));
  const today = new Date().toISOString().slice(0, 10);
  const isValidCompleted = (t: typeof existing[number]) =>
    t.status === "concluido" && (!t.expirationDate || t.expirationDate >= today);
  const completedCatalogIds = new Set(
    existing.filter(isValidCompleted).map((t) => t.catalogItemId).filter(Boolean) as number[],
  );
  const pendingByRequirement = new Set(existing.filter((t) => t.status === "pendente").map((t) => t.requirementId).filter(Boolean) as number[]);
  const pendingCatalogIds = new Set(existing.filter((t) => t.status === "pendente").map((t) => t.catalogItemId).filter(Boolean) as number[]);

  let generated = 0;
  let reused = 0;

  for (const rule of rules) {
    // escopo
    if (rule.scope === "filial") {
      const units = (rule.filialUnitIds as number[]) ?? [];
      if (!emp.unitId || !units.includes(emp.unitId)) continue;
    }
    // aproveitamento
    if (completedCatalogIds.has(rule.catalogItemId)) { reused += 1; continue; }
    // dedup
    if (pendingByRequirement.has(rule.id) || pendingCatalogIds.has(rule.catalogItemId)) continue;

    const [item] = await database
      .select()
      .from(trainingCatalogTable)
      .where(eq(trainingCatalogTable.id, rule.catalogItemId));
    if (!item) continue;

    const dueDate =
      rule.deadlineType === "fixo" && rule.deadlineDays && emp.admissionDate
        ? addDaysIso(emp.admissionDate, rule.deadlineDays)
        : null;

    await database.insert(employeeTrainingsTable).values({
      employeeId,
      title: item.title,
      description: item.programContent ?? null,
      objective: item.objective ?? null,
      institution: item.defaultInstructor ?? null,
      targetCompetencyName: item.targetCompetencyName ?? null,
      targetCompetencyType: item.targetCompetencyType ?? null,
      targetCompetencyLevel: item.targetCompetencyLevel ?? null,
      evaluationMethod: item.evaluationMethod ?? null,
      workloadHours: item.workloadHours ?? null,
      renewalMonths: item.validityMonths ?? null,
      status: "pendente",
      catalogItemId: item.id,
      requirementId: rule.id,
      dueDate,
    });
    pendingByRequirement.add(rule.id);
    pendingCatalogIds.add(rule.catalogItemId);
    generated += 1;
  }

  return { generated, reused };
}
```

- [ ] **Step 4: Rodar — deve passar.** Vitest do Step 1 → PASS.
- [ ] **Step 5: Typecheck + commit**
```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/services/aprendizagem/requirements-engine.ts artifacts/api-server/tests/services/requirements-engine.integration.test.ts
git commit -m "feat(aprendizagem): motor applyTrainingRequirements (aproveitamento + dedup + dueDate) + testes"
```

---

### Task 5: Ganchos no criar/editar colaborador + autoLinkedTrainings

**Files:**
- Modify: `artifacts/api-server/src/routes/employees.ts` (POST ~1342–1367, PATCH ~2259–2284)
- Create/append: teste em `artifacts/api-server/tests/routes/employees-auto-link.integration.test.ts`

**Interfaces:**
- Consumes: `applyTrainingRequirements` (Task 4).
- Produces: resposta de criar/editar colaborador com `autoLinkedTrainings: { generated, reused }`.

- [ ] **Step 1: Teste (falha primeiro)**

Criar `employees-auto-link.integration.test.ts`: criar cargo + item de catálogo + regra `fixo` para o cargo; **POST** colaborador (via API) com `position` = nome do cargo → resposta tem `autoLinkedTrainings.generated >= 1`, e `GET .../employees/:id/trainings` mostra o pendente com `dueDate`. Segundo caso: **PATCH** mudando o `position` de um colaborador para um cargo com regras → resposta `autoLinkedTrainings.generated >= 1`.

- [ ] **Step 2: Rodar — deve falhar** (campo ausente). → FAIL.

- [ ] **Step 3: Gancho no POST (dentro da tx)**

Importar `applyTrainingRequirements`. Alterar o bloco da transação (atual: retorna `createdEmployee`) para também aplicar o motor e devolver o resumo:
```ts
    const { emp, autoLinked } = await db.transaction(async (tx) => {
      const [createdEmployee] = await tx
        .insert(employeesTable)
        .values({ ...employeePayload, organizationId: params.data.orgId })
        .returning();

      await createEmployeeProfileItems(tx, createdEmployee.id, professionalExperiences, "professional_experience");
      await createEmployeeProfileItems(tx, createdEmployee.id, educationCertifications, "education_certification");

      const autoLinked = await applyTrainingRequirements({
        orgId: params.data.orgId,
        employeeId: createdEmployee.id,
        database: tx,
      });
      return { emp: createdEmployee, autoLinked };
    });

    res.status(201).json({ ...formatEmployee(emp), autoLinkedTrainings: autoLinked });
```

- [ ] **Step 4: Gancho no PATCH (mudança de cargo)**

Antes do `.update` (~2269), buscar o cargo atual; após o update, se mudou, aplicar o motor:
```ts
    const [before] = await db
      .select({ position: employeesTable.position })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)));

    const [emp] = await db
      .update(employeesTable)
      .set(payload)
      .where(and(eq(employeesTable.id, params.data.empId), eq(employeesTable.organizationId, params.data.orgId)))
      .returning();
    if (!emp) { res.status(404).json({ error: "Colaborador não encontrado" }); return; }

    let autoLinked = { generated: 0, reused: 0 };
    if (payload.position !== undefined && before && payload.position !== before.position) {
      autoLinked = await applyTrainingRequirements({
        orgId: params.data.orgId,
        employeeId: params.data.empId,
        database: db,
      });
    }
    res.json({ ...formatEmployee(emp), autoLinkedTrainings: autoLinked });
```
(Confirmar que `payload` é o objeto validado do `UpdateEmployeeBody` e que `position` existe nele.)

- [ ] **Step 5: Rodar — deve passar.** Vitest do Step 1 → PASS.
- [ ] **Step 6: Regressão + typecheck + commit**
```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/employees.integration.test.ts
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/routes/employees.ts artifacts/api-server/tests/routes/employees-auto-link.integration.test.ts
git commit -m "feat(aprendizagem): auto-vínculo de obrigatoriedades na admissão e na mudança de cargo"
```

---

### Task 6: Frontend — tela Cronograma de obrigatoriedades + rota + menu

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/obrigatoriedades/index.tsx`
- Modify: `artifacts/web/src/App.tsx`, `artifacts/web/src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: hooks `useListTrainingRequirements`, `useCreateTrainingRequirement`, `useUpdateTrainingRequirement`, `useDeleteTrainingRequirement` (Task 2); `useListPositions`, `useListTrainingCatalog`, `useListUnits` (existentes).

- [ ] **Step 1: Página** — mirror estrutural de `pages/app/aprendizagem/catalogo/index.tsx` (SP1): `usePageTitle("Cronograma de obrigatoriedades")`, `HeaderActionButton` "Nova obrigatoriedade", filtros (cargo/tipo de prazo/escopo) e tabela de regras (cargo, treinamento, norma, prazo/origem, escopo, recorrência, crítico). Modal de criar/editar: selects de **cargo** (de `useListPositions`), **treinamento** (de `useListTrainingCatalog`), `deadlineType` (fixo/programa/rh) com `deadlineDays` condicional, `scope` (geral/filial) com multiseleção de unidades (`useListUnits`) condicional, `recurrence`, `isCritical` (checkbox), `norm`, `notes`. Excluir com confirmação. Hooks gerados + invalidação por `getListTrainingRequirementsQueryKey`.

- [ ] **Step 2: Rota** — em `App.tsx`: `import AprendizagemObrigatoriedadesPage from "@/pages/app/aprendizagem/obrigatoriedades";` + rotas `/aprendizagem/obrigatoriedades` e `/app/aprendizagem/obrigatoriedades` (mirror do catálogo).

- [ ] **Step 3: Nav + breadcrumb + módulo** — em `AppLayout.tsx`: item `{ href: "/aprendizagem/obrigatoriedades", label: "Obrigatoriedades" }` em `aprendizagemLinks`; branch de breadcrumb; entrada `{ prefix: "/aprendizagem/obrigatoriedades", module: "employees" }` no `moduleByPath`.

- [ ] **Step 4: Typecheck + build**
Run: `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build` → sem erros.
- [ ] **Step 5: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/obrigatoriedades artifacts/web/src/App.tsx artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(aprendizagem): tela Cronograma de obrigatoriedades + rota e menu"
```

---

### Task 7: Frontend — preview no stepper de cadastro + toast

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/index.tsx`

**Interfaces:**
- Consumes: `usePreviewTrainingRequirements` (Task 2); resposta `autoLinkedTrainings` do create/update.

- [ ] **Step 1: Preview no passo Profissional** — após o select de cargo (~1119), quando há `position` (+ `unitId`), chamar `usePreviewTrainingRequirements(orgId, { position, unitId }, { query: { enabled } })` e renderizar um bloco read-only "Treinamentos obrigatórios que serão vinculados" listando `preview.requirements` (título do treinamento via catálogo já no payload da regra ou um lookup; mostrar prazo/origem e crítico).

- [ ] **Step 2: Toast pós-cadastro** — no `onSuccess`/após `createMutation.mutateAsync`, ler `result.autoLinkedTrainings` e exibir toast "N treinamento(s) vinculado(s) · M aproveitado(s)" (usar o sistema de toast já usado na página).

- [ ] **Step 3: Typecheck + build** → sem erros.
- [ ] **Step 4: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/colaboradores/index.tsx
git commit -m "feat(aprendizagem): preview de obrigatoriedades no cadastro + toast de auto-vínculo"
```

---

### Task 8: Verificação final do SP2

- [ ] **Step 1: Typecheck completo** — `pnpm typecheck` → verde.
- [ ] **Step 2: Build web** — `pnpm --filter @workspace/web build` → ok.
- [ ] **Step 3: Testes** — `TEST_ENV=integration pnpm exec vitest run --project integration` para: requirements-engine, training-requirements, employees-auto-link, **e regressão** employees/training-catalog/competency-catalog/training-snapshot → todos verdes.
- [ ] **Step 4: Conferir DoD (spec §11).** Registrar o que fica para o smoke pré-PR.

---

## Self-review

- **Cobertura do spec:** §3 schema (Task 1) ✓; §4 motor (Task 4) ✓; §5 ganchos (Task 5) ✓; §6 contrato+preview (Tasks 2,3) ✓; §7 frontend cronograma (Task 6) + preview/toast (Task 7) ✓; §8 bridge (Global Constraints) ✓; §9 testes (Tasks 3,4,5,8) ✓. Itens adiados (§12) — nenhuma task os implementa (correto).
- **Placeholders:** motor e ganchos têm código verbatim; CRUD/tela usam mirror de arquivos concretos do SP1 (`training-catalog.ts`, `catalogo/index.tsx`) com substituições explícitas; sem "TBD".
- **Consistência de nomes:** `trainingRequirementsTable`/`TrainingRequirement` (Task 1) usados em 3/4; `applyTrainingRequirements({orgId, employeeId, database})` definido na Task 4 e chamado na Task 5; hooks `useListTrainingRequirements`/`usePreviewTrainingRequirements` (Task 2) consumidos em 6/7; `autoLinkedTrainings` definido (Task 2) e produzido (Task 5) e consumido (Task 7).
- **Riscos sinalizados:** gancho na tx (motor não lança em ausência de cargo/regra — retorna zero); FK requirementId por DDL; idempotência coberta por teste.
