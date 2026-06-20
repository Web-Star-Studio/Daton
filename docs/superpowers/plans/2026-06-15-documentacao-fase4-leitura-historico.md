# Documentação Fase 4 — Leitura de conteúdo + histórico por revisão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** No detalhe do documento: (a) uma aba "Conteúdo" que mostra o conteúdo atual renderizado (somente leitura); (b) clicar numa versão na aba "Versões" abre o **snapshot congelado daquela revisão** (conteúdo + metadados) via `useGetDocumentVersionSnapshot`; (c) reorganizar o grid da aba Informações para manter "Criado em"/"Atualizado em" no mesmo par (follow-up da Fase 2).

**Architecture:** Componente reutilizável `DocumentContentReader` (render de seções como markdown read-only) consumido pela aba Conteúdo e pelo diálogo de snapshot. Sem mudanças de backend — os endpoints `GET .../versions/:n` e o `contentSections` no `DocumentDetail` já existem (Fase 1).

**Tech Stack:** React 19, wouter, TanStack Query (hooks gerados), `react-markdown` + `remark-gfm`, Vitest (web-unit/jsdom + @testing-library/react).

**Spec:** `docs/superpowers/specs/2026-06-15-documentacao-conteudo-na-plataforma-design.md` (§8 leitura/histórico).

**Branch/worktree:** `feat/documentacao-conteudo-na-plataforma` em `/home/jp/daton/Daton-doc-conteudo`.

---

## Fatos do código (verificados no worktree da feature)

- `useGetDocumentVersionSnapshot(orgId, docId, versionNumber, { query: { queryKey, enabled } })` → `DocumentVersionSnapshot`; `getGetDocumentVersionSnapshotQueryKey(orgId, docId, versionNumber)` existe. `enabled` default `!!(orgId && docId && versionNumber)`.
- `DocumentVersionSnapshot = { versionNumber: number; changeDescription: string; createdAt: string; contentSections: DocumentContentSection[]; metaSnapshot?: DocumentVersionMetaSnapshot | null }`. `DocumentVersionMetaSnapshot = { title; code; area; applicableNorm; normativeRequirements }`. Todos importáveis de `@workspace/api-client-react`.
- `[id].tsx`: `const [activeTab, setActiveTab] = useState<"info" | "attachments" | "versions" | "flow">("info")` (linha 202-204); array `tabs` (linha ~857/atual ~885) com `{id,label,icon}`; abas renderizadas por `.map`. `doc.contentSections` disponível (obrigatório).
- Grid Info atual (linhas 929-964): `Título|Tipo`, `Código|Área`, `Norma|Versão`, `Validade|Criado`, `Atualizado(sozinho)` ← Criado/Atualizado separados (a corrigir).
- Versões (linhas 1317-1383): `doc.versions.map((v: DocumentVersion) => ...)` com `v.versionNumber, v.createdAt, v.changeDescription, v.changedByName, v.changedFields`.
- Dialog: `<Dialog open onOpenChange title description>{children}<DialogFooter/></Dialog>` (de `@/components/ui/dialog`, já importado). `Eye`, `FileText`, `GitBranch` já importados de lucide; `formatDate/formatDateTime/formatVersionLabel`, `InfoField` definidos no arquivo.
- Web-unit render: `@testing-library/react` (`render`, `screen`); para componentes sem query, `render(...)` direto basta (helper `renderWithQueryClient` existe em `tests/support/render.tsx` se precisar de QueryClient).

---

## File Structure (Fase 4)

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `artifacts/web/src/components/documents/document-content-reader.tsx` | Render read-only de seções (markdown) | Create |
| `artifacts/web/tests/pages/document-content-reader.unit.test.tsx` | render test | Create |
| `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx` | aba Conteúdo + diálogo de snapshot + reorg grid Info | Modify |

---

## Task 4.1: `DocumentContentReader` + render test (TDD)

**Files:**
- Create: `artifacts/web/src/components/documents/document-content-reader.tsx`
- Test: `artifacts/web/tests/pages/document-content-reader.unit.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentContentReader } from "@/components/documents/document-content-reader";

describe("DocumentContentReader", () => {
  it("renderiza títulos e markdown das seções em ordem", () => {
    render(
      <DocumentContentReader
        sections={[
          { id: "b", title: "Segundo", body: "**negrito**", order: 1 },
          { id: "a", title: "Primeiro", body: "texto", order: 0 },
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading");
    expect(headings.map((h) => h.textContent)).toEqual(["Primeiro", "Segundo"]);
    expect(screen.getByText("negrito").tagName).toBe("STRONG");
  });

  it("mostra estado vazio quando não há seções", () => {
    render(<DocumentContentReader sections={[]} />);
    expect(screen.getByText(/nenhum conteúdo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/document-content-reader.unit.test.tsx`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Implementar o componente**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocumentContentSection } from "@workspace/api-client-react";

