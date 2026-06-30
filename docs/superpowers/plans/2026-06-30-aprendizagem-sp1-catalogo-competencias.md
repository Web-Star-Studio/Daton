# Aprendizagem — SP1 (Catálogo de treinamentos + banco de competências) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir o catálogo de treinamentos e o banco de competências (dados de referência org-level) com UI de gestão, integrados de forma aditiva (bridge) ao que já existe.

**Architecture:** Duas tabelas novas (`training_catalog`, `competency_catalog`) + coluna `employee_trainings.catalog_item_id`. Contrato no `openapi.yaml` → Orval gera zod + hooks. Backend: dois routers novos montados sob o módulo `employees` (mesma permissão do SP0). Competency catalog reusa a mecânica do catálogo SWOT (idempotente, rename propaga, delete só do catálogo). Frontend: tela Catálogo nova + seletor de catálogo no form de treino + painel de competências na área Matriz. Snapshot-na-criação: ao lançar treino de um item do catálogo, copia os campos template e grava `catalog_item_id`.

**Tech Stack:** Drizzle ORM (Postgres), Express 5 + zod, OpenAPI 3.1 + Orval, React 19 + Wouter + TanStack Query, Vitest (integration + web-unit).

## Global Constraints

- **Bridge, sem migração:** `catalog_item_id` nullable; registros e competências texto-livre existentes ficam intactos.
- **Permissão:** routers novos sob o módulo **`employees`** (`requireModuleAccessForPaths("employees", [...])`). Sem novo módulo de permissão.
- **Codegen sem `ruby`** (ausente; só `python3`): NÃO rodar `pnpm --filter @workspace/api-spec codegen` direto. Usar o caminho python3 (Task 2, Step de codegen). Nunca editar arquivos gerados à mão.
- **FK p/ evitar ciclo:** `catalog_item_id` é `integer` simples no schema Drizzle (sem `.references()`); a FK real entra por **DDL** — mesmo padrão de `users.employee_id` neste repo.
- **DB nunca em PROD:** `drizzle push` e testes de integração rodam contra **DB docker de teste** (`pnpm test:integration:up`), nunca a :3001/Neon. Aplicar schema novo no DB de teste antes dos testes de integração.
- **Vocabulário C-H-A:** `competency_catalog.competencyType ∈ {conhecimento, habilidade, atitude}`. Aditivo; texto-livre antigo coexiste.
- **Commits:** 1 commit por task (autorizado). Sem push/PR salvo pedido (a branch já tem push de backup).
- Prettier: 2 espaços, aspas duplas, trailing commas. Identificadores em inglês; UI em PT-BR.

**Pré-flight:** `pnpm typecheck` verde na base (já confirmado no SP1 anterior). DB docker de teste disponível (`pnpm test:integration:up`).

---

## File Structure

**DB (`lib/db/src/`):**
- Create: `schema/learning-catalog.ts` — `trainingCatalogTable`, `competencyCatalogTable` + type exports.
- Modify: `schema/index.ts` — `export * from "./learning-catalog";`.
- Modify: `schema/employees.ts` — adicionar coluna `catalogItemId` em `employeeTrainingsTable`.

**Contrato (`lib/api-spec/`):**
- Modify: `openapi.yaml` — paths + schemas para `training-catalog` e `competency-catalog` (tags novas).
- Generated (NÃO editar): `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`.

**Backend (`artifacts/api-server/src/`):**
- Create: `routes/training-catalog.ts` — CRUD do catálogo de treinos.
- Create: `routes/competency-catalog.ts` — CRUD do banco de competências (padrão SWOT).
- Modify: `routes/index.ts` — montar os 2 routers sob módulo `employees`.
- Modify: `routes/employees.ts` — snapshot na criação de training quando vem `catalogItemId`.
- Create (tests): `tests/routes/training-catalog.integration.test.ts`, `tests/routes/competency-catalog.integration.test.ts`.

**Frontend (`artifacts/web/src/`):**
- Create: `pages/app/aprendizagem/catalogo/index.tsx` — tela Catálogo.
- Modify: `App.tsx` — rotas `/aprendizagem/catalogo` (+ `/app/...`).
- Modify: `components/layout/AppLayout.tsx` — item "Catálogo" em `aprendizagemLinks` + breadcrumb.
- Modify: `pages/app/aprendizagem/colaboradores/treinamentos.tsx` — seletor de catálogo no TrainingAdminForm + painel de competências na Matriz + inline-create.

