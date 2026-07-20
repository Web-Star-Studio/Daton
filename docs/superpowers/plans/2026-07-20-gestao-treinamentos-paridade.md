# Gestão de Treinamentos — Paridade com o mockup (13) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a paridade da tela `aprendizagem/gestao-treinamentos` com o mockup `lms_gabardo (13) (1).html` — 5 cards, exportação .xlsx, pills, busca, colunas Norma/Crítico e Confirmados/Realizados, e "Por prazo" como painel de 3 colunas.

**Architecture:** Evoluir a página `artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx` no lugar (sem tela nova), extraindo sub-componentes apresentacionais (`_components/`) e utilitários puros (`_lib/`, `_export.ts`). Backend ganha 2 contagens + 2 filtros virtuais no endpoint de trainings e 2 contagens no de turmas; **sem DDL**. Export é client-side (`xlsx`).

**Tech Stack:** React 19 + Vite + Tailwind; Express 5 + Drizzle; OpenAPI 3.1 → Orval (Zod + React Query); Vitest (web-unit JSDOM + integration Node); lib `xlsx` (já dependência).

**Spec:** `docs/superpowers/specs/2026-07-20-gestao-treinamentos-paridade-design.md`

## Global Constraints

- **Sem DDL / mudança de schema.** Todos os dados já existem (`training_class_participants.attendance/result`, `employee_trainings.completion_date`, `training_catalog.is_critical`/`norm_ids`, `training_classes.status`).
- **OpenAPI é fonte única de contrato.** Após editar `lib/api-spec/openapi.yaml`, rodar `pnpm --filter @workspace/api-spec codegen`. **Nunca** editar arquivos gerados (`lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*`) à mão. O codegen precisa de `python3` no PATH.
- **`pnpm typecheck` deve passar** ao fim de cada tarefa.
- **Testes de integração exigem `TEST_ENV=integration`** (senão batem no Neon de PRODUÇÃO). Subir DB de teste com `pnpm test:integration:up` + `pnpm test:integration:db:push` (nunca `pnpm --filter @workspace/db push`).
- **Glob de teste web-unit:** `artifacts/web/tests/**/*.unit.test.{ts,tsx}`. Integração: `**/tests/**/*.integration.test.ts`.
- **UI em PT-BR**; usar componentes/estilos já existentes (`@/components/ui/*`, `cn`, Tailwind). Não mudar o design system.
- **Componentes apresentacionais** recebem dados por props (sem hooks de dados) para teste isolado.
- **Definições de bucket (verbatim da spec):**
  - `vencido` = `status='vencido'` OU (`expiration_date` não-nula e `< current_date`).
  - `a_vencer` = não-vencido e `expiration_date` entre hoje e hoje+30d.
  - `pendente` = `status='pendente'`.
  - `programado` = `pendente` ∧ EXISTS participante em turma ativa (`training_classes.status ∈ {agendada, em_andamento}`) do mesmo `catalog_item_id`.
  - `realizado` (mês) = `status='concluido'` ∧ `completion_date` no mês corrente.
  - `programado ⊂ pendente` (card "Pendentes" conta todos os pendentes).
  - Turma: **Confirmados** = `attendance='presente'`; **Realizados** = `result='aprovado'`; Inscritos = `participantCount`.
- **5 cards fiéis:** o card verde "Concluídos" all-time **sai**; entra "Realizados no mês". Ordem: Vencidos · A vencer 30d · Pendentes · Programados · Realizados no mês.

---

## File Structure

**Backend (modificar):**
- `lib/api-spec/openapi.yaml` — params `onlyProgramado`/`realizadoInCurrentMonth` + campos de stats `programado`/`realizadoMes` na resposta de trainings; campos `confirmedCount`/`realizadoCount` no item de turma.
- `artifacts/api-server/src/routes/employees.ts` — condições de filtro + stats novos no handler `GET .../employees/trainings`.
- `artifacts/api-server/src/routes/training-classes.ts` — contagens `confirmed`/`realizado` por turma no handler de listagem + `serializeClass`.

**Frontend (novos):**
- `artifacts/web/src/pages/app/aprendizagem/gestao/_lib/catalog-meta.ts` — `buildCatalogMeta`.
- `artifacts/web/src/pages/app/aprendizagem/gestao/_export.ts` — row-builders + `exportGestao*Xlsx`.
- `artifacts/web/src/pages/app/aprendizagem/gestao/_components/MetricCards.tsx`
- `artifacts/web/src/pages/app/aprendizagem/gestao/_components/StatusPills.tsx`
- `artifacts/web/src/pages/app/aprendizagem/gestao/_components/PorColaboradorTable.tsx`
- `artifacts/web/src/pages/app/aprendizagem/gestao/_components/PorTurmaTable.tsx`
- `artifacts/web/src/pages/app/aprendizagem/gestao/_components/PorPrazoPanel.tsx`

**Frontend (modificar):**
- `artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx` — orquestra estado, monta cards/pills/abas, wiring das queries novas.

**Testes (novos):**
- `artifacts/web/tests/pages/aprendizagem/gestao-catalog-meta.unit.test.ts`
- `artifacts/web/tests/pages/aprendizagem/gestao-export.unit.test.ts`
- `artifacts/web/tests/pages/aprendizagem/gestao-metric-cards.unit.test.tsx`
- `artifacts/web/tests/pages/aprendizagem/gestao-status-pills.unit.test.tsx`
- `artifacts/web/tests/pages/aprendizagem/gestao-por-colaborador-table.unit.test.tsx`
- `artifacts/web/tests/pages/aprendizagem/gestao-por-turma-table.unit.test.tsx`
- `artifacts/web/tests/pages/aprendizagem/gestao-por-prazo-panel.unit.test.tsx`
- `artifacts/api-server/tests/gestao-trainings-stats.integration.test.ts`
- `artifacts/api-server/tests/gestao-turmas-counts.integration.test.ts`

---

## Task 1: Backend — contagens `programado`/`realizadoMes` + filtros virtuais

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (operação `GET /organizations/{orgId}/employees/trainings`: query params + schema de stats da resposta)
- Modify: `artifacts/api-server/src/routes/employees.ts` (handler em ~1603–1990: bloco de condições ~1699–1823 e `statsRow` ~1917–1941, e o objeto `stats` da resposta logo após)
- Test: `artifacts/api-server/tests/gestao-trainings-stats.integration.test.ts`

**Interfaces:**
- Consumes: params existentes do endpoint (`status`, `expiringWithinDays`, `search`, `unitId`, `position`, `normId`).
- Produces: novos query params booleanos `onlyProgramado` e `realizadoInCurrentMonth`; novos campos numéricos em `stats`: `programado`, `realizadoMes`. O frontend (Task 5) consome `countResult.stats.programado` e `countResult.stats.realizadoMes`, e passa `onlyProgramado: true` / `realizadoInCurrentMonth: true` em `ListOrganizationTrainingsParams`.

- [ ] **Step 1: Escrever o teste de integração (falhando)**

