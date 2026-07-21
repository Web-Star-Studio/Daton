# Evidência pela linha do requisito + "Outras competências" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a evidência de competência entrar pela própria linha do requisito do cargo (herdando nome+tipo+nível), de modo que o resolvedor a reconheça na hora, e separar/renomear o bloco manual como "Outras competências".

**Architecture:** Reutiliza `employee_competencies` (sem tabela nova, sem DDL). Um novo endpoint faz **upsert por `buildCompetencyKey`** — o casamento de nome fica autoritativo no backend. O resolvedor passa a expor `manualCompetencyId` por requisito; o GET do colaborador marca cada competência com `isPositionRequirement`. O frontend só consome esses sinais (nunca re-normaliza).

**Tech Stack:** Express 5 + Drizzle (backend), OpenAPI 3.1 + Orval (contrato/hooks), React 19 + React Query + Tailwind (frontend), Vitest (unit/integração).

## Global Constraints

- **Sem tabela nova, sem DDL, sem correção de dado em produção.** Só leitura/escrita em colunas já existentes de `employee_competencies` e leitura de `position_competency_requirements`.
- **Casamento nome/tipo é autoritativo no backend** via `buildCompetencyKey` (de `services/aprendizagem/competency-resolver.ts`). O frontend **nunca** re-deriva normalização.
- **Reusar, não recriar:** `buildCompetencyKey`; o padrão de upsert já em `routes/employees.ts:3958-4003`; `ProfileItemAttachmentsField`, `uploadEmployeeRecordFiles`, `mapRecordAttachmentItems`, `EMPLOYEE_RECORD_ATTACHMENT_ACCEPT`, `sanitizeEmployeeRecordAttachments`, `validateEmployeeRecordAttachments`, `formatCompetencyRecord`.
- **Invariante da Fase 1:** `nao_classificado` nunca conta como lacuna (fora de selo/barra/denominador).
- **Nível adquirido no upsert é exatamente o enviado** (edição manual pode baixar) — diferente do fluxo de eficácia, que usa `max`.
- **Copy exata (nomenclatura):**
  - Bloco cargo: título **"Competências do cargo"**, subtítulo **"Exigidas pelo cargo · anexe a evidência de cada uma"**.
  - Bloco manual: título **"Outras competências"**, subtítulo **"Qualificações além das que o cargo exige"**.
- **Após mexer no `openapi.yaml`:** rodar `pnpm --filter @workspace/api-spec codegen` (precisa de `python3`). Nunca editar arquivos gerados à mão.
- Prettier: 2 espaços, aspas duplas, trailing commas. `pnpm typecheck` limpo ao fim de cada task.
- Testes de integração: sempre `TEST_ENV=integration`. Nunca `pnpm db push`.

## File Structure

- `lib/api-spec/openapi.yaml` — novo path + 2 campos de schema (contrato, fonte única).
- `artifacts/api-server/src/services/aprendizagem/competency-resolver.ts` — `manualCompetencyId` em `ResolvedRequirement`.
- `artifacts/api-server/src/routes/employees.ts` — novo endpoint de upsert; `isPositionRequirement` no GET.
- `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/FormacaoQualificacoes.tsx` — linhas acionáveis + subtítulo + fix do selo.
- `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/RegistrarEvidenciaDialog.tsx` — **novo**, diálogo focado.
- `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx` — wiring do diálogo + rename/filtragem de "Outras competências".
- Testes: `tests/**` (node-unit para resolver, integração para rotas, web-unit para componentes).

---

## Task 1: Contrato — endpoint de evidência + campos de conformidade

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Generated (via codegen, não editar): `lib/api-zod/src/generated/`, `lib/api-client-react/src/generated/`

**Interfaces:**
- Produces (consumido pelas tasks 3/5): operação `createCompetencyRequirementEvidence` →
  `POST /organizations/{orgId}/employees/{empId}/competency-requirement-evidence`.
- Produces: `manualCompetencyId` (integer, nullable) em cada item de `EmployeeCompetencyConformance.requirements`.
- Produces: `isPositionRequirement` (boolean) no schema de resposta de competência (o mesmo referenciado pela resposta de `GET .../competencies` e pelo array `competencies` do GET do colaborador).

- [ ] **Step 1: Adicionar o path do endpoint** logo após o bloco `/organizations/{orgId}/employees/{empId}/competencies/{compId}` (por volta de openapi.yaml:1520+). `operationId: createCompetencyRequirementEvidence`, `tags: [competencies]`, params `orgId`/`empId` (mesmo padrão dos vizinhos), request body `$ref: CreateCompetencyRequirementEvidenceBody`, resposta `200` `$ref` para o schema de registro de competência já existente (o que a resposta de create/list usa).

