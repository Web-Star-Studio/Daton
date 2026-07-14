# Diagnóstico do Fator de Desempenho — periodicidade + histórico com autor e data

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O "Diagnóstico atual" do Fator de Desempenho (Segurança Viária / ISO 39001 §6.3) deixa de ser um textarea sobrescrevível e passa a ter periodicidade própria, histórico append-only com autor e data, badge de vencimento no painel e cobrança no painel "Suas Pendências".

**Architecture:** Tabela nova `road_safety_factor_diagnoses` (append-only, espelhando `road_safety_factor_measurements`) + coluna `diagnosis_periodicity` nullable no fator. Uma função pura calcula vencimento e status a partir do último diagnóstico. A API deriva `currentDiagnosis` do histórico (compose-on-read) e fecha a escrita direta do campo. O front registra novos diagnósticos por diálogo na ficha do fator; o painel ganha coluna de status; um provider novo no registry de pendências cobra o responsável do fator.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), Express 5, Zod, OpenAPI 3.1 + Orval, React 19 + TanStack Query, Vitest (node-unit / web-unit / integration), supertest.

**Spec:** `docs/superpowers/specs/2026-07-14-fd-diagnostico-historico-design.md`
**Branch:** `feat/road-safety-kpi-link` (empilha no PR #110 — não abrir branch nova).

## Global Constraints

- **Append-only:** diagnóstico não tem PUT nem DELETE. Correção = registro novo. Mesma regra que `road_safety_factor_measurements` já segue.
- **Autor vem do servidor:** sempre `req.auth!.userId`. Qualquer autor enviado no corpo é ignorado — é isso que dá valor de trilha de auditoria.
- **`diagnosis_periodicity` nullable = "sem revisão programada"**: sem vencimento, sem badge, sem pendência. É o default — os fatores que já existem em produção não podem nascer vencidos.
- **`current_diagnosis` não é dropada.** Vira legado: backfillada como primeiro registro do histórico e, a partir daí, derivada na leitura e **removida do contrato de escrita**.
- **Nunca editar arquivos gerados** (`lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`). Alterar `lib/api-spec/openapi.yaml` e rodar `pnpm --filter @workspace/api-spec codegen`.
- **Testes de integração só com `TEST_ENV=integration`.** Sem essa variável, o vitest carrega o `.env` e bate no Neon **de produção**.
- **Datas são `YYYY-MM-DD` (date-only).** Parsear como data local, nunca `new Date("YYYY-MM-DD")` cru (vira UTC e desloca um dia).
- **Idioma:** rótulos de UI e mensagens de erro em PT-BR; código, tipos e commits em inglês/PT conforme o padrão do arquivo vizinho.
- Prettier: 2 espaços, aspas duplas, vírgula final. `pnpm typecheck` limpo é obrigatório.

---

### Task 1: Schema do banco, DDL e limpeza de testes

Cria a tabela do histórico e a coluna de periodicidade. Sem isso nada mais compila.

**Files:**
- Modify: `lib/db/src/schema/road-safety.ts`
- Create: `scripts/sql/20260714_add_road_safety_diagnoses.sql`
- Modify: `e2e/support/cleanup.ts:88-95` (imports) e `:790-800` (deleções)

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: `roadSafetyFactorDiagnosesTable`, `RoadSafetyFactorDiagnosis`, `InsertRoadSafetyFactorDiagnosis`, e o campo `diagnosisPeriodicity` em `roadSafetyFactorsTable`.

- [ ] **Step 1: Adicionar a coluna de periodicidade ao fator**

Em `lib/db/src/schema/road-safety.ts`, dentro de `roadSafetyFactorsTable`, logo abaixo de `periodicity`:

```ts
    periodicity: varchar("periodicity", { length: 20 }).notNull().default("monthly"),
    /**
     * Cadência de revisão do DIAGNÓSTICO do fator — distinta de `periodicity`,
     * que rege o lançamento do indicador. Null = sem revisão programada: não
     * vence e não gera pendência.
     */
    diagnosisPeriodicity: varchar("diagnosis_periodicity", { length: 20 }),
```

- [ ] **Step 2: Criar a tabela do histórico**

No mesmo arquivo, depois de `roadSafetyFactorMeasurementsTable`:

```ts
/**
 * Diagnóstico do fator — append-only. Cada revisão é um registro novo, com
 * autor e data; nenhum registro existente é editado ou apagado.
 */
export const roadSafetyFactorDiagnosesTable = pgTable(
  "road_safety_factor_diagnoses",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id),
    factorId: integer("factor_id")
      .notNull()
      .references(() => roadSafetyFactorsTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    referenceDate: date("reference_date").notNull(),
    /** Null = registro migrado (autor original não registrado) ou usuário removido. */
    diagnosedByUserId: integer("diagnosed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("road_safety_diagnoses_factor_idx").on(
      table.factorId,
      table.referenceDate,
    ),
  ],
);
```

E, no fim do arquivo, os schemas/tipos (mesmo padrão dos vizinhos):

```ts
export const insertRoadSafetyFactorDiagnosisSchema = createInsertSchema(
  roadSafetyFactorDiagnosesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoadSafetyFactorDiagnosis = z.infer<
  typeof insertRoadSafetyFactorDiagnosisSchema
>;
export type RoadSafetyFactorDiagnosis =
  typeof roadSafetyFactorDiagnosesTable.$inferSelect;
```

- [ ] **Step 3: Verificar que o schema é re-exportado**

Run: `grep -n "road-safety" lib/db/src/schema/index.ts`
Expected: já existe um `export * from "./road-safety";`. Se não existir, adicione.

- [ ] **Step 4: DDL de produção**

Create `scripts/sql/20260714_add_road_safety_diagnoses.sql`:

```sql
-- Diagnóstico do Fator de Desempenho (ISO 39001 §6.3): periodicidade + histórico.
-- Idempotente: pode rodar duas vezes sem efeito colateral.

ALTER TABLE road_safety_factors
  ADD COLUMN IF NOT EXISTS diagnosis_periodicity varchar(20);

CREATE TABLE IF NOT EXISTS road_safety_factor_diagnoses (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  factor_id integer NOT NULL REFERENCES road_safety_factors(id) ON DELETE CASCADE,
  content text NOT NULL,
  reference_date date NOT NULL,
  diagnosed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS road_safety_diagnoses_factor_idx
  ON road_safety_factor_diagnoses (factor_id, reference_date);
```

- [ ] **Step 5: Limpeza dos testes — apagar diagnósticos antes dos fatores**

Em `e2e/support/cleanup.ts`, adicione `roadSafetyFactorDiagnosesTable` ao bloco de imports de `@workspace/db` (junto de `roadSafetyFactorsTable`) e, onde hoje estão as deleções de road safety, insira a nova **antes** da de fatores:

```ts
      await db
        .delete(roadSafetyFactorDiagnosesTable)
        .where(inArray(roadSafetyFactorDiagnosesTable.organizationId, orgIds));
      await db
        .delete(roadSafetyFactorMeasurementsTable)
        .where(inArray(roadSafetyFactorMeasurementsTable.organizationId, orgIds));
      await db
        .delete(roadSafetyFactorsTable)
        .where(inArray(roadSafetyFactorsTable.organizationId, orgIds));
```

A ordem importa: o CASCADE cobre o banco, mas a limpeza é explícita e a FK de `organization_id` barra a remoção da org se sobrar linha.

- [ ] **Step 6: Aplicar o schema no banco de teste e checar tipos**

Run:
```bash
pnpm test:integration:up
pnpm test:integration:db:push
pnpm typecheck
```
Expected: push aplica `road_safety_factor_diagnoses`; typecheck termina sem erro.
**Nunca** rodar `pnpm --filter @workspace/db push` (aponta para o Neon de produção).

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/road-safety.ts scripts/sql/20260714_add_road_safety_diagnoses.sql e2e/support/cleanup.ts
git commit -m "feat(road-safety): schema do histórico de diagnóstico do FD + periodicidade"
```

---

### Task 2: Regra de vencimento (função pura + testes)

O cálculo mora em um lugar só, sem banco e sem relógio global, para ser testável e reusado por rota e provider.

**Files:**
- Create: `artifacts/api-server/src/services/road-safety/diagnosis.ts`
- Create: `artifacts/api-server/tests/services/road-safety/diagnosis.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type DiagnosisPeriodicity = "monthly" | "quarterly" | "semiannual" | "annual"`
  - `type DiagnosisStatus = "none" | "ok" | "due_soon" | "overdue"`
  - `nextDiagnosisDate(input: { periodicity: string | null; factorCreatedAt: Date; lastReferenceDate: string | null }): string | null` → `"YYYY-MM-DD"`
  - `diagnosisStatus(nextDate: string | null, now: Date, dueSoonDays?: number): DiagnosisStatus`

- [ ] **Step 1: Escrever os testes que falham**

Create `artifacts/api-server/tests/services/road-safety/diagnosis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  diagnosisStatus,
  nextDiagnosisDate,
} from "../../../src/services/road-safety/diagnosis";

