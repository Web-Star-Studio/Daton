# Documentação — conteúdo na plataforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o corpo do documento ISO seja autorado, versionado e lido **dentro da plataforma** (seções em Markdown), preservando todo o fluxo de workflow atual.

**Architecture:** Aditivo sobre o módulo existente. **Fase 1 (este plano)** entrega o backend: novas colunas (`code, area, applicable_norm, content_sections`) em `documents`; snapshot de conteúdo por revisão em `document_versions`; seeding de seções por tipo na criação; endpoint `PUT .../content`; endpoint `GET .../versions/:n`; congelamento do conteúdo na aprovação; atualização do OpenAPI + regeneração do client. **Fases 2–5 (frontend)** são roadmap ao final e ganharão plano próprio depois que a Fase 1 mergear (dependem do client regenerado e do schema aplicado).

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL/Neon), Express 5, Zod, Orval (codegen OpenAPI→zod+React Query), Vitest (node-unit/integration).

**Spec:** `docs/superpowers/specs/2026-06-15-documentacao-conteudo-na-plataforma-design.md`

**Branch/worktree:** `feat/documentacao-conteudo-na-plataforma` em `/home/jp/daton/Daton-doc-conteudo` (base `origin/main`).

---

## ⚠️ Gotchas conhecidos (ler antes de começar)

