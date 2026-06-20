# Documentação — Paridade com o template (v2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aproximar o módulo Qualidade→Documentação do protótipo da cliente em fidelidade visual e padronização de campos, sem regredir o motor já validado.

**Architecture:** Full-stack incremental. Backend primeiro (campo `records_treatment` jsonb aditivo, validação, snapshot, aceitar `contentSections` no create) → OpenAPI/codegen → front (selects padronizados, aba Conteúdo + Registros no wizard, listagem com cards/colunas/badges/filtro, bloco de assinaturas e registros no detalhe + PDF). Mantém versionamento automático e Markdown.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL/Neon), Express 5, React 19 + RHF + Wouter + TanStack Query, OpenAPI 3.1 + Orval, Vitest.

## Global Constraints

- pnpm workspace; todo o repo deve passar `pnpm typecheck`.
- Generated files (`lib/api-zod`, `lib/api-client-react`) NUNCA editados à mão — regerar com `pnpm --filter @workspace/api-spec codegen`.
- Schema via DDL aditivo manual no Neon PROD — NUNCA `pnpm db push`.
- Prettier: 2 espaços, aspas duplas, trailing commas. Componentes `PascalCase`, hooks `use-*`.
- Selects de UI: usar `SearchableStringSelect`/`SearchableSelect` (o usuário rejeita `<select>` nativo).
- Decisões fixas: versionamento automático (sem tabela de revisão manual); Markdown (sem WYSIWYG); Norma = lista fixa `["ISO 9001:2015","ISO 14001:2015","ISO 39001:2012"]` + valor livre; Área/Setor = nome do Departamento gravado como string em `documents.area`.
- Testes de integração: subir DDL no test DB (`daton_integration` :55432) e rodar com `--testTimeout=30000` (timeout padrão de 5s é flaky nesta máquina).

---

### Task 1: Schema — coluna `records_treatment` + tipo de snapshot

**Files:**
- Modify: `lib/db/src/schema/documents.ts`

**Interfaces:**
- Produces: tipo `DocumentRecordsTreatment`; coluna `documentsTable.recordsTreatment` (jsonb nullable); campo `recordsTreatment` em `DocumentVersionMetaSnapshot`.

- [ ] **Step 1: Adicionar o tipo e a coluna**

Em `lib/db/src/schema/documents.ts`, após `DocumentVersionMetaSnapshot`, adicionar:

```ts
export type DocumentRecordsTreatment = {
  storageLocation: string | null; // local de armazenamento (§7.5.3)
  retentionMonths: number | null; // tempo de guarda em meses
  disposalMethod: string | null; // forma de descarte
  responsible: string | null; // responsável pelo registro
  notes: string | null; // observações
};
```

Incluir `recordsTreatment` no tipo `DocumentVersionMetaSnapshot`:

```ts
export type DocumentVersionMetaSnapshot = {
  title: string;
  code: string | null;
  area: string | null;
  applicableNorm: string | null;
  normativeRequirements: string[];
  recordsTreatment: DocumentRecordsTreatment | null;
};
```

Na definição de `documentsTable`, logo após a coluna `contentSections`, adicionar:

```ts
    recordsTreatment: jsonb("records_treatment").$type<DocumentRecordsTreatment>(),
```

- [ ] **Step 2: Typecheck do schema**

Run: `pnpm --filter @workspace/db typecheck` (ou `pnpm typecheck`)
Expected: PASS (sem erros). Pode haver erros em `content.ts`/`routes` por causa do novo campo obrigatório no snapshot — serão resolvidos na Task 3; se aparecerem, anotar e prosseguir para a Task 3 antes de commitar.

- [ ] **Step 3: DDL aditivo no test DB**

Run:
```bash
cd /home/jp/daton/Daton-doc-conteudo && node -e '
const {Client}=require("pg");const fs=require("fs");
const url=fs.readFileSync(".env.integration","utf8").match(/DATABASE_URL=(.*)/)[1].trim().split("?")[0];
(async()=>{const c=new Client({connectionString:url,ssl:false});await c.connect();
await c.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS records_treatment jsonb");
console.log("ok");await c.end();})();'
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/documents.ts
git commit -m "feat(documentacao): coluna records_treatment (§7.5.3) + snapshot type"
```