const CREATED = new Date(2026, 0, 10); // 10/01/2026, local

describe("nextDiagnosisDate", () => {
  it("soma o intervalo de cada periodicidade à data do último diagnóstico", () => {
    const base = { factorCreatedAt: CREATED, lastReferenceDate: "2026-01-31" };
    expect(nextDiagnosisDate({ ...base, periodicity: "monthly" })).toBe("2026-02-28");
    expect(nextDiagnosisDate({ ...base, periodicity: "quarterly" })).toBe("2026-04-30");
    expect(nextDiagnosisDate({ ...base, periodicity: "semiannual" })).toBe("2026-07-31");
    expect(nextDiagnosisDate({ ...base, periodicity: "annual" })).toBe("2027-01-31");
  });

  it("sem periodicidade não há vencimento", () => {
    expect(
      nextDiagnosisDate({
        periodicity: null,
        factorCreatedAt: CREATED,
        lastReferenceDate: "2026-01-31",
      }),
    ).toBeNull();
  });

  it("fator sem diagnóstico conta a partir da criação do fator", () => {
    expect(
      nextDiagnosisDate({
        periodicity: "annual",
        factorCreatedAt: CREATED,
        lastReferenceDate: null,
      }),
    ).toBe("2027-01-10");
  });
});

describe("diagnosisStatus", () => {
  const now = new Date(2026, 6, 14); // 14/07/2026

  it("classifica vencido, vence em breve e em dia", () => {
    expect(diagnosisStatus("2026-07-13", now)).toBe("overdue");
    expect(diagnosisStatus("2026-07-18", now)).toBe("due_soon"); // dentro da janela de 7 dias
    expect(diagnosisStatus("2026-07-14", now)).toBe("due_soon"); // vence hoje
    expect(diagnosisStatus("2026-08-30", now)).toBe("ok");
  });

  it("sem data de vencimento o status é 'none'", () => {
    expect(diagnosisStatus(null, now)).toBe("none");
  });

  it("respeita uma janela de 'vence em breve' customizada", () => {
    expect(diagnosisStatus("2026-07-25", now, 30)).toBe("due_soon");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/road-safety/diagnosis.test.ts`
Expected: FAIL — `Failed to resolve import ".../services/road-safety/diagnosis"`.

- [ ] **Step 3: Implementar**

Create `artifacts/api-server/src/services/road-safety/diagnosis.ts`:

```ts
/**
 * Vencimento do diagnóstico do Fator de Desempenho (ISO 39001 §6.3).
 *
 * Função pura, sem banco e sem relógio global: `now` é injetado para os testes
 * e para o provider de pendências, que já injeta o seu.
 */

export type DiagnosisPeriodicity =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type DiagnosisStatus = "none" | "ok" | "due_soon" | "overdue";

/** Meses somados à data do último diagnóstico para achar o próximo. */
export const DIAGNOSIS_PERIODICITY_MONTHS: Record<DiagnosisPeriodicity, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Parse date-only sem drift de fuso: "2026-01-31" vira 31/01 local, não UTC. */
function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toDateOnly(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Soma meses preservando o fim do mês: 31/01 + 1 mês = 28/02 (ou 29 em bissexto),
 * não 03/03 como o overflow nativo de Date faria.
 */
function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));
  return result;
}

function isDiagnosisPeriodicity(v: string | null): v is DiagnosisPeriodicity {
  return v !== null && v in DIAGNOSIS_PERIODICITY_MONTHS;
}

/**
 * Data do próximo diagnóstico. Null quando o fator não tem revisão programada.
 * Sem diagnóstico registrado, a contagem começa na criação do fator — um fator
 * criado hoje com revisão anual vence daqui a um ano, não imediatamente.
 */
export function nextDiagnosisDate(input: {
  periodicity: string | null;
  factorCreatedAt: Date;
  lastReferenceDate: string | null;
}): string | null {
  if (!isDiagnosisPeriodicity(input.periodicity)) return null;
  const base =
    (input.lastReferenceDate ? parseDateOnly(input.lastReferenceDate) : null) ??
    input.factorCreatedAt;
  const months = DIAGNOSIS_PERIODICITY_MONTHS[input.periodicity];
  return toDateOnly(addMonths(base, months));
}

/** Vencido / vence em breve (janela de `dueSoonDays`) / em dia. */
export function diagnosisStatus(
  nextDate: string | null,
  now: Date,
  dueSoonDays = 7,
): DiagnosisStatus {
  if (!nextDate) return "none";
  const next = parseDateOnly(nextDate);
  if (!next) return "none";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next.getTime() < today.getTime()) return "overdue";
  const limit = new Date(today);
  limit.setDate(limit.getDate() + dueSoonDays);
  return next.getTime() <= limit.getTime() ? "due_soon" : "ok";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/road-safety/diagnosis.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/road-safety/diagnosis.ts artifacts/api-server/tests/services/road-safety/diagnosis.test.ts
git commit -m "feat(road-safety): regra de vencimento do diagnóstico (função pura + testes)"
```

---

### Task 3: Contrato OpenAPI + codegen

O contrato é a fonte da verdade: sem isso, o front não tem tipos nem hooks. Também é aqui que `currentDiagnosis` finalmente entra no contrato — hoje a rota lê o campo direto de `req.body` porque ele nunca foi especificado.

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (paths perto da linha 9773, schemas perto da 11250)
- Regenerate: `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/` (nunca à mão)

**Interfaces:**
- Consumes: Task 2 (`DiagnosisStatus` — os mesmos quatro valores no enum do contrato).
- Produces: tipos `RoadSafetyFactorDiagnosis`, `CreateRoadSafetyDiagnosisBody`; hooks `useListRoadSafetyDiagnoses`, `useCreateRoadSafetyDiagnosis`; query key `getListRoadSafetyDiagnosesQueryKey`; campos novos em `RoadSafetyFactor`.

- [ ] **Step 1: Adicionar os paths**

Em `lib/api-spec/openapi.yaml`, logo após o bloco `/organizations/{orgId}/road-safety/factors/{factorId}/measurements` (termina na linha ~9772):

```yaml
  /organizations/{orgId}/road-safety/factors/{factorId}/diagnoses:
    get:
      operationId: listRoadSafetyDiagnoses
      tags: [road-safety]
      summary: List the append-only diagnosis history of a factor
      parameters:
        - name: orgId
          in: path
          required: true
          schema:
            type: integer
        - name: factorId
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: Diagnosis history, most recent first
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/RoadSafetyFactorDiagnosis"
    post:
      operationId: createRoadSafetyDiagnosis
      tags: [road-safety]
      summary: Register a new diagnosis (append-only; author is the logged-in user)
      parameters:
        - name: orgId
          in: path
          required: true
          schema:
            type: integer
        - name: factorId
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateRoadSafetyDiagnosisBody"
      responses:
        "201":
          description: Diagnosis created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RoadSafetyFactorDiagnosis"
```

- [ ] **Step 2: Adicionar os schemas novos**

Depois do schema `RoadSafetyMeasurement` (termina perto da linha 11390):

```yaml
    RoadSafetyFactorDiagnosis:
      type: object
      properties:
        id:
          type: integer
        organizationId:
          type: integer
        factorId:
          type: integer
        content:
          type: string
        referenceDate:
          type: string
          description: Date-only (YYYY-MM-DD) the diagnosis refers to.
        diagnosedByUserId:
          type: integer
          nullable: true
          description: Null = migrated record (original author unknown) or removed user.
        diagnosedByUserName:
          type: string
          nullable: true
        createdAt:
          type: string
        updatedAt:
          type: string
      required:
        - id
        - organizationId
        - factorId
        - content
        - referenceDate
        - createdAt
        - updatedAt

    CreateRoadSafetyDiagnosisBody:
      type: object
      properties:
        content:
          type: string
          minLength: 1
        referenceDate:
          type: string
          description: Date-only (YYYY-MM-DD). Defaults to today on the client.
      required:
        - content
        - referenceDate
```

- [ ] **Step 3: Estender o schema `RoadSafetyFactor` (leitura)**

Dentro de `RoadSafetyFactor.properties` (perto da linha 11295, junto de `kpiIndicatorId`):

```yaml
        currentDiagnosis:
          type: string
          nullable: true
          description: Computed — text of the most recent diagnosis. Read-only; write via the diagnoses endpoint.
        diagnosisPeriodicity:
          type: string
          nullable: true
          enum: [monthly, quarterly, semiannual, annual]
          description: Review cadence of the diagnosis. Null = no scheduled review (never due, no pendencia).
        lastDiagnosis:
          nullable: true
          allOf:
            - $ref: "#/components/schemas/RoadSafetyFactorDiagnosis"
        nextDiagnosisDate:
          type: string
          nullable: true
          description: Computed — last diagnosis (or factor creation) + periodicity.
        diagnosisStatus:
          type: string
          enum: [none, ok, due_soon, overdue]
          description: Computed — none when there is no scheduled review.
```

E acrescente `diagnosisStatus` à lista `required` do `RoadSafetyFactor`.

- [ ] **Step 4: Bodies de escrita**

No `CreateRoadSafetyFactorBody`, adicione as propriedades:

```yaml
        diagnosisPeriodicity:
          type: string
          nullable: true
          enum: [monthly, quarterly, semiannual, annual]
        initialDiagnosis:
          type: string
          nullable: true
          description: Optional. When present, creates the first diagnosis record (author = logged-in user, reference date = today).
```

No `UpdateRoadSafetyFactorBody`, adicione **apenas**:

```yaml
        diagnosisPeriodicity:
          type: string
          nullable: true
          enum: [monthly, quarterly, semiannual, annual]
```

`currentDiagnosis` **não entra em nenhum dos dois bodies** — a única porta de escrita é o endpoint de diagnóstico.

- [ ] **Step 5: Rodar o codegen**

Run:
```bash
pnpm --filter @workspace/api-spec codegen
pnpm typecheck
```
Expected: codegen sem erro. O `typecheck` **vai falhar** em `artifacts/api-server/src/routes/road-safety/index.ts` e no front, porque o código ainda escreve `currentDiagnosis` — isso é esperado e será resolvido nas Tasks 4 e 7. Se quiser confirmar que só isso quebrou:

Run: `pnpm typecheck 2>&1 | grep -c "currentDiagnosis"`
Expected: um número > 0, e nenhum erro de outra natureza.

- [ ] **Step 6: Verificar os tipos gerados**

Run: `grep -rl "RoadSafetyFactorDiagnosis\|createRoadSafetyDiagnosis" lib/api-zod/src/generated lib/api-client-react/src/generated | head`
Expected: arquivos novos listados.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(road-safety): contrato do diagnóstico do FD (OpenAPI + codegen)"
```

---

### Task 4: Backend — endpoints, derivação e fechamento da escrita

**Files:**
- Modify: `artifacts/api-server/src/routes/road-safety/index.ts`
- Create: `artifacts/api-server/tests/routes/road-safety-diagnosis.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 (`roadSafetyFactorDiagnosesTable`), Task 2 (`nextDiagnosisDate`, `diagnosisStatus`), Task 3 (`CreateRoadSafetyDiagnosisBody`, `ListRoadSafetyDiagnosesParams`, `CreateRoadSafetyDiagnosisParams`).
- Produces: `GET`/`POST .../factors/:factorId/diagnoses`; campos `currentDiagnosis` (derivado), `diagnosisPeriodicity`, `lastDiagnosis`, `nextDiagnosisDate`, `diagnosisStatus` no payload do fator.

- [ ] **Step 1: Escrever os testes de integração que falham**

Create `artifacts/api-server/tests/routes/road-safety-diagnosis.integration.test.ts`:

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

async function createFactor(
  context: TestOrgContext,
  body: Record<string, unknown> = {},
): Promise<number> {
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/road-safety/factors`)
    .set(authHeader(context))
    .send({ type: "intermediate", name: `Fator ${context.prefix}`, ...body });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("Road safety: diagnóstico do fator", () => {
  it("carimba o autor do servidor e ignora autor enviado no corpo", async () => {
    const context = await createTestContext({ seed: "rs-diag-author" });
    contexts.push(context);
    const factorId = await createFactor(context);

    const res = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`,
      )
      .set(authHeader(context))
      .send({
        content: "Frota com idade média de 6,2 anos.",
        referenceDate: "2026-07-14",
        diagnosedByUserId: 99999, // deve ser ignorado
      });

    expect(res.status).toBe(201);
    expect(res.body.diagnosedByUserId).toBe(context.userId);
    expect(res.body.content).toBe("Frota com idade média de 6,2 anos.");
    expect(res.body.referenceDate).toBe("2026-07-14");
  });

  it("devolve o histórico do mais recente para o mais antigo, com o nome do autor", async () => {
    const context = await createTestContext({ seed: "rs-diag-hist" });
    contexts.push(context);
    const factorId = await createFactor(context);
    const url = `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`;

    for (const [content, referenceDate] of [
      ["Diagnóstico antigo", "2025-01-10"],
      ["Diagnóstico recente", "2026-07-01"],
    ]) {
      const created = await request(app)
        .post(url)
        .set(authHeader(context))
        .send({ content, referenceDate });
      expect(created.status).toBe(201);
    }

    const res = await request(app).get(url).set(authHeader(context));
    expect(res.status).toBe(200);
    expect(res.body.map((d: { content: string }) => d.content)).toEqual([
      "Diagnóstico recente",
      "Diagnóstico antigo",
    ]);
    expect(res.body[0].diagnosedByUserName).toBeTruthy();
  });

  it("deriva currentDiagnosis, lastDiagnosis e o vencimento do histórico", async () => {
    const context = await createTestContext({ seed: "rs-diag-derive" });
    contexts.push(context);
    const factorId = await createFactor(context, { diagnosisPeriodicity: "annual" });

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`,
      )
      .set(authHeader(context))
      .send({ content: "Estado atual do fator", referenceDate: "2026-01-31" });

    const res = await request(app)
      .get(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`)
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body.currentDiagnosis).toBe("Estado atual do fator");
    expect(res.body.lastDiagnosis.content).toBe("Estado atual do fator");
    expect(res.body.lastDiagnosis.referenceDate).toBe("2026-01-31");
    expect(res.body.nextDiagnosisDate).toBe("2027-01-31");
    expect(res.body.diagnosisStatus).toBe("ok");
  });

  it("fator sem periodicidade não vence", async () => {
    const context = await createTestContext({ seed: "rs-diag-none" });
    contexts.push(context);
    const factorId = await createFactor(context);

    const res = await request(app)
      .get(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`)
      .set(authHeader(context));

    expect(res.body.nextDiagnosisDate).toBeNull();
    expect(res.body.diagnosisStatus).toBe("none");
  });

  it("cria o primeiro diagnóstico junto com o fator quando initialDiagnosis vem preenchido", async () => {
    const context = await createTestContext({ seed: "rs-diag-initial" });
    contexts.push(context);
    const factorId = await createFactor(context, {
      initialDiagnosis: "Diagnóstico inicial",
      diagnosisPeriodicity: "monthly",
    });

    const res = await request(app)
      .get(
        `/api/organizations/${context.organizationId}/road-safety/factors/${factorId}/diagnoses`,
      )
      .set(authHeader(context));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].content).toBe("Diagnóstico inicial");
    expect(res.body[0].diagnosedByUserId).toBe(context.userId);
  });

  it("PATCH do fator não escreve mais no diagnóstico", async () => {
    const context = await createTestContext({ seed: "rs-diag-readonly" });
    contexts.push(context);
    const factorId = await createFactor(context, { initialDiagnosis: "Original" });

    const patch = await request(app)
      .patch(`/api/organizations/${context.organizationId}/road-safety/factors/${factorId}`)
      .set(authHeader(context))
      .send({ currentDiagnosis: "Tentativa de sobrescrita", analysis: "nova análise" });

    expect(patch.status).toBe(200);
    expect(patch.body.currentDiagnosis).toBe("Original");
    expect(patch.body.analysis).toBe("nova análise");
  });

  it("fator de outra organização devolve 404", async () => {
    const a = await createTestContext({ seed: "rs-diag-org-a" });
    const b = await createTestContext({ seed: "rs-diag-org-b" });
    contexts.push(a, b);
    const factorId = await createFactor(a);

    const res = await request(app)
      .get(`/api/organizations/${b.organizationId}/road-safety/factors/${factorId}/diagnoses`)
      .set(authHeader(b));

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/road-safety-diagnosis.integration.test.ts`
Expected: FAIL — 404 nos endpoints de diagnoses (rota inexistente) e campos ausentes no payload do fator.

- [ ] **Step 3: Serializar o diagnóstico e estender o fator**

Em `artifacts/api-server/src/routes/road-safety/index.ts`, adicione aos imports:

```ts
import {
  db,
  kpiIndicatorsTable,
  roadSafetyFactorDiagnosesTable,
  roadSafetyFactorMeasurementsTable,
  roadSafetyFactorsTable,
  usersTable,
} from "@workspace/db";
import {
  CreateRoadSafetyDiagnosisBody,
  CreateRoadSafetyDiagnosisParams,
  CreateRoadSafetyFactorBody,
  // … os demais que já estão lá
  ListRoadSafetyDiagnosesParams,
} from "@workspace/api-zod";
import {
  diagnosisStatus,
  nextDiagnosisDate,
} from "../../services/road-safety/diagnosis";
```

Depois de `serializeMeasurement`, acrescente:

```ts
type DiagnosisRow = typeof roadSafetyFactorDiagnosesTable.$inferSelect;

/** Último diagnóstico do fator + nome do autor, quando houver. */
type LastDiagnosis = { row: DiagnosisRow; authorName: string | null } | null;

function serializeDiagnosis(r: DiagnosisRow, diagnosedByUserName: string | null) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    factorId: r.factorId,
    content: r.content,
    referenceDate: r.referenceDate,
    diagnosedByUserId: r.diagnosedByUserId ?? null,
    diagnosedByUserName,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
```

Altere a assinatura de `serializeFactor` para receber o último diagnóstico e derivar os campos computados:

```ts
function serializeFactor(
  r: FactorRow,
  responsibleUserName: string | null,
  agg: MeasurementAggregate,
  lastDiagnosis: LastDiagnosis = null,
  now: Date = new Date(),
) {
  const last = lastDiagnosis?.row ?? null;
  const nextDate = nextDiagnosisDate({
    periodicity: r.diagnosisPeriodicity ?? null,
    factorCreatedAt: r.createdAt,
    lastReferenceDate: last?.referenceDate ?? null,
  });
  return {
    id: r.id,
    // … todos os campos que já existiam, sem mudança, exceto currentDiagnosis:
    // `currentDiagnosis` agora é DERIVADO do histórico — a coluna vira legado.
    currentDiagnosis: last?.content ?? null,
    diagnosisPeriodicity: r.diagnosisPeriodicity ?? null,
    lastDiagnosis: last
      ? serializeDiagnosis(last, lastDiagnosis?.authorName ?? null)
      : null,
    nextDiagnosisDate: nextDate,
    diagnosisStatus: diagnosisStatus(nextDate, now),
    // … latestValue, createdAt, updatedAt etc. seguem iguais
  };
}
```

Mantenha todos os outros campos do `serializeFactor` como estão — só `currentDiagnosis` muda de origem (da coluna para o histórico) e os quatro campos novos entram.

- [ ] **Step 4: Buscar o último diagnóstico sem N+1**

Ainda em `index.ts`, um helper que resolve os últimos diagnósticos de vários fatores em **duas** queries (a lista e os autores), nunca uma por fator:

```ts
/**
 * Último diagnóstico de cada fator. Uma query só: ordena por (factor, data, id)
 * e fica com o primeiro de cada fator — sem N+1 na listagem do painel.
 */
async function lastDiagnosisByFactor(
  factorIds: number[],
): Promise<Map<number, { row: DiagnosisRow; authorName: string | null }>> {
  const byFactor = new Map<number, { row: DiagnosisRow; authorName: string | null }>();
  if (factorIds.length === 0) return byFactor;

  const rows = await db
    .select({
      diagnosis: roadSafetyFactorDiagnosesTable,
      authorName: usersTable.name,
    })
    .from(roadSafetyFactorDiagnosesTable)
    .leftJoin(
      usersTable,
      eq(usersTable.id, roadSafetyFactorDiagnosesTable.diagnosedByUserId),
    )
    .where(inArray(roadSafetyFactorDiagnosesTable.factorId, factorIds))
    .orderBy(
      asc(roadSafetyFactorDiagnosesTable.factorId),
      desc(roadSafetyFactorDiagnosesTable.referenceDate),
      desc(roadSafetyFactorDiagnosesTable.id),
    );

  for (const r of rows) {
    // A ordenação garante que o primeiro de cada fator é o mais recente;
    // empate de data desempata por id (o último inserido vale).
    if (!byFactor.has(r.diagnosis.factorId)) {
      byFactor.set(r.diagnosis.factorId, {
        row: r.diagnosis,
        authorName: r.authorName ?? null,
      });
    }
  }
  return byFactor;
}
```

Use-o nas três rotas que serializam fator:
- `GET /factors`: `const lastByFactor = await lastDiagnosisByFactor(factorIds);` e passe `lastByFactor.get(r.factor.id) ?? null` para `serializeFactor`.
- `GET /factors/:factorId` e `PATCH /factors/:factorId`: `const lastByFactor = await lastDiagnosisByFactor([row.id]);` e passe `lastByFactor.get(row.id) ?? null`.
- `POST /factors`: passa o registro recém-criado (Step 6) ou `null`.

- [ ] **Step 5: Fechar a escrita de `currentDiagnosis` e aceitar `diagnosisPeriodicity`**

No `POST /factors`, **remova** o bloco que lia `req.body.currentDiagnosis` (linhas ~226-231) e troque por:

```ts
        diagnosisPeriodicity: body.data.diagnosisPeriodicity ?? null,
```

No `PATCH /factors/:factorId`, **remova** o bloco `if (req.body && "currentDiagnosis" in req.body) { … }` (linhas ~309-314) e adicione, junto dos outros campos:

```ts
    if (d.diagnosisPeriodicity !== undefined)
      updateData.diagnosisPeriodicity = d.diagnosisPeriodicity;
```

- [ ] **Step 6: `initialDiagnosis` na criação do fator**

Ainda no `POST /factors`, depois do `.returning()` que cria o fator:

```ts
    const initial = body.data.initialDiagnosis?.trim();
    let lastDiagnosis: LastDiagnosis = null;
    if (initial) {
      const [diagRow] = await db
        .insert(roadSafetyFactorDiagnosesTable)
        .values({
          organizationId: params.data.orgId,
          factorId: row.id,
          content: initial,
          referenceDate: todayDateOnly(),
          diagnosedByUserId: req.auth!.userId,
        })
        .returning();
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, req.auth!.userId));
      lastDiagnosis = { row: diagRow, authorName: u?.name ?? null };
    }

    res.status(201).json(
      serializeFactor(row, null, EMPTY_AGGREGATE, lastDiagnosis),
    );
