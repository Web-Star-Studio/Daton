# Aprendizagem — SP3 (Turmas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turmas (instâncias agendadas de um item do catálogo) com participantes, presença/notas/evidências, e conclusão que grava o employee_training de cada participante presente e aprovado.

**Architecture:** Duas tabelas (`training_classes`, `training_class_participants`). CRUD de turma + participantes + evidências (attachments) e um serviço `completeTrainingClass` que, ao concluir, grava/atualiza o `employee_training` dos aprovados (reaproveitando o pendente da obrigatoriedade). Contrato no openapi.yaml → Orval (python3). Telas reusam os padrões do SP1/SP2.

**Tech Stack:** Drizzle/Postgres, Express 5 + zod, OpenAPI + Orval (codegen via python3), React 19 + Wouter + TanStack Query, Vitest.

## Global Constraints

- **Bridge, sem migração:** tabelas novas; `employee_trainings` só recebe registros/updates ao concluir turmas.
- **Permissão:** router sob módulo **`employees`** (`requireModuleAccessForPaths`).
- **Codegen sem ruby:** caminho python3 (ver SP1/SP2). Nunca editar gerados.
- **FK p/ evitar ciclo:** `training_class_participants.employeeTrainingId` é integer simples no schema; FK real via DDL (`ON DELETE SET NULL`).
- **DB nunca em PROD:** `drizzle push`/testes contra o DB de integração docker (`:55432`, já no ar). Aplicar DDL no DB de teste.
- **Status adiados:** sem `programado`; sem tela de triagem operacional.
- **Commits:** 1 por task. Push de backup ao fim.
- Prettier 2 espaços, aspas duplas, trailing commas; identificadores em inglês, UI em PT-BR.

**Pré-flight:** `pnpm typecheck` verde; DB de integração no ar com schema SP1/SP2.

---

## File Structure

- **DB:** `lib/db/src/schema/learning-catalog.ts` (+ `trainingClassesTable`, `trainingClassParticipantsTable`).
- **Contrato:** `lib/api-spec/openapi.yaml` + gerados.
- **Backend:** `artifacts/api-server/src/routes/training-classes.ts` (CRUD + participantes + complete), `artifacts/api-server/src/services/aprendizagem/complete-class.ts` (serviço), `routes/index.ts` (mount), testes.
- **Frontend:** `pages/app/aprendizagem/turmas/index.tsx` (lista + stepper + painel), `App.tsx`, `AppLayout.tsx`.

---

### Task 1: Schema — training_classes + training_class_participants

**Files:** Modify `lib/db/src/schema/learning-catalog.ts`

**Interfaces:**
- Produces: `trainingClassesTable`, `trainingClassParticipantsTable`, tipos `TrainingClass`, `TrainingClassParticipant`.

- [ ] **Step 1: Adicionar as tabelas**

Em `learning-catalog.ts` (adicionar `date`, `unitsTable`, `employeesTable`, `EmployeeRecordAttachment` aos imports conforme necessário — `date` de `drizzle-orm/pg-core`; `unitsTable` de `./units`; `employeesTable` + `type EmployeeRecordAttachment` de `./employees`):
```ts
export const trainingClassesTable = pgTable("training_classes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id")
    .notNull()
    .references(() => trainingCatalogTable.id, { onDelete: "cascade" }),
  code: text("code"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  location: text("location"),
  instructor: text("instructor"),
  modality: text("modality"),
  workloadHours: integer("workload_hours"),
  capacity: integer("capacity"),
  minScore: integer("min_score"),
  status: text("status").notNull().default("agendada"),
  notes: text("notes"),
  attachments: jsonb("attachments")
    .$type<EmployeeRecordAttachment[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const trainingClassParticipantsTable = pgTable(
  "training_class_participants",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => trainingClassesTable.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "cascade" }),
    attendance: text("attendance"),
    score: integer("score"),
    result: text("result"),
    employeeTrainingId: integer("employee_training_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("training_class_participant_unique").on(
      table.classId,
      table.employeeId,
    ),
  ],
);

export type TrainingClass = typeof trainingClassesTable.$inferSelect;
export type TrainingClassParticipant =
  typeof trainingClassParticipantsTable.$inferSelect;
```
(Confirmar imports: `date` em pg-core; `unitsTable` de `./units`; `employeesTable`/`EmployeeRecordAttachment` de `./employees`. Cuidado com ciclo: `employees.ts` não importa `learning-catalog.ts`, então importar `employeesTable` aqui é seguro.)

- [ ] **Step 2: Typecheck libs** — `pnpm typecheck:libs` → sem erros.