> **DDL PROD (deploy manual, fora deste plano):** `ALTER TABLE documents ADD COLUMN IF NOT EXISTS records_treatment jsonb;` no Neon PROD via node+pg (ssl rejectUnauthorized:false), idempotente.

---

### Task 2: Backend — validação e snapshot de `recordsTreatment`

**Files:**
- Modify: `artifacts/api-server/src/services/documents/content.ts`
- Test: `artifacts/api-server/tests/services/documents/content.unit.test.ts`

**Interfaces:**
- Consumes: `DocumentRecordsTreatment` de `@workspace/db`.
- Produces: `RecordsTreatmentSchema` (zod), `normalizeRecordsTreatment(input): DocumentRecordsTreatment | null`; `buildVersionMetaSnapshot` agora inclui `recordsTreatment`.

- [ ] **Step 1: Escrever o teste que falha**

Em `content.unit.test.ts`, adicionar:

```ts
import {
  normalizeRecordsTreatment,
  buildVersionMetaSnapshot,
} from "../../../src/services/documents/content";

describe("normalizeRecordsTreatment", () => {
  it("converte strings vazias em null e mantém valores", () => {
    expect(
      normalizeRecordsTreatment({
        storageLocation: "  Pasta SGI  ",
        retentionMonths: 60,
        disposalMethod: "",
        responsible: "  ",
        notes: null,
      }),
    ).toEqual({
      storageLocation: "Pasta SGI",
      retentionMonths: 60,
      disposalMethod: null,
      responsible: null,
      notes: null,
    });
  });

  it("retorna null quando tudo está vazio", () => {
    expect(
      normalizeRecordsTreatment({
        storageLocation: "",
        retentionMonths: null,
        disposalMethod: "",
        responsible: "",
        notes: "",
      }),
    ).toBeNull();
    expect(normalizeRecordsTreatment(null)).toBeNull();
    expect(normalizeRecordsTreatment(undefined)).toBeNull();
  });
});

describe("buildVersionMetaSnapshot inclui recordsTreatment", () => {
  it("congela recordsTreatment", () => {
    const snap = buildVersionMetaSnapshot({
      title: "T",
      code: "C-1",
      area: "Qualidade",
      applicableNorm: "ISO 9001:2015",
      normativeRequirements: [],
      recordsTreatment: {
        storageLocation: "Pasta",
        retentionMonths: 12,
        disposalMethod: null,
        responsible: null,
        notes: null,
      },
    });
    expect(snap.recordsTreatment?.retentionMonths).toBe(12);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/content.unit.test.ts`
Expected: FAIL (`normalizeRecordsTreatment is not a function` / snapshot sem `recordsTreatment`).

- [ ] **Step 3: Implementar**

Em `content.ts`, importar `DocumentRecordsTreatment` de `@workspace/db` e adicionar:

```ts
export const RecordsTreatmentSchema = z
  .object({
    storageLocation: z.string().max(500).nullable().optional(),
    retentionMonths: z.number().int().min(0).max(1200).nullable().optional(),
    disposalMethod: z.string().max(500).nullable().optional(),
    responsible: z.string().max(500).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .nullable()
  .optional();

export function normalizeRecordsTreatment(
  input:
    | {
        storageLocation?: string | null;
        retentionMonths?: number | null;
        disposalMethod?: string | null;
        responsible?: string | null;
        notes?: string | null;
      }
    | null
    | undefined,
): DocumentRecordsTreatment | null {
  if (!input) return null;
  const result: DocumentRecordsTreatment = {
    storageLocation: blankToNull(input.storageLocation ?? null),
    retentionMonths:
      typeof input.retentionMonths === "number" ? input.retentionMonths : null,
    disposalMethod: blankToNull(input.disposalMethod ?? null),
    responsible: blankToNull(input.responsible ?? null),
    notes: blankToNull(input.notes ?? null),
  };
  const empty =
    !result.storageLocation &&
    result.retentionMonths === null &&
    !result.disposalMethod &&
    !result.responsible &&
    !result.notes;
  return empty ? null : result;
}
```

Atualizar `buildVersionMetaSnapshot` para aceitar e copiar `recordsTreatment` (adicionar ao parâmetro de entrada e ao objeto retornado: `recordsTreatment: source.recordsTreatment ?? null`). Garantir que `blankToNull` aceita `string | null`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/content.unit.test.ts`
Expected: PASS (todos, incluindo os 13 já existentes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/documents/content.ts artifacts/api-server/tests/services/documents/content.unit.test.ts
git commit -m "feat(documentacao): validação e snapshot de recordsTreatment"
```

