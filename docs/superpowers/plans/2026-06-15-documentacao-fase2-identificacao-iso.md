# Documentação Fase 2 — Identificação ISO nas telas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor os campos de identificação ISO — `code` (Código), `area` (Área/setor), `applicableNorm` (Norma aplicável) — nas telas de criação e detalhe de documentos, e mapear código duplicado para um erro **409** amigável.

**Architecture:** Frontend wiring sobre o client já regenerado na Fase 1 (`CreateDocumentBody`/`UpdateDocumentBody`/`DocumentDetail` já têm `code/area/applicableNorm`). Mais um pequeno hardening de backend: traduzir a violação da constraint `documents_org_code_unique` (Postgres 23505) em HTTP 409 (follow-up registrado na Fase 1, feito agora que o front passa a enviar `code`).

**Tech Stack:** React 19, react-hook-form + Zod, TanStack Query (hooks gerados), Express 5 + Drizzle (backend 409), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-documentacao-conteudo-na-plataforma-design.md` (§7 identificação ISO).

**Branch/worktree:** `feat/documentacao-conteudo-na-plataforma` em `/home/jp/daton/Daton-doc-conteudo` (continua a Fase 1, já nesta branch).

**Decisão de UI:** os três campos são **Input de texto livre** (o backend guarda texto; evita duplicar uma lista de normas em 3 arquivos; `applicableNorm` pode virar `Select` numa iteração futura). Placeholders: `Ex.: IT-LOG-001`, `Ex.: Logística`, `Ex.: ISO 9001`.

---

## Pré-requisitos / fatos do código

- `ApiError` (de `@workspace/api-client-react`, `custom-fetch.ts:188`) tem `.status` e `.data` — detecta-se 409 por `(err as { status?: number }).status === 409`.
- Creates (`index.tsx`, `novo.tsx`) usam react-hook-form com `register` e `setError`; o catch atual só faz `console.error`.
- Detalhe (`[id].tsx`) usa estado simples `editForm`/`setEditForm` (não RHF) e já importa `toast` de `@/hooks/use-toast`. Exibe metadados via componente `InfoField` (`[id].tsx:2054`).
- Backend create envolve `db.transaction(...)`; PATCH usa `.update(documentsTable).set(updates)`. A constraint única é `documents_org_code_unique` em `(organization_id, code)`.

---

## File Structure (Fase 2)

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `artifacts/api-server/src/services/documents/content.ts` | `isDuplicateCodeError(err)` helper | Modify |
| `artifacts/api-server/src/routes/documents.ts` | create + PATCH traduzem 23505 → 409 | Modify |
| `artifacts/web/src/pages/app/qualidade/documentacao/index.tsx` | campos no modal de criação + 409 | Modify |
| `artifacts/web/src/pages/app/qualidade/documentacao/novo.tsx` | campos na página de criação + 409 | Modify |
| `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx` | exibição + edição + 409 | Modify |
| `artifacts/api-server/tests/services/documents/content.unit.test.ts` | unit do helper | Modify |
| `artifacts/api-server/tests/routes/documents-content.integration.test.ts` | integração 409 código duplicado | Modify |

---

## Task 2.1: Backend — código duplicado → 409 (TDD)

**Files:**
- Modify: `artifacts/api-server/src/services/documents/content.ts`
- Modify: `artifacts/api-server/src/routes/documents.ts`
- Test: `artifacts/api-server/tests/services/documents/content.unit.test.ts`, `artifacts/api-server/tests/routes/documents-content.integration.test.ts`

- [ ] **Step 1: Unit test do helper (falha primeiro)**

Adicionar em `content.unit.test.ts`:
```ts
import {
  // ...imports existentes...
  isDuplicateCodeError,
} from "../../../src/services/documents/content";