- [ ] **Step 3: Aplicar no DB de teste + FK por DDL**
```bash
pnpm test:integration:db:push
docker exec feat-gestao-aprendizagem-postgres-1 psql -U postgres -d daton_integration -c "ALTER TABLE training_class_participants ADD CONSTRAINT tcp_employee_training_fk FOREIGN KEY (employee_training_id) REFERENCES employee_trainings(id) ON DELETE SET NULL;"
```
Expected: push cria as 2 tabelas; DDL cria a FK.

- [ ] **Step 4: Commit**
```bash
git add lib/db/src/schema/learning-catalog.ts
git commit -m "feat(aprendizagem): schema training_classes + training_class_participants"
```

---

### Task 2: OpenAPI training-classes + codegen

**Files:** Modify `lib/api-spec/openapi.yaml` + gerados.

**Interfaces:**
- Produces: hooks `useListTrainingClasses`, `useCreateTrainingClass`, `useGetTrainingClass`, `useUpdateTrainingClass`, `useDeleteTrainingClass`, `useAddTrainingClassParticipants`, `useUpdateTrainingClassParticipant`, `useDeleteTrainingClassParticipant`, `useCompleteTrainingClass`; schemas `TrainingClass`, `TrainingClassParticipant`, `TrainingClassDetail`, `Create/UpdateTrainingClassBody`, `AddTrainingClassParticipantsBody`, `UpdateTrainingClassParticipantBody`.

- [ ] **Step 1: Tag + schemas + paths**

Adicionar tag `training-classes`. Schemas (espelhar a forma dos schemas de SP1/SP2; `attachments` usa `$ref EmployeeRecordAttachment`):
- `TrainingClass` (`id, organizationId, catalogItemId, code?, startDate, endDate?, unitId?, location?, instructor?, modality?, workloadHours?, capacity?, minScore?, status, notes?, attachments[], participantCount?, createdAt, updatedAt`; required: id, organizationId, catalogItemId, startDate, status, attachments, createdAt, updatedAt).
- `TrainingClassParticipant` (`id, classId, employeeId, employeeName?, attendance?, score?, result?, employeeTrainingId?, createdAt`; required: id, classId, employeeId, createdAt).
- `TrainingClassDetail` (allOf TrainingClass + `participants: TrainingClassParticipant[]`).
- `CreateTrainingClassBody` (`catalogItemId, startDate` required; demais opcionais incl. `attachments`).
- `UpdateTrainingClassBody` (todos opcionais).
- `AddTrainingClassParticipantsBody` (`{ employeeIds: integer[] }`, required).
- `UpdateTrainingClassParticipantBody` (`attendance?, score?, result?`).

Paths (operationIds explícitos; mirror SP1/SP2):
- `GET /organizations/{orgId}/training-classes` — `listTrainingClasses`; query `status?, unitId?, catalogItemId?`; resposta `{ data: TrainingClass[] }`.
- `POST /organizations/{orgId}/training-classes` — `createTrainingClass` → 201 `TrainingClass`.
- `GET /organizations/{orgId}/training-classes/{id}` — `getTrainingClass` → 200 `TrainingClassDetail`.
- `PATCH /organizations/{orgId}/training-classes/{id}` — `updateTrainingClass` → 200 `TrainingClass`.
- `DELETE /organizations/{orgId}/training-classes/{id}` — `deleteTrainingClass` → 204.
- `POST /organizations/{orgId}/training-classes/{id}/participants` — `addTrainingClassParticipants`; body `AddTrainingClassParticipantsBody` → 200 `TrainingClassDetail`.
- `PATCH /organizations/{orgId}/training-classes/{id}/participants/{participantId}` — `updateTrainingClassParticipant` → 200 `TrainingClassParticipant`.
- `DELETE /organizations/{orgId}/training-classes/{id}/participants/{participantId}` — `deleteTrainingClassParticipant` → 204.
- `POST /organizations/{orgId}/training-classes/{id}/complete` — `completeTrainingClass`; resposta `{ completed: integer }`.

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
git commit -m "feat(aprendizagem): contrato OpenAPI training-classes + codegen"
```

---

### Task 3: Backend CRUD turma + participantes + mount + testes

**Files:**
- Create: `artifacts/api-server/src/routes/training-classes.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/tests/routes/training-classes.integration.test.ts`

**Interfaces:**
- Consumes: `trainingClassesTable`, `trainingClassParticipantsTable`, `employeesTable`; zod gerado; `sanitizeEmployeeRecordAttachments`/`validateEmployeeRecordAttachments` (exportar/duplicar — ver Step 3).
- Produces: rotas `/organizations/:orgId/training-classes` (+ `/participants`).

- [ ] **Step 1: Teste de integração (falha primeiro)**

Mirror dos testes SP1/SP2 (supertest + `createTestContext`/`authHeader`/`cleanupTestContext`; `createEmployee` p/ participantes; criar item de catálogo via API). Cobrir: criar turma; inscrever participantes (`POST .../participants` com `employeeIds`); detalhe inclui participantes; PATCH participante (presença/nota → result derivado); DELETE participante; DELETE turma. Arquivo `training-classes.integration.test.ts`.

- [ ] **Step 2: Rodar — deve falhar (404).**
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/training-classes.integration.test.ts` → FAIL.