---

### Task 3: Backend rotas + OpenAPI + codegen (create aceita contentSections + recordsTreatment; PATCH; snapshot)

**Files:**
- Modify: `artifacts/api-server/src/routes/documents.ts`
- Modify: `lib/api-spec/openapi.yaml`
- Test: `artifacts/api-server/tests/routes/documents-content.integration.test.ts`

**Interfaces:**
- Consumes: `normalizeContentSections`, `normalizeRecordsTreatment`, `seedSectionsForType`, `buildVersionMetaSnapshot`.
- Produces: contrato com `contentSections?` e `recordsTreatment?` em create/update; `recordsTreatment` em `DocumentDetail` e no snapshot da versão.

- [ ] **Step 1: Escrever o teste de integração que falha**

Em `documents-content.integration.test.ts`, adicionar (seguir o padrão `createTestContext`/`createDocumentForTest` do arquivo):

```ts
it("(e) create aceita contentSections inline em vez do template", async () => {
  const context = await createTestContext({ seed: "documents-content-inline" });
  contexts.push(context);
  const reviewer = await createTestUser(context, { suffix: "rev", modules: ["documents"] });
  const employee = await createTestEmployee(context); // helper de tests/support
  const res = await request(app)
    .post(`/api/organizations/${context.organizationId}/documents`)
    .set(authHeader(context))
    .send({
      title: "Doc inline",
      type: "politica",
      elaboratorIds: [employee.id],
      criticalReviewerIds: [reviewer.id],
      approverIds: [reviewer.id],
      contentSections: [{ id: "x1", title: "Única", body: "**oi**", order: 0 }],
      recordsTreatment: { storageLocation: "Pasta SGI", retentionMonths: 24, disposalMethod: null, responsible: null, notes: null },
    });
  expect(res.status).toBe(201);
  expect(res.body.contentSections).toHaveLength(1);
  expect(res.body.contentSections[0].title).toBe("Única");
  expect(res.body.recordsTreatment.retentionMonths).toBe(24);
});
```

> Se não houver `createTestEmployee` em `tests/support/backend.ts`, usar a factory existente para employees (verificar o arquivo) ou criar via DB; elaboratorIds exige um employee real da org.

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/documents-content.integration.test.ts --testTimeout=30000`
Expected: FAIL (recordsTreatment undefined; contentSections veio do template, não o inline).

- [ ] **Step 3: Implementar nas rotas**

Em `routes/documents.ts`:

1. No handler de **create** (`CreateDocumentBodySchema`), antes do insert: se `body.data.contentSections` vier, usar `normalizeContentSections(body.data.contentSections)`; senão `seedSectionsForType(body.data.type)`. No `.values({...})` trocar `contentSections: seedSectionsForType(...)` por essa variável e adicionar `recordsTreatment: normalizeRecordsTreatment(body.data.recordsTreatment)`.
2. No handler de **PATCH** (`/documents/:docId`): se `recordsTreatment` vier no body, setar `recordsTreatment: normalizeRecordsTreatment(...)` no update.
3. No **snapshot da aprovação**: incluir `recordsTreatment: documentsTable.recordsTreatment` no `select` de `docForSnapshot` e passar ao `buildVersionMetaSnapshot`.
4. Garantir que o **GET detail** já retorna `recordsTreatment` (incluir no mapeamento da resposta do detalhe).

- [ ] **Step 4: Atualizar OpenAPI**

Em `lib/api-spec/openapi.yaml`:
- Adicionar schema `DocumentRecordsTreatment` (objeto com storageLocation/disposalMethod/responsible/notes string nullable e retentionMonths integer nullable).
- Em `CreateDocumentBody` e `UpdateDocumentBody`: `contentSections` (array de `DocumentContentSection`, opcional — em Create) e `recordsTreatment` ($ref nullable, opcional).
- Em `DocumentDetail`: `recordsTreatment` ($ref nullable).
- Em `DocumentVersionMetaSnapshot`: `recordsTreatment` ($ref nullable).

- [ ] **Step 5: Regerar client**

Run: `pnpm --filter @workspace/api-spec codegen` (usa python3; o pipeline yaml→json + orval). Restaurar barrel se necessário: `git checkout HEAD -- lib/api-zod/src/index.ts` apenas se o codegen apagar exports não relacionados.
Expected: `lib/api-zod` e `lib/api-client-react` atualizados com os novos campos.

- [ ] **Step 6: Rodar integração + typecheck**

Run:
```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/documents-content.integration.test.ts artifacts/api-server/tests/routes/documents.integration.test.ts --testTimeout=30000
pnpm typecheck
```
Expected: integração 26/26 (7+1 novos + 18) PASS; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/documents.ts lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/tests/routes/documents-content.integration.test.ts
git commit -m "feat(documentacao): API aceita contentSections inline + recordsTreatment (§7.5.3)"
```