```

E o helper, junto dos outros no topo do arquivo:

```ts
/** Hoje em date-only local — a data de referência padrão do diagnóstico inicial. */
function todayDateOnly(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
```

- [ ] **Step 7: Os dois endpoints de diagnóstico**

No fim da seção de rotas, antes dos helpers `resolveResponsible`/`resolveIndicatorLink`:

```ts
// ─── Diagnoses (append-only history) ─────────────────────────────────────────

router.get(
  "/organizations/:orgId/road-safety/factors/:factorId/diagnoses",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListRoadSafetyDiagnosesParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const [factor] = await db
      .select({ id: roadSafetyFactorsTable.id })
      .from(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.id, params.data.factorId),
          eq(roadSafetyFactorsTable.organizationId, params.data.orgId),
        ),
      );
    if (!factor) { res.status(404).json({ error: "Fator não encontrado" }); return; }

    const rows = await db
      .select({
        diagnosis: roadSafetyFactorDiagnosesTable,
        diagnosedByUserName: usersTable.name,
      })
      .from(roadSafetyFactorDiagnosesTable)
      .leftJoin(
        usersTable,
        eq(usersTable.id, roadSafetyFactorDiagnosesTable.diagnosedByUserId),
      )
      .where(
        and(
          eq(roadSafetyFactorDiagnosesTable.factorId, params.data.factorId),
          eq(roadSafetyFactorDiagnosesTable.organizationId, params.data.orgId),
        ),
      )
      .orderBy(
        desc(roadSafetyFactorDiagnosesTable.referenceDate),
        desc(roadSafetyFactorDiagnosesTable.id),
      );

    res.json(
      rows.map((r) => serializeDiagnosis(r.diagnosis, r.diagnosedByUserName ?? null)),
    );
  },
);