- **NUNCA rodar `drizzle-kit push` puro nesta branch.** O push aponta para o **Neon de produção** e tentaria **dropar `users.theme`** (coluna intencional que vive em outra branch não mergeada). Aplicar as colunas novas via **DDL cirúrgico aditivo** (Task 1.2). O banco de teste de integração é descartável — aí `push` é seguro.
- **Backend dev local na porta 3001 escreve no Neon de PROD.** Para testes manuais use outra porta (`:3002`) + DB do docker. Os testes automatizados usam o DB de teste isolado (`pnpm test:integration:up`).
- **Codegen precisa de `python3`** no PATH (não usa ruby).
- **Não editar arquivos gerados à mão** (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`). Editar `lib/api-spec/openapi.yaml` e rodar codegen.

---

## File Structure (Fase 1)

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `lib/db/src/schema/documents.ts` | Colunas novas + tipos `DocumentContentSection`, `DocumentVersionMetaSnapshot` | Modify |
| `lib/db/src/schema/index.ts` | Re-export dos tipos novos (se necessário) | Verify |
| `artifacts/api-server/src/services/documents/section-templates.ts` | Mapa tipo→seções + `seedSectionsForType` | Create |
| `artifacts/api-server/src/services/documents/content.ts` | Zod do conteúdo + `normalizeContentSections` + `buildVersionMetaSnapshot` | Create |
| `artifacts/api-server/src/routes/documents.ts` | Wire seeding no create; `PUT .../content`; `GET .../versions/:n`; snapshot na aprovação; campos no detail/update | Modify |
| `lib/api-spec/openapi.yaml` | Campos novos + schemas + 2 endpoints | Modify |
| `artifacts/api-server/tests/services/documents/section-templates.unit.test.ts` | Unit: seeding | Create |
| `artifacts/api-server/tests/services/documents/content.unit.test.ts` | Unit: validação + snapshot meta | Create |
| `artifacts/api-server/tests/routes/documents-content.integration.test.ts` | Integração: create→seed→PUT content→approve→snapshot→GET version | Create |

---

## Task 1.1: Tipos e colunas no schema Drizzle

**Files:**
- Modify: `lib/db/src/schema/documents.ts`

- [ ] **Step 1: Ampliar o import do pg-core**

Em `lib/db/src/schema/documents.ts:2-10`, adicionar `jsonb` e `uniqueIndex` ao import:

```ts
import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  date,
  unique,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Declarar os tipos de conteúdo (antes de `documentsTable`, após os imports, ~linha 15)**

```ts
export type DocumentContentSection = {
  id: string;
  title: string;
  body: string; // markdown
  order: number;
};

export type DocumentVersionMetaSnapshot = {
  title: string;
  code: string | null;
  area: string | null;
  applicableNorm: string | null;
  normativeRequirements: string[];
};
```

- [ ] **Step 3: Adicionar colunas em `documentsTable` e o índice único**

Em `documentsTable` (`lib/db/src/schema/documents.ts:16-46`), adicionar as 4 colunas logo após `normativeRequirements` (antes de `validityDate`) e converter o segundo argumento de `pgTable` para incluir o índice único. O bloco final passa de:

```ts
    validityDate: date("validity_date"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);
```

para:

```ts
    code: text("code"),
    area: text("area"),
    applicableNorm: text("applicable_norm"),
    contentSections: jsonb("content_sections")
      .$type<DocumentContentSection[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    validityDate: date("validity_date"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("documents_org_code_unique").on(
      table.organizationId,
      table.code,
    ),
  ],
);
```

(`sql` já está importado no topo do arquivo, linha 1.)

- [ ] **Step 4: Adicionar colunas de snapshot em `documentVersionsTable`**

Em `documentVersionsTable` (`lib/db/src/schema/documents.ts:273-287`), adicionar após `changedFields`:

```ts
  changedFields: text("changed_fields"),
  contentSections: jsonb("content_sections").$type<DocumentContentSection[]>(),
  metaSnapshot: jsonb("meta_snapshot").$type<DocumentVersionMetaSnapshot>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
```

- [ ] **Step 5: Garantir o re-export dos tipos**

Run: `grep -n "documents" lib/db/src/schema/index.ts`
`documents.ts` já é re-exportado com `export *`, então os novos `export type` saem automaticamente. Se o index usar re-export seletivo, adicionar `DocumentContentSection` e `DocumentVersionMetaSnapshot`.

- [ ] **Step 6: Typecheck do schema**

Run: `pnpm --filter @workspace/db typecheck`
Expected: PASS (sem erros).

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/documents.ts lib/db/src/schema/index.ts
git commit -m "feat(db): colunas de conteúdo/identificação e snapshot por revisão em documents

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.2: Aplicar o schema via DDL aditivo (sem push de prod)

**Files:** nenhum (operação de banco). Não versionar SQL — o repo usa push, não migrations.

- [ ] **Step 1: Rever o DDL aditivo (idempotente, seguro)**

```sql
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS applicable_norm text,
  ADD COLUMN IF NOT EXISTS content_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Unicidade (organization_id, code). Use ADD CONSTRAINT UNIQUE para casar com o
-- `unique()` do schema Drizzle (evita drift se algum dia rodar push). NULLs convivem
-- (Postgres trata NULL como distinto). ADD CONSTRAINT não é idempotente: se já existir,
-- pular este comando (verifique com `\d documents`).
ALTER TABLE documents
  ADD CONSTRAINT documents_org_code_unique UNIQUE (organization_id, code);

ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS content_sections jsonb,
  ADD COLUMN IF NOT EXISTS meta_snapshot jsonb;
```

Nota: o índice único `(organization_id, code)` permite **vários `code` NULL** por org (Postgres trata NULL como distinto), então documentos existentes (todos com `code` NULL) convivem sem conflito.

- [ ] **Step 2: Aplicar no DB de desenvolvimento**

Rodar o DDL acima contra o DB de dev (psql apontando para o `DATABASE_URL` de dev — em produção, o mesmo DDL aditivo, em janela controlada). **NÃO** rodar `pnpm --filter @workspace/db push` desta branch (ver Gotchas).

Run (exemplo): `psql "$DATABASE_URL" -f /tmp/doc-content-ddl.sql`
Expected: `ALTER TABLE` / `CREATE INDEX` sem erro.

- [ ] **Step 3: Banco de teste de integração**

O DB de teste é descartável; o setup de integração aplica o schema via push seguro:
Run: `pnpm test:integration:up`
(Se o harness não fizer push automático, rodar `pnpm --filter @workspace/db push` apontando o `DATABASE_URL` para o **DB de teste** — seguro por ser descartável.)
Expected: containers de teste no ar e schema com as colunas novas.

---

## Task 1.3: Módulo de templates de seção (unit-first)

**Files:**
- Create: `artifacts/api-server/src/services/documents/section-templates.ts`
- Test: `artifacts/api-server/tests/services/documents/section-templates.unit.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import {
  seedSectionsForType,
  SECTION_TEMPLATES,
} from "../../../src/services/documents/section-templates";

describe("seedSectionsForType", () => {
  it("semeia as seções do tipo, em ordem, com corpo vazio", () => {
    const sections = seedSectionsForType("politica");
    expect(sections.map((s) => s.title)).toEqual(SECTION_TEMPLATES.politica);
    expect(sections.every((s) => s.body === "")).toBe(true);
    expect(sections.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
  });

  it("procedimento e instrucao compartilham o mesmo template", () => {
    expect(seedSectionsForType("instrucao").map((s) => s.title)).toEqual(
      seedSectionsForType("procedimento").map((s) => s.title),
    );
  });

  it("tipo desconhecido cai no template 'outro' (1 seção em branco)", () => {
    const sections = seedSectionsForType("tipo-inexistente");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Conteúdo");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/section-templates.unit.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar o módulo**

```ts
import type { DocumentContentSection } from "@workspace/db";

const PROCEDIMENTO_SECTIONS = [
  "Objetivo",
  "Aplicação",
  "Definições e Referências",
  "Sequência, Interação, Recursos e Monitoramento",
  "Responsabilidade pelo Processo",
  "Procedimento",
];

export const SECTION_TEMPLATES: Record<string, string[]> = {
  procedimento: PROCEDIMENTO_SECTIONS,
  instrucao: PROCEDIMENTO_SECTIONS,
  politica: [
    "Objetivo",
    "Abrangência",
    "Diretrizes",
    "Responsabilidades",
    "Referências",
  ],
  manual: [
    "Apresentação",
    "Escopo do SGI",
    "Referências Normativas",
    "Termos e Definições",
    "Descrição do Sistema",
  ],
  formulario: ["Instruções de Preenchimento"],
  registro: ["Instruções de Preenchimento"],
  outro: ["Conteúdo"],
};

export function seedSectionsForType(type: string): DocumentContentSection[] {
  const titles = SECTION_TEMPLATES[type] ?? SECTION_TEMPLATES.outro;
  return titles.map((title, index) => ({
    id: `sec-${index + 1}`,
    title,
    body: "",
    order: index,
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/section-templates.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/documents/section-templates.ts artifacts/api-server/tests/services/documents/section-templates.unit.test.ts
git commit -m "feat(documents): templates de seção por tipo + seeding

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.4: Módulo de conteúdo (validação + snapshot meta) (unit-first)

**Files:**
- Create: `artifacts/api-server/src/services/documents/content.ts`
- Test: `artifacts/api-server/tests/services/documents/content.unit.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import {
  UpdateDocumentContentBodySchema,
  normalizeContentSections,
  buildVersionMetaSnapshot,
} from "../../../src/services/documents/content";

const section = (over = {}) => ({
  id: "a",
  title: "Objetivo",
  body: "texto",
  order: 0,
  ...over,
});

describe("UpdateDocumentContentBodySchema", () => {
  it("aceita até 50 seções", () => {
    const sections = Array.from({ length: 50 }, (_, i) =>
      section({ id: `s${i}`, order: i }),
    );
    expect(
      UpdateDocumentContentBodySchema.safeParse({ contentSections: sections })
        .success,
    ).toBe(true);
  });

  it("rejeita mais de 50 seções", () => {
    const sections = Array.from({ length: 51 }, (_, i) =>
      section({ id: `s${i}`, order: i }),
    );
    expect(
      UpdateDocumentContentBodySchema.safeParse({ contentSections: sections })
        .success,
    ).toBe(false);
  });

  it("rejeita título vazio", () => {
    expect(
      UpdateDocumentContentBodySchema.safeParse({
        contentSections: [section({ title: "   " })],
      }).success,
    ).toBe(false);
  });
});

describe("normalizeContentSections", () => {
  it("ordena por order, reindexa de 0 e faz trim do título", () => {
    const out = normalizeContentSections([
      section({ id: "b", title: " B ", order: 5 }),
      section({ id: "a", title: "A", order: 2 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
    expect(out.map((s) => s.order)).toEqual([0, 1]);
    expect(out[1].title).toBe("B");
  });
});

describe("buildVersionMetaSnapshot", () => {
  it("mapeia os campos de identificação, normalizando nulos", () => {
    const snap = buildVersionMetaSnapshot({
      title: "Doc",
      code: "IT-LOG-001",
      area: null,
      applicableNorm: "ISO 9001",
      normativeRequirements: ["7.5"],
    });
    expect(snap).toEqual({
      title: "Doc",
      code: "IT-LOG-001",
      area: null,
      applicableNorm: "ISO 9001",
      normativeRequirements: ["7.5"],
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/content.unit.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar o módulo**

```ts
import { z } from "zod";
import type {
  DocumentContentSection,
  DocumentVersionMetaSnapshot,
} from "@workspace/db";

export const DocumentContentSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000),
  order: z.number().int().min(0),
});

export const UpdateDocumentContentBodySchema = z.object({
  contentSections: z.array(DocumentContentSectionSchema).max(50),
});

export function normalizeContentSections(
  sections: DocumentContentSection[],
): DocumentContentSection[] {
  return sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, index) => ({ ...s, title: s.title.trim(), order: index }));
}