---

### Task 4: Extrair `DocumentSectionEditor` (componente reutilizável)

**Files:**
- Create: `artifacts/web/src/components/documents/document-section-editor.tsx`
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/conteudo.tsx`

**Interfaces:**
- Produces: `<DocumentSectionEditor sections onChange canEdit />` onde `onChange(next: DocumentContentSection[])`. Encapsula `SectionCard` + add/renomear/reordenar/remover (reusa `@/lib/document-content-sections`).

- [ ] **Step 1: Criar o componente**

Mover o `SectionCard` e a lista de seções (o `sections.map(...)` + botão "Adicionar seção") de `conteudo.tsx` para `document-section-editor.tsx`, expondo:

```tsx
export function DocumentSectionEditor({
  sections,
  canEdit,
  onChange,
}: {
  sections: DocumentContentSection[];
  canEdit: boolean;
  onChange: (next: DocumentContentSection[]) => void;
}) { /* SectionCard + add/move/remove/update via @/lib/document-content-sections */ }
```

As ações chamam `onChange(addSection(sections))`, `onChange(moveSection(...))`, etc. Manter o estado vazio ("Nenhuma seção ainda.") e o `aria-label`/`dark:prose-invert`/responsivo já aplicados.

- [ ] **Step 2: `conteudo.tsx` passa a usar o componente**

Substituir o bloco de seções por `<DocumentSectionEditor sections={sections} canEdit={canEdit} onChange={setSections} />`. Manter init/dirty/save/guard como estão.

- [ ] **Step 3: Rodar testes web do feature**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-content-sections.unit.test.ts artifacts/web/tests/pages/document-content-reader.unit.test.tsx`
Expected: PASS (lógica pura intacta).

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.
```bash
git add artifacts/web/src/components/documents/document-section-editor.tsx artifacts/web/src/pages/app/qualidade/documentacao/conteudo.tsx
git commit -m "refactor(documentacao): extrai DocumentSectionEditor reutilizável"
```

---

### Task 5: Selects padronizados no "Básico" (Área/Tipo/Norma) — criação + edição

**Files:**
- Create: `artifacts/web/src/lib/document-list.ts`
- Test: `artifacts/web/tests/lib/document-list.unit.test.ts`
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/index.tsx`
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`

**Interfaces:**
- Produces: `NORMA_OPTIONS: string[]`, `TYPE_COLORS: Record<string,string>`, `summarizeDocuments(docs)`. (TYPE_COLORS/summarize usados na Task 7; criados aqui para testar junto.)

- [ ] **Step 1: Teste das constantes/util**

Em `document-list.unit.test.ts`:

```ts
import { NORMA_OPTIONS, summarizeDocuments } from "@/lib/document-list";

it("NORMA_OPTIONS traz as 3 normas fixas", () => {
  expect(NORMA_OPTIONS).toEqual(["ISO 9001:2015", "ISO 14001:2015", "ISO 39001:2012"]);
});

it("summarizeDocuments conta por situação", () => {
  const r = summarizeDocuments([
    { status: "published" }, { status: "approved" }, { status: "distributed" },
    { status: "in_review" }, { status: "draft" }, { status: "rejected" },
  ]);
  expect(r).toEqual({ total: 6, vigentes: 3, emRevisao: 1, rascunho: 2 });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-list.unit.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `document-list.ts`**

```ts
export const NORMA_OPTIONS = ["ISO 9001:2015", "ISO 14001:2015", "ISO 39001:2012"];

export const TYPE_COLORS: Record<string, string> = {
  manual: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  procedimento: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  instrucao: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  politica: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  formulario: "bg-slate-50 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  registro: "bg-slate-50 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  outro: "bg-muted text-foreground",
};

