# Aprendizagem — SP4 (Programa Anual / PAT) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Programa anual de treinamento (itens planejados por ano/filial), com CRUD, indicadores e a ação "criar turma" que vincula a turma (SP3) ao item.

**Architecture:** Tabela `annual_training_program` + CRUD. "Criar turma" é orquestrado no frontend (cria a turma via SP3 + PATCH do item com `classId`/status). Contrato no openapi.yaml → Orval (python3). Tela reusa os padrões do SP1–SP3.

**Tech Stack:** Drizzle/Postgres, Express 5 + zod, OpenAPI + Orval (codegen via python3), React 19 + Wouter + TanStack Query, Vitest.

## Global Constraints

- **Bridge, sem migração:** tabela nova.
- **Permissão:** router sob módulo **`employees`** (`requireModuleAccessForPaths`).
- **Codegen sem ruby:** caminho python3 (ver SP1/SP2/SP3). Nunca editar gerados.
- **FK p/ evitar ciclo:** `annual_training_program.classId` é integer simples; FK real via DDL (`ON DELETE SET NULL`).
- **DB nunca em PROD:** `drizzle push`/testes contra o DB de integração docker (`:55432`, já no ar). DDL no DB de teste.
- **Status manual:** sem derivação automática de `realizada` a partir da conclusão da turma (adiado).
- **Commits:** 1 por task. Push de backup ao fim.
- Prettier 2 espaços, aspas duplas, trailing commas; identificadores em inglês, UI em PT-BR.

**Pré-flight:** `pnpm typecheck` verde; DB de integração no ar com schema SP1–SP3.

---

## File Structure

- **DB:** `lib/db/src/schema/learning-catalog.ts` (+ `annualTrainingProgramTable`).
- **Contrato:** `lib/api-spec/openapi.yaml` + gerados.
- **Backend:** `artifacts/api-server/src/routes/annual-program.ts` (CRUD), `routes/index.ts` (mount), teste.
- **Frontend:** `pages/app/aprendizagem/programa/index.tsx`, `App.tsx`, `AppLayout.tsx`.

---

### Task 1: Schema — annual_training_program

**Files:** Modify `lib/db/src/schema/learning-catalog.ts`

**Interfaces:**
- Produces: `annualTrainingProgramTable`, tipo `AnnualTrainingProgramItem`.

- [ ] **Step 1: Adicionar a tabela** (após as tabelas de turma; `unitsTable`/`trainingCatalogTable` já importados):
```ts
export const annualTrainingProgramTable = pgTable("annual_training_program", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .references(() => trainingCatalogTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  plannedMonth: integer("planned_month"),
  modality: text("modality"),
  plannedQuantity: integer("planned_quantity"),
  responsible: text("responsible"),
  status: text("status").notNull().default("planejada"),
  notes: text("notes"),
  // turma que cumpre o item; FK real via DDL (set null)
  classId: integer("class_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AnnualTrainingProgramItem =
  typeof annualTrainingProgramTable.$inferSelect;
```

- [ ] **Step 2: Typecheck libs** — `pnpm typecheck:libs` → sem erros.
- [ ] **Step 3: Push DB de teste + FK DDL**
```bash
pnpm test:integration:db:push
docker exec feat-gestao-aprendizagem-postgres-1 psql -U postgres -d daton_integration -c "ALTER TABLE annual_training_program ADD CONSTRAINT atp_class_fk FOREIGN KEY (class_id) REFERENCES training_classes(id) ON DELETE SET NULL;"
```
Expected: tabela criada; FK criada.
- [ ] **Step 4: Commit**
```bash
git add lib/db/src/schema/learning-catalog.ts
git commit -m "feat(aprendizagem): schema annual_training_program (PAT)"
```

---

### Task 2: OpenAPI annual-program + codegen

**Files:** Modify `lib/api-spec/openapi.yaml` + gerados.