Criar `artifacts/api-server/tests/gestao-trainings-stats.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import {
  createTestContext,
  type TestContext,
} from "../../../tests/support/backend";
import { db } from "@workspace/db";
import {
  employeeTrainingsTable,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
} from "@workspace/db";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
  // catálogo + colaborador
  const [cat] = await db
    .insert(trainingCatalogTable)
    .values({ organizationId: ctx.orgId, title: `${ctx.prefix} NR-35`, status: "ativo" })
    .returning();
  const emp = await ctx.createEmployee({ name: `${ctx.prefix} Fulano` });
  // treino pendente com turma ativa → programado
  await db.insert(employeeTrainingsTable).values({
    employeeId: emp.id,
    title: `${ctx.prefix} NR-35`,
    status: "pendente",
    catalogItemId: cat.id,
  });
  const [cls] = await db
    .insert(trainingClassesTable)
    .values({
      organizationId: ctx.orgId,
      catalogItemId: cat.id,
      startDate: "2026-07-25",
      status: "agendada",
    })
    .returning();
  await db.insert(trainingClassParticipantsTable).values({
    classId: cls.id,
    employeeId: emp.id,
  });
  // treino concluído neste mês → realizadoMes
  await db.insert(employeeTrainingsTable).values({
    employeeId: emp.id,
    title: `${ctx.prefix} Integração`,
    status: "concluido",
    completionDate: new Date().toISOString().slice(0, 10),
  });
});

afterAll(() => ctx.cleanup());

describe("GET employees/trainings — stats programado/realizadoMes", () => {
  it("conta programado e realizadoMes", async () => {
    const res = await request(app)
      .get(`/api/organizations/${ctx.orgId}/employees/trainings?pageSize=1`)
      .set(ctx.authHeader());
    expect(res.status).toBe(200);
    expect(res.body.stats.programado).toBe(1);
    expect(res.body.stats.realizadoMes).toBe(1);
  });

  it("onlyProgramado filtra a lista para pendentes com turma ativa", async () => {
    const res = await request(app)
      .get(`/api/organizations/${ctx.orgId}/employees/trainings?onlyProgramado=true&pageSize=50`)
      .set(ctx.authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe("pendente");
  });

  it("realizadoInCurrentMonth filtra concluídos do mês", async () => {
    const res = await request(app)
      .get(`/api/organizations/${ctx.orgId}/employees/trainings?realizadoInCurrentMonth=true&pageSize=50`)
      .set(ctx.authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe("concluido");
  });
});
```

> Nota ao implementador: confira as factories reais de `tests/support/backend.ts` (`createTestContext`, `createEmployee`/`ctx.createEmployee`, `authHeader`, `prefix`, `cleanup`). Ajuste nomes conforme a API existente do helper — o padrão exato está em outros `*.integration.test.ts` do mesmo diretório. Se `app` for exportado de outro módulo, use o mesmo import dos testes vizinhos.

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm test:integration:up && pnpm test:integration:db:push && TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/gestao-trainings-stats.integration.test.ts`
Expected: FAIL — `stats.programado` é `undefined` (campo ainda não existe).

- [ ] **Step 3: Adicionar os query params no schema Zod do handler**

Em `employees.ts`, no `.extend({ ... })` do `ListOrganizationTrainingsQueryParams` (bloco ~1617–1641), acrescentar:

```ts
      /** Filtra a lista para "programados": pendente ∩ participante de turma ativa. */
      onlyProgramado: z.coerce.boolean().optional(),
      /** Filtra a lista para concluídos com completion_date no mês corrente. */
      realizadoInCurrentMonth: z.coerce.boolean().optional(),
```

- [ ] **Step 4: Definir os fragmentos SQL reutilizáveis (bucket) perto do handler**

No topo do arquivo (junto aos outros fragmentos `board*` reutilizados por este handler), adicionar:

```ts
// Programado = pendente ∩ participante de turma ativa (agendada|em_andamento) do mesmo item.
const isProgramado = sql`(
  ${employeeTrainingsTable.status} = 'pendente' and exists (
    select 1 from training_class_participants tcp
    join training_classes tc on tc.id = tcp.class_id
    where tcp.employee_id = ${employeeTrainingsTable.employeeId}
      and tc.catalog_item_id = ${employeeTrainingsTable.catalogItemId}
      and tc.status in ('agendada', 'em_andamento')
  )
)`;
// Realizado no mês = concluído com completion_date dentro do mês corrente.
const isRealizadoMes = sql`(
  ${employeeTrainingsTable.status} = 'concluido'
  and ${employeeTrainingsTable.completionDate} >= date_trunc('month', current_date)
  and ${employeeTrainingsTable.completionDate} < date_trunc('month', current_date) + interval '1 month'
)`;
```

> Se `board*` forem definidos dentro do módulo mas fora do handler, colocar estes ao lado deles para reaproveitar o mesmo escopo. Não duplicar dentro do handler.

- [ ] **Step 5: Aplicar os filtros virtuais nas condições**

No bloco de "Filtros novos" (após o `if (query.data.status) { ... }`, ~1725), adicionar:

```ts
    if (query.data.onlyProgramado) {
      conditions.push(isProgramado);
    }
    if (query.data.realizadoInCurrentMonth) {
      conditions.push(isRealizadoMes);
    }
```

- [ ] **Step 6: Adicionar os counts em `statsRow`**

No objeto do `db.select({ ... })` de `statsRow` (~1917–1941), adicionar:

```ts
        programadoCount: sql<number>`count(*) filter (where ${isProgramado})::int`,
        realizadoMesCount: sql<number>`count(*) filter (where ${isRealizadoMes})::int`,
```

- [ ] **Step 7: Expor no objeto `stats` da resposta**

Localizar o objeto de resposta `stats: { ... }` (logo após `statsRow`, onde `pendente: statsRow.pendenteCount` etc. são montados) e acrescentar:

```ts
        programado: statsRow?.programadoCount ?? 0,
        realizadoMes: statsRow?.realizadoMesCount ?? 0,
```

- [ ] **Step 8: Atualizar o OpenAPI**

Em `lib/api-spec/openapi.yaml`, na operação `GET /organizations/{orgId}/employees/trainings`:
- Nos `parameters`, adicionar (no estilo do `expiringWithinDays` já presente ~1109):

```yaml
        - name: onlyProgramado
          in: query
          required: false
          schema: { type: boolean }
        - name: realizadoInCurrentMonth
          in: query
          required: false
          schema: { type: boolean }
```
- No schema do objeto `stats` da resposta (onde estão `vencido`/`pendente`/`concluido`), adicionar:

```yaml
                    programado: { type: integer }
                    realizadoMes: { type: integer }
```

> Localize o schema de stats buscando `pendente:` dentro da resposta dessa operação (ou o componente reutilizado). Adicione os 2 campos como `integer` no mesmo nível.

- [ ] **Step 9: Rodar o codegen**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: regenera `lib/api-zod` e `lib/api-client-react` sem erro; `ListOrganizationTrainingsParams` passa a aceitar `onlyProgramado`/`realizadoInCurrentMonth` e o tipo de `stats` ganha `programado`/`realizadoMes`.

- [ ] **Step 10: Rodar o teste e ver passar + typecheck**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/gestao-trainings-stats.integration.test.ts`
Expected: PASS (3/3).
Run: `pnpm typecheck`
Expected: 0 erros.