export function summarizeDocuments(docs: { status: string }[]) {
  const has = (...s: string[]) => docs.filter((d) => s.includes(d.status)).length;
  return {
    total: docs.length,
    vigentes: has("published", "approved", "distributed"),
    emRevisao: has("in_review"),
    rascunho: has("draft", "rejected"),
  };
}
```

- [ ] **Step 4: Ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-list.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Selects no modal de criação (`index.tsx`)**

Importar `SearchableStringSelect`, `useListDepartments`, `NORMA_OPTIONS`, `TYPE_LABELS`. Carregar departamentos: `const { data: departments } = useListDepartments(orgId!, { query: { enabled: !!orgId } })` (seguir assinatura do hook gerado). Trocar os campos do passo Básico por `Controller` (RHF) com `SearchableStringSelect`:
- Área/Setor: `options={(departments ?? []).map(d => d.name)}` → `field.onChange`.
- Tipo: `options={Object.values(TYPE_LABELS)}`, mapeando rótulo↔chave (`field.value` é a chave; exibir `TYPE_LABELS[field.value]`; ao escolher, reverter rótulo→chave).
- Norma: `options={NORMA_OPTIONS}` (valor livre permitido via `showLegacy`).

- [ ] **Step 6: Selects no diálogo de edição (`[id].tsx`)**

No passo "Básico" do edit dialog, trocar os `<Input>`/`<Select>` de Área/Tipo/Norma por `SearchableStringSelect` controlado por `editForm` (`value`/`onChange` → `setEditForm`). Manter o erro inline de Código (Task anterior) intacto.

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.
```bash
git add artifacts/web/src/lib/document-list.ts artifacts/web/tests/lib/document-list.unit.test.ts artifacts/web/src/pages/app/qualidade/documentacao/index.tsx artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(documentacao): Área(Departamentos)/Tipo/Norma como combobox padronizado"
```

---

### Task 6: Aba "Conteúdo" no wizard de criação

**Files:**
- Create: `artifacts/web/src/lib/document-section-templates.ts`
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/index.tsx`

**Interfaces:**
- Consumes: `DocumentSectionEditor` (Task 4).
- Produces: `sectionTitlesForType(type): string[]` (mirror do servidor), `seedSectionsForType(type): DocumentContentSection[]` no client.

- [ ] **Step 1: Mirror dos templates no client**

```ts
// Mirror de artifacts/api-server/src/services/documents/section-templates.ts — manter em sincronia.
import type { DocumentContentSection } from "@workspace/api-client-react";

const PROCEDIMENTO = ["Objetivo","Aplicação","Definições e Referências","Sequência, Interação, Recursos e Monitoramento","Responsabilidade pelo Processo","Procedimento"];
export const SECTION_TEMPLATE_TITLES: Record<string, string[]> = {
  procedimento: PROCEDIMENTO,
  instrucao: PROCEDIMENTO,
  politica: ["Objetivo","Abrangência","Diretrizes","Responsabilidades","Referências"],
  manual: ["Apresentação","Escopo do SGI","Referências Normativas","Termos e Definições","Descrição do Sistema"],
  formulario: ["Instruções de Preenchimento"],
  registro: ["Instruções de Preenchimento"],
  outro: ["Conteúdo"],
};
export function seedSectionsForType(type: string): DocumentContentSection[] {
  const titles = SECTION_TEMPLATE_TITLES[type] ?? SECTION_TEMPLATE_TITLES.outro;
  return titles.map((title, i) => ({ id: `sec-${i + 1}`, title, body: "", order: i }));
}
```

- [ ] **Step 2: Adicionar a etapa "Conteúdo" ao wizard**

Em `index.tsx`: `const steps = ["Básico", "Conteúdo", "Responsáveis", "Escopo", "Registros", "Anexos"]`. Adicionar estado `const [contentSections, setContentSections] = useState<DocumentContentSection[]>([])`. Inicializar/re-semear quando o tipo muda e o conteúdo ainda não foi tocado:

```tsx
const contentTouched = useRef(false);
const watchedType = watch("type");
useEffect(() => {
  if (!contentTouched.current) setContentSections(seedSectionsForType(watchedType));
}, [watchedType]);
```

Renderizar no passo Conteúdo: `<DocumentSectionEditor sections={contentSections} canEdit onChange={(next) => { contentTouched.current = true; setContentSections(next); }} />`.

- [ ] **Step 3: Enviar `contentSections` no payload de criação**