router.post(
  "/organizations/:orgId/road-safety/factors/:factorId/diagnoses",
  requireAuth,
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = CreateRoadSafetyDiagnosisParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
    if (params.data.orgId !== req.auth!.organizationId) { res.status(403).json({ error: "Acesso negado" }); return; }

    const body = CreateRoadSafetyDiagnosisBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

    const content = body.data.content.trim();
    if (!content) { res.status(400).json({ error: "O diagnóstico não pode ser vazio" }); return; }

    const [factor] = await db
      .select({ id: roadSafetyFactorsTable.id })
      .from(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.id, params.data.factorId),
          eq(roadSafetyFactorsTable.organizationId, params.data.orgId),
        ),
      );
    if (!factor) { res.status(404).json({ error: "Fator não encontrado" }); return; }

    // O autor é sempre o usuário logado: nada que venha no corpo é considerado.
    const [row] = await db
      .insert(roadSafetyFactorDiagnosesTable)
      .values({
        organizationId: params.data.orgId,
        factorId: params.data.factorId,
        content,
        referenceDate: body.data.referenceDate,
        diagnosedByUserId: req.auth!.userId,
      })
      .returning();

    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId));

    res.status(201).json(serializeDiagnosis(row, u?.name ?? null));
  },
);
```

Não existe PUT nem DELETE de diagnóstico — append-only, por decisão de desenho.

- [ ] **Step 8: Rodar os testes e o typecheck**

Run:
```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/road-safety-diagnosis.integration.test.ts
pnpm typecheck
```
Expected: 7 testes PASS. O typecheck ainda pode falhar **no front** (`cadastro.tsx` escreve `currentDiagnosis`) — resolvido na Task 7. Nenhum erro deve restar em `artifacts/api-server`.

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/routes/road-safety/index.ts artifacts/api-server/tests/routes/road-safety-diagnosis.integration.test.ts
git commit -m "feat(road-safety): endpoints de diagnóstico (append-only) + derivação do vencimento"
```