- [ ] **Step 3: Implementar o router**

Criar `routes/training-classes.ts` espelhando `routes/training-requirements.ts` (SP2):
- `serializeClass(row, participantCount?)` — datas iso, `attachments` array.
- `serializeParticipant(row, employeeName?)`.
- **list** (filtros status/unitId/catalogItemId + contagem de inscritos via subquery/group).
- **create** (valida `attachments` com os helpers do módulo employees — importar de `./employees` se exportados, senão validar inline com a mesma forma).
- **get detail** (turma + participantes com nome do colaborador via join `employeesTable`).
- **update** (campos da turma + `attachments`).
- **delete** (204/404).
- **add participants** (`employeeIds[]`): para cada, insere participante com `onConflictDoNothing` (único classId+employeeId); **vincula** o pendente: busca `employee_trainings` do colaborador com `catalogItemId` da turma e `status='pendente'` → grava `employeeTrainingId` no participante. Retorna o detalhe.
- **update participant** (`attendance`, `score`): recalcula `result` = `attendance==='presente' && (minScore==null || score>=minScore) ? 'aprovado' : (attendance==='faltou' ? 'reprovado' : result)`; aceita override de `result` do body.
- **delete participant** (204/404).

- [ ] **Step 4: Montar sob módulo employees** (mirror dos mounts SP1/SP2 em `routes/index.ts`, regex `/^\/organizations\/[^/]+\/training-classes(?:\/|$)/`).

- [ ] **Step 5: Rodar — deve passar.** Vitest do Step 1 → PASS.
- [ ] **Step 6: Typecheck + commit**
```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/routes/training-classes.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/tests/routes/training-classes.integration.test.ts
git commit -m "feat(aprendizagem): rota CRUD de turmas + participantes + testes"
```

---

### Task 4: Serviço completeTrainingClass + endpoint /complete + testes

**Files:**
- Create: `artifacts/api-server/src/services/aprendizagem/complete-class.ts`
- Modify: `artifacts/api-server/src/routes/training-classes.ts` (endpoint `/complete`)
- Create: `artifacts/api-server/tests/services/complete-class.integration.test.ts`

**Interfaces:**
- Consumes: `trainingClassesTable`, `trainingClassParticipantsTable`, `trainingCatalogTable`, `employeeTrainingsTable`.
- Produces: `completeTrainingClass({ orgId, classId, database }) => Promise<{ completed: number }>`.

- [ ] **Step 1: Teste de integração (falha primeiro)**

`complete-class.integration.test.ts`. Casos:
1. **Conclui aprovados:** turma de um item (validityMonths=12) com 2 participantes presentes (um aprovado, um reprovado por nota) + 1 ausente; `completeTrainingClass`; esperar `completed===1`; o aprovado tem `employee_training` `concluido` com `completionDate` = data da turma e `expirationDate` = +12 meses; reprovado/ausente sem conclusão; turma vira `realizada`.
2. **Reaproveita pendente:** participante com `employeeTrainingId` (pendente vinculado) → o MESMO registro vira concluído (não cria novo).
3. **Idempotência:** concluir 2x → `completed` 0 na 2ª; sem duplicar.

- [ ] **Step 2: Rodar — deve falhar.** → FAIL (import não resolve).

- [ ] **Step 3: Implementar o serviço**