No objeto `data:` do `createMut.mutateAsync`, adicionar `contentSections: contentSections.length ? contentSections : undefined`. Resetar `contentSections`/`contentTouched` ao fechar/abrir o modal.

- [ ] **Step 4: Typecheck + verificação manual**

Run: `pnpm typecheck` → exit 0.
Manual: criar doc no app → seções do tipo aparecem na aba Conteúdo, editáveis; ao salvar, o doc nasce com o conteúdo digitado.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/lib/document-section-templates.ts artifacts/web/src/pages/app/qualidade/documentacao/index.tsx
git commit -m "feat(documentacao): aba Conteúdo no wizard de criação"
```

---

### Task 7: Aba "Registros" (§7.5.3) no wizard + edição

**Files:**
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/index.tsx`
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`

**Interfaces:**
- Consumes: campos `recordsTreatment` da API (Task 3).

- [ ] **Step 1: Form state + etapa no wizard**

Em `index.tsx`, estado `const [records, setRecords] = useState({ storageLocation: "", retentionMonths: "", disposalMethod: "", responsible: "", notes: "" })`. Renderizar na etapa "Registros": Inputs para local de armazenamento, tempo de guarda (number), responsável, observações (Textarea) e `SearchableStringSelect`/select de forma de descarte (`["Exclusão digital","Fragmentação física","Arquivo morto"]`).

- [ ] **Step 2: Enviar no payload de criação**

Adicionar ao `data:`:
```ts
recordsTreatment: {
  storageLocation: records.storageLocation.trim() || null,
  retentionMonths: records.retentionMonths ? Number(records.retentionMonths) : null,
  disposalMethod: records.disposalMethod || null,
  responsible: records.responsible.trim() || null,
  notes: records.notes.trim() || null,
},
```

- [ ] **Step 3: Edição no detalhe**

Em `[id].tsx`, no diálogo de edição, adicionar a mesma seção de campos (em `editForm` ou estado próprio inicializado de `doc.recordsTreatment`) e incluir `recordsTreatment` no `handleSaveEditDialog`.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/index.tsx artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(documentacao): Tratativa de Registros (§7.5.3) no wizard e edição"
```

---

### Task 8: Listagem — cards-resumo, colunas Código/Norma, badge de Tipo, filtro Norma

**Files:**
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/index.tsx`

**Interfaces:**
- Consumes: `summarizeDocuments`, `TYPE_COLORS`, `NORMA_OPTIONS` (Task 5); `STATUS_LABELS`/`STATUS_COLORS` existentes.

- [ ] **Step 1: Cards-resumo**

Acima da barra de filtros, renderizar 4 cards a partir de `const stats = summarizeDocuments(documents ?? [])`: Total / Vigentes / Em revisão / Rascunho. Seguir o padrão de cartão já usado no app (ex.: `Card` com número grande + label). Adicionar `published: "Vigente"` em `STATUS_LABELS` e uma cor em `STATUS_COLORS` (emerald) para cobrir o status visível.

- [ ] **Step 2: Colunas Código e Norma**

Adicionar `<th>Código</th>` e `<th>Norma</th>` no cabeçalho (após Título/Tipo conforme o protótipo) e as `<td>` correspondentes: Código com `font-mono text-xs` (`doc.code || "—"`), Norma (`doc.applicableNorm || "—"`).

- [ ] **Step 3: Badge de Tipo colorido**

Trocar o `<span class="text-muted-foreground text-xs">{TYPE_LABELS...}</span>` por um badge:
```tsx
<span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${TYPE_COLORS[doc.type] || "bg-muted text-foreground"}`}>
  {TYPE_LABELS[doc.type] || doc.type}
</span>
```

- [ ] **Step 4: Filtro por Norma**

Adicionar estado `normFilter` e um `SearchableStringSelect`/select com `NORMA_OPTIONS` na barra de filtros; aplicar no parâmetro de busca (cliente ou no `useListDocuments`, conforme os outros filtros já fazem). Incluir `normFilter` nas deps do `useMemo`/query.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → exit 0. Manual: lista mostra cards + Código + Norma + badge de tipo colorido + filtro Norma.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/index.tsx
git commit -m "feat(documentacao): listagem com cards-resumo, Código/Norma, badge de tipo e filtro de norma"
```

---

### Task 9: Detalhe — Código/Norma na meta, bloco de assinaturas e Registros

**Files:**
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`