- [ ] **Step 2: Criar o schema `CreateCompetencyRequirementEvidenceBody`** em `components.schemas` (perto de `CreateCompetencyBody`, ~14157):

```yaml
    CreateCompetencyRequirementEvidenceBody:
      type: object
      required: [competencyName, competencyType, requiredLevel, acquiredLevel]
      properties:
        competencyName:
          type: string
          minLength: 1
        competencyType:
          type: string
          enum: [conhecimento, habilidade, atitude]
        requiredLevel:
          type: integer
          minimum: 0
          maximum: 5
        acquiredLevel:
          type: integer
          minimum: 0
          maximum: 5
        evidence:
          type: string
          nullable: true
        attachments:
          type: array
          items:
            $ref: "#/components/schemas/EmployeeRecordAttachmentInput"
```
(usar o mesmo `$ref` de attachments que `CreateCompetencyBody` usa — localizar e reaproveitar o nome exato.)

- [ ] **Step 3: Adicionar `manualCompetencyId`** ao item de `requirements` em `EmployeeCompetencyConformance` (openapi.yaml:13076-13140), como `integer, nullable: true` (não incluir em `required`).

- [ ] **Step 4: Adicionar `isPositionRequirement`** (`type: boolean`) ao schema de registro de competência de resposta — localizar o schema referenciado pela resposta 200 de `GET .../competencies` (tem `requiredLevel`/`acquiredLevel`/`attachments`). Não obrigatório em `required` (tolerância a leitura legada).

- [ ] **Step 5: Rodar codegen e typecheck.**
Run: `pnpm --filter @workspace/api-spec codegen && pnpm typecheck`
Expected: gera `useCreateCompetencyRequirementEvidence` em `@workspace/api-client-react` e o zod correspondente; typecheck limpo.

- [ ] **Step 6: Commit.**
`git add lib/api-spec lib/api-zod lib/api-client-react && git commit -m "feat(aprendizagem): contrato do endpoint de evidência por requisito + campos de conformidade"`

---

## Task 2: Resolver — `manualCompetencyId` por requisito

**Files:**
- Modify: `artifacts/api-server/src/services/aprendizagem/competency-resolver.ts`
- Test: `artifacts/api-server/tests/... competency-resolver.unit.test.ts` (criar se não houver; projeto `node-unit`, glob `tests/**/*.unit.test.ts`)

**Interfaces:**
- Consumes: `buildCompetencyKey` (já no arquivo).
- Produces: `ResolvedRequirement.manualCompetencyId: number | null` — preenchido com o `employee_competencies.id` cuja chave casa com o requisito (quando há atestado manual), senão `null`.

- [ ] **Step 1: Teste falhando (unit).** Montar um caso com `employee_competencies` contendo uma competência cujo `name/type` casa um requisito do cargo; asserir que o `requirement` correspondente volta com `manualCompetencyId === <id daquela competência>`, e que um requisito sem atestado manual volta `manualCompetencyId === null`. Usar um `Db` fake/stub como os testes existentes do resolver (se não houver, montar mocks das 5 queries: positions, requirements, provable, competencies, trainings).
Run: `pnpm exec vitest run --project node-unit <arquivo>`
Expected: FAIL (campo inexistente).

- [ ] **Step 2: Guardar o id no mapa manual.** Trocar `manualByEmployee: Map<number, Map<string, number>>` (level) por `Map<string, { level: number; id: number }>` — em `competency-resolver.ts:183-201`. Na dedup, "maior nível vence" continua; empatando, manter o primeiro. Ajustar o consumo em `manualForEmployee.get(key)`:

```ts
const manualByEmployee = new Map<number, Map<string, { level: number; id: number }>>();
// ...
if (!byKey.has(key) || comp.acquiredLevel > (byKey.get(key)?.level ?? 0)) {
  byKey.set(key, { level: comp.acquiredLevel, id: comp.id });
}
```

- [ ] **Step 3: Derivar `manualCompetencyId` no loop de requisitos** (`competency-resolver.ts:286-338`):

```ts
const manualEntry = manualForEmployee.get(key) ?? null;
const hasManual = manualEntry !== null;
const manualLevel = manualEntry?.level ?? 0;
// ...
const manualCompetencyId = manualEntry?.id ?? null;
```
Adicionar `manualCompetencyId` ao `ResolvedRequirement` (interface ~45-60) e ao objeto `requirements.push({ ... })`.

