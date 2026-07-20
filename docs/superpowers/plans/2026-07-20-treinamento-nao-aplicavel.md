# Treinamento "Não aplicável" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar um treinamento do colaborador como **Não aplicável**, com motivo obrigatório, e garantir que ele saia de **toda** contagem de obrigação do módulo.

**Architecture:** Novo valor `nao_aplicavel` na coluna `employee_trainings.status` (texto livre, sem constraint ⇒ sem DDL para o valor) + coluna nova nullable `not_applicable_reason` (única DDL). A obrigatoriedade do motivo é validada na API. O trabalho pesado não é a opção no dropdown: é excluir o NA nos pontos que hoje tratam "não concluído" como pendência.

**Tech Stack:** Express 5 + Drizzle; OpenAPI 3.1 → Orval; React 19 + Vite; Vitest (web-unit JSDOM + integration Node).

**Spec:** `docs/superpowers/specs/2026-07-20-treinamento-nao-aplicavel-design.md`

## Global Constraints

- **Regra central (verbatim):** um treinamento com `status = 'nao_aplicavel'` é **invisível para toda contagem de obrigação** — não é pendência, não vence, não é realizado, e não entra em numerador nem denominador de conformidade. Continua visível na ficha, com o motivo, como registro auditável.
- **Única DDL:** `ALTER TABLE employee_trainings ADD COLUMN not_applicable_reason text;` (nullable, aditiva). Aplicar **apenas no docker de teste** durante a implementação; a produção depende de autorização explícita do usuário e **não** faz parte de nenhuma tarefa.
- **NUNCA** rodar `pnpm --filter @workspace/db push` (aponta para o Neon de PRODUÇÃO). No docker use DDL cirúrgica via `docker exec -i daton-postgres-1 psql -U postgres -d daton_integration`.
- **NUNCA** rodar o vitest de integração sem `TEST_ENV=integration` (senão bate no Neon de PRODUÇÃO).
- **OpenAPI é fonte única:** editar `lib/api-spec/openapi.yaml` e rodar `pnpm --filter @workspace/api-spec codegen` (precisa `python3`). **Nunca** editar arquivos gerados à mão.
- `pnpm typecheck` deve passar ao fim de cada tarefa.
- Glob web-unit: `artifacts/web/tests/**/*.unit.test.{ts,tsx}`. Integração: `artifacts/api-server/tests/**/*.integration.test.ts`.
- UI em PT-BR; rótulo exato **"Não aplicável"**; label do campo **"Motivo da não aplicabilidade *"**. Não alterar o design system.
- Commits em PT-BR, sem dados de produção (repo público).
- **Não** mexer no status `em_andamento` (dívida pré-existente, fora de escopo).

---

## File Structure

**Backend (modificar):**
- `lib/api-spec/openapi.yaml` — `nao_aplicavel` no enum (5 ocorrências `enum: [pendente, concluido, vencido]` + 1 lista em ~13623) e campo `notApplicableReason` nos schemas de treinamento.
- `artifacts/api-server/src/routes/employees.ts` — `deriveTrainingStatus` (~308); filtro/stats/buckets da lista (~1868–1990); POST (~3312) e PATCH (~3434).
- `artifacts/api-server/src/services/kpi/lms-metrics.ts` — negação.
- `artifacts/api-server/src/services/aprendizagem/learning-summary.ts` — negação.
- `artifacts/api-server/src/routes/training-catalog.ts` — 2 negações.
- `artifacts/api-server/src/services/aprendizagem/requirements-engine.ts` — dedup (~88–99).

**Frontend (modificar):**
- `artifacts/web/src/pages/app/aprendizagem/gestao/_lib/format.ts` — badge/label.
- `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx` — mapa de status, diálogo, listagem.
- `artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx` e `treinamento-detalhe.tsx` — mapas.
- `artifacts/web/src/pages/app/aprendizagem/minha-area/index.tsx` — mapa.
- `artifacts/web/src/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations.ts` — contadores.