- [ ] **Step 1: Garantir Código + Norma na grade de informações**

Conferir/adicionar os itens "Código" e "Norma aplicável" na grade de meta do detalhe (se já existirem, pular).

- [ ] **Step 2: Bloco de assinaturas**

Adicionar uma seção "Assinaturas" com 3 caixas (Elaborado por / Revisado por (análise crítica) / Aprovado por) mostrando nome + data, lendo de `doc.elaborators`, `doc.criticalReviewers`, `doc.approvers` (usar `approvedAt` formatado para o aprovador). Layout `grid grid-cols-1 md:grid-cols-3 gap-3`.

- [ ] **Step 3: Bloco de Tratativa de Registros**

Renderizar `doc.recordsTreatment` (se presente) em uma seção read-only: local, tempo de guarda (meses), forma de descarte, responsável, observações.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(documentacao): detalhe com assinaturas, registros e Código/Norma"
```

---

### Task 10: PDF — assinaturas e Tratativa de Registros

**Files:**
- Modify: `artifacts/web/src/lib/document-pdf.ts`
- Modify: `artifacts/web/tests/lib/document-pdf.unit.test.ts`
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx` (passar os novos dados ao `exportDocumentPdf`)

- [ ] **Step 1: Teste que falha**

Estender o input de `buildDocumentPdf`/`exportDocumentPdf` com `signatures?: { role: string; name: string | null; date: string | null }[]` e `recordsTreatment?: DocumentRecordsTreatment | null`. Adicionar teste verificando que `buildDocumentPdf` com `signatures` e `recordsTreatment` não lança e produz um documento (assert no número de páginas/strings via o mesmo padrão dos 14 testes atuais).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-pdf.unit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `document-pdf.ts`, após o conteúdo, desenhar a seção "Assinaturas" (3 colunas role/name/date) e, se houver, "Tratativa de Registros (§7.5.3)". Reusar os helpers de layout existentes (`drawRuns`/`splitTextToSize`).

- [ ] **Step 4: Ver passar + ligar no detalhe**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-pdf.unit.test.ts` → PASS.
No `[id].tsx`, no `onClick` do "Exportar PDF", passar `signatures` (de elaboradores/revisores/aprovadores) e `recordsTreatment`.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → exit 0.
```bash
git add artifacts/web/src/lib/document-pdf.ts artifacts/web/tests/lib/document-pdf.unit.test.ts artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(documentacao): PDF com assinaturas e Tratativa de Registros"
```

---

### Task 11: Documentos legados — "Nova revisão" + semear modelo em conteúdo vazio

**Files:**
- Modify: `artifacts/api-server/src/routes/documents.ts`
- Modify: `lib/api-spec/openapi.yaml` (+ codegen)
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`
- Modify: `artifacts/web/src/components/documents/document-section-editor.tsx`
- Test: `artifacts/api-server/tests/routes/documents.integration.test.ts`

**Interfaces:**
- Produces: rota `POST /organizations/:orgId/documents/:docId/revise`; hook gerado `useReviseDocument` (nome conforme operationId); botão "Nova revisão" no detalhe; botão "Usar modelo do tipo" no editor.

- [ ] **Step 1: Teste de integração que falha**

Em `documents.integration.test.ts`:

```ts
it("revise reabre documento aprovado para nova revisão (volta a draft, mantém versão)", async () => {
  const context = await createTestContext({ seed: "documents-revise" });
  contexts.push(context);
  const { document, criticalReviewer, approver } = await createDocumentForTest(context);
  // levar até approved
  await request(app).post(`/api/organizations/${context.organizationId}/documents/${document.id}/critical-analysis/complete`).set({ Authorization: `Bearer ${criticalReviewer!.token}` }).send({}).expect(200);
  await request(app).post(`/api/organizations/${context.organizationId}/documents/${document.id}/submit`).set(authHeader(context)).send({ changeDescription: "v1" }).expect(200);
  await request(app).post(`/api/organizations/${context.organizationId}/documents/${document.id}/approve`).set({ Authorization: `Bearer ${approver!.token}` }).send({}).expect(200);

  const revise = await request(app).post(`/api/organizations/${context.organizationId}/documents/${document.id}/revise`).set(authHeader(context)).send({});
  expect(revise.status).toBe(200);
  expect(revise.body.status).toBe("draft");
  expect(revise.body.currentVersion).toBe(1); // versão aprovada preservada no histórico
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/documents.integration.test.ts -t "revise reabre" --testTimeout=30000`
Expected: FAIL (rota 404).