```ts
import { and, eq } from "drizzle-orm";
import {
  db as defaultDb,
  trainingClassesTable,
  trainingClassParticipantsTable,
  trainingCatalogTable,
  employeeTrainingsTable,
} from "@workspace/db";

type Database = Pick<typeof defaultDb, "select" | "insert" | "update">;

function addMonthsIso(isoDate: string, months: number): string | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function completeTrainingClass(args: {
  orgId: number;
  classId: number;
  database: Database;
}): Promise<{ completed: number }> {
  const { orgId, classId, database } = args;
  const [cls] = await database
    .select()
    .from(trainingClassesTable)
    .where(and(eq(trainingClassesTable.id, classId), eq(trainingClassesTable.organizationId, orgId)));
  if (!cls) return { completed: 0 };

  const [item] = await database
    .select()
    .from(trainingCatalogTable)
    .where(eq(trainingCatalogTable.id, cls.catalogItemId));

  const completionDate = cls.endDate ?? cls.startDate;
  const expirationDate =
    item?.validityMonths && completionDate
      ? addMonthsIso(completionDate, item.validityMonths)
      : null;

  const participants = await database
    .select()
    .from(trainingClassParticipantsTable)
    .where(eq(trainingClassParticipantsTable.classId, classId));

  let completed = 0;
  for (const p of participants) {
    if (p.attendance !== "presente" || p.result === "reprovado") continue;

    if (p.employeeTrainingId) {
      const [t] = await database
        .select()
        .from(employeeTrainingsTable)
        .where(eq(employeeTrainingsTable.id, p.employeeTrainingId));
      if (t && t.status === "concluido") continue; // idempotente
      await database
        .update(employeeTrainingsTable)
        .set({ status: "concluido", completionDate, expirationDate })
        .where(eq(employeeTrainingsTable.id, p.employeeTrainingId));
      completed += 1;
      continue;
    }

    // tenta reaproveitar um pendente do mesmo item
    const [pending] = await database
      .select()
      .from(employeeTrainingsTable)
      .where(and(
        eq(employeeTrainingsTable.employeeId, p.employeeId),
        eq(employeeTrainingsTable.catalogItemId, cls.catalogItemId),
        eq(employeeTrainingsTable.status, "pendente"),
      ));
    if (pending) {
      await database
        .update(employeeTrainingsTable)
        .set({ status: "concluido", completionDate, expirationDate })
        .where(eq(employeeTrainingsTable.id, pending.id));
      await database
        .update(trainingClassParticipantsTable)
        .set({ employeeTrainingId: pending.id })
        .where(eq(trainingClassParticipantsTable.id, p.id));
      completed += 1;
      continue;
    }

    // cria novo (snapshot do catálogo) já concluído
    const [created] = await database
      .insert(employeeTrainingsTable)
      .values({
        employeeId: p.employeeId,
        title: item?.title ?? "Treinamento",
        description: item?.programContent ?? null,
        objective: item?.objective ?? null,
        institution: item?.defaultInstructor ?? null,
        targetCompetencyName: item?.targetCompetencyName ?? null,
        targetCompetencyType: item?.targetCompetencyType ?? null,
        targetCompetencyLevel: item?.targetCompetencyLevel ?? null,
        evaluationMethod: item?.evaluationMethod ?? null,
        workloadHours: item?.workloadHours ?? cls.workloadHours ?? null,
        renewalMonths: item?.validityMonths ?? null,
        status: "concluido",
        completionDate,
        expirationDate,
        catalogItemId: cls.catalogItemId,
      })
      .returning();
    await database
      .update(trainingClassParticipantsTable)
      .set({ employeeTrainingId: created.id })
      .where(eq(trainingClassParticipantsTable.id, p.id));
    completed += 1;
  }

  await database
    .update(trainingClassesTable)
    .set({ status: "realizada" })
    .where(eq(trainingClassesTable.id, classId));

  return { completed };
}
```

- [ ] **Step 4: Endpoint `/complete`** em `training-classes.ts`:
```ts
router.post(
  "/organizations/:orgId/training-classes/:id/complete",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    // validar params (orgId/id) + org scope como nos outros handlers
    const result = await completeTrainingClass({ orgId, classId: id, database: db });
    res.json(result);
  },
);
```
(Importar `completeTrainingClass`; validar params com o zod gerado `CompleteTrainingClassParams`.)

- [ ] **Step 5: Rodar — deve passar.** Vitest do Step 1 → PASS.
- [ ] **Step 6: Typecheck + commit**
```bash
pnpm --filter @workspace/api-server typecheck
git add artifacts/api-server/src/services/aprendizagem/complete-class.ts artifacts/api-server/src/routes/training-classes.ts artifacts/api-server/tests/services/complete-class.integration.test.ts
git commit -m "feat(aprendizagem): conclusão de turma grava employee_trainings (completeTrainingClass)"
```

---

### Task 5: Frontend — tela Turmas (lista + nova turma stepper) + rota/menu

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/turmas/index.tsx`
- Modify: `artifacts/web/src/App.tsx`, `artifacts/web/src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `useListTrainingClasses`, `useCreateTrainingClass`, `useAddTrainingClassParticipants` (Task 2); `useListTrainingCatalog`, `useListUnits`, `useListEmployees` (existentes).