- [ ] **Step 4: Rodar teste e typecheck.**
Run: `pnpm exec vitest run --project node-unit <arquivo> && pnpm typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 5: Commit.**
`git commit -am "feat(aprendizagem): resolvedor expõe manualCompetencyId por requisito"`

---

## Task 3: Backend — endpoint de upsert + `isPositionRequirement` no GET

**Files:**
- Modify: `artifacts/api-server/src/routes/employees.ts`
- Test: `artifacts/api-server/tests/employees-competency-requirement-evidence.integration.test.ts` (projeto `integration`)

**Interfaces:**
- Consumes: `buildCompetencyKey`, `sanitizeEmployeeRecordAttachments`, `validateEmployeeRecordAttachments`, `formatCompetencyRecord`, `requireWriteAccess`.
- Produces: `POST .../competency-requirement-evidence` retorna o registro de competência (upsert por chave).
- Produces: cada item de `competencies[]` no GET do colaborador ganha `isPositionRequirement`.

- [ ] **Step 1: Teste de integração falhando.** Cenário (usar `createTestContext`): criar cargo + `position_competency_requirements` (name "Auditor X", type "conhecimento", requiredLevel 3) + colaborador nesse cargo. (a) `POST .../competency-requirement-evidence` com `{competencyName:"AUDITOR X", competencyType:"conhecimento", requiredLevel:3, acquiredLevel:3, evidence:"Certificado"}` → 201/200; (b) `GET .../:empId` → a linha de conformidade daquele requisito tem `status:"atende"` e `manualCompetencyId` preenchido; a competência criada aparece em `competencies[]` com `isPositionRequirement:true`; (c) repetir o POST com `acquiredLevel:1` → **não cria duplicata** (mesma chave), o registro fica com acquiredLevel 1 (baixou) e o requisito volta a `gap`; (d) analyst → 403; (e) attachment inválido → 400.
Run: `TEST_ENV=integration pnpm exec vitest run --project integration <arquivo>`
Expected: FAIL (rota inexistente).

- [ ] **Step 2: Schemas zod** (perto de `CreateCompetencyParams`/`CreateCompetencyBody`, importados em employees.ts:65-68 — definir onde esses vivem, provavelmente um módulo de schemas do employees). Params = `{orgId, empId}` (coerce int). Body = espelho do `CreateCompetencyRequirementEvidenceBody` do contrato.

- [ ] **Step 3: Handler de upsert.** Registrar `router.post("/organizations/:orgId/employees/:empId/competency-requirement-evidence", requireAuth, requireWriteAccess(), ...)`. Validar params/body, `orgId === req.auth.organizationId`, `verifyEmployeeOwnership`. Sanitizar+validar attachments (igual ao POST atual, 3140-3148). Depois:

```ts
const key = buildCompetencyKey(body.data.competencyName, body.data.competencyType);
const existing = await db
  .select()
  .from(employeeCompetenciesTable)
  .where(eq(employeeCompetenciesTable.employeeId, params.data.empId));
const match = existing.find(
  (c) => buildCompetencyKey(c.name, c.type) === key,
);

let comp;
if (match) {
  [comp] = await db
    .update(employeeCompetenciesTable)
    .set({
      requiredLevel: body.data.requiredLevel,
      acquiredLevel: body.data.acquiredLevel,
      evidence: body.data.evidence ?? null,
      ...(attachments !== undefined ? { attachments } : {}),
    })
    .where(eq(employeeCompetenciesTable.id, match.id))
    .returning();
} else {
  [comp] = await db
    .insert(employeeCompetenciesTable)
    .values({
      employeeId: params.data.empId,
      name: body.data.competencyName,
      type: body.data.competencyType,
      requiredLevel: body.data.requiredLevel,
      acquiredLevel: body.data.acquiredLevel,
      evidence: body.data.evidence ?? null,
      attachments: attachments || [],
    })
    .returning();
}
res.status(match ? 200 : 201).json(formatCompetencyRecord(comp));
```

- [ ] **Step 4: `isPositionRequirement` no GET** (employees.ts:2867-2898). Após obter `resolvedConformance`, montar o conjunto de chaves de requisito e marcar cada competência:

```ts
const requirementKeys = new Set(
  (resolvedConformance?.requirements ?? []).map((r) =>
    buildCompetencyKey(r.competencyName, r.competencyType),
  ),
);
// ...
competencies: competencies.map((c) => ({
  ...formatCompetencyRecord(c),
  isPositionRequirement: requirementKeys.has(buildCompetencyKey(c.name, c.type)),
})),
```

- [ ] **Step 5: Rodar teste + typecheck.**
Run: `TEST_ENV=integration pnpm exec vitest run --project integration <arquivo> && pnpm typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 6: Commit.**
`git commit -am "feat(aprendizagem): upsert de evidência por requisito + isPositionRequirement no GET"`