- [ ] **Step 11: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/employees.ts artifacts/api-server/tests/gestao-trainings-stats.integration.test.ts
git commit -m "feat(aprendizagem): stats programado/realizadoMes + filtros no endpoint de treinos"
```

---

## Task 2: Backend — contagens `confirmedCount`/`realizadoCount` por turma

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (item da resposta de `GET /organizations/{orgId}/training-classes`: campos `confirmedCount`, `realizadoCount`)
- Modify: `artifacts/api-server/src/routes/training-classes.ts` (`serializeClass` ~35–41 e o handler de listagem ~134–151)
- Test: `artifacts/api-server/tests/gestao-turmas-counts.integration.test.ts`

**Interfaces:**
- Produces: cada item de turma na listagem ganha `confirmedCount: number` e `realizadoCount: number`. O frontend (Task 6) consome `c.confirmedCount` / `c.realizadoCount`.

- [ ] **Step 1: Escrever o teste de integração (falhando)**

Criar `artifacts/api-server/tests/gestao-turmas-counts.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { createTestContext, type TestContext } from "../../../tests/support/backend";
import {
  db,
  trainingCatalogTable,
  trainingClassesTable,
  trainingClassParticipantsTable,
} from "@workspace/db";

let ctx: TestContext;
let classId: number;

beforeAll(async () => {
  ctx = await createTestContext();
  const [cat] = await db
    .insert(trainingCatalogTable)
    .values({ organizationId: ctx.orgId, title: `${ctx.prefix} Dir. defensiva`, status: "ativo" })
    .returning();
  const [cls] = await db
    .insert(trainingClassesTable)
    .values({ organizationId: ctx.orgId, catalogItemId: cat.id, startDate: "2026-04-02", status: "realizada" })
    .returning();
  classId = cls.id;
  const e1 = await ctx.createEmployee({ name: `${ctx.prefix} A` });
  const e2 = await ctx.createEmployee({ name: `${ctx.prefix} B` });
  const e3 = await ctx.createEmployee({ name: `${ctx.prefix} C` });
  // 3 inscritos: 2 presentes (1 aprovado, 1 sem resultado), 1 faltou
  await db.insert(trainingClassParticipantsTable).values([
    { classId: cls.id, employeeId: e1.id, attendance: "presente", result: "aprovado" },
    { classId: cls.id, employeeId: e2.id, attendance: "presente", result: null },
    { classId: cls.id, employeeId: e3.id, attendance: "faltou", result: "reprovado" },
  ]);
});

afterAll(() => ctx.cleanup());