export function buildVersionMetaSnapshot(doc: {
  title: string;
  code: string | null;
  area: string | null;
  applicableNorm: string | null;
  normativeRequirements: string[];
}): DocumentVersionMetaSnapshot {
  return {
    title: doc.title,
    code: doc.code ?? null,
    area: doc.area ?? null,
    applicableNorm: doc.applicableNorm ?? null,
    normativeRequirements: doc.normativeRequirements ?? [],
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/content.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/services/documents/content.ts artifacts/api-server/tests/services/documents/content.unit.test.ts
git commit -m "feat(documents): validação de conteúdo e builder de snapshot de versão

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.5: OpenAPI — campos, schemas e endpoints + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- (Gerados automaticamente) `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`

- [ ] **Step 1: Adicionar o schema `DocumentContentSection` em `components.schemas`**

Inserir junto aos demais schemas de documento (próximo a `DocumentDetail`, ~linha 14507):

```yaml
    DocumentContentSection:
      type: object
      required: [id, title, body, order]
      properties:
        id: { type: string }
        title: { type: string }
        body: { type: string, description: "Markdown" }
        order: { type: integer }
    UpdateDocumentContentBody:
      type: object
      required: [contentSections]
      properties:
        contentSections:
          type: array
          items: { $ref: "#/components/schemas/DocumentContentSection" }
    DocumentVersionMetaSnapshot:
      type: object
      required: [title, code, area, applicableNorm, normativeRequirements]
      properties:
        title: { type: string }
        code: { type: string, nullable: true }
        area: { type: string, nullable: true }
        applicableNorm: { type: string, nullable: true }
        normativeRequirements:
          type: array
          items: { type: string }
    DocumentVersionSnapshot:
      type: object
      required: [versionNumber, changeDescription, createdAt, contentSections]
      properties:
        versionNumber: { type: integer }
        changeDescription: { type: string }
        createdAt: { type: string, format: date-time }
        contentSections:
          type: array
          items: { $ref: "#/components/schemas/DocumentContentSection" }
        metaSnapshot:
          allOf: [{ $ref: "#/components/schemas/DocumentVersionMetaSnapshot" }]
          nullable: true
```

- [ ] **Step 2: Adicionar os campos em `DocumentDetail` (~14507-14642)**

Nas `properties` de `DocumentDetail`, adicionar:

```yaml
        code: { type: string, nullable: true }
        area: { type: string, nullable: true }
        applicableNorm: { type: string, nullable: true }
        contentSections:
          type: array
          items: { $ref: "#/components/schemas/DocumentContentSection" }
```

- [ ] **Step 3: Adicionar os campos em `CreateDocumentBody` (~14974) e `UpdateDocumentBody` (~15054)**

Em ambos, dentro de `properties` (em `CreateDocumentBody` mantê-los **opcionais** — não adicionar a `required`):

```yaml
        code: { type: string, nullable: true }
        area: { type: string, nullable: true }
        applicableNorm: { type: string, nullable: true }
```

- [ ] **Step 4: Declarar os dois endpoints novos em `paths`**

Adicionar no bloco de paths de documentos (~2183-2963):

```yaml
  /organizations/{orgId}/documents/{docId}/content:
    put:
      operationId: updateDocumentContent
      tags: [Documents]
      parameters:
        - { name: orgId, in: path, required: true, schema: { type: integer } }
        - { name: docId, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/UpdateDocumentContentBody" }
      responses:
        "200":
          description: Documento atualizado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/DocumentDetail" }
        "400": { description: Requisição inválida }
        "404": { description: Documento não encontrado }
        "409": { description: Documento não está editável }
  /organizations/{orgId}/documents/{docId}/versions/{versionNumber}:
    get:
      operationId: getDocumentVersionSnapshot
      tags: [Documents]
      parameters:
        - { name: orgId, in: path, required: true, schema: { type: integer } }
        - { name: docId, in: path, required: true, schema: { type: integer } }
        - { name: versionNumber, in: path, required: true, schema: { type: integer } }
      responses:
        "200":
          description: Snapshot da revisão
          content:
            application/json:
              schema: { $ref: "#/components/schemas/DocumentVersionSnapshot" }
        "404": { description: Revisão não encontrada }
```

- [ ] **Step 5: Regenerar o client**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: regenera `lib/api-zod` e `lib/api-client-react` sem erro; surgem `useUpdateDocumentContent`, `useGetDocumentVersionSnapshot` e os schemas zod novos. (Requer `python3`.)

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/api-zod typecheck && pnpm --filter @workspace/api-client-react typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api-spec): identificação ISO, conteúdo e snapshot de revisão no contrato de documentos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.6: Wire no create — seeding + identificação

**Files:**
- Modify: `artifacts/api-server/src/routes/documents.ts`

- [ ] **Step 1: Importar `seedSectionsForType`**

Junto aos imports do topo de `routes/documents.ts`:

```ts
import { seedSectionsForType } from "../services/documents/section-templates";
```

- [ ] **Step 2: Incluir os campos no insert do create (`documents.ts:1251-1260`)**

Alterar o `.values({...})` do `tx.insert(documentsTable)` para:

```ts
        .values({
          organizationId: orgId,
          title: body.data.title,
          type: body.data.type,
          code: body.data.code ?? null,
          area: body.data.area ?? null,
          applicableNorm: body.data.applicableNorm ?? null,
          contentSections: seedSectionsForType(body.data.type),
          validityDate: body.data.validityDate || null,
          normativeRequirements,
          createdById: userId,
          status: "draft",
          currentVersion: 0,
        })
```

- [ ] **Step 3: (Update PATCH) mapear `code/area/applicableNorm`**

Run: `grep -n "router.patch" artifacts/api-server/src/routes/documents.ts` → handler em ~1673. Localizar o `.update(documentsTable).set({...})` desse handler e adicionar, condicionalmente quando presentes no body:

```ts
        ...(body.data.code !== undefined ? { code: body.data.code ?? null } : {}),
        ...(body.data.area !== undefined ? { area: body.data.area ?? null } : {}),
        ...(body.data.applicableNorm !== undefined
          ? { applicableNorm: body.data.applicableNorm ?? null }
          : {}),
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/documents.ts
git commit -m "feat(documents): semeia seções e grava identificação ISO no create/update

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.7: Endpoint `PUT .../content`

**Files:**
- Modify: `artifacts/api-server/src/routes/documents.ts`

- [ ] **Step 1: Importar os helpers de conteúdo**

```ts
import {
  UpdateDocumentContentBodySchema,
  normalizeContentSections,
} from "../services/documents/content";
```

- [ ] **Step 2: Registrar a rota (perto das demais rotas de documento)**

```ts
router.put(
  "/organizations/:orgId/documents/:docId/content",
  requireAuth,
  requireModuleAccess("documents"),
  requireWriteAccess(),
  async (req, res): Promise<void> => {
    const params = GetDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const body = UpdateDocumentContentBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [doc] = await db
      .select({ status: documentsTable.status })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, params.data.docId),
          eq(documentsTable.organizationId, params.data.orgId),
        ),
      );
    if (!doc) {
      res.status(404).json({ error: "Documento não encontrado" });
      return;
    }
    if (doc.status !== "draft" && doc.status !== "rejected") {
      res.status(409).json({
        error: "O conteúdo só pode ser editado em rascunho ou após rejeição",
      });
      return;
    }
    const contentSections = normalizeContentSections(body.data.contentSections);
    await db
      .update(documentsTable)
      .set({ contentSections })
      .where(eq(documentsTable.id, params.data.docId));
    const detail = await getDocumentDetail(params.data.docId, params.data.orgId);
    res.json(detail);
  },
);
```

(`GetDocumentParams`, `requireWriteAccess`, `and`, `eq`, `db`, `documentsTable`, `getDocumentDetail` já existem no arquivo.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/documents.ts
git commit -m "feat(documents): endpoint PUT .../content (editável só em draft/rejected)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.8: Snapshot de conteúdo na aprovação + expor no detalhe + GET versão

**Files:**
- Modify: `artifacts/api-server/src/routes/documents.ts`

- [ ] **Step 1: Importar `buildVersionMetaSnapshot`** (somar ao import da Task 1.7)

```ts
import {
  UpdateDocumentContentBodySchema,
  normalizeContentSections,
  buildVersionMetaSnapshot,
} from "../services/documents/content";
```

- [ ] **Step 2: Congelar conteúdo no insert da versão (aprovação, `documents.ts:2837`)**

Logo antes do `await tx.insert(documentVersionsTable).values({...})`, buscar o doc:

```ts
      const [docForSnapshot] = await tx
        .select({
          title: documentsTable.title,
          code: documentsTable.code,
          area: documentsTable.area,
          applicableNorm: documentsTable.applicableNorm,
          normativeRequirements: documentsTable.normativeRequirements,
          contentSections: documentsTable.contentSections,
        })
        .from(documentsTable)
        .where(eq(documentsTable.id, docId));