---

### Task 1: Schema das tabelas de catálogo + coluna de link

**Files:**
- Create: `lib/db/src/schema/learning-catalog.ts`
- Modify: `lib/db/src/schema/index.ts`
- Modify: `lib/db/src/schema/employees.ts` (tabela `employeeTrainingsTable`)

**Interfaces:**
- Produces: `trainingCatalogTable`, `competencyCatalogTable`, tipos `TrainingCatalogItem`, `CompetencyCatalogItem`; coluna `employeeTrainingsTable.catalogItemId` (integer, nullable).

- [ ] **Step 1: Criar `learning-catalog.ts`**

Espelhar o estilo de `lib/db/src/schema/swot.ts` (imports `pgTable, serial, integer, text, boolean, timestamp, uniqueIndex, sql`; FK org com `onDelete: "cascade"`). Conteúdo:
```ts
import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable } from "./organizations";

export const trainingCatalogTable = pgTable("training_catalog", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category"),
  modality: text("modality"),
  norm: text("norm"),
  clause: text("clause"),
  workloadHours: integer("workload_hours"),
  validityMonths: integer("validity_months"),
  isMandatory: boolean("is_mandatory").notNull().default(false),
  status: text("status").notNull().default("ativo"),
  targetCompetencyName: text("target_competency_name"),
  targetCompetencyType: text("target_competency_type"),
  targetCompetencyLevel: integer("target_competency_level"),
  defaultInstructor: text("default_instructor"),
  objective: text("objective"),
  programContent: text("program_content"),
  evaluationMethod: text("evaluation_method"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const competencyCatalogTable = pgTable(
  "competency_catalog",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    competencyType: text("competency_type"),
    category: text("category"),
    norm: text("norm"),
    isMandatory: boolean("is_mandatory").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("competency_catalog_org_lower_name_unique").on(
      table.organizationId,
      sql`lower(${table.name})`,
    ),
  ],
);

export type TrainingCatalogItem = typeof trainingCatalogTable.$inferSelect;
export type CompetencyCatalogItem = typeof competencyCatalogTable.$inferSelect;
```

- [ ] **Step 2: Re-exportar no índice**

Em `lib/db/src/schema/index.ts`, adicionar (depois de `export * from "./employees";`):
```ts
export * from "./learning-catalog";
```

- [ ] **Step 3: Adicionar `catalogItemId` em `employeeTrainingsTable`**

Em `lib/db/src/schema/employees.ts`, na definição de `employeeTrainingsTable`, adicionar a coluna (logo após `legacyV1Id`, antes de `createdAt`). Plain integer, **sem `.references()`** (FK real por DDL no Step 5):
```ts
  catalogItemId: integer("catalog_item_id"),
```
(Confirmar que `integer` já está importado em employees.ts — está, pois `employeeId` usa integer.)

- [ ] **Step 4: Typecheck do lib/db**

Run: `pnpm --filter @workspace/db typecheck` (ou `pnpm typecheck:libs`)
Expected: sem erros.

- [ ] **Step 5: Aplicar schema no DB de teste + FK por DDL**

Subir o DB de teste e aplicar o schema (NUNCA prod):
```bash
pnpm test:integration:up
# aplica as tabelas novas + coluna no DB de teste (DATABASE_URL do compose de teste)
pnpm --filter @workspace/db push
```
Aplicar a FK real de `catalog_item_id` por DDL cirúrgico no DB de teste (psql do compose de teste):
```sql
ALTER TABLE employee_trainings
  ADD CONSTRAINT employee_trainings_catalog_item_fk
  FOREIGN KEY (catalog_item_id) REFERENCES training_catalog(id) ON DELETE SET NULL;
```
Expected: `push` aplica `training_catalog`, `competency_catalog` e `employee_trainings.catalog_item_id`; DDL cria a FK. (Em produção, a mesma DDL aditiva entra no deploy — fora do escopo deste plano.)

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/learning-catalog.ts lib/db/src/schema/index.ts lib/db/src/schema/employees.ts
git commit -m "feat(aprendizagem): schema training_catalog + competency_catalog + employee_trainings.catalog_item_id"
```

---

### Task 2: OpenAPI training-catalog + codegen (python3)

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Generated: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`