- [ ] **Step 1: Página (lista + nova turma)** — mirror de `pages/app/aprendizagem/obrigatoriedades/index.tsx`: `usePageTitle("Gestão de turmas")`, `HeaderActionButton` "Nova turma", lista (filtros status/filial; colunas treinamento(catálogo)/filial/data/inscritos/status), e **modal stepper 3 passos**: treinamento (catálogo) → dados da turma (datas, filial, local, instrutor, modalidade, carga, vagas, nota mínima, status) → participantes (busca via `useListEmployees` + seleção). Ao salvar: `useCreateTrainingClass` e, se houver selecionados, `useAddTrainingClassParticipants`. Invalida por `getListTrainingClassesQueryKey`.

- [ ] **Step 2: Rota** — `App.tsx`: import + rotas `/aprendizagem/turmas` e `/app/aprendizagem/turmas` (mirror).
- [ ] **Step 3: Nav + breadcrumb + módulo** — `AppLayout.tsx`: item `{ href: "/aprendizagem/turmas", label: "Turmas" }`; branch de breadcrumb; entrada `{ prefix: "/aprendizagem/turmas", module: "employees" }`.
- [ ] **Step 4: Typecheck + build** — `pnpm --filter @workspace/web typecheck && pnpm --filter @workspace/web build` → sem erros.
- [ ] **Step 5: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/turmas artifacts/web/src/App.tsx artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(aprendizagem): tela Turmas (lista + nova turma) + rota e menu"
```

---

### Task 6: Frontend — painel de detalhe (presença/notas/evidências + concluir)

**Files:** Modify `artifacts/web/src/pages/app/aprendizagem/turmas/index.tsx`

**Interfaces:**
- Consumes: `useGetTrainingClass`, `useUpdateTrainingClassParticipant`, `useDeleteTrainingClassParticipant`, `useCompleteTrainingClass`, `useUpdateTrainingClass` (Task 2).

- [ ] **Step 1: Painel de detalhe** — ao selecionar uma turma na lista, carregar `useGetTrainingClass` e mostrar um painel com abas:
  - **Presença:** para cada participante, toggle presente/faltou → `useUpdateTrainingClassParticipant`.
  - **Notas:** input de nota por participante → `useUpdateTrainingClassParticipant`; mostra `result` (aprovado/reprovado).
  - **Evidências:** lista de `attachments` + upload (reusar o mecanismo de upload por URL pré-assinada já usado em colaboradores/treinos — adaptar o componente de anexos; gravar via `useUpdateTrainingClass` com `attachments`).
  - Botão **Concluir turma** → `useCompleteTrainingClass` + toast "N treino(s) concluído(s)"; desabilitado se já `realizada`.

- [ ] **Step 2: Typecheck + build** → sem erros.
- [ ] **Step 3: Commit**
```bash
git add artifacts/web/src/pages/app/aprendizagem/turmas/index.tsx
git commit -m "feat(aprendizagem): painel da turma (presença/notas/evidências) + concluir"
```

---

### Task 7: Verificação final do SP3

- [ ] **Step 1: Typecheck completo** — `pnpm typecheck` → verde.
- [ ] **Step 2: Build web** — `pnpm --filter @workspace/web build` → ok.
- [ ] **Step 3: Testes** — `TEST_ENV=integration pnpm exec vitest run --project integration` para: training-classes, complete-class, **e regressão** (training-catalog, competency-catalog, training-requirements, requirements-engine, employees-auto-link, training-snapshot, employees) → todos verdes.
- [ ] **Step 4: Conferir DoD (spec §10).** Registrar o que fica para o smoke pré-PR.

---

## Self-review

- **Cobertura do spec:** §3 schema (Task 1) ✓; §4 fluxo/serviço (Tasks 3 inscrição+presença/notas, 4 conclusão) ✓; §5 contrato (Task 2) ✓; §6 frontend (Tasks 5,6) ✓; §7 bridge (Global Constraints) ✓; §8 testes (Tasks 3,4,7) ✓. Itens adiados (§11) — nenhuma task os implementa (correto).
- **Placeholders:** serviço de conclusão com código verbatim; CRUD/tela usam mirror de arquivos concretos do SP1/SP2 com substituições; sem "TBD".
- **Consistência de nomes:** `trainingClassesTable`/`trainingClassParticipantsTable` (Task 1) usados em 3/4; `completeTrainingClass({orgId,classId,database})` (Task 4) chamado no endpoint; hooks `useList/Create/Get/Update/DeleteTrainingClass` + participants + `useCompleteTrainingClass` (Task 2) consumidos em 5/6; `result` derivado consistente (Task 3).