---

### Task 5: Provider de pendências

**Files:**
- Modify: `artifacts/api-server/src/services/pendencias/types.ts`
- Modify: `artifacts/api-server/src/services/pendencias/registry.ts`
- Create: `artifacts/api-server/src/services/pendencias/providers/road-safety-diagnosis.ts`
- Create: `artifacts/api-server/tests/services/pendencias/road-safety-diagnosis.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 (tabelas), Task 2 (`nextDiagnosisDate`, `diagnosisStatus`), contrato `PendenciaProvider` existente.
- Produces: `roadSafetyDiagnosisPendenciaProvider` registrado; `PendenciaSource` ganha `"road_safety_diagnosis"`.

- [ ] **Step 1: Escrever o teste de integração que falha**

Create `artifacts/api-server/tests/services/pendencias/road-safety-diagnosis.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, roadSafetyFactorsTable } from "@workspace/db";
import { roadSafetyDiagnosisPendenciaProvider } from "../../../src/services/pendencias/providers/road-safety-diagnosis";
import {
  cleanupTestContext,
  createTestContext,
  type TestOrgContext,
} from "../../../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

async function insertFactor(
  context: TestOrgContext,
  values: { code: string; diagnosisPeriodicity: string | null; responsibleUserId: number | null },
) {
  const [row] = await db
    .insert(roadSafetyFactorsTable)
    .values({
      organizationId: context.organizationId,
      code: values.code,
      type: "intermediate",
      name: `FATOR ${values.code}`,
      periodicity: "monthly",
      diagnosisPeriodicity: values.diagnosisPeriodicity,
      responsibleUserId: values.responsibleUserId,
      // criado há muito tempo: sem diagnóstico, já venceu
      createdAt: new Date(2024, 0, 10),
    })
    .returning();
  return row;
}

describe("Pendências: diagnóstico de fator de desempenho", () => {
  it("cobra o responsável quando o diagnóstico está vencido", async () => {
    const context = await createTestContext({ seed: "pend-diag-overdue" });
    contexts.push(context);
    const factor = await insertFactor(context, {
      code: "FD01",
      diagnosisPeriodicity: "annual",
      responsibleUserId: context.userId,
    });

    const pendencias = await roadSafetyDiagnosisPendenciaProvider.listPending({
      orgId: context.organizationId,
      responsibleUserIds: [context.userId],
      now: new Date(2026, 6, 14),
      dueSoonDays: 7,
    });

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0].id).toBe(`road_safety_diagnosis:${factor.id}`);
    expect(pendencias[0].urgency).toBe("overdue");
    expect(pendencias[0].responsibleUserId).toBe(context.userId);
    expect(pendencias[0].title).toContain("FD01");
    expect(pendencias[0].dueDate).toBe("2025-01-10");
  });

  it("ignora fator sem periodicidade de diagnóstico", async () => {
    const context = await createTestContext({ seed: "pend-diag-noperiod" });
    contexts.push(context);
    await insertFactor(context, {
      code: "FD02",
      diagnosisPeriodicity: null,
      responsibleUserId: context.userId,
    });

    const pendencias = await roadSafetyDiagnosisPendenciaProvider.listPending({
      orgId: context.organizationId,
      responsibleUserIds: [context.userId],
      now: new Date(2026, 6, 14),
      dueSoonDays: 7,
    });

    expect(pendencias).toHaveLength(0);
  });

  it("ignora fator sem responsável (não há a quem cobrar)", async () => {
    const context = await createTestContext({ seed: "pend-diag-noresp" });
    contexts.push(context);
    await insertFactor(context, {
      code: "FD03",
      diagnosisPeriodicity: "annual",
      responsibleUserId: null,
    });

    const pendencias = await roadSafetyDiagnosisPendenciaProvider.listPending({
      orgId: context.organizationId,
      responsibleUserIds: [context.userId],
      now: new Date(2026, 6, 14),
      dueSoonDays: 7,
    });

    expect(pendencias).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/road-safety-diagnosis.integration.test.ts`
Expected: FAIL — módulo `providers/road-safety-diagnosis` não existe.

- [ ] **Step 3: Registrar a fonte nova no contrato**

Em `artifacts/api-server/src/services/pendencias/types.ts`:

```ts
export type PendenciaSource =
  | "kpi"
  | "action_plan"
  | "nonconformity"
  | "regulatory_document"
  | "road_safety_diagnosis";
```

E em `SOURCE_LABELS`:

```ts
export const SOURCE_LABELS: Record<PendenciaSource, string> = {
  kpi: "Indicador",
  action_plan: "Plano de ação",
  nonconformity: "Não conformidade",
  regulatory_document: "Documento regulatório",
  road_safety_diagnosis: "Diagnóstico de fator",
};
```

- [ ] **Step 4: Implementar o provider**

Create `artifacts/api-server/src/services/pendencias/providers/road-safety-diagnosis.ts`:

```ts
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, roadSafetyFactorDiagnosesTable, roadSafetyFactorsTable } from "@workspace/db";
import {
  diagnosisStatus,
  nextDiagnosisDate,
} from "../../road-safety/diagnosis";
import {
  SOURCE_LABELS,
  type Pendencia,
  type PendenciaProvider,
  type PendenciaProviderContext,
} from "../types";

/**
 * Cobra a revisão do diagnóstico do Fator de Desempenho (ISO 39001 §6.3).
 * Fator sem periodicidade de diagnóstico não vence; fator sem responsável não
 * tem a quem cobrar — os dois casos ficam de fora.
 */
export const roadSafetyDiagnosisPendenciaProvider: PendenciaProvider = {
  source: "road_safety_diagnosis",
  async listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]> {
    if (ctx.responsibleUserIds.length === 0) return [];

    const factors = await db
      .select({
        id: roadSafetyFactorsTable.id,
        code: roadSafetyFactorsTable.code,
        name: roadSafetyFactorsTable.name,
        createdAt: roadSafetyFactorsTable.createdAt,
        diagnosisPeriodicity: roadSafetyFactorsTable.diagnosisPeriodicity,
        responsibleUserId: roadSafetyFactorsTable.responsibleUserId,
      })
      .from(roadSafetyFactorsTable)
      .where(
        and(
          eq(roadSafetyFactorsTable.organizationId, ctx.orgId),
          isNotNull(roadSafetyFactorsTable.diagnosisPeriodicity),
          isNotNull(roadSafetyFactorsTable.responsibleUserId),
          inArray(roadSafetyFactorsTable.responsibleUserId, ctx.responsibleUserIds),
        ),
      );
    if (factors.length === 0) return [];

    const diagnoses = await db
      .select({
        factorId: roadSafetyFactorDiagnosesTable.factorId,
        referenceDate: roadSafetyFactorDiagnosesTable.referenceDate,
      })
      .from(roadSafetyFactorDiagnosesTable)
      .where(
        inArray(
          roadSafetyFactorDiagnosesTable.factorId,
          factors.map((f) => f.id),
        ),
      );

    /** Data do diagnóstico mais recente de cada fator (string date-only ordena lexicograficamente). */
    const latestByFactor = new Map<number, string>();
    for (const d of diagnoses) {
      const current = latestByFactor.get(d.factorId);
      if (!current || d.referenceDate > current) {
        latestByFactor.set(d.factorId, d.referenceDate);
      }
    }

    const pendencias: Pendencia[] = [];
    for (const f of factors) {
      const dueDate = nextDiagnosisDate({
        periodicity: f.diagnosisPeriodicity,
        factorCreatedAt: f.createdAt,
        lastReferenceDate: latestByFactor.get(f.id) ?? null,
      });
      const status = diagnosisStatus(dueDate, ctx.now, ctx.dueSoonDays);
      if (status !== "overdue" && status !== "due_soon") continue;

      pendencias.push({
        id: `road_safety_diagnosis:${f.id}`,
        source: "road_safety_diagnosis",
        sourceLabel: SOURCE_LABELS.road_safety_diagnosis,
        title: `Diagnóstico do ${f.code} — ${f.name}`,
        statusLabel: status === "overdue" ? "Vencido" : "A vencer",
        dueDate,
        urgency: status,
        responsibleUserId: f.responsibleUserId as number,
        link: { route: "/app/fatores-desempenho", ctaLabel: "Revisar diagnóstico" },
        meta: { factorId: f.id, code: f.code },
      });
    }
    return pendencias;
  },
};
```

- [ ] **Step 5: Registrar no registry**

Em `artifacts/api-server/src/services/pendencias/registry.ts`:

```ts
import { roadSafetyDiagnosisPendenciaProvider } from "./providers/road-safety-diagnosis";