**Interfaces:**
- Produces: hooks `useListAnnualProgram`, `useCreateAnnualProgramItem`, `useUpdateAnnualProgramItem`, `useDeleteAnnualProgramItem`; schemas `AnnualProgramItem`, `Create/UpdateAnnualProgramItemBody`.

- [ ] **Step 1: Tag + schemas + paths**

Adicionar tag `annual-program`. Schemas (mirror SP2/SP3):
- `AnnualProgramItem` (`id, organizationId, year, catalogItemId, unitId?, plannedMonth?, modality?, plannedQuantity?, responsible?, status, notes?, classId?, createdAt, updatedAt`; required: id, organizationId, year, catalogItemId, status, createdAt, updatedAt).
- `CreateAnnualProgramItemBody` (`year, catalogItemId` required; demais opcionais).
- `UpdateAnnualProgramItemBody` (todos opcionais, incl. `classId`, `status`).

Paths (operationIds explícitos):
- `GET /organizations/{orgId}/annual-program` — `listAnnualProgram`; query `year?, unitId?, status?`; resposta `{ data: AnnualProgramItem[] }`.
- `POST /organizations/{orgId}/annual-program` — `createAnnualProgramItem` → 201.
- `PATCH /organizations/{orgId}/annual-program/{id}` — `updateAnnualProgramItem` → 200.
- `DELETE /organizations/{orgId}/annual-program/{id}` — `deleteAnnualProgramItem` → 204.

- [ ] **Step 2: Codegen (python3)**
```bash
cd lib/api-spec
python3 -c 'import yaml; yaml.safe_load(open("openapi.yaml"))'
python3 -c 'import yaml,json; json.dump(yaml.safe_load(open("openapi.yaml")), open(".openapi.codegen.json","w"), indent=2)'
pnpm exec orval --config ./orval.config.ts
python3 -c 'p="../api-zod/src/index.ts"; ls=[l for l in open(p) if "./generated/types" not in l]; open(p,"w").write("".join(ls))'
rm -f .openapi.codegen.json
cd ../..
```
- [ ] **Step 3: Typecheck** — `pnpm typecheck:libs && pnpm --filter @workspace/web typecheck` → sem erros.
- [ ] **Step 4: Commit**
```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(aprendizagem): contrato OpenAPI annual-program + codegen"
```

---

### Task 3: Backend CRUD annual-program + mount + testes

**Files:**
- Create: `artifacts/api-server/src/routes/annual-program.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/tests/routes/annual-program.integration.test.ts`

**Interfaces:**
- Consumes: `annualTrainingProgramTable`; zod gerado.
- Produces: rotas `/organizations/:orgId/annual-program`.