describe("isDuplicateCodeError", () => {
  it("reconhece violação 23505 da constraint de código", () => {
    expect(isDuplicateCodeError({ code: "23505", constraint: "documents_org_code_unique" })).toBe(true);
  });
  it("ignora outras violações", () => {
    expect(isDuplicateCodeError({ code: "23505", constraint: "outra_constraint" })).toBe(false);
    expect(isDuplicateCodeError({ code: "23502" })).toBe(false);
    expect(isDuplicateCodeError(new Error("x"))).toBe(false);
    expect(isDuplicateCodeError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/content.unit.test.ts`
Expected: FAIL (`isDuplicateCodeError` não existe).

- [ ] **Step 3: Implementar o helper em `content.ts`**

```ts
export function isDuplicateCodeError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505" &&
    "constraint" in err &&
    (err as { constraint?: string }).constraint === "documents_org_code_unique"
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project node-unit artifacts/api-server/tests/services/documents/content.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Traduzir no CREATE handler (`routes/documents.ts`)**

Adicionar `isDuplicateCodeError` ao import de `../services/documents/content`. Envolver o bloco `const [doc] = await db.transaction(async (tx) => {...});` (criação) num try/catch:
```ts
    let doc;
    try {
      [doc] = await db.transaction(async (tx) => {
        // ...corpo existente da transação, inalterado...
      });
    } catch (err) {
      if (isDuplicateCodeError(err)) {
        res.status(409).json({
          error: "Já existe um documento com este código nesta organização.",
        });
        return;
      }
      throw err;
    }
```
(Manter `const [doc]` → `let doc;` antes do try; o restante do handler que usa `doc` segue igual.)

- [ ] **Step 6: Traduzir no PATCH handler (`routes/documents.ts`)**

No handler `router.patch("/organizations/:orgId/documents/:docId", ...)`, envolver a chamada `.update(documentsTable).set(updates)...` num try/catch com o mesmo mapeamento:
```ts
    try {
      await db.update(documentsTable).set(updates)/* .where(...) existente */;
    } catch (err) {
      if (isDuplicateCodeError(err)) {
        res.status(409).json({
          error: "Já existe um documento com este código nesta organização.",
        });
        return;
      }
      throw err;
    }
```
Ler o handler antes para envolver exatamente a chamada de update correta (preservando o `.where(...)` existente e o restante do fluxo).

- [ ] **Step 7: Teste de integração (falha → passa)**

Adicionar caso em `documents-content.integration.test.ts` (usar os helpers já presentes no arquivo: `createProcedimentoForTest` ou criação direta; criar dois documentos com o mesmo `code` na mesma org):
```ts
it("rejeita código duplicado na mesma organização (409)", async () => {
  const ctx = contexts[0]; // ou criar via createTestContext conforme o padrão do arquivo
  const make = (suffix: string) =>
    request(app)
      .post(`/api/organizations/${ctx.organizationId}/documents`)
      .set(authHeader(ctx))
      .send({
        title: `Doc ${suffix}`,
        type: "politica",
        code: "DUP-001",
        elaboratorIds: [/* employee id conforme helper */],
        criticalReviewerIds: [ctx.userId],
        approverIds: [ctx.userId],
      });
  const first = await make("A");
  expect(first.status).toBe(201);
  const second = await make("B");
  expect(second.status).toBe(409);
  expect(second.body.error).toMatch(/código/i);
});
```
Ajustar o shape exato (ids de elaborador/aprovador, recipients para `politica` que não exige destinatário) ao que os outros casos do arquivo já fazem.

Run:
```bash
pnpm test:integration:up
pnpm exec vitest run --project integration artifacts/api-server/tests/routes/documents-content.integration.test.ts
pnpm test:integration:down
```
Expected: o novo caso PASSA (e os 4 anteriores continuam verdes). **Somente o DB de teste docker (`.env.integration` → 127.0.0.1:55432); nunca outro banco.**

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm --filter @workspace/api-server typecheck` → PASS.
```bash
git add artifacts/api-server/src/services/documents/content.ts artifacts/api-server/src/routes/documents.ts artifacts/api-server/tests/services/documents/content.unit.test.ts artifacts/api-server/tests/routes/documents-content.integration.test.ts
git commit -m "feat(documents): código duplicado por org retorna 409

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.2: Frontend — modal de criação (`index.tsx`)

**Files:** Modify `artifacts/web/src/pages/app/qualidade/documentacao/index.tsx`

- [ ] **Step 1: Schema — adicionar 3 campos opcionais** (`index.tsx:83`)

No `createDocumentSchema`, após `title`:
```ts
  title: z.string().min(1, "Título é obrigatório"),
  code: z.string().optional(),
  area: z.string().optional(),
  applicableNorm: z.string().optional(),
  type: z.enum([
```

- [ ] **Step 2: defaultValues** (`index.tsx:545`)

Após `title: "",`:
```ts
      title: "",
      code: "",
      area: "",
      applicableNorm: "",
      type: "manual",
```

- [ ] **Step 3: Campos no passo 0** (`index.tsx:806-848`)

Logo após o bloco do `Título do Documento *` (o primeiro `<div>` dentro de `step === 0`), inserir:
```tsx
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label>Código</Label>
                <Input
                  placeholder="Ex.: IT-LOG-001"
                  className="mt-2"
                  {...register("code")}
                />
                {errors.code && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.code.message}
                  </p>
                )}
              </div>
              <div>
                <Label>Área / Setor</Label>
                <Input
                  placeholder="Ex.: Logística"
                  className="mt-2"
                  {...register("area")}
                />
              </div>
            </div>
```
E, dentro do `grid grid-cols-2` que já tem `Tipo` e `Data de Validade`, NÃO mexer; em vez disso adicionar a Norma aplicável como uma linha própria logo após esse grid (ainda dentro do `step === 0`):
```tsx
            <div>
              <Label>Norma aplicável</Label>
              <Input
                placeholder="Ex.: ISO 9001"
                className="mt-2"
                {...register("applicableNorm")}
              />
            </div>
```

- [ ] **Step 4: Payload de criação** (`index.tsx:698-741`, dentro de `createMut.mutateAsync({ data: {...} })`)

Após `title: data.title.trim(),`:
```ts
          title: data.title.trim(),
          code: data.code?.trim() || undefined,
          area: data.area?.trim() || undefined,
          applicableNorm: data.applicableNorm?.trim() || undefined,
          type: data.type,
```

- [ ] **Step 5: Tratar 409 no catch** (`index.tsx`, catch do `onSubmit`)

Trocar o catch atual (`console.error("Create failed:", err)`) por:
```ts
    } catch (err) {
      if ((err as { status?: number })?.status === 409) {
        setError("code", {
          type: "manual",
          message: "Já existe um documento com este código nesta organização.",
        });
        return;
      }
      console.error("Create failed:", err);
    }
```
(`setError` já está disponível no componente — é usado para `recipientIds`.)

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/index.tsx
git commit -m "feat(web/documentacao): identificação ISO no modal de criação + 409 de código

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.3: Frontend — página de criação (`novo.tsx`)

**Files:** Modify `artifacts/web/src/pages/app/qualidade/documentacao/novo.tsx`

Repetir o mesmo padrão da Task 2.2 (os trechos são equivalentes neste arquivo):

- [ ] **Step 1: Schema** (`novo.tsx:52`) — adicionar `code/area/applicableNorm` opcionais após `title` (mesmo bloco do Step 1 da 2.2).
- [ ] **Step 2: defaultValues** (`novo.tsx:103`) — adicionar `code: "", area: "", applicableNorm: ""` após `title: ""`.
- [ ] **Step 3: Campos** — no JSX da seção de identificação (`novo.tsx:302-349`), após o bloco do `Título do Documento *`, inserir o grid `Código` + `Área / Setor` e, após o grid `Tipo`/`Filial`, a linha `Norma aplicável` (mesmos `<Input {...register(...)}>` da 2.2 Step 3).
- [ ] **Step 4: Payload** (`novo.tsx:247-283`) — após `title: data.title.trim(),`, adicionar as 3 linhas `code/area/applicableNorm` (idêntico à 2.2 Step 4).
- [ ] **Step 5: Catch 409** — trocar o catch do `onSubmit` para o mesmo tratamento da 2.2 Step 5 (`setError("code", ...)`).
- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/novo.tsx
git commit -m "feat(web/documentacao): identificação ISO na página de criação + 409 de código

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.4: Frontend — detalhe (exibição + edição) (`[id].tsx`)

**Files:** Modify `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`

- [ ] **Step 1: Exibir no painel Info** (`[id].tsx:900-1003`)

Logo após o primeiro grid (`Título` / `Tipo`), inserir um grid novo:
```tsx
          <div className="grid grid-cols-2 gap-6">
            <InfoField label="Código" value={doc.code ?? ""} />
            <InfoField label="Área / Setor" value={doc.area ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField label="Norma aplicável" value={doc.applicableNorm ?? ""} />
            <InfoField
              label="Versão Atual"
              value={formatVersionLabel(doc.currentVersion)}
            />
          </div>
```
E REMOVER o `InfoField label="Versão Atual"` do grid seguinte (onde hoje está pareado com `Data de Validade`), deixando `Data de Validade` sozinho OU pareando-o com `Criado em`. Resultado final sem duplicar `Versão Atual`. (Ler o bloco e reorganizar de forma limpa: Título/Tipo · Código/Área · Norma/Versão · Validade/Criado · Atualizado.)

- [ ] **Step 2: `EditFormState`** (`[id].tsx:144-156`)

Adicionar após `title: string;`:
```ts
  title: string;
  code: string;
  area: string;
  applicableNorm: string;
  type: string;
```

- [ ] **Step 3: Inicialização do editForm a partir do doc** (`[id].tsx:498-529`)

Após `title: doc.title,`:
```ts
      title: doc.title,
      code: doc.code ?? "",
      area: doc.area ?? "",
      applicableNorm: doc.applicableNorm ?? "",
      type: doc.type,
```

- [ ] **Step 4: Campos no passo 0 do diálogo de edição** (`[id].tsx:1633-1677`)

Após o bloco do `Título *`, inserir:
```tsx
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label>Código</Label>
                    <Input
                      className="mt-2"
                      value={editForm.code}
                      onChange={(e) =>
                        setEditForm({ ...editForm, code: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Área / Setor</Label>
                    <Input
                      className="mt-2"
                      value={editForm.area}
                      onChange={(e) =>
                        setEditForm({ ...editForm, area: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Norma aplicável</Label>
                  <Input
                    className="mt-2"
                    value={editForm.applicableNorm}
                    onChange={(e) =>
                      setEditForm({ ...editForm, applicableNorm: e.target.value })
                    }
                  />
                </div>
```

- [ ] **Step 5: Payload de update + 409** (`[id].tsx:575-596`, `handleSaveEditDialog`)

Incluir os campos no payload e envolver em try/catch com `toast`:
```ts
  const handleSaveEditDialog = async () => {
    if (!orgId || !editForm) return;
    try {
      await updateMut.mutateAsync({
        orgId,
        docId,
        data: {
          title: editForm.title.trim(),
          code: editForm.code.trim() || undefined,
          area: editForm.area.trim() || undefined,
          applicableNorm: editForm.applicableNorm.trim() || undefined,
          type: editForm.type,
          validityDate: editForm.validityDate || undefined,
          elaboratorIds: editForm.elaboratorIds,
          criticalReviewerIds: editForm.criticalReviewerIds,
          unitIds: editForm.unitIds,
          approverIds: editForm.approverIds,
          recipientIds: editForm.recipientIds,
          recipientGroupIds: editForm.recipientGroupIds,
          referenceIds: editForm.referenceIds,
          normativeRequirements: editForm.normativeRequirements,
        } as never,
      });
    } catch (err) {
      if ((err as { status?: number })?.status === 409) {
        toast({
          title: "Código já utilizado",
          description: "Já existe um documento com este código nesta organização.",
          variant: "destructive",
        });
        return;
      }
      throw err;
    }
    handleCloseEditDialog();
    invalidate();
  };
```
(`toast` já está importado no arquivo, linha 45.)

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(web/documentacao): identificação ISO no detalhe (exibição + edição) + 409

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.5: Verificação final da Fase 2

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck` → PASS (todos os pacotes).

- [ ] **Step 2: Unit + integração**

Run: `pnpm exec vitest run --project node-unit` → PASS (inclui `isDuplicateCodeError`).
Run (DB de teste docker apenas):
```bash
pnpm test:integration:up
pnpm exec vitest run --project integration artifacts/api-server/tests/routes/documents-content.integration.test.ts
pnpm test:integration:down
```
Expected: PASS (5 casos, incluindo o 409 de código duplicado).

- [ ] **Step 3: Checklist manual (requer dev servers — executar o subagente NÃO sobe servidores; é o usuário quem roda, em portas seguras :3002 + docker DB, nunca :3001/PROD)**

1. Criar documento com `Código`, `Área`, `Norma aplicável` preenchidos → persiste e aparece no detalhe.
2. Editar esses campos no diálogo → salvam.
3. Criar outro documento com o MESMO código → mensagem "Já existe um documento com este código…" sob o campo Código (criação) / toast (edição).
4. Documento antigo (sem código) → campos exibem "—" e edição funciona.

- [ ] **Step 4: Revisão de diff**

Run: `git diff --stat origin/main..HEAD` — confirmar apenas os arquivos previstos; nenhum gerado editado à mão; nenhum `push` de banco rodado.

---

## Self-Review (na escrita do plano)

- **Cobertura:** identificação ISO no create modal (2.2), create page (2.3), detalhe exibição+edição (2.4); 409 de código duplicado backend (2.1) + UX nas 3 telas. Cobre §7 do spec para a parte de telas.
- **Placeholders:** nenhum nas tasks; pontos de "ler o handler/bloco antes de envolver" referenciam código real com âncoras de linha e comando de localização.
- **Consistência de tipos:** os campos `code/area/applicableNorm` existem em `CreateDocumentBody`/`UpdateDocumentBody`/`DocumentDetail` (gerados na Fase 1); `isDuplicateCodeError` definido em 2.1 e usado em create+PATCH; detecção de 409 por `.status` (shape de `ApiError`).
- **Tests:** o backend ganha unit + integração (TDD). As telas são wiring declarativo sem lógica pura extraível → cobertas por typecheck + checklist manual (sem teste de render pesado, que só exercitaria mocks). Honesto e proporcional.

## Notas / decisões
- `applicableNorm` é Input de texto livre no v1 (pode virar `Select` de normas comuns numa iteração futura).
- A constraint `documents_org_code_unique` permite múltiplos documentos sem código (NULL distinto) — só bloqueia códigos repetidos preenchidos.