**Interfaces:**
- Produces: hooks `useListTrainingCatalog`, `useCreateTrainingCatalogItem`, `useGetTrainingCatalogItem`, `useUpdateTrainingCatalogItem`, `useDeleteTrainingCatalogItem`; schemas `TrainingCatalogItem`, `CreateTrainingCatalogItemBody`, `UpdateTrainingCatalogItemBody`, `PaginatedTrainingCatalog`.

- [ ] **Step 1: Adicionar a tag e os schemas**

No `openapi.yaml`, adicionar à lista `tags:` (mirror das tags existentes como `trainings`):
```yaml
  - name: training-catalog
    description: Catálogo de treinamentos (definições reutilizáveis) — ISO 10015
```
Em `components.schemas`, adicionar `TrainingCatalogItem` (espelhar a forma de `EmployeeTraining`/`OrganizationTraining` já existentes), com as propriedades: `id, organizationId, title, category, modality, norm, clause, workloadHours, validityMonths, isMandatory, status, targetCompetencyName, targetCompetencyType, targetCompetencyLevel, defaultInstructor, objective, programContent, evaluationMethod, createdAt, updatedAt` (tipos: integer/string/boolean conforme schema do banco; `required: [id, organizationId, title, isMandatory, status]`). Adicionar `CreateTrainingCatalogItemBody` (mesmos campos exceto id/org/timestamps; `required: [title]`), `UpdateTrainingCatalogItemBody` (todos opcionais), e `PaginatedTrainingCatalog` (espelhar `PaginatedOrganizationTrainings`: `data[] + pagination`).

- [ ] **Step 2: Adicionar os paths com operationId explícito**

Espelhar a forma dos paths de `trainings` no `openapi.yaml`. Endpoints (tag `training-catalog`):
- `GET /organizations/{orgId}/training-catalog` — operationId `listTrainingCatalog`; query params `search, norm, category, modality, status, page, pageSize`; resposta `PaginatedTrainingCatalog`.
- `POST /organizations/{orgId}/training-catalog` — operationId `createTrainingCatalogItem`; body `CreateTrainingCatalogItemBody`; 201 `TrainingCatalogItem`.
- `GET /organizations/{orgId}/training-catalog/{itemId}` — operationId `getTrainingCatalogItem`; 200 `TrainingCatalogItem`.
- `PATCH /organizations/{orgId}/training-catalog/{itemId}` — operationId `updateTrainingCatalogItem`; body `UpdateTrainingCatalogItemBody`; 200 `TrainingCatalogItem`.
- `DELETE /organizations/{orgId}/training-catalog/{itemId}` — operationId `deleteTrainingCatalogItem`; 204.

- [ ] **Step 3: Rodar o codegen via python3 (ruby ausente)**

```bash
cd lib/api-spec
python3 -c 'import yaml,json; json.dump(yaml.safe_load(open("openapi.yaml")), open(".openapi.codegen.json","w"), indent=2)'
pnpm exec orval --config ./orval.config.ts
python3 -c 'p="../api-zod/src/index.ts"; ls=[l for l in open(p) if "./generated/types" not in l]; open(p,"w").write("".join(ls))'
rm -f .openapi.codegen.json
cd ../..
```
(Se `python3 -c "import yaml"` falhar por falta de PyYAML: `pip install --user pyyaml` ou usar o venv do repo. Verificar antes.)
Expected: `lib/api-client-react/src/generated/api.ts` passa a exportar `useListTrainingCatalog`, `useCreateTrainingCatalogItem`, etc.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck:libs && pnpm --filter @workspace/web typecheck`
Expected: sem erros; os hooks/zod gerados tipam.

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated lib/api-zod/src/index.ts
git commit -m "feat(aprendizagem): contrato OpenAPI training-catalog + codegen"
```

---

### Task 3: Backend training-catalog CRUD + mount + testes

**Files:**
- Create: `artifacts/api-server/src/routes/training-catalog.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/tests/routes/training-catalog.integration.test.ts`