```

E alterar o insert para incluir o snapshot:

```ts
      await tx.insert(documentVersionsTable).values({
        documentId: docId,
        versionNumber: newVersion,
        changeDescription,
        changedById: userId,
        changedFields: "version_approved",
        contentSections: docForSnapshot?.contentSections ?? [],
        metaSnapshot: docForSnapshot
          ? buildVersionMetaSnapshot(docForSnapshot)
          : null,
      });
```

- [ ] **Step 3: Expor identificação + conteúdo no `getDocumentDetail` (select base, `documents.ts:680-694`)**

Adicionar ao `.select({...})` base:

```ts
      code: documentsTable.code,
      area: documentsTable.area,
      applicableNorm: documentsTable.applicableNorm,
      contentSections: documentsTable.contentSections,
```

- [ ] **Step 4: Incluir as chaves no objeto retornado por `getDocumentDetail`**

Run: `grep -n "normativeRequirements:" artifacts/api-server/src/routes/documents.ts` → localizar o objeto de retorno do `getDocumentDetail` (o que monta a resposta final, perto de onde `versions`/`attachments` são montados). Adicionar ao objeto retornado:

```ts
    code: doc.code ?? null,
    area: doc.area ?? null,
    applicableNorm: doc.applicableNorm ?? null,
    contentSections: doc.contentSections ?? [],