export function DocumentContentReader({
  sections,
}: {
  sections: DocumentContentSection[];
}) {
  if (!sections || sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Nenhum conteúdo redigido.
      </p>
    );
  }
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-6">
      {ordered.map((section) => (
        <section key={section.id} className="space-y-2">
          <h3 className="text-sm font-semibold">{section.title || "—"}</h3>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.body || "_Sem conteúdo._"}
            </ReactMarkdown>
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/document-content-reader.unit.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/components/documents/document-content-reader.tsx artifacts/web/tests/pages/document-content-reader.unit.test.tsx
git commit -m "feat(web/documentacao): DocumentContentReader (render read-only de seções)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.2: Detalhe — aba Conteúdo + diálogo de snapshot + reorg grid Info

**Files:** Modify `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`

- [ ] **Step 1: Imports**

Adicionar ao import de `@workspace/api-client-react` (lista de hooks): `useGetDocumentVersionSnapshot,` e `getGetDocumentVersionSnapshotQueryKey,`. Adicionar `AlignLeft` ao import de `lucide-react`. Adicionar:
```tsx
import { DocumentContentReader } from "@/components/documents/document-content-reader";
```

- [ ] **Step 2: Estado da aba + do snapshot**

Alterar o union do `activeTab` (linha ~202) para incluir `"content"`:
```tsx
  const [activeTab, setActiveTab] = useState<
    "info" | "content" | "attachments" | "versions" | "flow"
  >("info");
```
E adicionar o estado do snapshot perto dos demais `useState`:
```tsx
  const [snapshotVersion, setSnapshotVersion] = useState<number | null>(null);
```

- [ ] **Step 3: Hook do snapshot**

Perto do `useGetDocument(...)`:
```tsx
  const { data: snapshot, isLoading: snapshotLoading } =
    useGetDocumentVersionSnapshot(orgId!, docId, snapshotVersion ?? 0, {
      query: {
        queryKey: getGetDocumentVersionSnapshotQueryKey(
          orgId!,
          docId,
          snapshotVersion ?? 0,
        ),
        enabled: !!orgId && snapshotVersion !== null,
      },
    });
```

- [ ] **Step 4: Entrada da aba "Conteúdo"**

No array `tabs`, inserir após a entrada `info`:
```tsx
    { id: "content" as const, label: "Conteúdo", icon: AlignLeft },
```

- [ ] **Step 5: Painel da aba "Conteúdo"**

Logo após o fechamento do bloco `{activeTab === "info" && ( ... )}` (e antes de `{activeTab === "attachments" && ...}`), adicionar:
```tsx
      {activeTab === "content" && (
        <DocumentContentReader sections={doc.contentSections} />
      )}
```

- [ ] **Step 6: Reorg do grid Info (Criado/Atualizado no mesmo par)**

Substituir os três grids atuais (linhas 939-964: `Norma|Versão`, `Validade|Criado`, `Atualizado(sozinho)`) por:
```tsx
          <div className="grid grid-cols-2 gap-6">
            <InfoField
              label="Norma aplicável"
              value={doc.applicableNorm ?? ""}
            />
            <InfoField
              label="Versão Atual"
              value={formatVersionLabel(doc.currentVersion)}
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField
              label="Data de Validade"
              value={formatDate(doc.validityDate)}
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField
              label="Criado em"
              value={formatDateTime(doc.createdAt)}
            />
            <InfoField
              label="Atualizado em"
              value={formatDateTime(doc.updatedAt)}
            />
          </div>
```

- [ ] **Step 7: Linhas de versão clicáveis (aba Versões)**

No `.map((v: DocumentVersion) => ...)` (linhas ~1356-1379), trocar o `<div>` interno (que contém o `flex items-center gap-2 mb-1` + descrição) por um `<button>` clicável que abre o snapshot:
```tsx
              {doc.versions.map((v: DocumentVersion) => (
                <div key={v.id} className="relative">
                  <div className="absolute -left-[29px] top-1 w-4 h-4 rounded-full bg-card border-2 border-foreground/20 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSnapshotVersion(v.versionNumber)}
                    className="text-left w-full rounded-lg -mx-2 px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">
                        v{v.versionNumber}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(v.createdAt)}
                      </span>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground/60 ml-auto" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {v.changeDescription}
                    </p>
                    {v.changedByName && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        por {v.changedByName}
                      </p>
                    )}
                    {v.changedFields && (
                      <p className="text-xs text-muted-foreground/50 mt-0.5">
                        Campos: {v.changedFields}
                      </p>
                    )}
                  </button>
                </div>
              ))}
```

- [ ] **Step 8: Diálogo de snapshot**

Junto dos demais `<Dialog>` no fim do JSX do componente, adicionar:
```tsx
      <Dialog
        open={snapshotVersion !== null}
        onOpenChange={(open) => {
          if (!open) setSnapshotVersion(null);
        }}
        title={`Conteúdo — v${snapshotVersion ?? ""}`}
        description="Versão congelada desta revisão (somente leitura)."
      >
        <div className="space-y-4 max-h-[60vh] overflow-auto">
          {snapshotLoading || !snapshot ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              {snapshot.metaSnapshot && (
                <div className="text-xs text-muted-foreground">
                  {snapshot.metaSnapshot.title}
                  {snapshot.metaSnapshot.code
                    ? ` · ${snapshot.metaSnapshot.code}`
                    : ""}
                  {snapshot.metaSnapshot.applicableNorm
                    ? ` · ${snapshot.metaSnapshot.applicableNorm}`
                    : ""}
                  {` · ${formatDateTime(snapshot.createdAt)}`}
                </div>
              )}
              <DocumentContentReader sections={snapshot.contentSections} />
            </>
          )}
        </div>
      </Dialog>
```

- [ ] **Step 9: Typecheck + commit**

Run: `pnpm --filter @workspace/web typecheck` → PASS.
```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(web/documentacao): aba Conteúdo + leitura de snapshot por revisão + grid Info reorganizado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.3: Verificação final da Fase 4

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck` → PASS.

- [ ] **Step 2: web-unit**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/document-content-reader.unit.test.tsx` → PASS.
(Suíte web-unit completa tem falhas/OOM PRÉ-EXISTENTES em `operational-planning`, `environmental-laia-home`, `suppliers-pages` — não são regressão.)

- [ ] **Step 3: Checklist manual (requer dev servers — usuário roda em :3002 + docker DB; nunca :3001/PROD)**

1. Abrir um documento → nova aba "Conteúdo" mostra as seções renderizadas (markdown), somente leitura.
2. Aba "Versões" → clicar numa versão abre o diálogo com o conteúdo congelado daquela revisão + cabeçalho (título/código/norma/data).
3. Documento com revisão antiga (sem snapshot de conteúdo) → diálogo mostra "Nenhum conteúdo redigido." e metaSnapshot ausente sem quebrar.
4. Aba Informações → "Criado em" e "Atualizado em" aparecem no mesmo par; sem campo duplicado.

- [ ] **Step 4: Revisão de diff**

Run: `git diff --stat origin/main..HEAD` — apenas os arquivos previstos; nada gerado editado à mão.

---

## Self-Review (na escrita do plano)

- **Cobertura:** aba Conteúdo (leitura atual), leitura de snapshot por revisão (hook `useGetDocumentVersionSnapshot`), reorg do grid Info (follow-up Fase 2). Cobre o restante de leitura do §8.
- **Placeholders:** nenhum; âncoras de linha + componentes reais.
- **Tests:** `DocumentContentReader` coberto por render test (web-unit). A fiação no `[id].tsx` (aba/diálogo) por typecheck + checklist manual — render test do `[id].tsx` inteiro exigiria mock pesado de muitos hooks/contexto; desproporcional.
- **Consistência:** Dialog conforme padrão do arquivo (`open/onOpenChange/title/description`); hook chamado incondicionalmente com `enabled` (sem hook condicional); `DocumentContentReader` reutilizado no diálogo e na aba.

## Notas / limitações
- O snapshot de revisões antigas (anteriores à Fase 1) terá `contentSections: []` e `metaSnapshot: null` — o reader mostra estado vazio e o cabeçalho some; comportamento correto.
- Não refatoramos o ramo somente-leitura do editor (`conteudo.tsx`) para usar o `DocumentContentReader` — duplicação pequena, deixada como follow-up opcional para não arriscar regressão no editor.
- Versão 0 (sem revisão aprovada) não aparece na lista de versões, então não há clique para snapshot v0.