**Interfaces:**
- Consumes: `trainingCatalogTable` (Task 1); `requireAuth, requireWriteAccess, requireModuleAccessForPaths` (existentes); zod bodies gerados em `@workspace/api-zod` (Task 2).
- Produces: rotas REST sob `/organizations/:orgId/training-catalog`.

- [ ] **Step 1: Teste de integração (falha primeiro)**

Usar o padrão **supertest** real do repo (verbatim de `artifacts/api-server/tests/routes/employees.integration.test.ts`): `request(app)` + `authHeader(context)` + `createTestContext({ seed })` + cleanup em `afterEach`. Criar `artifacts/api-server/tests/routes/training-catalog.integration.test.ts`:
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

describe("training-catalog routes", () => {
  it("cria, lista, busca, edita e deleta um item do catálogo", async () => {
    const context = await createTestContext({ seed: "training-catalog" });
    contexts.push(context);
    const base = `/api/organizations/${context.organizationId}/training-catalog`;

    const created = await request(app).post(base).set(authHeader(context)).send({
      title: `Cat ${context.prefix}`,
      category: "Capacitação",
      isMandatory: true,
      validityMonths: 12,
    });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeDefined();

    const listed = await request(app).get(base).set(authHeader(context));
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((i: { id: number }) => i.id === created.body.id)).toBe(true);

    const patched = await request(app)
      .patch(`${base}/${created.body.id}`)
      .set(authHeader(context))
      .send({ status: "inativo" });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe("inativo");

    const removed = await request(app)
      .delete(`${base}/${created.body.id}`)
      .set(authHeader(context));
    expect(removed.status).toBe(204);
  });
});
```

- [ ] **Step 2: Rodar — deve falhar (rota inexistente)**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/training-catalog.integration.test.ts`
Expected: FAIL (404 / rota não montada).

- [ ] **Step 3: Implementar o router**

Criar `routes/training-catalog.ts` espelhando o estilo de um router CRUD existente (ex.: handlers de `routes/swot/index.ts` e `routes/employees.ts`: `requireWriteAccess()`, validação zod com `.safeParse`, escopo por `:orgId` + checagem `params.orgId === req.auth!.organizationId`, `eq(trainingCatalogTable.organizationId, orgId)`). Handlers: list (filtros search/norm/category/modality/status + paginação), create (201), get (200/404), update (200/404), delete (204/404). Usar `express.Router()` e exportar default. Incluir um `serializeCatalogItem(r)` que converte `createdAt/updatedAt` com `.toISOString()` (espelhar `serializePerspective` do swot), para casar com o `format: date-time` do contrato. As validações de body podem usar os zod gerados em `@workspace/api-zod` (ex.: `createTrainingCatalogItemBody`) ou zod local espelhando o body.

- [ ] **Step 4: Montar o router sob o módulo employees**

Em `routes/index.ts`: `import trainingCatalogRouter from "./training-catalog";` e montar espelhando o bloco do `employeesRouter`:
```ts
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/training-catalog(?:\/|$)/,
  ]),
  trainingCatalogRouter,
);
```

- [ ] **Step 5: Rodar o teste — deve passar**

Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/training-catalog.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/routes/training-catalog.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/tests/routes/training-catalog.integration.test.ts
git commit -m "feat(aprendizagem): rota CRUD training-catalog + testes"
```

---

### Task 4: OpenAPI competency-catalog + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`; Generated.

**Interfaces:**
- Produces: hooks `useListCompetencyCatalog`, `useCreateCompetencyCatalogItem`, `useUpdateCompetencyCatalogItem`, `useDeleteCompetencyCatalogItem`; schemas `CompetencyCatalogItem` (com `usageCount` opcional integer), `CreateCompetencyCatalogItemBody` (`required: [name]`), `UpdateCompetencyCatalogItemBody`.

- [ ] **Step 1: Tag + schemas + paths**

Adicionar tag `competency-catalog`. Schemas: `CompetencyCatalogItem` (`id, organizationId, name, competencyType, category, norm, isMandatory, usageCount?, createdAt, updatedAt`; `required: [id, organizationId, name, isMandatory]`), `CreateCompetencyCatalogItemBody` (`name` required + type/category/norm/isMandatory opcionais), `UpdateCompetencyCatalogItemBody`. Paths (operationIds explícitos):
- `GET /organizations/{orgId}/competency-catalog` — `listCompetencyCatalog` → `{ data: CompetencyCatalogItem[] }`.
- `POST /organizations/{orgId}/competency-catalog` — `createCompetencyCatalogItem` (idempotente: 200 existente | 201 novo).
- `PATCH /organizations/{orgId}/competency-catalog/{itemId}` — `updateCompetencyCatalogItem`.
- `DELETE /organizations/{orgId}/competency-catalog/{itemId}` — `deleteCompetencyCatalogItem` (204).