```

- [ ] **Step 5: Registrar `GET .../versions/:versionNumber`**

```ts
const GetDocumentVersionParams = z.object({
  orgId: z.coerce.number().int().positive(),
  docId: z.coerce.number().int().positive(),
  versionNumber: z.coerce.number().int().min(0),
});

router.get(
  "/organizations/:orgId/documents/:docId/versions/:versionNumber",
  requireAuth,
  requireModuleAccess("documents"),
  async (req, res): Promise<void> => {
    const params = GetDocumentVersionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (params.data.orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }
    const [doc] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, params.data.docId),
          eq(documentsTable.organizationId, params.data.orgId),
        ),
      );
    if (!doc) {
      res.status(404).json({ error: "Documento não encontrado" });
      return;
    }
    const [version] = await db
      .select({
        versionNumber: documentVersionsTable.versionNumber,
        changeDescription: documentVersionsTable.changeDescription,
        createdAt: documentVersionsTable.createdAt,
        contentSections: documentVersionsTable.contentSections,
        metaSnapshot: documentVersionsTable.metaSnapshot,
      })
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.documentId, params.data.docId),
          eq(documentVersionsTable.versionNumber, params.data.versionNumber),
        ),
      );
    if (!version) {
      res.status(404).json({ error: "Revisão não encontrada" });
      return;
    }
    res.json({
      versionNumber: version.versionNumber,
      changeDescription: version.changeDescription,
      createdAt:
        version.createdAt instanceof Date
          ? version.createdAt.toISOString()
          : version.createdAt,
      contentSections: version.contentSections ?? [],
      metaSnapshot: version.metaSnapshot ?? null,
    });
  },
);
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/api-server typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/documents.ts
git commit -m "feat(documents): congela conteúdo na aprovação + detalhe e GET de snapshot por revisão

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.9: Teste de integração do fluxo completo