---

## Task 4: Frontend — linhas acionáveis em "Competências do cargo"

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/FormacaoQualificacoes.tsx`
- Test: `artifacts/web/tests/... FormacaoQualificacoes.unit.test.tsx` (web-unit)

**Interfaces:**
- Consumes: `EmployeeCompetencyConformance` (agora com `manualCompetencyId`, `source`, `evidence`).
- Produces (consumido pela Task 5): props novas —
  `editable?: boolean`, `onAttachEvidence?: (req: RequirementRow) => void`, `onEditEvidence?: (req: RequirementRow) => void`, onde `RequirementRow` = o item de `conformance.requirements` (name, type, requiredLevel, acquiredLevel, status, source, manualCompetencyId).

- [ ] **Step 1: Teste falhando (web-unit).** Renderizar com `editable` e três requisitos (`nao_classificado`, `gap`, `atende`+source `manual`, `atende`+source `treinamento`). Asserir: botão "Evidência" aparece nas linhas `gap` e `nao_classificado`; ao clicar chama `onAttachEvidence` com aquele requisito; a linha `atende`/`manual` mostra controle de editar e chama `onEditEvidence`; a linha `atende`/`treinamento` não mostra botão de evidência; sem `editable` nenhum botão aparece.
Run: `pnpm exec vitest run --project web-unit <arquivo>`
Expected: FAIL.

- [ ] **Step 2: Subtítulo do bloco.** No header (perto de FormacaoQualificacoes.tsx:88-102) adicionar, abaixo do título "Competências do cargo" da subseção (linha ~115-117), o subtítulo **"Exigidas pelo cargo · anexe a evidência de cada uma"** (texto `text-[11px] text-muted-foreground`).

- [ ] **Step 3: Fix do selo verde enganoso.** Onde `hasGaps` decide o selo (FormacaoQualificacoes.tsx:84-101): quando `progressDenom === 0` (nada avaliado) o selo não deve dizer "Requisitos atendidos". Mostrar rótulo neutro **"Sem avaliação ainda"** (tom `muted`, não verde) nesse caso; verde só quando `progressDenom > 0 && !hasGaps`.

- [ ] **Step 4: Ações por linha.** No `requirements.map` (FormacaoQualificacoes.tsx:160-219), quando `editable`:
  - `nao_classificado`/`gap`: botão "＋ Evidência" (estilo discreto de ação) → `onAttachEvidence?.(item)`.
  - `atende` com `item.source === "manual"`: ícone lápis → `onEditEvidence?.(item)`; e, se houver `item.evidence`/anexo, exibir chip.
  - `atende` com `item.source === "treinamento"`: texto "via treinamento" (usar `item.evidence?.title` se vier) e nenhum botão.
Manter o layout/tons atuais (emerald/red/muted); botões só com `editable`.

- [ ] **Step 5: Rodar teste + typecheck.**
Run: `pnpm exec vitest run --project web-unit <arquivo> && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**
`git commit -am "feat(aprendizagem): linhas de Competências do cargo viram acionáveis (+ Evidência / editar)"`

---

## Task 5: Frontend — diálogo de evidência + wiring na ficha

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/RegistrarEvidenciaDialog.tsx`
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx`
- Test: `artifacts/web/tests/... RegistrarEvidenciaDialog.unit.test.tsx` (web-unit)

**Interfaces:**
- Consumes: `useCreateCompetencyRequirementEvidence` (codegen da Task 1), `onAttachEvidence/onEditEvidence` (Task 4), `uploadEmployeeRecordFiles`, `ProfileItemAttachmentsField`, `getGetEmployeeQueryKey`.
- Produces: diálogo controlado que faz o POST e invalida a query do colaborador.