**Testes (novos):**
- `artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`
- `artifacts/web/tests/pages/aprendizagem/ficha-derivations-na.unit.test.ts`
- `artifacts/web/tests/pages/aprendizagem/registrar-conclusao-na.unit.test.tsx`

---

## Task 1: Contrato + escrita (motivo obrigatório)

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Modify: `artifacts/api-server/src/routes/employees.ts` (POST ~3312, PATCH ~3434)
- Test: `artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`

**Interfaces:**
- Produces: valor de status `nao_aplicavel` e campo `notApplicableReason?: string | null` em `CreateTrainingBody`, `UpdateTrainingBody`, `OrganizationTraining` e no schema de treinamento do colaborador. Consumido pelas Tasks 2–6.

- [ ] **Step 1: Aplicar a coluna no banco docker de teste**

```bash
docker exec -i daton-postgres-1 psql -U postgres -d daton_integration -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE employee_trainings ADD COLUMN IF NOT EXISTS not_applicable_reason text;
SQL
```
Expected: `ALTER TABLE`. (NÃO tocar na produção.)

- [ ] **Step 2: Declarar a coluna no schema Drizzle**

Em `lib/db/src/schema/employees.ts`, na tabela `employee_trainings`, ao lado de `status`:

```ts
    /** Motivo obrigatório quando status = 'nao_aplicavel'. Nullable: registros
     *  históricos e os demais status não têm motivo. */
    notApplicableReason: text("not_applicable_reason"),
```

- [ ] **Step 3: Escrever o teste de integração (falhando)**

Criar `artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`. Abra um `*.integration.test.ts` vizinho (ex.: `gestao-trainings-stats.integration.test.ts`) e **copie o padrão real** de imports/contexto (`createTestContext({seed})`, `ctx.organizationId`, `ctx.prefix`, `authHeader(ctx)`, `createEmployee(ctx, …)`, `cleanupTestContext` no `afterEach`).

```ts
it("rejeita nao_aplicavel sem motivo e aceita com motivo", async () => {
  const ctx = await createTestContext({ seed: "na-motivo" });
  contexts.push(ctx);
  const emp = await createEmployee(ctx, { name: `${ctx.prefix} Fulano` });

  const semMotivo = await request(app)
    .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
    .set(authHeader(ctx))
    .send({ title: `${ctx.prefix} NR-35`, status: "nao_aplicavel" });
  expect(semMotivo.status).toBe(400);

  const comMotivo = await request(app)
    .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
    .set(authHeader(ctx))
    .send({
      title: `${ctx.prefix} NR-35`,
      status: "nao_aplicavel",
      notApplicableReason: "Colaborador não executa atividade em altura",
    });
  expect(comMotivo.status).toBe(201);
  expect(comMotivo.body.status).toBe("nao_aplicavel");
  expect(comMotivo.body.notApplicableReason).toBe(
    "Colaborador não executa atividade em altura",
  );
});

it("sair de nao_aplicavel limpa o motivo", async () => {
  const ctx = await createTestContext({ seed: "na-limpa-motivo" });
  contexts.push(ctx);
  const emp = await createEmployee(ctx, { name: `${ctx.prefix} Ciclano` });
  const criado = await request(app)
    .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
    .set(authHeader(ctx))
    .send({ title: `${ctx.prefix} NR-10`, status: "nao_aplicavel", notApplicableReason: "Não se aplica" });
  expect(criado.status).toBe(201);

  const patch = await request(app)
    .patch(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings/${criado.body.id}`)
    .set(authHeader(ctx))
    .send({ status: "pendente" });
  expect(patch.status).toBe(200);
  expect(patch.body.status).toBe("pendente");
  expect(patch.body.notApplicableReason).toBeNull();
});
```

> Confirme no código a rota real de POST/PATCH de treinamento do colaborador (caminho e verbo) antes de escrever as URLs.

- [ ] **Step 4: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`
Expected: FAIL — `nao_aplicavel` rejeitado pelo enum (400 nos dois casos).