export const pendenciaProviders: PendenciaProvider[] = [
  kpiPendenciaProvider,
  actionPlanPendenciaProvider,
  nonconformityPendenciaProvider,
  regulatoryDocumentPendenciaProvider,
  roadSafetyDiagnosisPendenciaProvider,
];
```

- [ ] **Step 6: Rodar e ver passar**

Run:
```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/services/pendencias/road-safety-diagnosis.integration.test.ts
pnpm typecheck
```
Expected: 3 testes PASS. Se o front tiver mapa exaustivo de `PendenciaSource` (ex.: rótulo/ícone por fonte), o typecheck vai apontar o caso faltante — adicione "Diagnóstico de fator" lá também.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/services/pendencias artifacts/api-server/tests/services/pendencias/road-safety-diagnosis.integration.test.ts
git commit -m "feat(road-safety): diagnóstico vencido vira pendência do responsável do fator"
```

---

### Task 6: Client do front (tipos, rótulos e hooks)

**Files:**
- Modify: `artifacts/web/src/lib/road-safety-client.ts`
- Create: `artifacts/web/tests/lib/road-safety-diagnosis.unit.test.ts`

**Interfaces:**
- Consumes: Task 3 (hooks e tipos gerados).
- Produces: `DIAGNOSIS_PERIODICITY_LABELS`, `DiagnosisStatus`, `diagnosisBadgeLabel`, `useRoadSafetyDiagnoses`, `useCreateDiagnosisWithInvalidation`, `todayDateOnly`.

- [ ] **Step 1: Escrever os testes que falham**

Create `artifacts/web/tests/lib/road-safety-diagnosis.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_PERIODICITY_LABELS,
  diagnosisBadgeLabel,
} from "@/lib/road-safety-client";

describe("diagnosisBadgeLabel", () => {
  const now = new Date(2026, 6, 14); // 14/07/2026

  it("sem revisão programada mostra travessão", () => {
    expect(diagnosisBadgeLabel("none", null, now)).toBe("—");
  });

  it("vencido mostra 'Vencido'", () => {
    expect(diagnosisBadgeLabel("overdue", "2026-07-01", now)).toBe("Vencido");
  });

  it("a vencer mostra a contagem de dias", () => {
    expect(diagnosisBadgeLabel("due_soon", "2026-07-18", now)).toBe("Vence em 4 dias");
    expect(diagnosisBadgeLabel("due_soon", "2026-07-15", now)).toBe("Vence em 1 dia");
    expect(diagnosisBadgeLabel("due_soon", "2026-07-14", now)).toBe("Vence hoje");
  });

  it("em dia mostra a data do próximo", () => {
    expect(diagnosisBadgeLabel("ok", "2027-01-31", now)).toBe("Próximo em 31/01/2027");
  });
});

describe("DIAGNOSIS_PERIODICITY_LABELS", () => {
  it("tem rótulo em PT-BR para as quatro cadências", () => {
    expect(DIAGNOSIS_PERIODICITY_LABELS.monthly).toBe("Mensal");
    expect(DIAGNOSIS_PERIODICITY_LABELS.quarterly).toBe("Trimestral");
    expect(DIAGNOSIS_PERIODICITY_LABELS.semiannual).toBe("Semestral");
    expect(DIAGNOSIS_PERIODICITY_LABELS.annual).toBe("Anual");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/road-safety-diagnosis.unit.test.ts`
Expected: FAIL — `diagnosisBadgeLabel` não é exportado.

- [ ] **Step 3: Implementar no client**

Em `artifacts/web/src/lib/road-safety-client.ts`, **remova** o `export type WithCurrentDiagnosis` (linha ~33) e o comentário que o acompanha — o campo agora está no contrato gerado. Adicione aos imports gerados:

```ts
import {
  getListRoadSafetyDiagnosesQueryKey,
  getListRoadSafetyFactorsQueryKey,
  getListRoadSafetyMeasurementsQueryKey,
  useCreateRoadSafetyDiagnosis,
  useListRoadSafetyDiagnoses,
  // … os que já existiam
  type CreateRoadSafetyDiagnosisBody,
  type RoadSafetyFactorDiagnosis,
} from "@workspace/api-client-react";

export type {
  CreateRoadSafetyDiagnosisBody,
  RoadSafetyFactorDiagnosis,
  // … os que já existiam
};
```

E acrescente:

```ts
// ─── Diagnóstico do fator ────────────────────────────────────────────────────

export type DiagnosisPeriodicity = Periodicity;
export const DIAGNOSIS_PERIODICITIES: DiagnosisPeriodicity[] = [...PERIODICITIES];

export const DIAGNOSIS_PERIODICITY_LABELS: Record<DiagnosisPeriodicity, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export type DiagnosisStatus = "none" | "ok" | "due_soon" | "overdue";

/** Hoje em "YYYY-MM-DD" local — padrão da data de referência no diálogo. */
export function todayDateOnly(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "31/01/2027" a partir de "2027-01-31". */
export function formatDateOnly(value: string): string {
  const d = parseDateOnly(value);
  if (!d) return value;
  return d.toLocaleDateString("pt-BR");
}

/** Texto do badge de vencimento do diagnóstico no painel e na ficha. */
export function diagnosisBadgeLabel(
  status: DiagnosisStatus,
  nextDate: string | null,
  now: Date = new Date(),
): string {
  if (status === "none" || !nextDate) return "—";
  if (status === "overdue") return "Vencido";
  if (status === "ok") return `Próximo em ${formatDateOnly(nextDate)}`;
  const next = parseDateOnly(nextDate);
  if (!next) return "A vencer";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return "Vence hoje";
  return days === 1 ? "Vence em 1 dia" : `Vence em ${days} dias`;
}

// ─── Hooks do diagnóstico ────────────────────────────────────────────────────

export function useRoadSafetyDiagnoses(
  orgId: number,
  factorId: number,
  enabled = true,
) {
  return useListRoadSafetyDiagnoses(orgId, factorId, {
    query: {
      queryKey: getListRoadSafetyDiagnosesQueryKey(orgId, factorId),
      enabled: enabled && factorId > 0,
    },
  });
}

export function useCreateDiagnosisWithInvalidation(orgId: number) {
  const queryClient = useQueryClient();
  return useCreateRoadSafetyDiagnosis({
    mutation: {
      onSuccess: (_data, variables) => {
        // O painel mostra status de vencimento derivado do histórico: os dois
        // caches precisam cair juntos, senão o badge fica mentindo até o reload.
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyFactorsQueryKey(orgId),
        });
        queryClient.invalidateQueries({
          queryKey: getListRoadSafetyDiagnosesQueryKey(orgId, variables.factorId),
        });
      },
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/road-safety-diagnosis.unit.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/lib/road-safety-client.ts artifacts/web/tests/lib/road-safety-diagnosis.unit.test.ts
git commit -m "feat(road-safety): client do diagnóstico (rótulos, badge e hooks)"
```