- [ ] **Step 2: Codegen (python3)** — mesmos comandos do Task 2 Step 3.

- [ ] **Step 3: Typecheck** — `pnpm typecheck:libs`. Expected: sem erros.

- [ ] **Step 4: Commit**
```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated lib/api-zod/src/index.ts
git commit -m "feat(aprendizagem): contrato OpenAPI competency-catalog + codegen"
```

---

### Task 5: Backend competency-catalog (padrão SWOT) + mount + testes

**Files:**
- Create: `artifacts/api-server/src/routes/competency-catalog.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/tests/routes/competency-catalog.integration.test.ts`

**Interfaces:**
- Consumes: `competencyCatalogTable`, `employeeCompetenciesTable`, `positionCompetencyRequirementsTable` (Task 1 + existentes).
- Produces: rotas `/organizations/:orgId/competency-catalog`.

- [ ] **Step 1: Teste de integração (falha primeiro)**

Cobrir: (a) POST idempotente (criar "Direção segura" 2x → mesmo id, 2º retorna 200); (b) rename propaga — criar competência no catálogo, criar um `employee_competency` e um `position_competency_requirement` com o mesmo nome (case-insensitive), PATCH renomeia, e os dois usos passam a refletir o novo nome; (c) DELETE remove do catálogo mas preserva o texto nos usos. Espelhar imports/helpers do teste de Task 3.

- [ ] **Step 2: Rodar — deve falhar.**
Run: `pnpm exec vitest run --project integration artifacts/api-server/tests/routes/competency-catalog.integration.test.ts` → FAIL.

- [ ] **Step 3: Implementar o router espelhando `routes/swot/index.ts`**

Mirror dos handlers de perspectives em `artifacts/api-server/src/routes/swot/index.ts`, com estas substituições exatas:
- Tabela do catálogo: `swotPerspectivesTable` → `competencyCatalogTable`.
- Campos extras na criação/edição: além de `name`, gravar `competencyType, category, norm, isMandatory`.
- **POST idempotente:** mesma lógica (match `lower(name)`, retorna 200 existente; senão insert `.onConflictDoNothing()`, re-query em corrida; 201 no insert).
- **PATCH (rename):** ao mudar `name`, propagar para **dois** alvos (não um): 
  ```ts
  await db.update(employeeCompetenciesTable).set({ name }).where(and(
    /* org via join/employeeId scope conforme padrão */,
    sql`lower(${employeeCompetenciesTable.name}) = lower(${current.name})`,
  ));
  await db.update(positionCompetencyRequirementsTable).set({ competencyName: name }).where(
    sql`lower(${positionCompetencyRequirementsTable.competencyName}) = lower(${current.name})`,
  );
  ```
  (Escopar por organização conforme as tabelas: `employee_competencies` via `employeeId→employees.organizationId`; `position_competency_requirements` via `positionId→positions.organizationId`. Seguir como os handlers existentes escopam essas tabelas.)
- **DELETE:** remove só do catálogo (sem propagação).
- **GET list:** incluir `usageCount` (contagem case-insensitive de usos nas duas tabelas) — opcional; se custar, retornar sem e calcular no front.

- [ ] **Step 4: Montar sob módulo employees** (mirror do Task 3 Step 4, regex `/^\/organizations\/[^/]+\/competency-catalog(?:\/|$)/`).

- [ ] **Step 5: Rodar — deve passar.** Run o vitest do Step 1 → PASS.

- [ ] **Step 6: Typecheck + commit**
```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/routes/competency-catalog.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/tests/routes/competency-catalog.integration.test.ts
git commit -m "feat(aprendizagem): rota competency-catalog (idempotente + rename propaga) + testes"
```

---

### Task 6: Snapshot na criação de treino a partir do catálogo