- [ ] **Step 5: OpenAPI — enum e campo**

Em `lib/api-spec/openapi.yaml`, nas **5** ocorrências de `enum: [pendente, concluido, vencido]` (linhas ~1108, 13107, 13205, 13987, 14089), trocar por:

```yaml
enum: [pendente, concluido, vencido, nao_aplicavel]
```

E na lista em ~13623 (formato `- pendente / - concluido / - vencido`), acrescentar `- nao_aplicavel`.

Nos schemas de treinamento (os que têm `status` acima), adicionar ao lado:

```yaml
        notApplicableReason:
          type: string
          nullable: true
          description: >-
            Motivo obrigatório quando status = nao_aplicavel. A API rejeita NA
            sem motivo e limpa o campo quando o status deixa de ser NA.
```

- [ ] **Step 6: Codegen**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: `CreateTrainingBodyStatusValues` passa a incluir `nao_aplicavel`; os tipos ganham `notApplicableReason`.

- [ ] **Step 7: Validar na escrita (POST e PATCH)**

Em `artifacts/api-server/src/routes/employees.ts`, após o `safeParse` do body no POST (~3312) e no PATCH (~3434), aplicar a mesma regra. Extraia um helper único no arquivo (não duplique a lógica):

```ts
/** NA exige motivo; qualquer outro status descarta o motivo. Devolve o valor a
 *  gravar em not_applicable_reason, ou um erro de validação. */
function resolveNotApplicableReason(
  status: string | undefined,
  reason: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (status === "nao_aplicavel") {
    const trimmed = (reason ?? "").trim();
    if (!trimmed) {
      return { ok: false, error: "Motivo é obrigatório quando o status é Não aplicável" };
    }
    return { ok: true, value: trimmed };
  }
  return { ok: true, value: null };
}
```

Uso no POST e no PATCH: se `ok === false`, responder `400` com `{ error }`; senão gravar `notApplicableReason: value` junto do `status`.

> No PATCH, o status pode não vir no body (atualização parcial). Nesse caso use o status **atual do registro** para decidir, e só limpe o motivo se o status resultante deixar de ser NA.

- [ ] **Step 8: Serializar o campo na resposta**

O mapper da resposta de treinamento enumera campos manualmente (foi assim que `catalogItemId` ficou de fora antes). Garanta `notApplicableReason: row.notApplicableReason` **em todos** os pontos que devolvem um treinamento: POST, PATCH, detalhe e o `pageData` da listagem (`routes/employees.ts`, ~2050).

- [ ] **Step 9: Rodar teste + typecheck**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`
Expected: PASS (2/2).
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 10: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react lib/db/src/schema/employees.ts artifacts/api-server/src/routes/employees.ts artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts
git commit -m "feat(aprendizagem): status nao_aplicavel com motivo obrigatório na API"
```

---

## Task 2: NA sai do status derivado, dos filtros, das stats e dos buckets

**Files:**
- Modify: `artifacts/api-server/src/routes/employees.ts` (`deriveTrainingStatus` ~308; filtro ~1868–1889; `statsRow`; fragmentos `isProgramado`/`isRealizadoMes`/`onlyPendenteSemTurma`)
- Test: `artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts` (acrescentar casos)

**Interfaces:** Consumes o valor `nao_aplicavel` (Task 1).

- [ ] **Step 1: Acrescentar os testes (falhando)**