- [ ] **Step 1: Teste de integração (falha primeiro)** — mirror dos testes SP2/SP3 (supertest + `createTestContext`/`authHeader`/`cleanupTestContext`; criar item de catálogo via API). Cobrir: criar item (year, catalogItemId, plannedMonth, status); listar com filtro `year`; PATCH (classId + status); DELETE. Arquivo `annual-program.integration.test.ts`.
- [ ] **Step 2: Rodar — deve falhar (404).**
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/annual-program.integration.test.ts` → FAIL.
- [ ] **Step 3: Implementar o router** — espelhar `routes/training-requirements.ts` (SP2): `serialize` (datas iso), list (filtros year/unitId/status; ordenar por plannedMonth/id), create, update (campos incl. `classId`/`status`), delete. Usar zod gerado (`ListAnnualProgramParams/QueryParams`, `CreateAnnualProgramItemParams/Body`, `UpdateAnnualProgramItemParams/Body`, `DeleteAnnualProgramItemParams`).
- [ ] **Step 4: Montar sob módulo employees** (mirror em `routes/index.ts`, regex `/^\/organizations\/[^/]+\/annual-program(?:\/|$)/`).
- [ ] **Step 5: Rodar — deve passar.** Vitest do Step 1 → PASS.
- [ ] **Step 6: Typecheck + commit**
```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/routes/annual-program.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/tests/routes/annual-program.integration.test.ts
git commit -m "feat(aprendizagem): rota CRUD do programa anual + testes"
```

---

### Task 4: Frontend — tela Programa anual + criar/ver turma + rota/menu

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/programa/index.tsx`
- Modify: `artifacts/web/src/App.tsx`, `artifacts/web/src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `useListAnnualProgram`, `useCreateAnnualProgramItem`, `useUpdateAnnualProgramItem`, `useDeleteAnnualProgramItem` (Task 2); `useListTrainingCatalog`, `useListUnits`, `useCreateTrainingClass` (existentes/SP3); `useLocation` (wouter) para navegar a Turmas.

- [ ] **Step 1: Página** — mirror estrutural de `pages/app/aprendizagem/obrigatoriedades/index.tsx`: `usePageTitle("Programa anual de treinamento")`, `HeaderActionButton` "Adicionar item". **Indicadores** (cards) calculados da lista (total / realizada / em_andamento / planejada). **Filtros** (ano: select de anos; filial). **Tabela** (treinamento via catálogo, filial, mês, modalidade, qtd, responsável, status) com **"Adicionar item"** (modal: ano, treinamento via `useListTrainingCatalog`, filial via `useListUnits`, mês 1–12, modalidade, qtd, responsável, status) e ação por linha:
  - sem `classId`: **"Criar turma"** → `useCreateTrainingClass` (pré-preenche `catalogItemId`, `unitId`, `modality`, `startDate` = `${year}-${plannedMonth padded}-01`) → `useUpdateAnnualProgramItem` (`{ classId: novaTurma.id, status: "em_andamento" }`) → toast + `navigate("/aprendizagem/turmas")`.
  - com `classId`: **"Ver turma"** → `navigate("/aprendizagem/turmas")`.
  Invalida por `getListAnnualProgramQueryKey`.

- [ ] **Step 2: Rota** — `App.tsx`: import + rotas `/aprendizagem/programa` e `/app/aprendizagem/programa` (mirror).
- [ ] **Step 3: Nav + breadcrumb + módulo** — `AppLayout.tsx`: item `{ href: "/aprendizagem/programa", label: "Programa anual" }`; branch de breadcrumb; entrada `{ prefix: "/aprendizagem/programa", module: "employees" }`.
- [ ] **Step 4: Typecheck + build** — `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build` → sem erros.
- [ ] **Step 5: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/programa artifacts/web/src/App.tsx artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(aprendizagem): tela Programa anual + criar/ver turma + rota e menu"
```

---

### Task 5: Verificação final do SP4

- [ ] **Step 1: Typecheck completo** — `pnpm typecheck` → verde.
- [ ] **Step 2: Build web** — `pnpm --filter @workspace/web build` → ok.
- [ ] **Step 3: Testes** — `TEST_ENV=integration pnpm exec vitest run --project integration` para: annual-program **+ regressão** (training-classes, complete-class, training-requirements, requirements-engine, employees-auto-link, training-catalog, competency-catalog, training-snapshot, employees) → todos verdes.
- [ ] **Step 4: Conferir DoD (spec §10).** Registrar o que fica para o smoke pré-PR.

---

## Self-review

- **Cobertura do spec:** §3 schema (Task 1) ✓; §4 CRUD + criar-turma orquestrado + indicadores (Tasks 3,4) ✓; §5 contrato (Task 2) ✓; §6 frontend (Task 4) ✓; §7 bridge (Global Constraints) ✓; §8 testes (Tasks 3,5) ✓. Item adiado (§11 auto-status) — nenhuma task o implementa (correto).
- **Placeholders:** schema verbatim; CRUD/tela usam mirror de arquivos concretos do SP2/SP3 com substituições; sem "TBD".
- **Consistência de nomes:** `annualTrainingProgramTable`/`AnnualTrainingProgramItem` (Task 1) usados em 3; hooks `useList/Create/Update/DeleteAnnualProgram(Item)` (Task 2) consumidos em 4; `classId`/`status` no PATCH consistentes; "criar turma" = `useCreateTrainingClass` + `useUpdateAnnualProgramItem`.