**Files:**
- Modify: `artifacts/api-server/src/routes/employees.ts` (POST `.../trainings`)
- Modify: `lib/api-spec/openapi.yaml` (`CreateTrainingBody`: + `catalogItemId?`) + codegen
- Modify: `artifacts/api-server/tests/routes/*` (test do snapshot — pode ir no employees integration test existente ou novo)

**Interfaces:**
- Consumes: `trainingCatalogTable`, `CreateTrainingBody` (com `catalogItemId`).
- Produces: ao criar training com `catalogItemId`, o registro carrega snapshot + `catalog_item_id`.

- [ ] **Step 1: Contrato — adicionar `catalogItemId?` a `CreateTrainingBody`** no `openapi.yaml` (integer, opcional) + codegen (python3).

- [ ] **Step 2: Teste (falha primeiro)** — criar item de catálogo (com objective/workloadHours/validityMonths/targetCompetency*), POST training com `{ employeeId, catalogItemId, completionDate }` e **sem** os demais campos; esperar que o registro retornado tenha `title/objective/workloadHours/targetCompetencyName` vindos do catálogo, `catalogItemId` setado, e `expirationDate` = completionDate + validityMonths.

- [ ] **Step 3: Implementar o snapshot** no handler POST `.../trainings` de `employees.ts`: se `body.catalogItemId` veio, carregar o item (validando org), e para cada campo template **ausente no body**, preencher com o do catálogo (`title, description, objective, institution→defaultInstructor, targetCompetencyName/Type/Level, evaluationMethod, workloadHours`); mapear `validityMonths`→`renewalMonths` e, se houver `completionDate`, calcular `expirationDate`. Gravar `catalogItemId`. Campos enviados no body têm precedência (override).

- [ ] **Step 4: Rodar — deve passar.** Vitest do training snapshot → PASS.

- [ ] **Step 5: Typecheck + commit**
```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/routes/employees.ts lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/tests
git commit -m "feat(aprendizagem): snapshot do catálogo ao lançar treino (catalogItemId)"
```

---

### Task 7: Frontend — tela Catálogo + rota + nav

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/catalogo/index.tsx`
- Modify: `artifacts/web/src/App.tsx`
- Modify: `artifacts/web/src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: hooks gerados `useListTrainingCatalog`, `useCreateTrainingCatalogItem`, `useUpdateTrainingCatalogItem`, `useDeleteTrainingCatalogItem` (Task 2).
- Produces: rota `/aprendizagem/catalogo`; item de menu "Catálogo".

- [ ] **Step 1: Página Catálogo** — grid de cards (título, norma, categoria/carga/validade, badges modalidade/obrigatório), filtros (busca + norma/categoria/modalidade), **ficha** (modal read-only com ações; botão "Abrir turma" oculto até SP3) e **novo/duplicar** (modal de formulário). Usar os hooks gerados. Seguir o design system (cards, badges) e os padrões das telas existentes do módulo.

- [ ] **Step 2: Rota** — em `App.tsx`, adicionar `import AprendizagemCatalogoPage from "@/pages/app/aprendizagem/catalogo";` e as rotas `/aprendizagem/catalogo` e `/app/aprendizagem/catalogo` (mirror das rotas de colaboradores do SP0).

- [ ] **Step 3: Nav + breadcrumb** — em `AppLayout.tsx`: adicionar `{ href: "/aprendizagem/catalogo", label: "Catálogo" }` ao array `aprendizagemLinks` (gate `hasModuleAccess("employees")`); adicionar branch de breadcrumb `/aprendizagem/catalogo` ("Aprendizagem / Catálogo"); adicionar `{ prefix: "/aprendizagem/catalogo", module: "employees" }` ao `moduleByPath` se necessário (o prefixo `/aprendizagem/colaboradores` não cobre `/catalogo`).

- [ ] **Step 4: Typecheck + build**
Run: `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build`
Expected: sem erros.

- [ ] **Step 5: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/catalogo artifacts/web/src/App.tsx artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(aprendizagem): tela Catálogo de treinamentos + rota e menu"
```

---

### Task 8: Frontend — seletor de catálogo no form de treino

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx` (TrainingAdminForm + dialog)

**Interfaces:**
- Consumes: `useListTrainingCatalog`; `useCreateTraining` (com `catalogItemId`).