- [ ] **Step 3: Implementar a rota**

Em `routes/documents.ts`, adicionar `POST /organizations/:orgId/documents/:docId/revise` (requireAuth + requireModuleAccess("documents") + requireWriteAccess). Validar org. Carregar doc org-scoped (404 se não existe). Se `status` ∈ {`draft`,`rejected`} → 400 "Documento já está em edição". Se `status === "in_review"` → 400 "Rejeite ou aguarde a revisão atual". Caso `approved`/`published`/`distributed`: numa transação, setar `status: "draft"` (NÃO mexer em `currentVersion`) e recriar o ciclo de análise crítica reusando a mesma lógica do handler de `reject` (status draft + `startCriticalAnalysisCycle`). Após commit, `notifyDocumentDraftStakeholders` e retornar `getDocumentDetail(...)`. Envolver as notificações pós-commit em try/catch (não derrubar 200).

- [ ] **Step 4: OpenAPI + codegen**

Adicionar a operação `revise` no `openapi.yaml` (operationId p.ex. `reviseDocument`, resposta `DocumentDetail`). Run: `pnpm --filter @workspace/api-spec codegen`.

- [ ] **Step 5: Ver passar + typecheck**

Run:
```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/documents.integration.test.ts --testTimeout=30000
pnpm typecheck
```
Expected: PASS; exit 0.

- [ ] **Step 6: Botão "Nova revisão" no detalhe**

Em `[id].tsx`, para `doc.status` ∈ {`approved`,`published`,`distributed`} e `canWriteModule("documents")`, mostrar `HeaderActionButton` "Nova revisão" que abre confirmação (AlertDialog: "O documento voltará para rascunho até nova aprovação.") e chama `useReviseDocument`. Em sucesso, `invalidate()` (o doc vira draft → botões Conteúdo/Editar destravam).

- [ ] **Step 7: Botão "Usar modelo do tipo" no editor (conteúdo vazio)**

Em `DocumentSectionEditor`, quando `canEdit && sections.length === 0`, exibir, além de "Adicionar seção", um botão **"Usar modelo do tipo"**. Como o componente não conhece o `type`, aceitar uma prop opcional `onSeedTemplate?: () => void`; em `conteudo.tsx` passar `onSeedTemplate={() => setSections(seedSectionsForType(doc.type))}` (usa o mirror da Task 6). Botão só aparece se `onSeedTemplate` for fornecido.

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm typecheck` → exit 0. Manual: abrir doc legado → "Nova revisão" → vira rascunho → "Conteúdo" → "Usar modelo do tipo" semeia as seções → preencher → salvar.
```bash
git add artifacts/api-server/src/routes/documents.ts lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/tests/routes/documents.integration.test.ts artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx artifacts/web/src/components/documents/document-section-editor.tsx
git commit -m "feat(documentacao): Nova revisão p/ docs legados + semear modelo em conteúdo vazio"
```

---

## Self-Review (do autor do plano)

- **Cobertura da spec:** ① campos padronizados → Task 5; ② conteúdo no wizard → Tasks 4+6; ③ Registros §7.5.3 → Tasks 1,2,3,7,9,10; ④ listagem → Task 8; ⑤ detalhe/PDF → Tasks 9,10; ⑥ documentos legados / Nova revisão → Task 11 (usa o mirror `seedSectionsForType` da Task 6). Divergências intencionais (versão manual, WYSIWYG, FK de área, catálogo de norma) corretamente fora.
- **Placeholders:** código pure-logic completo (Tasks 1,2,5,6); UI com blocos concretos + verificação manual onde não há harness de render (consistente com o v1).
- **Consistência de tipos:** `DocumentRecordsTreatment` (db) → `RecordsTreatmentSchema`/`normalizeRecordsTreatment` (content.ts) → `recordsTreatment` no contrato/forms/PDF. `seedSectionsForType` existe no servidor (Task 3) e espelhado no client (Task 6, com comentário de sincronia). `DocumentSectionEditor` (Task 4) consumido na Task 6.
- **Nota:** confirmar a assinatura exata de `useListDepartments` e do hook de create gerado ao implementar (Task 5/6) — seguir os outros usos no repo.