---

### Task 7: Ficha do fator — periodicidade, card somente-leitura, diálogo e histórico

O textarea livre morre aqui. Na criação vira "Diagnóstico inicial"; na edição vira card + diálogo.

**Files:**
- Create: `artifacts/web/src/pages/app/road-safety/_components/diagnostico.tsx`
- Modify: `artifacts/web/src/pages/app/road-safety/_components/cadastro.tsx:349-355` (o `Field` de "Diagnóstico atual") e o estado do form
- Modify: `artifacts/web/src/pages/app/road-safety/_components/badges.tsx`

**Interfaces:**
- Consumes: Task 6 (`useRoadSafetyDiagnoses`, `useCreateDiagnosisWithInvalidation`, `diagnosisBadgeLabel`, `DIAGNOSIS_PERIODICITY_LABELS`, `todayDateOnly`, `formatDateOnly`).
- Produces: `<DiagnosisBadge status nextDate />` (badges.tsx); `<DiagnosisSection orgId factor />` (diagnostico.tsx).

- [ ] **Step 1: Badge de diagnóstico**

Em `badges.tsx`, reusando a constante `PILL` que os três badges do arquivo já compartilham (com as variantes dark, como os vizinhos):

```tsx
const DIAGNOSIS_STYLES: Record<DiagnosisStatus, string> = {
  none: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  due_soon: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

/** Vencimento do diagnóstico — e.g. "Vencido", "Vence em 4 dias". */
export function DiagnosisBadge({
  status,
  nextDate,
}: {
  status: DiagnosisStatus;
  nextDate: string | null;
}) {
  return (
    <span className={cn(PILL, DIAGNOSIS_STYLES[status])}>
      {diagnosisBadgeLabel(status, nextDate)}
    </span>
  );
}
```

Acrescente `diagnosisBadgeLabel` e `type DiagnosisStatus` ao import que o arquivo já faz de `@/lib/road-safety-client`.

- [ ] **Step 2: Seção de diagnóstico (card + diálogo + histórico)**

Create `artifacts/web/src/pages/app/road-safety/_components/diagnostico.tsx`:

```tsx
import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  formatDateOnly,
  todayDateOnly,
  useCreateDiagnosisWithInvalidation,
  useRoadSafetyDiagnoses,
  type RoadSafetyFactor,
  type RoadSafetyFactorDiagnosis,
} from "@/lib/road-safety-client";
import { DiagnosisBadge } from "./badges";

/** Autor nulo = registro migrado do texto livre antigo — não inventamos autoria. */
function authorLabel(d: RoadSafetyFactorDiagnosis): string {
  if (d.diagnosedByUserName) return d.diagnosedByUserName;
  return d.diagnosedByUserId === null
    ? "Registro anterior ao histórico — autor não registrado"
    : "Autor removido";
}

export function DiagnosisSection({
  orgId,
  factor,
}: {
  orgId: number;
  factor: RoadSafetyFactor;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [content, setContent] = useState("");
  const [referenceDate, setReferenceDate] = useState(todayDateOnly());

  const { data: history = [], isLoading } = useRoadSafetyDiagnoses(orgId, factor.id);
  const createDiagnosis = useCreateDiagnosisWithInvalidation(orgId);

  const last = factor.lastDiagnosis ?? null;

  async function submit() {
    const text = content.trim();
    if (!text) {
      toast({ title: "Escreva o diagnóstico antes de salvar", variant: "destructive" });
      return;
    }
    try {
      await createDiagnosis.mutateAsync({
        orgId,
        factorId: factor.id,
        data: { content: text, referenceDate },
      });
      toast({ title: "Diagnóstico registrado" });
      setOpen(false);
      setContent("");
      setReferenceDate(todayDateOnly());
    } catch {
      toast({ title: "Não foi possível registrar o diagnóstico", variant: "destructive" });
    }
  }

  return (
    <div className="sm:col-span-2 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Stethoscope className="h-4 w-4 text-muted-foreground" />
          Diagnóstico atual
          <DiagnosisBadge
            status={factor.diagnosisStatus}
            nextDate={factor.nextDiagnosisDate ?? null}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Registrar novo diagnóstico
        </Button>
      </div>

      {last ? (
        <div className="space-y-1">
          <p className="whitespace-pre-wrap text-[13px] text-foreground">{last.content}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatDateOnly(last.referenceDate)} · {authorLabel(last)}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Nenhum diagnóstico registrado ainda.
        </p>
      )}

      {history.length > 1 ? (
        <div>
          <button
            type="button"
            className="text-[12px] font-medium text-blue-600 hover:underline"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? "Ocultar histórico" : `Histórico (${history.length})`}
          </button>
          {showHistory ? (
            <ul className="mt-2 space-y-2 border-t border-border/60 pt-2">
              {history.map((d) => (
                <li key={d.id} className="space-y-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {formatDateOnly(d.referenceDate)} · {authorLabel(d)}
                  </p>
                  <p className="whitespace-pre-wrap text-[12px] text-foreground">
                    {d.content}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">Carregando histórico…</p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar novo diagnóstico</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase text-muted-foreground">
                Diagnóstico
              </label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Estado atual do fator — o diagnóstico que embasa a análise GUT..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase text-muted-foreground">
                Data de referência
              </label>
              <Input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              O registro é permanente: uma correção entra como um diagnóstico novo,
              assinado por você.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={createDiagnosis.isPending}>
              {createDiagnosis.isPending ? "Salvando…" : "Salvar diagnóstico"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Ligar no cadastro**

Em `cadastro.tsx`. O componente já tem `const editing = factorId !== null` (linha 156) e `factor`, o fator carregado da lista (linha 158-162, `null` enquanto carrega) — use esses dois, não crie variável nova.

1. No tipo do form, troque `currentDiagnosis: string` por:
```ts
  initialDiagnosis: string;
  diagnosisPeriodicity: "" | Periodicity;
```
2. No estado inicial (`EMPTY_FORM`), troque `currentDiagnosis: ""` por `initialDiagnosis: ""` e `diagnosisPeriodicity: ""`.
3. No `useEffect` que carrega o fator para edição (linha ~181), **remova** `currentDiagnosis: (factor as WithCurrentDiagnosis).currentDiagnosis ?? ""` e coloque:
```ts
      diagnosisPeriodicity: (factor.diagnosisPeriodicity ?? "") as "" | Periodicity,
```
4. No payload de save (linha ~223), troque `currentDiagnosis: form.currentDiagnosis || null` por:
```ts
      diagnosisPeriodicity: form.diagnosisPeriodicity || null,
      // initialDiagnosis só existe na criação — na edição o diagnóstico entra
      // pelo endpoint próprio, com autor e data.
      ...(editing ? {} : { initialDiagnosis: form.initialDiagnosis || null }),