- [ ] **Step 1: Seletor de item do catálogo** no diálogo de novo treino: um `SearchableSelect`/combobox listando itens ativos do catálogo. Ao selecionar, **pré-preencher** os campos do form (title, objective, workloadHours, targetCompetency*, etc.) com o template e guardar `catalogItemId` no estado. Campos seguem editáveis (override). Texto-livre continua possível (catalogItemId fica vazio).

- [ ] **Step 2: Enviar `catalogItemId`** no payload do `useCreateTraining` quando houver item selecionado.

- [ ] **Step 3: Typecheck + build** — `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build`. Expected: sem erros.

- [ ] **Step 4: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx
git commit -m "feat(aprendizagem): seletor do catálogo no formulário de treino (pré-preenche + vincula)"
```

---

### Task 9: Frontend — banco de competências (painel + inline-create)

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx` (área Matriz)
- Modify: diálogos de competência (requisito de cargo e/ou competência do colaborador) para inline-create

**Interfaces:**
- Consumes: `useListCompetencyCatalog`, `useCreateCompetencyCatalogItem`, `useUpdateCompetencyCatalogItem`, `useDeleteCompetencyCatalogItem` (Task 4).

- [ ] **Step 1: Painel de gestão** — espelhar o `PerspectivesPanel` de `artifacts/web/src/pages/app/organizacao/swot.tsx` (add input + lista com contagem de uso + rename inline + delete com confirmação), adaptado para competências (campos type/category/norm/isMandatory no add/edit). Ancorar como aba/seção na área **Matriz** de `treinamentos.tsx`.

- [ ] **Step 2: Inline-create** — nos campos de nome de competência (diálogo de requisito de cargo e/ou competência do colaborador), usar `SearchableSelect` com `onCreateOption` chamando `useCreateCompetencyCatalogItem` (idempotente) — espelhar `handleCreatePerspectiveInline`/uso do SearchableSelect no swot.tsx. Opções = catálogo + texto-livre existente.

- [ ] **Step 3: Typecheck + build** — `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build`. Expected: sem erros.

- [ ] **Step 4: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx
git commit -m "feat(aprendizagem): banco de competências — painel de gestão + criação inline na Matriz"
```

---

### Task 10: Verificação final do SP1

- [ ] **Step 1: Typecheck completo** — `pnpm typecheck` → verde (libs + apps + e2e).
- [ ] **Step 2: Build web** — `pnpm --filter @workspace/web build` → ok.
- [ ] **Step 3: Testes** — `pnpm exec vitest run --project integration` (catalog + competency + snapshot) e `pnpm exec vitest run --project node-unit --project web-unit` relevantes → verdes. (Requer DB de teste.)
- [ ] **Step 4: Conferir critérios de aceitação do spec (§12).** Documentar o que ficou para o smoke pré-PR (E2E de criar item → lançar treino com snapshot).

---

## Self-review

- **Cobertura do spec:** §3 tabelas (Task 1) ✓; §4 snapshot (Task 6) ✓; §5 competency padrão SWOT (Task 5) ✓; §7 contrato+codegen python3 (Tasks 2,4,6) ✓; §8 telas — Catálogo (Task 7), form de treino (Task 8), painel competências (Task 9) ✓; §9 bridge (Global Constraints + colunas nullable) ✓; §10 testes (Tasks 3,5,6,10) ✓; §6 C-H-A (Task 1/4 vocab) ✓.
- **Placeholders:** handlers usam mirror-reference a arquivos concretos existentes (swot/index.ts, employees.ts) com substituições explícitas — não há "TBD". Código novo (schemas, colunas, comandos de codegen, asserções de teste) está verbatim.
- **Consistência de nomes:** `trainingCatalogTable`/`competencyCatalogTable`/`catalogItemId` definidos no Task 1 e usados nos Tasks 3/5/6; operationIds → hooks (`useListTrainingCatalog` etc.) definidos no Task 2/4 e consumidos nos Tasks 7/8/9; regex de mount consistente (`training-catalog`, `competency-catalog`) nos Tasks 3/5.
- **Riscos conhecidos no plano:** codegen python3 (Tasks 2/4/6) e escopo-por-org da propagação de rename (Task 5 Step 3) sinalizados explicitamente para resolver na implementação.