describe("GET training-classes — confirmedCount/realizadoCount", () => {
  it("Inscritos=3, Confirmados=2 (presente), Realizados=1 (aprovado)", async () => {
    const res = await request(app)
      .get(`/api/organizations/${ctx.orgId}/training-classes`)
      .set(ctx.authHeader());
    expect(res.status).toBe(200);
    const cls = res.body.data.find((c: { id: number }) => c.id === classId);
    expect(cls.participantCount).toBe(3);
    expect(cls.confirmedCount).toBe(2);
    expect(cls.realizadoCount).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/gestao-turmas-counts.integration.test.ts`
Expected: FAIL — `cls.confirmedCount` é `undefined`.

- [ ] **Step 3: Estender a query de contagem por turma**

No handler de listagem (~140–147), substituir a query `counts` por uma que também some presente/aprovado:

```ts
    const counts = await db
      .select({
        classId: trainingClassParticipantsTable.classId,
        n: sql<number>`cast(count(*) as int)`,
        confirmed: sql<number>`cast(count(*) filter (where ${trainingClassParticipantsTable.attendance} = 'presente') as int)`,
        realizado: sql<number>`cast(count(*) filter (where ${trainingClassParticipantsTable.result} = 'aprovado') as int)`,
      })
      .from(trainingClassParticipantsTable)
      .groupBy(trainingClassParticipantsTable.classId);
    const countByClass = new Map(
      counts.map((c) => [c.classId, { n: c.n, confirmed: c.confirmed, realizado: c.realizado }]),
    );
```

- [ ] **Step 4: Passar as contagens ao `serializeClass`**

A função `serializeClass` já existe (~35) e hoje recebe `(r, participantCount?)` e devolve um objeto com um spread condicional `...(participantCount !== undefined ? { participantCount } : {})`. **Não reescrever o corpo** — apenas: (1) adicionar 2 parâmetros na assinatura e (2) adicionar 2 spreads condicionais irmãos do `participantCount`, mantendo todo o resto igual:

```ts
// assinatura: acrescentar os 2 parâmetros no fim
function serializeClass(
  r: TrainingClass,
  participantCount?: number,
  confirmedCount?: number,
  realizadoCount?: number,
) {
  return {
    /* ...todo o corpo atual permanece exatamente como está... */
    ...(participantCount !== undefined ? { participantCount } : {}),
    ...(confirmedCount !== undefined ? { confirmedCount } : {}),
    ...(realizadoCount !== undefined ? { realizadoCount } : {}),
  };
}
```

E na montagem da resposta (~150):

```ts
    res.json({
      data: rows.map((r) => {
        const c = countByClass.get(r.id);
        return serializeClass(r, c?.n ?? 0, c?.confirmed ?? 0, c?.realizado ?? 0);
      }),
    });
```

- [ ] **Step 5: Atualizar o OpenAPI**

Em `lib/api-spec/openapi.yaml`, no schema do item de turma retornado por `GET .../training-classes` (onde está `participantCount:` ~11197), adicionar:

```yaml
        confirmedCount: { type: integer }
        realizadoCount: { type: integer }
```

- [ ] **Step 6: Codegen**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: `TrainingClass` (tipo gerado) passa a ter `confirmedCount?`/`realizadoCount?`.

- [ ] **Step 7: Rodar teste + typecheck**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/gestao-turmas-counts.integration.test.ts`
Expected: PASS.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/training-classes.ts artifacts/api-server/tests/gestao-turmas-counts.integration.test.ts
git commit -m "feat(aprendizagem): confirmedCount/realizadoCount por turma na listagem"
```

---

## Task 3: Frontend — util puro `buildCatalogMeta`

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/gestao/_lib/catalog-meta.ts`
- Test: `artifacts/web/tests/pages/aprendizagem/gestao-catalog-meta.unit.test.ts`

**Interfaces:**
- Consumes: itens do catálogo (`{ id: number; normIds?: number[]; isCritical?: boolean }`) e um `Map<number,string>` de rótulos de norma por id.
- Produces: `buildCatalogMeta(catalog, normLabelById): Map<number, CatalogMeta>` com `type CatalogMeta = { normLabels: string[]; isCritical: boolean }`. Usado por Task 4 (colunas) e Task 7 (export).

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { buildCatalogMeta } from "@/pages/app/aprendizagem/gestao/_lib/catalog-meta";

describe("buildCatalogMeta", () => {
  const normLabelById = new Map([[1, "ISO 9001"], [2, "ISO 14001"]]);

  it("mapeia normLabels e isCritical por item", () => {
    const meta = buildCatalogMeta(
      [
        { id: 10, normIds: [1, 2], isCritical: true },
        { id: 11, normIds: [], isCritical: false },
      ],
      normLabelById,
    );
    expect(meta.get(10)).toEqual({ normLabels: ["ISO 9001", "ISO 14001"], isCritical: true });
    expect(meta.get(11)).toEqual({ normLabels: [], isCritical: false });
  });

  it("ignora normId sem rótulo conhecido e trata campos ausentes", () => {
    const meta = buildCatalogMeta([{ id: 12, normIds: [1, 99] }], normLabelById);
    expect(meta.get(12)).toEqual({ normLabels: ["ISO 9001"], isCritical: false });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-catalog-meta.unit.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
export type CatalogMeta = { normLabels: string[]; isCritical: boolean };

type CatalogItemLike = {
  id: number;
  normIds?: number[] | null;
  isCritical?: boolean | null;
};

/** Mapa catalogItemId → { normLabels, isCritical }, resolvendo os rótulos de
 *  norma pelos ids. normId sem rótulo conhecido é descartado. */
export function buildCatalogMeta(
  catalog: CatalogItemLike[],
  normLabelById: Map<number, string>,
): Map<number, CatalogMeta> {
  const out = new Map<number, CatalogMeta>();
  for (const item of catalog) {
    const normLabels = (item.normIds ?? [])
      .map((id) => normLabelById.get(id))
      .filter((l): l is string => !!l);
    out.set(item.id, { normLabels, isCritical: !!item.isCritical });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-catalog-meta.unit.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/gestao/_lib/catalog-meta.ts artifacts/web/tests/pages/aprendizagem/gestao-catalog-meta.unit.test.ts
git commit -m "feat(aprendizagem): util buildCatalogMeta (norma/crítico por item de catálogo)"
```

---

## Task 4: Frontend — `PorColaboradorTable` com colunas Norma + Crítico

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/gestao/_components/PorColaboradorTable.tsx`
- Modify: `artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx` (substituir o uso do `TrainingTable` local pelas novas colunas; adicionar `useAllNorms` + `normLabelById` + `catalogMeta`; passar como props)
- Test: `artifacts/web/tests/pages/aprendizagem/gestao-por-colaborador-table.unit.test.tsx`

**Interfaces:**
- Consumes: `OrganizationTraining[]`, `Map<number, CatalogMeta>` (Task 3), helpers `formatDate`/`trainingDeadline` (extrair para `_lib/` se necessário, ou duplicar assinatura — ver Step 3).
- Produces: componente `PorColaboradorTable({ rows, catalogMeta, loading, error, emptyLabel })`. Colunas: Colaborador · Cargo · Filial · Treinamento · **Norma** · Situação · Vencimento · **Crítico**.

- [ ] **Step 1: Escrever o teste (falhando)**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PorColaboradorTable } from "@/pages/app/aprendizagem/gestao/_components/PorColaboradorTable";

const rows = [
  {
    id: 1, employeeId: 1, employeeName: "Ana", employeePosition: "Motorista",
    unitName: "Curitiba", title: "NR-35", status: "pendente",
    expirationDate: "2026-08-01", catalogItemId: 10, attachments: [], reviewerCount: 0,
  },
] as never;

describe("PorColaboradorTable", () => {
  it("mostra Norma e Crítico do catálogo", () => {
    const meta = new Map([[10, { normLabels: ["ISO 39001"], isCritical: true }]]);
    render(<PorColaboradorTable rows={rows} catalogMeta={meta} loading={false} error={false} emptyLabel="—" />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("ISO 39001")).toBeInTheDocument();
    // marcador de crítico (badge "Crítico")
    expect(screen.getByText(/Crítico/i)).toBeInTheDocument();
  });

  it("treino sem item de catálogo mostra '—' na norma e não é crítico", () => {
    const noCat = [{ ...rows[0], catalogItemId: null }] as never;
    render(<PorColaboradorTable rows={noCat} catalogMeta={new Map()} loading={false} error={false} emptyLabel="—" />);
    expect(screen.queryByText(/Crítico/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-por-colaborador-table.unit.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o componente**

Extrair a lógica de `TrainingTable` (index.tsx ~552–620) para o novo arquivo, adicionando as colunas. Copiar `formatDate`, `trainingDeadline`, `STATUS_BADGE`, `STATUS_LABEL` para um `_lib/format.ts` compartilhado e importar nos dois lugares (DRY) — ou, se preferir manter simples, mover essas 4 definições para o topo do componente e reimportá-las no index. Estrutura do componente:

```tsx
import type { OrganizationTraining, OrganizationTrainingStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CatalogMeta } from "../_lib/catalog-meta";
import { formatDate, trainingDeadline, STATUS_BADGE, STATUS_LABEL } from "../_lib/format";

export function PorColaboradorTable({
  rows, catalogMeta, loading, error, emptyLabel,
}: {
  rows: OrganizationTraining[];
  catalogMeta: Map<number, CatalogMeta>;
  loading: boolean;
  error: boolean;
  emptyLabel: string;
}) {
  if (loading) return <p className="px-4 py-8 text-sm text-muted-foreground">Carregando...</p>;
  if (error) return <p className="px-4 py-8 text-center text-sm text-red-600">Não foi possível carregar os treinamentos.</p>;
  if (rows.length === 0) return <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Colaborador</th>
            <th className="px-4 py-2 font-medium">Cargo</th>
            <th className="px-4 py-2 font-medium">Filial</th>
            <th className="px-4 py-2 font-medium">Treinamento</th>
            <th className="px-4 py-2 font-medium">Norma</th>
            <th className="px-4 py-2 font-medium">Situação</th>
            <th className="px-4 py-2 font-medium">Vencimento</th>
            <th className="px-4 py-2 font-medium">Crítico</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const meta = t.catalogItemId != null ? catalogMeta.get(t.catalogItemId) : undefined;
            const normLabel = meta?.normLabels.length ? meta.normLabels.join(", ") : "—";
            return (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-2 font-medium">{t.employeeName}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.employeePosition ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.unitName ?? "—"}</td>
                <td className="px-4 py-2">{t.title}</td>
                <td className="px-4 py-2 text-muted-foreground">{normLabel}</td>
                <td className="px-4 py-2">
                  <Badge className={cn("border", STATUS_BADGE[t.status as OrganizationTrainingStatus])}>
                    {STATUS_LABEL[t.status as OrganizationTrainingStatus]}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{formatDate(trainingDeadline(t))}</td>
                <td className="px-4 py-2">
                  {meta?.isCritical ? (
                    <Badge className="border border-red-200 bg-red-50 text-red-700">Crítico</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

Criar `_lib/format.ts` movendo `formatDate`, `trainingDeadline`, `STATUS_BADGE`, `STATUS_LABEL` de `index.tsx` (e reimportá-las no index para não duplicar).

- [ ] **Step 4: Ligar no index.tsx**

- Adicionar `import { useAllNorms } from "@/lib/norms-client";` e `import { PorColaboradorTable } from "./_components/PorColaboradorTable";` e `import { buildCatalogMeta } from "./_lib/catalog-meta";`.
- Após os hooks de dados existentes, montar:

```tsx
  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelById = useMemo(
    () => new Map(allNorms.map((n) => [n.id, n.label])),
    [allNorms],
  );
  const catalogItems = useMemo(() => catalogResult?.data ?? [], [catalogResult]);
  const catalogMeta = useMemo(
    () => buildCatalogMeta(catalogItems, normLabelById),
    [catalogItems, normLabelById],
  );
```

- Substituir os 2 usos de `<TrainingTable rows={...} />` (abas colaborador e prazo) por `<PorColaboradorTable rows={...} catalogMeta={catalogMeta} ... />` e remover a função local `TrainingTable`.

> `catalogResult` já existe na página (via `useAllTrainingCatalog`). Confirmar o shape (`.data` vs array direto) e ajustar. Confirmar que `RegulatoryNorm` tem `.label` (senão usar o campo real de rótulo).

- [ ] **Step 5: Rodar teste + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-por-colaborador-table.unit.test.tsx`
Expected: PASS (2/2).
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/gestao/ artifacts/web/tests/pages/aprendizagem/gestao-por-colaborador-table.unit.test.tsx
git commit -m "feat(aprendizagem): colunas Norma e Crítico na tabela Por colaborador"
```

---

## Task 5: Frontend — 5 cards + StatusPills + Busca

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/gestao/_components/MetricCards.tsx`
- Create: `artifacts/web/src/pages/app/aprendizagem/gestao/_components/StatusPills.tsx`
- Modify: `artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx` (5 cards, pills, busca, tipo `StatusFilter`, wiring dos params `onlyProgramado`/`realizadoInCurrentMonth`/`search`)
- Test: `artifacts/web/tests/pages/aprendizagem/gestao-metric-cards.unit.test.tsx`, `gestao-status-pills.unit.test.tsx`

**Interfaces:**
- `type StatusFilter = "" | "vencido" | "a_vencer" | "pendente" | "programado" | "realizado";`
- `MetricCards({ counts, active, onToggle })` com `counts: { vencido; aVencer; pendente; programado; realizadoMes }` e `active: StatusFilter`, `onToggle(f: StatusFilter): void`. Renderiza 5 cards na ordem da spec.
- `StatusPills({ active, onToggle })` — 6 pills (Todos + 5 buckets) compartilhando o mesmo `active/onToggle`.

- [ ] **Step 1: Escrever os testes (falhando)**

`gestao-metric-cards.unit.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetricCards } from "@/pages/app/aprendizagem/gestao/_components/MetricCards";

describe("MetricCards", () => {
  const counts = { vencido: 12, aVencer: 23, pendente: 47, programado: 18, realizadoMes: 84 };

  it("mostra os 5 cards com valores e rótulos", () => {
    render(<MetricCards counts={counts} active="" onToggle={() => {}} />);
    for (const label of ["Vencidos", "A vencer em 30 dias", "Pendentes", "Programados", "Realizados no mês"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("18")).toBeInTheDocument(); // Programados
    expect(screen.getByText("84")).toBeInTheDocument(); // Realizados no mês
  });

  it("clicar em Programados dispara onToggle('programado')", () => {
    const onToggle = vi.fn();
    render(<MetricCards counts={counts} active="" onToggle={onToggle} />);
    fireEvent.click(screen.getByText("Programados"));
    expect(onToggle).toHaveBeenCalledWith("programado");
  });
});
```

`gestao-status-pills.unit.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusPills } from "@/pages/app/aprendizagem/gestao/_components/StatusPills";

describe("StatusPills", () => {
  it("mostra 6 pills e dispara onToggle com o bucket", () => {
    const onToggle = vi.fn();
    render(<StatusPills active="" onToggle={onToggle} />);
    for (const label of ["Todos", "Vencidos", "A vencer 30d", "Pendentes", "Programados", "Realizados"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("Programados"));
    expect(onToggle).toHaveBeenCalledWith("programado");
    fireEvent.click(screen.getByText("Todos"));
    expect(onToggle).toHaveBeenCalledWith("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-metric-cards.unit.test.tsx artifacts/web/tests/pages/aprendizagem/gestao-status-pills.unit.test.tsx`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `MetricCards`**

```tsx
import { cn } from "@/lib/utils";

export type CardStatusFilter = "" | "vencido" | "a_vencer" | "pendente" | "programado" | "realizado";

const CARDS: Array<{
  key: Exclude<CardStatusFilter, "">;
  label: string;
  sub: string;
  accent: string;
  border: string;
  countKey: "vencido" | "aVencer" | "pendente" | "programado" | "realizadoMes";
}> = [
  { key: "vencido", label: "Vencidos", sub: "requerem ação imediata", accent: "text-red-700", border: "border-l-red-500", countKey: "vencido" },
  { key: "a_vencer", label: "A vencer em 30 dias", sub: "atenção necessária", accent: "text-amber-700", border: "border-l-amber-500", countKey: "aVencer" },
  { key: "pendente", label: "Pendentes", sub: "aguardando turma", accent: "text-blue-700", border: "border-l-blue-500", countKey: "pendente" },
  { key: "programado", label: "Programados", sub: "turma confirmada", accent: "text-teal-700", border: "border-l-teal-500", countKey: "programado" },
  { key: "realizado", label: "Realizados no mês", sub: "concluídos no mês", accent: "text-green-700", border: "border-l-green-500", countKey: "realizadoMes" },
];

export function MetricCards({
  counts, active, onToggle,
}: {
  counts: { vencido: number; aVencer: number; pendente: number; programado: number; realizadoMes: number };
  active: CardStatusFilter;
  onToggle: (f: CardStatusFilter) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onToggle(c.key)}
          className={cn(
            "rounded-xl border border-l-[3px] bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40",
            c.border,
            active === c.key && "ring-2 ring-primary/40",
          )}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
          <div className={cn("mt-1 text-2xl font-semibold tabular-nums", c.accent)}>{counts[c.countKey]}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{c.sub}</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implementar `StatusPills`**

```tsx
import { cn } from "@/lib/utils";
import type { CardStatusFilter } from "./MetricCards";

const PILLS: Array<{ val: CardStatusFilter; label: string; tone: string }> = [
  { val: "", label: "Todos", tone: "bg-muted text-foreground" },
  { val: "vencido", label: "Vencidos", tone: "bg-red-50 text-red-700" },
  { val: "a_vencer", label: "A vencer 30d", tone: "bg-amber-50 text-amber-700" },
  { val: "pendente", label: "Pendentes", tone: "bg-blue-50 text-blue-700" },
  { val: "programado", label: "Programados", tone: "bg-teal-50 text-teal-700" },
  { val: "realizado", label: "Realizados", tone: "bg-green-50 text-green-700" },
];

export function StatusPills({
  active, onToggle,
}: {
  active: CardStatusFilter;
  onToggle: (f: CardStatusFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PILLS.map((p) => (
        <button
          key={p.val || "todos"}
          type="button"
          onClick={() => onToggle(p.val)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            active === p.val ? p.tone + " ring-1 ring-current/30" : "bg-transparent text-muted-foreground hover:bg-muted",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Ligar no index.tsx**

- Trocar o `type StatusFilter` (linha ~90) por: `type StatusFilter = "" | "vencido" | "a_vencer" | "pendente" | "programado" | "realizado";` (ou importar `CardStatusFilter` de `MetricCards` e usar como `StatusFilter`).
- Substituir o bloco manual dos 4 `<MetricCard>` (linhas ~324–354) por:

```tsx
      <MetricCards
        counts={{
          vencido: stats?.vencido ?? 0,
          aVencer: aVencerCount,
          pendente: stats?.pendente ?? 0,
          programado: stats?.programado ?? 0,
          realizadoMes: stats?.realizadoMes ?? 0,
        }}
        active={statusFilter}
        onToggle={toggleStatus}
      />
      <StatusPills active={statusFilter} onToggle={toggleStatus} />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar colaborador..."
        className="w-full max-w-xs rounded-md border px-3 py-1.5 text-sm sm:w-auto"
      />
```

- Adicionar estado `const [search, setSearch] = useState("");`.
- No `mainParams` (linha ~188), acrescentar o wiring dos novos buckets e da busca:

```tsx
  const mainParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    status: statusFilter === "vencido" || statusFilter === "pendente" ? statusFilter : undefined,
    expiringWithinDays: statusFilter === "a_vencer" ? 30 : undefined,
    onlyProgramado: statusFilter === "programado" ? true : undefined,
    realizadoInCurrentMonth: statusFilter === "realizado" ? true : undefined,
    search: search.trim() || undefined,
    page: 1,
    pageSize,
  };
```

- Remover a função local `MetricCard` (não é mais usada) e o `import`/uso do antigo `concluido`. Ajustar `toggleStatus` para o novo tipo (aceita os 6 valores; o mesmo valor clicado 2× volta a `""`).
- `countParams`/`expiringParams` seguem como estão (contagens não dependem do statusFilter).

> Import: `import { MetricCards } from "./_components/MetricCards"; import { StatusPills } from "./_components/StatusPills";`

- [ ] **Step 6: Rodar testes + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-metric-cards.unit.test.tsx artifacts/web/tests/pages/aprendizagem/gestao-status-pills.unit.test.tsx`
Expected: PASS.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 7: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/gestao/ artifacts/web/tests/pages/aprendizagem/gestao-metric-cards.unit.test.tsx artifacts/web/tests/pages/aprendizagem/gestao-status-pills.unit.test.tsx
git commit -m "feat(aprendizagem): 5 cards (Programados/Realizados-mês) + pills + busca na Gestão"
```

---

## Task 6: Frontend — `PorTurmaTable` com Confirmados + Realizados

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/gestao/_components/PorTurmaTable.tsx`
- Modify: `artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx` (substituir a tabela inline de turmas ~416–482 pelo componente)
- Test: `artifacts/web/tests/pages/aprendizagem/gestao-por-turma-table.unit.test.tsx`

**Interfaces:**
- `PorTurmaTable({ classes, catalogTitleById, unitNameById, loading, error })`. Colunas: Turma · Treinamento · Data · Filial · Inscritos · **Confirmados** · **Realizados** · Status · (ação "Abrir"). Usa `c.participantCount`, `c.confirmedCount`, `c.realizadoCount`.

- [ ] **Step 1: Escrever o teste (falhando)**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PorTurmaTable } from "@/pages/app/aprendizagem/gestao/_components/PorTurmaTable";

const classes = [
  { id: 1, code: "T04", catalogItemId: 5, startDate: "2026-04-02", unitId: 2, status: "realizada", participantCount: 24, confirmedCount: 24, realizadoCount: 23 },
] as never;

describe("PorTurmaTable", () => {
  it("mostra Inscritos, Confirmados e Realizados", () => {
    render(
      <PorTurmaTable
        classes={classes}
        catalogTitleById={new Map([[5, "Direção defensiva"]])}
        unitNameById={new Map([[2, "Curitiba"]])}
        loading={false}
        error={false}
      />,
    );
    expect(screen.getByText("Direção defensiva")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("Realizada")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-por-turma-table.unit.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** (extrair a tabela de turmas de `index.tsx` ~431–479 e adicionar as 2 colunas)

```tsx
import { Link } from "wouter";
import type { TrainingClass } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, CLASS_STATUS_BADGE, CLASS_STATUS_LABEL } from "../_lib/format";

export function PorTurmaTable({
  classes, catalogTitleById, unitNameById, loading, error,
}: {
  classes: TrainingClass[];
  catalogTitleById: Map<number, string>;
  unitNameById: Map<number, string>;
  loading: boolean;
  error: boolean;
}) {
  if (loading) return <p className="px-4 py-8 text-sm text-muted-foreground">Carregando...</p>;
  if (error) return <p className="px-4 py-8 text-center text-sm text-red-600">Não foi possível carregar as turmas.</p>;
  if (classes.length === 0) return <p className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhuma turma encontrada para os filtros selecionados.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Turma</th>
            <th className="px-4 py-2 font-medium">Treinamento</th>
            <th className="px-4 py-2 font-medium">Data</th>
            <th className="px-4 py-2 font-medium">Filial</th>
            <th className="px-4 py-2 font-medium">Inscritos</th>
            <th className="px-4 py-2 font-medium">Confirmados</th>
            <th className="px-4 py-2 font-medium">Realizados</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="px-4 py-2 font-medium">{c.code ?? "—"}</td>
              <td className="px-4 py-2">{catalogTitleById.get(c.catalogItemId) ?? `#${c.catalogItemId}`}</td>
              <td className="px-4 py-2 text-muted-foreground">{formatDate(c.startDate)}</td>
              <td className="px-4 py-2 text-muted-foreground">{c.unitId ? (unitNameById.get(c.unitId) ?? "—") : "—"}</td>
              <td className="px-4 py-2 tabular-nums">{c.participantCount ?? 0}</td>
              <td className="px-4 py-2 tabular-nums">{c.confirmedCount ?? 0}</td>
              <td className="px-4 py-2 tabular-nums">{c.realizadoCount ?? "—"}</td>
              <td className="px-4 py-2">
                <Badge className={CLASS_STATUS_BADGE[c.status] ?? ""}>{CLASS_STATUS_LABEL[c.status] ?? c.status}</Badge>
              </td>
              <td className="px-4 py-2 text-right">
                <Link href="/aprendizagem/turmas" className="text-xs font-medium text-blue-600 hover:underline">Abrir</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Mover `CLASS_STATUS_BADGE`/`CLASS_STATUS_LABEL` para `_lib/format.ts` (criado na Task 4) e reimportar no index.

- [ ] **Step 4: Ligar no index.tsx** — substituir o bloco inline da aba turma por `<PorTurmaTable classes={classes} catalogTitleById={catalogTitle} unitNameById={unitName} loading={classLoading} error={classError} />`.

- [ ] **Step 5: Rodar teste + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-por-turma-table.unit.test.tsx`
Expected: PASS.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/gestao/ artifacts/web/tests/pages/aprendizagem/gestao-por-turma-table.unit.test.tsx
git commit -m "feat(aprendizagem): colunas Confirmados e Realizados na tabela Por turma"
```

---

## Task 7: Frontend — Exportação .xlsx

> **CORREÇÃO (aplicada nas Tasks 3/4):** `training_catalog` NÃO tem `isCritical` — a criticidade
> vem de `training_requirements.isCritical` via `OrganizationTraining.requirementId`. Portanto
> `CatalogMeta` agora é só `{ normLabels: string[] }`, e a coluna/valor **Crítico** resolve-se por
> `requirementCriticalById: Map<number, boolean>` (montado no `index.tsx` com `useListTrainingRequirements`).
> `buildColaboradorRows` deve receber esse mapa como 3º parâmetro e computar
> `Crítico: (t.requirementId != null && requirementCriticalById.get(t.requirementId) === true) ? "Sim" : "Não"`.
> Ignore, abaixo, o `catalogMeta.isCritical` (não existe mais) — **Norma** continua vindo do `catalogMeta`.

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/gestao/_export.ts`
- Modify: `artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx` (botão "Exportar" no topo)
- Test: `artifacts/web/tests/pages/aprendizagem/gestao-export.unit.test.ts`

**Interfaces:**
- `buildColaboradorRows(rows: OrganizationTraining[], catalogMeta: Map<number,CatalogMeta>): Record<string, string|number>[]`
- `buildTurmaRows(classes: TrainingClass[], catalogTitleById: Map<number,string>, unitNameById: Map<number,string>): Record<string, string|number>[]`
- `exportGestaoXlsx(view: "colaborador" | "turma", rows: Record<string,string|number>[]): void` — escreve o arquivo (padrão `regulatorios/_export.ts`).

- [ ] **Step 1: Escrever o teste (falhando)** — testa só os row-builders puros (não escreve arquivo)

```ts
import { describe, it, expect } from "vitest";
import { buildColaboradorRows, buildTurmaRows } from "@/pages/app/aprendizagem/gestao/_export";

describe("gestao export row-builders", () => {
  it("colaborador: labels PT-BR, norma e crítico", () => {
    const rows = buildColaboradorRows(
      [{ id: 1, employeeName: "Ana", employeePosition: "Motorista", unitName: "Curitiba", title: "NR-35", status: "pendente", expirationDate: "2026-08-01", catalogItemId: 10 } as never],
      new Map([[10, { normLabels: ["ISO 39001"], isCritical: true }]]),
    );
    expect(rows[0]).toMatchObject({
      Colaborador: "Ana", Cargo: "Motorista", Filial: "Curitiba",
      Treinamento: "NR-35", Norma: "ISO 39001", Situação: "Pendente", Crítico: "Sim",
    });
  });

  it("turma: inscritos/confirmados/realizados", () => {
    const rows = buildTurmaRows(
      [{ id: 1, code: "T04", catalogItemId: 5, startDate: "2026-04-02", unitId: 2, status: "realizada", participantCount: 24, confirmedCount: 24, realizadoCount: 23 } as never],
      new Map([[5, "Direção defensiva"]]),
      new Map([[2, "Curitiba"]]),
    );
    expect(rows[0]).toMatchObject({
      Turma: "T04", Treinamento: "Direção defensiva", Filial: "Curitiba",
      Inscritos: 24, Confirmados: 24, Realizados: 23, Status: "Realizada",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-export.unit.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar** (reusando labels/format de `_lib/format.ts`)

```ts
import * as XLSX from "xlsx";
import type { OrganizationTraining, OrganizationTrainingStatus, TrainingClass } from "@workspace/api-client-react";
import type { CatalogMeta } from "./_lib/catalog-meta";
import { formatDate, trainingDeadline, STATUS_LABEL, CLASS_STATUS_LABEL } from "./_lib/format";

function fileTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function buildColaboradorRows(
  rows: OrganizationTraining[],
  catalogMeta: Map<number, CatalogMeta>,
): Record<string, string | number>[] {
  return rows.map((t) => {
    const meta = t.catalogItemId != null ? catalogMeta.get(t.catalogItemId) : undefined;
    return {
      Colaborador: t.employeeName,
      Cargo: t.employeePosition ?? "",
      Filial: t.unitName ?? "",
      Treinamento: t.title,
      Norma: meta?.normLabels.join(", ") ?? "",
      Situação: STATUS_LABEL[t.status as OrganizationTrainingStatus] ?? t.status,
      Vencimento: formatDate(trainingDeadline(t)).replace("—", ""),
      Crítico: meta?.isCritical ? "Sim" : "Não",
    };
  });
}

export function buildTurmaRows(
  classes: TrainingClass[],
  catalogTitleById: Map<number, string>,
  unitNameById: Map<number, string>,
): Record<string, string | number>[] {
  return classes.map((c) => ({
    Turma: c.code ?? "",
    Treinamento: catalogTitleById.get(c.catalogItemId) ?? `#${c.catalogItemId}`,
    Data: formatDate(c.startDate).replace("—", ""),
    Filial: c.unitId ? (unitNameById.get(c.unitId) ?? "") : "",
    Inscritos: c.participantCount ?? 0,
    Confirmados: c.confirmedCount ?? 0,
    Realizados: c.realizadoCount ?? 0,
    Status: CLASS_STATUS_LABEL[c.status] ?? c.status,
  }));
}

export function exportGestaoXlsx(view: "colaborador" | "turma", rows: Record<string, string | number>[]): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0] ?? {});
  ws["!cols"] = headers.map((h) => {
    const max = Math.max(h.length, ...rows.map((r) => String(r[h] ?? "").length));
    return { wch: Math.min(max + 2, 50) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, view === "turma" ? "Turmas" : "Colaboradores");
  XLSX.writeFile(wb, `gestao-treinamentos_${fileTimestamp()}.xlsx`);
}
```

- [ ] **Step 4: Ligar o botão no index.tsx** — no topbar (junto do `<Select>` de filial), adicionar:

```tsx
      <button
        type="button"
        onClick={() => {
          if (tab === "turma") {
            exportGestaoXlsx("turma", buildTurmaRows(classes, catalogTitle, unitName));
          } else {
            exportGestaoXlsx("colaborador", buildColaboradorRows(rows, catalogMeta));
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        Exportar
      </button>
```

Import: `import { buildColaboradorRows, buildTurmaRows, exportGestaoXlsx } from "./_export";`

> Na aba "prazo", exporta a mesma lista de colaborador (usa `rowsByDeadline`). Ajustar o condicional se quiser refletir a ordenação por prazo.

- [ ] **Step 5: Rodar teste + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-export.unit.test.ts`
Expected: PASS.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/gestao/ artifacts/web/tests/pages/aprendizagem/gestao-export.unit.test.ts
git commit -m "feat(aprendizagem): exportação .xlsx da Gestão de treinamentos (aba ativa + filtros)"
```

---

## Task 8: Frontend — "Por prazo" como painel de 3 colunas

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/gestao/_components/PorPrazoPanel.tsx`
- Modify: `artifacts/web/src/pages/app/aprendizagem/gestao/index.tsx` (substituir a aba "prazo" atual — a tabela reordenada — pelo painel; adicionar 3 queries de bucket)
- Test: `artifacts/web/tests/pages/aprendizagem/gestao-por-prazo-panel.unit.test.tsx`

**Interfaces:**
- `PorPrazoPanel({ vencidos, aVencer, pendentesSemTurma, onSeeAll, onCreateClass })` — 3 colunas; cada uma recebe uma lista já resolvida `PrazoItem[]` (`{ id; primary; meta }`) + contagem total; CTAs por callback. Componente é apresentacional (sem hooks de dados).
- `type PrazoItem = { id: number; primary: string; meta: string };`

- [ ] **Step 1: Escrever o teste (falhando)**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PorPrazoPanel } from "@/pages/app/aprendizagem/gestao/_components/PorPrazoPanel";

describe("PorPrazoPanel", () => {
  const vencidos = { total: 12, items: [{ id: 1, primary: "Carlos — Dir. defensiva", meta: "Venceu 15/04/26 · Porto Alegre" }] };
  const aVencer = { total: 23, items: [{ id: 2, primary: "Ana — Integração", meta: "Vence 01/07/26 · 8 dias" }] };
  const pendentes = { total: 47, items: [{ id: 3, primary: "Roberto — NR-35", meta: "Aguardando turma" }] };

  it("mostra as 3 colunas com contagens e itens", () => {
    render(<PorPrazoPanel vencidos={vencidos} aVencer={aVencer} pendentesSemTurma={pendentes} onSeeAll={() => {}} onCreateClass={() => {}} />);
    expect(screen.getByText("Vencidos")).toBeInTheDocument();
    expect(screen.getByText("A vencer em 30 dias")).toBeInTheDocument();
    expect(screen.getByText("Pendentes sem turma")).toBeInTheDocument();
    expect(screen.getByText("Carlos — Dir. defensiva")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("CTA 'Ver todos' de vencidos chama onSeeAll('vencido')", () => {
    const onSeeAll = vi.fn();
    render(<PorPrazoPanel vencidos={vencidos} aVencer={aVencer} pendentesSemTurma={pendentes} onSeeAll={onSeeAll} onCreateClass={() => {}} />);
    fireEvent.click(screen.getAllByText(/Ver todos/i)[0]);
    expect(onSeeAll).toHaveBeenCalledWith("vencido");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-por-prazo-panel.unit.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o componente**

```tsx
import { cn } from "@/lib/utils";
import type { CardStatusFilter } from "./MetricCards";

export type PrazoItem = { id: number; primary: string; meta: string };
type Bucket = { total: number; items: PrazoItem[] };

function Column({
  title, tone, bucket, cta, onCta,
}: {
  title: string; tone: string; bucket: Bucket; cta: string; onCta: () => void;
}) {
  return (
    <div>
      <div className={cn("mb-2.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide", tone)}>
        {title}
        <span className="rounded-full bg-current/10 px-2 py-0.5 tabular-nums">{bucket.total}</span>
      </div>
      <div className="space-y-1.5">
        {bucket.items.map((it) => (
          <div key={it.id} className="rounded-lg border bg-card px-3 py-2">
            <div className="text-xs font-medium">{it.primary}</div>
            <div className="text-[11px] text-muted-foreground">{it.meta}</div>
          </div>
        ))}
      </div>
      <button type="button" onClick={onCta} className="mt-2 w-full rounded-md border px-3 py-1.5 text-[11px] font-medium hover:bg-muted">
        {cta}
      </button>
    </div>
  );
}

export function PorPrazoPanel({
  vencidos, aVencer, pendentesSemTurma, onSeeAll, onCreateClass,
}: {
  vencidos: Bucket; aVencer: Bucket; pendentesSemTurma: Bucket;
  onSeeAll: (f: CardStatusFilter) => void;
  onCreateClass: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Column title="Vencidos" tone="text-red-700" bucket={vencidos} cta="Ver todos vencidos →" onCta={() => onSeeAll("vencido")} />
      <Column title="A vencer em 30 dias" tone="text-amber-700" bucket={aVencer} cta="Ver todos →" onCta={() => onSeeAll("a_vencer")} />
      <Column title="Pendentes sem turma" tone="text-blue-700" bucket={pendentesSemTurma} cta="Criar turma →" onCta={onCreateClass} />
    </div>
  );
}
```

- [ ] **Step 4: Ligar no index.tsx**

- Adicionar 3 queries `useListOrganizationTrainings` (pageSize ~5 cada) para os buckets, reusando `baseParams`:
  - vencidos: `{ ...baseParams, status: "vencido", pageSize: 5 }`
  - aVencer: `{ ...baseParams, expiringWithinDays: 30, pageSize: 5 }`
  - pendentesSemTurma: buscar `{ ...baseParams, status: "pendente", pageSize: 50 }` e **excluir os programados** no cliente — como não há flag por linha, buscar também `{ ...baseParams, onlyProgramado: true, pageSize: 500 }` e filtrar `pendentes` cujo `id` não está no conjunto de programados. (Simples e correto para o v1; total = `stats.pendente - stats.programado`.)
- Mapear cada linha para `PrazoItem`: `primary = \`${t.employeeName} — ${t.title}\``, `meta` = data + filial (usar `formatDate(trainingDeadline(t))` + `t.unitName`).
- Substituir o bloco atual da aba `prazo` (~393–414) por:

```tsx
      {tab === "prazo" ? (
        <PorPrazoPanel
          vencidos={{ total: stats?.vencido ?? 0, items: vencidosItems }}
          aVencer={{ total: aVencerCount, items: aVencerItems }}
          pendentesSemTurma={{ total: (stats?.pendente ?? 0) - (stats?.programado ?? 0), items: pendentesSemTurmaItems }}
          onSeeAll={(f) => { setStatusFilter(f); setTab("colaborador"); }}
          onCreateClass={() => setLocation("/aprendizagem/turmas")}
        />
      ) : null}
```

> Usar o hook de navegação já disponível (wouter `useLocation` → `setLocation`, ou um `<Link>`). Se preferir, o CTA "Criar turma" pode ser um `<Link href="/aprendizagem/turmas">` embutido; nesse caso ajuste a assinatura para não exigir `onCreateClass`.

- [ ] **Step 5: Rodar teste + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-por-prazo-panel.unit.test.tsx`
Expected: PASS.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/gestao/ artifacts/web/tests/pages/aprendizagem/gestao-por-prazo-panel.unit.test.tsx
git commit -m "feat(aprendizagem): Por prazo como painel de 3 colunas (vencidos/a vencer/pendentes sem turma)"
```

---

## Final: rodar toda a suíte da Gestão

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/gestao-*.unit.test.tsx artifacts/web/tests/pages/aprendizagem/gestao-*.unit.test.ts`
Expected: todos verdes.
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/gestao-*.integration.test.ts`
Expected: verdes.
Run: `pnpm typecheck` → 0 erros.