```
5. Substitua o `<Field label="Diagnóstico atual" full>` (linhas 349-355) por:
```tsx
        {editing && factor ? (
          <DiagnosisSection orgId={orgId} factor={factor} />
        ) : (
          <Field label="Diagnóstico inicial" full>
            <Textarea
              value={form.initialDiagnosis}
              onChange={(e) => set("initialDiagnosis", e.target.value)}
              placeholder="Estado atual do fator — o diagnóstico que embasa a análise GUT..."
            />
          </Field>
        )}
        <Field label="Periodicidade do diagnóstico">
          <Select
            value={form.diagnosisPeriodicity}
            onChange={(e) =>
              set("diagnosisPeriodicity", e.target.value as "" | Periodicity)
            }
          >
            <option value="">Sem revisão programada</option>
            {DIAGNOSIS_PERIODICITIES.map((p) => (
              <option key={p} value={p}>
                {DIAGNOSIS_PERIODICITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
```
6. Importe `DiagnosisSection`, `DIAGNOSIS_PERIODICITIES` e `DIAGNOSIS_PERIODICITY_LABELS`; remova o import de `WithCurrentDiagnosis`.

- [ ] **Step 4: Typecheck e testes**

Run:
```bash
pnpm typecheck
pnpm exec vitest run --project web-unit
```
Expected: typecheck **limpo em todo o monorepo** (era aqui que ficavam os últimos erros de `currentDiagnosis`); testes web verdes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/road-safety/_components
git commit -m "feat(road-safety): ficha do fator com diagnóstico versionado (card, diálogo e histórico)"
```

---

### Task 8: Coluna de diagnóstico no painel

**Files:**
- Modify: `artifacts/web/src/pages/app/road-safety/_components/painel.tsx:155-200`

**Interfaces:**
- Consumes: Task 6 (`formatDateOnly`), Task 7 (`DiagnosisBadge`).
- Produces: coluna "Diagnóstico" na tabela de fatores.

- [ ] **Step 1: Cabeçalho da coluna**

Depois de `<TableHead>Meta</TableHead>` (linha ~161):

```tsx
                <TableHead>Diagnóstico</TableHead>
```

- [ ] **Step 2: Célula**

Depois da célula de Meta (linha ~193):

```tsx
                    <TableCell>
                      <div className="space-y-0.5">
                        <DiagnosisBadge
                          status={f.diagnosisStatus}
                          nextDate={f.nextDiagnosisDate ?? null}
                        />
                        {f.lastDiagnosis ? (
                          <p className="text-[11px] text-muted-foreground">
                            {formatDateOnly(f.lastDiagnosis.referenceDate)}
                            {f.lastDiagnosis.diagnosedByUserName
                              ? ` · ${f.lastDiagnosis.diagnosedByUserName}`
                              : ""}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Sem diagnóstico
                          </p>
                        )}
                      </div>
                    </TableCell>
```

Importe `DiagnosisBadge` de `./badges` e `formatDateOnly` de `@/lib/road-safety-client`.

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add artifacts/web/src/pages/app/road-safety/_components/painel.tsx
git commit -m "feat(road-safety): coluna de diagnóstico no painel de fatores"
```

---

### Task 9: Backfill do diagnóstico legado

Transforma o texto livre que já existe em produção no primeiro registro do histórico. Sem isso, os fatores da Gabardo perdem o diagnóstico de vista na tela nova (o dado continua no banco, mas a API passa a derivar do histórico, que estaria vazio).

**Files:**
- Create: `scripts/src/migrate/road-safety-diagnosis-backfill.ts`

**Interfaces:**
- Consumes: Task 1 (tabelas).
- Produces: script idempotente, com `--dry-run` por padrão.

- [ ] **Step 1: Escrever o script**

Create `scripts/src/migrate/road-safety-diagnosis-backfill.ts`:

```ts
/**
 * Backfill: o texto livre de `road_safety_factors.current_diagnosis` vira o
 * primeiro registro do histórico de diagnósticos.
 *
 * Idempotente: só cria registro para fator que tem texto E ainda não tem
 * nenhum diagnóstico no histórico. Rodar duas vezes não duplica.
 *
 * Autor = NULL (o autor original nunca foi registrado — não inventamos um).
 * Data de referência = updated_at do fator: a melhor aproximação disponível de
 * quando aquele texto foi gravado.
 *
 * Uso:
 *   pnpm --filter @workspace/scripts exec tsx src/migrate/road-safety-diagnosis-backfill.ts           # dry-run
 *   pnpm --filter @workspace/scripts exec tsx src/migrate/road-safety-diagnosis-backfill.ts --apply   # grava
 */
import { sql } from "drizzle-orm";
import { db, roadSafetyFactorDiagnosesTable, roadSafetyFactorsTable } from "@workspace/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const factors = await db
    .select({
      id: roadSafetyFactorsTable.id,
      organizationId: roadSafetyFactorsTable.organizationId,
      code: roadSafetyFactorsTable.code,
      currentDiagnosis: roadSafetyFactorsTable.currentDiagnosis,
      updatedAt: roadSafetyFactorsTable.updatedAt,
    })
    .from(roadSafetyFactorsTable)
    .where(
      sql`${roadSafetyFactorsTable.currentDiagnosis} IS NOT NULL
          AND btrim(${roadSafetyFactorsTable.currentDiagnosis}) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM road_safety_factor_diagnoses d
            WHERE d.factor_id = ${roadSafetyFactorsTable.id}
          )`,
    );

  console.log(`Fatores a backfillar: ${factors.length}`);
  for (const f of factors) {
    const referenceDate = f.updatedAt.toISOString().slice(0, 10);
    console.log(`  ${f.code} (org ${f.organizationId}) → ${referenceDate}`);
    if (!APPLY) continue;
    await db.insert(roadSafetyFactorDiagnosesTable).values({
      organizationId: f.organizationId,
      factorId: f.id,
      content: f.currentDiagnosis!,
      referenceDate,
      diagnosedByUserId: null,
    });
  }

  console.log(
    APPLY
      ? `Backfill aplicado: ${factors.length} registro(s).`
      : "Dry-run — nada gravado. Use --apply para gravar.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Testar contra o banco local (nunca o de produção)**

Run:
```bash
pnpm typecheck
```
Expected: limpo. Execução real do script fica para o deploy (Task 10) — **nunca** rodar com `DATABASE_URL` de produção sem `--dry-run` antes.

- [ ] **Step 3: Commit**

```bash
git add scripts/src/migrate/road-safety-diagnosis-backfill.ts
git commit -m "chore(road-safety): backfill do diagnóstico legado para o histórico"
```

---

### Task 10: Validação final, push e diário

**Files:** nenhum arquivo de código novo.

- [ ] **Step 1: Suíte completa**

Run:
```bash
pnpm typecheck
pnpm exec vitest run --project node-unit --project web-unit
TEST_ENV=integration pnpm test:integration
```
Expected: tudo verde. Se algum teste de integração de outro módulo quebrar por causa da tabela nova, o problema é ordem de limpeza — revise a Task 1, Step 5.

- [ ] **Step 2: Conferir na UI local**

Suba o app numa porta que **não** seja a 3001 (a 3001 é o backend de dev do usuário e aponta para o Neon **de produção**) e confirme, com o banco docker:
1. Criar fator com diagnóstico inicial + periodicidade anual → aparece no painel com badge "Próximo em …".
2. Abrir "Ver" → card somente-leitura com autor e data; registrar novo diagnóstico → badge e painel atualizam sem reload.
3. Fator sem periodicidade → badge "—" e nenhuma pendência.

- [ ] **Step 3: Push**

```bash
git push origin feat/road-safety-kpi-link
```
Expected: CI verde no PR #110 (`pnpm typecheck`).

- [ ] **Step 4: Atualizar a descrição do PR #110**

O PR agora entrega duas coisas (vínculo com indicador + diagnóstico versionado). Atualize o corpo listando ambas e o que precisa rodar no deploy:
1. DDL `scripts/sql/20260714_add_road_safety_diagnoses.sql` no Neon de produção;
2. backfill `road-safety-diagnosis-backfill.ts` (dry-run, conferir contagem, depois `--apply`).

- [ ] **Step 5: Diário de bordo**

```bash
python3 scripts/diario-add.py --modulo "Segurança Viária" \
  --titulo "Diagnóstico do Fator de Desempenho: periodicidade, autor e histórico" \
  --file <entrada.md>
```
Conteúdo: o que entrou, o DDL/backfill pendentes de produção, o estado do PR #110 e as validações rodadas (`pnpm typecheck`, unit, integração). Em PT-BR, sem inflar: registrar o que ficou pendente (aplicação em produção) como pendente.

---

## Notas de execução

- **Ordem importa:** Tasks 1 → 2 → 3 → 4 são uma cadeia (schema → regra → contrato → rota). O typecheck fica vermelho entre a Task 3 e a Task 7 porque `currentDiagnosis` sai do contrato de escrita antes de o front parar de mandá-lo — é esperado e está sinalizado nos passos.
- **Tasks 5, 8 e 9** são independentes entre si depois da Task 4 e podem ser paralelizadas.
- Nada aqui altera a `periodicity` do Bloco B nem o `review_deadline` do Bloco E — se algum teste tocar neles, é regressão.