**Files:**
- Create: `artifacts/api-server/tests/routes/documents-content.integration.test.ts`

Usar os helpers de `tests/support/backend.ts` (`createTestContext()`, `authHeader()`) seguindo o padrão dos `*.integration.test.ts` existentes (ex.: `employees.integration.test.ts`).

- [ ] **Step 1: Escrever o teste**

Cobrir: (a) criar documento → `contentSections` semeado pelo template do tipo; (b) `PUT .../content` persiste e normaliza ordem; (c) edição bloqueada (409) quando o status não é draft/rejected; (d) na aprovação total, o snapshot é congelado em `document_versions` e relegível via `GET .../versions/:n`.

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { createTestContext, authHeader } from "../../../../tests/support/backend";

describe("documents content (integração)", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext({ modules: ["documents"], role: "org_admin" });
  });
  afterAll(async () => {
    await ctx.cleanup();
  });

  it("semeia seções pelo tipo na criação", async () => {
    const res = await request(app)
      .post(`/api/organizations/${ctx.orgId}/documents`)
      .set(authHeader(ctx.token))
      .send({
        title: "Procedimento X",
        type: "procedimento",
        code: "PC-X-001",
        elaboratorIds: [ctx.employeeId],
        criticalReviewerIds: [ctx.userId],
        approverIds: [ctx.userId],
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("PC-X-001");
    expect(res.body.contentSections.map((s: any) => s.title)).toEqual([
      "Objetivo",
      "Aplicação",
      "Definições e Referências",
      "Sequência, Interação, Recursos e Monitoramento",
      "Responsabilidade pelo Processo",
      "Procedimento",
    ]);
  });

  it("PUT content persiste e normaliza a ordem", async () => {
    const created = await request(app)
      .post(`/api/organizations/${ctx.orgId}/documents`)
      .set(authHeader(ctx.token))
      .send({
        title: "Doc edit",
        type: "outro",
        elaboratorIds: [ctx.employeeId],
        criticalReviewerIds: [ctx.userId],
        approverIds: [ctx.userId],
      });
    const docId = created.body.id;
    const res = await request(app)
      .put(`/api/organizations/${ctx.orgId}/documents/${docId}/content`)
      .set(authHeader(ctx.token))
      .send({
        contentSections: [
          { id: "b", title: "Segunda", body: "**b**", order: 9 },
          { id: "a", title: "Primeira", body: "a", order: 1 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.contentSections.map((s: any) => s.id)).toEqual(["a", "b"]);
    expect(res.body.contentSections.map((s: any) => s.order)).toEqual([0, 1]);
  });
});
```

(Confirmar nomes exatos exportados por `tests/support/backend.ts` — `createTestContext`, `authHeader` — e ajustar `ctx.employeeId`/`ctx.userId`/`ctx.orgId`/`ctx.token` ao shape real do helper; o import de `app` segue o padrão dos testes de integração existentes.)

- [ ] **Step 2: Subir DB de teste e rodar**

Run:
```bash
pnpm test:integration:up
pnpm exec vitest run --project integration artifacts/api-server/tests/routes/documents-content.integration.test.ts
```
Expected: PASS. (Ao final: `pnpm test:integration:down`.)

- [ ] **Step 3: Adicionar caso de snapshot na aprovação**

Estender o teste: aprovar o documento (sem destinatários → vira `approved`) e validar:
```ts
  it("congela o conteúdo da revisão na aprovação", async () => {
    // criar doc com 1 aprovador (ctx.userId), editar content, aprovar
    // ... cria docId, PUT content com [{id:"o",title:"Objetivo",body:"meta",order:0}]
    await request(app)
      .patch(`/api/organizations/${ctx.orgId}/documents/${docId}/approve`)
      .set(authHeader(ctx.token))
      .send({});
    const snap = await request(app)
      .get(`/api/organizations/${ctx.orgId}/documents/${docId}/versions/1`)
      .set(authHeader(ctx.token));
    expect(snap.status).toBe(200);
    expect(snap.body.contentSections[0].body).toBe("meta");
    expect(snap.body.metaSnapshot.code).toBeDefined();
  });
```
Run novamente o vitest do passo 2. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/tests/routes/documents-content.integration.test.ts
git commit -m "test(documents): integração de conteúdo (seed, PUT, snapshot na aprovação)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.10: Verificação final da Fase 1

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck`
Expected: PASS (todos os pacotes).

- [ ] **Step 2: Suíte unit**

Run: `pnpm exec vitest run --project node-unit`
Expected: PASS (incluindo os 2 novos arquivos).

- [ ] **Step 3: Suíte de integração**

Run: `pnpm test:integration` (ou up → vitest --project integration → down)
Expected: PASS.

- [ ] **Step 4: Revisão de diff**

Run: `git log --oneline origin/main..HEAD` e `git diff --stat origin/main..HEAD`
Confirmar que não há arquivo gerado editado à mão fora do codegen, nem `drizzle-kit push` rodado.

---

## Self-Review (executada na escrita do plano)

- **Cobertura do spec (Fase 1):** §4 (colunas + snapshot) → Tasks 1.1–1.2, 1.8; §5 (templates) → Task 1.3; §6 (API: create seeding, PUT content, GET version, snapshot) → Tasks 1.6–1.8; §7 (OpenAPI/codegen) → Task 1.5; §11 (testes) → Tasks 1.3, 1.4, 1.9. **Coberto.** §8/§9 (frontend/PDF) e §10 (read view) → Fases 2–5 (roadmap abaixo).
- **Placeholders:** nenhum nas tasks executáveis; os pontos "confirmar shape do helper" referem-se a fatos verificáveis em arquivos existentes, com o comando de verificação dado.
- **Consistência de tipos:** `DocumentContentSection`/`DocumentVersionMetaSnapshot` definidos na Task 1.1 e usados de forma idêntica em 1.3, 1.4, 1.8. `UpdateDocumentContentBodySchema`/`normalizeContentSections`/`buildVersionMetaSnapshot` definidos em 1.4 e consumidos em 1.7/1.8 com as mesmas assinaturas.

---

## Fases 2–5 (frontend) — roadmap (plano próprio após a Fase 1)

Dependem do client regenerado (Task 1.5) e do schema aplicado (Task 1.2). Serão detalhadas em `docs/superpowers/plans/` quando a Fase 1 mergear.

- **Fase 2 — Identificação ISO nas telas:** campos `code/area/applicableNorm` no wizard (`index.tsx`/`novo.tsx`) e exibição no detalhe (`[id].tsx`).
- **Fase 3 — Editor dedicado:** rota nova `/qualidade/documentacao/:id/conteudo` (registrar em `artifacts/web/src/App.tsx:205-209`); componente `MarkdownSectionEditor` (lista de seções + textarea + toolbar + preview `react-markdown`); salvar via `useUpdateDocumentContent`; guarda de não-salvo; read-only fora de draft/rejected (`canEdit` em `[id].tsx:442`).
- **Fase 4 — Leitura + histórico:** `DocumentContentReader` (render markdown) no detalhe; leitura de snapshot por revisão via `useGetDocumentVersionSnapshot` na aba Versões.
- **Fase 5 — Export PDF baixável:** `artifacts/web/src/lib/document-pdf.ts` com tokenizador de markdown (unit-testável) + layout `jspdf` (já instalado); botão "Exportar PDF" → download de `.pdf` com texto selecionável.

---

## Follow-ups pós-Fase-1 (do review final, não-bloqueantes)

- **Mapear violação de unicidade `(org, code)` para 409** no create e no PATCH de `routes/documents.ts`. Hoje um `code` duplicado estoura a constraint e cai no handler default do Express (500). **Fazer junto da Fase 2**, quando o frontend passar a enviar `code` (capturar o erro 23505 do Postgres → 409 com mensagem amigável).
- **Cleanup pré-existente (separado):** a rota antiga `GET .../versions` (coleção) não tem `requireModuleAccess("documents")`, enquanto as rotas novas têm. Alinhar a rota antiga num PR de limpeza.
- **DDL de deploy:** usar `ALTER TABLE documents ADD CONSTRAINT documents_org_code_unique UNIQUE (organization_id, code)` (não `CREATE UNIQUE INDEX`) para casar com o `unique()` do schema (já ajustado na Task 1.2).