```ts
it("NA não conta como pendente nem vencido, e não vira vencido pela validade", async () => {
  const ctx = await createTestContext({ seed: "na-fora-das-contagens" });
  contexts.push(ctx);
  const emp = await createEmployee(ctx, { name: `${ctx.prefix} Beltrano` });
  // NA com validade JÁ VENCIDA: não pode virar "vencido"
  await request(app)
    .post(`/api/organizations/${ctx.organizationId}/employees/${emp.id}/trainings`)
    .set(authHeader(ctx))
    .send({
      title: `${ctx.prefix} NR-33`,
      status: "nao_aplicavel",
      notApplicableReason: "Não executa espaço confinado",
      expirationDate: "2020-01-01",
    });

  const res = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/employees/trainings?pageSize=50`)
    .set(authHeader(ctx));
  expect(res.status).toBe(200);
  expect(res.body.stats.pendente).toBe(0);
  expect(res.body.stats.vencido).toBe(0);
  const row = res.body.data.find((t: { title: string }) => t.title.includes("NR-33"));
  expect(row.status).toBe("nao_aplicavel"); // não derivou para vencido

  const soPendentes = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/employees/trainings?status=pendente&pageSize=50`)
    .set(authHeader(ctx));
  expect(soPendentes.body.data.length).toBe(0);

  const soVencidos = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/employees/trainings?status=vencido&pageSize=50`)
    .set(authHeader(ctx));
  expect(soVencidos.body.data.length).toBe(0);

  const semTurma = await request(app)
    .get(`/api/organizations/${ctx.organizationId}/employees/trainings?onlyPendenteSemTurma=true&pageSize=50`)
    .set(authHeader(ctx));
  expect(semTurma.body.data.length).toBe(0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`
Expected: FAIL — o NA aparece como `vencido` (derivação pela validade) e é contado.

- [ ] **Step 3: `deriveTrainingStatus` — NA sai antes da checagem de validade**

Em `routes/employees.ts:308`:

```ts
function deriveTrainingStatus(
  status: string,
  expirationDate: string | null,
): string {
  // "Não aplicável" não vence: é um registro fora de qualquer obrigação.
  if (status === "nao_aplicavel") return status;
  if (expirationDate) {
    const expDate = new Date(expirationDate);
    if (expDate < new Date()) {
      return "vencido";
    }
  }
  return status;
}
```

- [ ] **Step 4: Definir um fragmento SQL único e reusá-lo**

Junto dos fragmentos já existentes (`isProgramado`, `isRealizadoMes`), adicionar:

```ts
/** Todo cálculo de obrigação ignora "não aplicável". */
const notNaoAplicavel = sql`${employeeTrainingsTable.status} <> 'nao_aplicavel'`;
```

- [ ] **Step 5: Aplicar nos pontos da rota**

- No ramo `vencido` do filtro de status (~1878), a condição casa por validade vencida — some `and ${notNaoAplicavel}`.
- Nas contagens do `statsRow`: `pendenteCount`, `vencidoCount` e `concluidoCount` recebem `and ${notNaoAplicavel}` (o `concluido` por consistência, ainda que `= 'concluido'` já exclua).
- Nos fragmentos `isProgramado` e `isRealizadoMes` e na condição de `onlyPendenteSemTurma`: garanta que partem de `pendente`/`concluido` explícitos (já partem) — **confirme** lendo o código e ajuste se algum ramo usar negação.

- [ ] **Step 6: Rodar teste + typecheck**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`
Expected: PASS.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/employees.ts artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts
git commit -m "fix(aprendizagem): NA fora do status derivado, dos filtros, das stats e dos buckets"
```

---

## Task 3: As 4 negações `<> 'concluido'`

**Files:**
- Modify: `artifacts/api-server/src/services/kpi/lms-metrics.ts`
- Modify: `artifacts/api-server/src/services/aprendizagem/learning-summary.ts`
- Modify: `artifacts/api-server/src/routes/training-catalog.ts` (2 ocorrências)
- Test: `artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts` (acrescentar)

- [ ] **Step 1: Acrescentar o teste (falhando)**

Um treino NA de um colaborador não pode ser contado como pendência no agregado do catálogo. Monte: catálogo + colaborador + treino NA vinculado ao item; chame a listagem do catálogo (`GET /organizations/:orgId/training-catalog`) e assere que a contagem de pendentes daquele item é `0`.

> Confirme o nome exato do campo de pendências no item do catálogo lendo `routes/training-catalog.ts` antes de escrever a asserção.

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts`
Expected: FAIL — o NA é contado como pendência.

- [ ] **Step 3: Corrigir as 4 negações**

Em cada uma das 4 ocorrências, trocar

```ts
sql`${employeeTrainingsTable.status} <> 'concluido'`
```

por

```ts
sql`${employeeTrainingsTable.status} not in ('concluido', 'nao_aplicavel')`
```

Localize-as com: `grep -rn "<> 'concluido'" artifacts/api-server/src`. **Devem sobrar zero ocorrências** ao fim.

- [ ] **Step 4: Rodar teste + typecheck**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts` → PASS.
Run: `grep -rn "<> 'concluido'" artifacts/api-server/src` → sem resultados.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts
git commit -m "fix(aprendizagem): NA deixa de ser contado como pendência (negações <> concluido)"
```

---

## Task 4: Motor de requisitos não recria um NA

**Files:**
- Modify: `artifacts/api-server/src/services/aprendizagem/requirements-engine.ts` (~88–99)
- Test: `artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts` (acrescentar)

- [ ] **Step 1: Acrescentar o teste (falhando)**

Monte um colaborador com cargo + obrigatoriedade; rode o motor uma vez (ou use a rota que o dispara) para gerar o pendente; marque o treino como NA (PATCH com motivo); rode o motor de novo; assere que **não** surgiu um novo pendente para o mesmo requisito (total de treinos do colaborador continua 1, e o único registro segue `nao_aplicavel`).

> Leia `requirements-engine.ts` para descobrir como disparar `applyTrainingRequirements` no teste (chamada direta do serviço é aceitável e mais simples que achar a rota).

- [ ] **Step 2: Rodar e ver falhar**

Expected: FAIL — surge um segundo treino `pendente` para o mesmo requisito.

- [ ] **Step 3: Tratar NA como "já resolvido" no dedup**

Nos conjuntos de dedup (~88–99), o filtro é `t.status === "pendente"`. O NA precisa entrar nos mesmos conjuntos para bloquear a recriação:

```ts
  // "pendente" bloqueia recriação por já existir a pendência; "nao_aplicavel"
  // bloqueia porque o RH declarou que o requisito não se aplica a esta pessoa —
  // recriar o pendente ressuscitaria exatamente o que foi dispensado.
  const jaTratado = (s: string) => s === "pendente" || s === "nao_aplicavel";

  const pendingByRequirement = new Set(
    existing
      .filter((t) => jaTratado(t.status))
      .map((t) => t.requirementId)
      .filter((id): id is number => id != null),
  );
  const pendingCatalogIds = new Set(
    existing
      .filter((t) => jaTratado(t.status))
      .map((t) => t.catalogItemId)
      .filter((id): id is number => id != null),
  );
```

- [ ] **Step 4: Rodar teste + typecheck** → PASS / 0 erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/aprendizagem/requirements-engine.ts artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts
git commit -m "fix(aprendizagem): motor de requisitos não recria treino marcado como não aplicável"
```

---

## Task 5: Frontend — rótulos, badges e contadores da ficha

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/gestao/_lib/format.ts`
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx` (mapa ~127)
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx` (~109, ~118)
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamento-detalhe.tsx` (~66, ~75)
- Modify: `artifacts/web/src/pages/app/aprendizagem/minha-area/index.tsx` (~18)
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations.ts`
- Test: `artifacts/web/tests/pages/aprendizagem/ficha-derivations-na.unit.test.ts`

**Interfaces:** `computeTrainingCounters` passa a devolver `naoAplicavel: number`, e `total` **exclui** os NA.

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { computeTrainingCounters } from "@/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations";

describe("computeTrainingCounters — não aplicável", () => {
  it("NA fica fora do total e dos 3 contadores, e tem contagem própria", () => {
    const r = computeTrainingCounters(
      [
        { status: "concluido", expirationDate: null },
        { status: "pendente", expirationDate: null },
        { status: "nao_aplicavel", expirationDate: null },
        // NA com validade vencida continua NA — não conta como vencido
        { status: "nao_aplicavel", expirationDate: "2020-01-01" },
      ],
      "2026-07-20",
    );
    expect(r.feitos).toBe(1);
    expect(r.pendentes).toBe(1);
    expect(r.vencidos).toBe(0);
    expect(r.naoAplicavel).toBe(2);
    expect(r.total).toBe(2); // total ignora os NA
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/ficha-derivations-na.unit.test.ts`
Expected: FAIL — `naoAplicavel` não existe e `total` inclui os NA.

- [ ] **Step 3: Ajustar `computeTrainingCounters`**

```ts
export function computeTrainingCounters(
  trainings: { status?: string | null; expirationDate?: string | null }[],
  today: string = new Date().toISOString().slice(0, 10),
): { total: number; feitos: number; pendentes: number; vencidos: number; naoAplicavel: number } {
  let feitos = 0;
  let pendentes = 0;
  let vencidos = 0;
  let naoAplicavel = 0;
  for (const t of trainings) {
    // "Não aplicável" sai de toda contagem de obrigação — inclusive do total.
    if (t.status === "nao_aplicavel") {
      naoAplicavel++;
      continue;
    }
    const expired = !!t.expirationDate && t.expirationDate < today;
    if (t.status === "vencido" || (t.status === "concluido" && expired)) {
      vencidos++;
    } else if (t.status === "concluido") {
      feitos++;
    } else if (t.status === "pendente") {
      pendentes++;
    }
  }
  return { total: trainings.length - naoAplicavel, feitos, pendentes, vencidos, naoAplicavel };
}
```

Ajuste o `FichaHeader` (que consome os contadores) para não quebrar: mantenha os 4 contadores atuais e, se houver NA, exiba um 5º discreto "Não aplicável".

- [ ] **Step 4: Rótulo e badge em todos os mapas**

Em cada um dos 5 arquivos de mapa, acrescentar a entrada `nao_aplicavel`:
- label: `"Não aplicável"`
- estilo neutro, coerente com o arquivo (ex.: em `gestao/_lib/format.ts`, `"bg-muted text-muted-foreground border-border"`; onde o mapa é de variante de Badge, use a variante neutra já existente no arquivo, ex.: `"secondary"` / `"outline"`).

> Cada arquivo tem sua convenção — **leia o mapa vizinho e siga a dele**; não invente classe nova.

- [ ] **Step 5: Rodar testes + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/` → tudo verde (inclusive os testes existentes da ficha e da Gestão).
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src artifacts/web/tests
git commit -m "feat(aprendizagem): rótulo Não aplicável e contadores da ficha ignorando NA"
```

---

## Task 6: Frontend — diálogo "Registrar conclusão"

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx` (diálogo ~2646–2760 e a listagem de treinamentos)
- Test: `artifacts/web/tests/pages/aprendizagem/registrar-conclusao-na.unit.test.tsx`

**Interfaces:** Consumes `CreateTrainingBodyStatusValues.nao_aplicavel` e o campo `notApplicableReason` (Task 1).

- [ ] **Step 1: Extrair o corpo do diálogo para um componente testável**

O diálogo hoje vive inline num arquivo grande. Extraia o **corpo do formulário** para `colaboradores/_components/RegistrarConclusaoForm.tsx`, apresentacional: recebe `form`, `onChange`, `instructorOptions` e devolve os campos. Isso permite testar a regra do motivo sem montar a página inteira. A lógica de salvar continua no `[id].tsx`.

- [ ] **Step 2: Escrever o teste (falhando)**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RegistrarConclusaoForm } from "@/pages/app/aprendizagem/colaboradores/_components/RegistrarConclusaoForm";

const base = { status: "pendente", completionDate: "", expirationDate: "", instructor: "", notApplicableReason: "" };

describe("RegistrarConclusaoForm — Não aplicável", () => {
  it("oferece a opção Não aplicável", () => {
    render(<RegistrarConclusaoForm form={base as never} onChange={() => {}} instructorOptions={[]} />);
    expect(screen.getByRole("option", { name: "Não aplicável" })).toBeInTheDocument();
  });

  it("com NA selecionado, mostra o campo de motivo e sinaliza obrigatoriedade quando vazio", () => {
    render(
      <RegistrarConclusaoForm
        form={{ ...base, status: "nao_aplicavel" } as never}
        onChange={() => {}}
        instructorOptions={[]}
      />,
    );
    expect(screen.getByLabelText(/Motivo da não aplicabilidade/i)).toBeInTheDocument();
    expect(screen.getByText(/obrigatório/i)).toBeInTheDocument();
  });

  it("sem NA, o campo de motivo não aparece", () => {
    render(<RegistrarConclusaoForm form={base as never} onChange={() => {}} instructorOptions={[]} />);
    expect(screen.queryByLabelText(/Motivo da não aplicabilidade/i)).not.toBeInTheDocument();
  });

  it("selecionar NA emite a mudança de status", () => {
    const onChange = vi.fn();
    render(<RegistrarConclusaoForm form={base as never} onChange={onChange} instructorOptions={[]} />);
    fireEvent.change(screen.getByLabelText(/Status/i), { target: { value: "nao_aplicavel" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: "nao_aplicavel" }));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/registrar-conclusao-na.unit.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 4: Implementar**

No `RegistrarConclusaoForm`:
- 4ª `<option value={CreateTrainingBodyStatusValues.nao_aplicavel}>Não aplicável</option>`.
- Quando `form.status === "nao_aplicavel"`: renderizar um `<Textarea>`/`<Input>` com `<Label>` **"Motivo da não aplicabilidade *"** ligado por `htmlFor`/`id`; se vazio, exibir a mensagem `Motivo é obrigatório quando o status é Não aplicável`.
- Quando NA: **desabilitar** os campos "Data de conclusão" e "Validade" (não apagar valores gravados).
- Ao trocar de NA para outro status: emitir `notApplicableReason: ""` junto da mudança.

No `[id].tsx`:
- Bloquear o botão **Salvar** enquanto `status === "nao_aplicavel"` e o motivo estiver vazio.
- Enviar `notApplicableReason` no payload de criação/edição.
- Na listagem de treinamentos da ficha, exibir o motivo como texto de apoio quando o item for NA.

- [ ] **Step 5: Rodar testes + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/` → tudo verde.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/web/src artifacts/web/tests
git commit -m "feat(aprendizagem): opção Não aplicável com motivo obrigatório no Registrar conclusão"
```

---

## Final

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/` → verde.
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/treinamento-nao-aplicavel.integration.test.ts artifacts/api-server/tests/gestao-trainings-stats.integration.test.ts` → verde (o segundo garante que os buckets da Gestão não regrediram).
Run: `pnpm typecheck` → 0 erros.
Run: `grep -rn "<> 'concluido'" artifacts/api-server/src` → sem resultados.

**Antes do PR:** validar a tela no navegador (abrir o diálogo, marcar NA sem motivo, com motivo, conferir que o item sai dos contadores da ficha e dos cards da Gestão).

**Não incluído em nenhuma tarefa:** a DDL de produção (`ALTER TABLE employee_trainings ADD COLUMN not_applicable_reason text;`) — depende de autorização explícita do usuário.