- [ ] **Step 1: Teste falhando (web-unit).** Renderizar o diálogo com um requisito (name "Auditor X", type "conhecimento", requiredLevel 3). Asserir: nome e tipo aparecem **travados/read-only** (não há input editável de nome/tipo); nível adquirido inicia em **3** (= requerido); ao submeter, chama a mutation com `{competencyName:"Auditor X", competencyType:"conhecimento", requiredLevel:3, acquiredLevel:3, evidence, attachments}`. Mockar o hook.
Run: `pnpm exec vitest run --project web-unit <arquivo>`
Expected: FAIL.

- [ ] **Step 2: Componente `RegistrarEvidenciaDialog`.** Props: `open`, `onOpenChange`, `requirement` (name/type/requiredLevel/acquiredLevel/manualCompetencyId), `orgId`, `empId`, `mode: "attach" | "edit"`. Layout: cabeçalho com nome + badge de tipo (read-only); campo numérico "Nível adquirido" (0–5, default `requirement.requiredLevel` no attach, `requirement.acquiredLevel` no edit); campo texto "Evidência"; `ProfileItemAttachmentsField` (upload via `uploadEmployeeRecordFiles`, `accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}`). Submit → `useCreateCompetencyRequirementEvidence`. Reaproveitar `Dialog`, `Label`, `Input` já usados no arquivo. (Opcional, se sobrar tempo: botão "Remover evidência" no modo edit → `useDeleteCompetency` com `manualCompetencyId`.)

- [ ] **Step 3: Wiring em [id].tsx.** No componente que renderiza `<FormacaoQualificacoes />` (id.tsx:3604): estado `evidenceDialog: { requirement, mode } | null`; passar `editable={canWriteEmployees}`, `onAttachEvidence={(r) => setEvidenceDialog({requirement:r, mode:"attach"})}`, `onEditEvidence={(r) => setEvidenceDialog({requirement:r, mode:"edit"})}`. Renderizar `<RegistrarEvidenciaDialog ... onSuccess>` que invalida `getGetEmployeeQueryKey(orgId, empId)` e fecha.

- [ ] **Step 4: Rodar teste + typecheck.**
Run: `pnpm exec vitest run --project web-unit <arquivo> && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**
`git commit -am "feat(aprendizagem): diálogo de evidência por requisito + wiring na ficha"`

---

## Task 6: Frontend — "Outras competências" (rename + filtro + subtítulo)

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx`
- Test: `artifacts/web/tests/... ficha-outras-competencias.unit.test.tsx` (web-unit) — ou estender um existente.

**Interfaces:**
- Consumes: `employee.competencies[].isPositionRequirement` (Task 3).

- [ ] **Step 1: Teste falhando (web-unit).** Dado `competencies` com uma marcada `isPositionRequirement:true` e outra `false`, a seção "Outras competências" (o `CompetenciasTab`) recebe **só** a `false`. E o título renderizado é "Outras competências" com o subtítulo.
Run: `pnpm exec vitest run --project web-unit <arquivo>`
Expected: FAIL.

- [ ] **Step 2: Rename + subtítulo.** No `<OverviewSectionTitle title="Competências" ... />` (id.tsx:3641-3656) trocar para **"Outras competências"** e adicionar o subtítulo **"Qualificações além das que o cargo exige"** (se `OverviewSectionTitle` não aceitar subtítulo, adicionar prop opcional `subtitle` — mudança mínima, ou renderizar um `<p>` abaixo). Manter o botão "Nova Competência".

- [ ] **Step 3: Filtro.** Passar ao `CompetenciasTab` apenas `(employee.competencies || []).filter((c) => !c.isPositionRequirement)`. Se a lista filtrada ficar vazia, o estado vazio atual do `CompetenciasTab` já cobre ("Nenhuma competência registrada") — aceitável.

- [ ] **Step 4: Rodar teste + typecheck + suíte web-unit do módulo.**
Run: `pnpm exec vitest run --project web-unit <arquivos aprendizagem> && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**
`git commit -am "feat(aprendizagem): seção manual vira 'Outras competências' (filtra requisitos do cargo)"`

---

## Fechamento (após todas as tasks)

- Revisão final do branch inteiro (subagente, modelo mais capaz) contra a spec + estes Global Constraints.
- Build: `pnpm build`.
- Validação em navegador (docker demo, backend 3003 / frontend 5174 — nunca a 3001): anexar evidência numa linha "Não avaliável" → vira "Atende" com anexo; enviar nome divergente pela API → servidor grava pela chave; competência de nome livre aparece em "Outras competências". Capturar prints → vira o artifact "explica tudo com prints".
- Diário de bordo + memória atualizada. PR **draft** (worktree isolado permite abrir sem perguntar).
```
