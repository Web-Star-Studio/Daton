# Documentação Fase 3 — Editor dedicado de conteúdo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tela dedicada `/qualidade/documentacao/:id/conteudo` para redigir o conteúdo do documento em seções (Markdown) — adicionar/renomear/reordenar/remover seções, editor com toolbar + preview ao vivo (`react-markdown`), salvar via `useUpdateDocumentContent`, guarda de alterações não salvas, e modo somente-leitura quando o documento não é editável.

**Architecture:** Lógica pura de manipulação de seções e de markup extraída para um módulo testável (`lib/document-content-sections.ts`); a página React (`conteudo.tsx`) consome esse módulo + `react-markdown` + o hook gerado. Rota nova registrada no `App.tsx`. Botão "Conteúdo" no detalhe (`[id].tsx`) navega para o editor.

**Tech Stack:** React 19, wouter, TanStack Query (hooks gerados), `react-markdown` + `remark-gfm` (já instalados), Vitest (web-unit/jsdom).

**Spec:** `docs/superpowers/specs/2026-06-15-documentacao-conteudo-na-plataforma-design.md` (§8 editor dedicado).

**Branch/worktree:** `feat/documentacao-conteudo-na-plataforma` em `/home/jp/daton/Daton-doc-conteudo`.

---

## Fatos do código (verificados)

- `useUpdateDocumentContent` (gerado): `mutateAsync({ orgId, docId, data: { contentSections } })`; `UpdateDocumentContentBody = { contentSections: DocumentContentSection[] }`. `DocumentContentSection = { id: string; title: string; body: string; order: number }`, importável de `@workspace/api-client-react`.
- `useGetDocument(orgId, docId, { query: { queryKey: getGetDocumentQueryKey(orgId, docId), enabled } })`; `doc.contentSections` é **obrigatório** no `DocumentDetail` (Fase 1).
- Auth/edição: `const { organization } = useAuth(); const orgId = organization?.id;` `const { canWriteModule } = usePermissions();` → `canEdit = canWriteModule("documents") && (doc?.status === "draft" || doc?.status === "rejected")`.
- Router: wouter. `import { useParams, useLocation } from "wouter"`; `const [, navigate] = useLocation()`.
- Layout: `usePageTitle(...)`, `useHeaderActions(jsx)` + `HeaderActionButton` (de `@/components/layout/HeaderActionButton`).
- UI: `Button`, `Input`, `Label`, `Textarea`, `Card` (de `@/components/ui/...`); `toast` de `@/hooks/use-toast`. `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle` de `@/components/ui/alert-dialog`.
- `react-markdown` usado como `<ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>` dentro de `<div className="prose prose-sm max-w-none">`.
- App.tsx: rotas em `src/App.tsx:205-209`; registrar `/:id/conteudo` ANTES de `/:id` (wouter casa por ordem; `:id` é 1 segmento e não casaria 2, mas registrar antes é mais seguro).
- Web-unit: `artifacts/web/tests/**/*.unit.test.ts`, vitest + alias `@/`.

---

## File Structure (Fase 3)

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `artifacts/web/src/lib/document-content-sections.ts` | Ops puras de seções + helpers de markup | Create |
| `artifacts/web/tests/lib/document-content-sections.unit.test.ts` | web-unit das ops/markup | Create |
| `artifacts/web/src/pages/app/qualidade/documentacao/conteudo.tsx` | Página do editor | Create |
| `artifacts/web/src/App.tsx` | registrar a rota | Modify |
| `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx` | botão "Conteúdo" → editor | Modify |

---

## Task 3.1: Módulo puro de seções + markup (TDD)

**Files:**
- Create: `artifacts/web/src/lib/document-content-sections.ts`
- Test: `artifacts/web/tests/lib/document-content-sections.unit.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from "vitest";
import {
  addSection,
  removeSection,
  updateSection,
  moveSection,
  sectionsAreEqual,
  applyInlineMarkup,
  applyLinePrefix,
} from "@/lib/document-content-sections";

const S = (over = {}) => ({ id: "x", title: "T", body: "B", order: 0, ...over });

describe("addSection", () => {
  it("acrescenta seção com id único, corpo vazio e order no fim", () => {
    const out = addSection([S({ id: "a", order: 0 })], "Nova");
    expect(out).toHaveLength(2);
    expect(out[1].title).toBe("Nova");
    expect(out[1].body).toBe("");
    expect(out[1].order).toBe(1);
    expect(out[1].id).toBeTruthy();
    expect(out[1].id).not.toBe("a");
  });
});

describe("removeSection", () => {
  it("remove e reindexa order", () => {
    const out = removeSection([S({ id: "a", order: 0 }), S({ id: "b", order: 1 }), S({ id: "c", order: 2 })], "b");
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
    expect(out.map((s) => s.order)).toEqual([0, 1]);
  });
});

describe("updateSection", () => {
  it("aplica patch só na seção alvo", () => {
    const out = updateSection([S({ id: "a" }), S({ id: "b" })], "b", { title: "Novo" });
    expect(out[1].title).toBe("Novo");
    expect(out[0].title).toBe("T");
  });
});

describe("moveSection", () => {
  it("sobe/desce e reindexa; no-op nas bordas", () => {
    const base = [S({ id: "a", order: 0 }), S({ id: "b", order: 1 }), S({ id: "c", order: 2 })];
    expect(moveSection(base, "b", "up").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(moveSection(base, "b", "down").map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect(moveSection(base, "a", "up")).toBe(base); // borda: mesma referência (no-op)
    expect(moveSection(base, "c", "down")).toBe(base);
    expect(moveSection(moveSection(base, "b", "up"), "a", "down").map((s) => s.order)).toEqual([0, 1, 2]);
  });
});

describe("sectionsAreEqual", () => {
  it("compara id/title/body/order", () => {
    const a = [S({ id: "a", title: "x", body: "y", order: 0 })];
    expect(sectionsAreEqual(a, [S({ id: "a", title: "x", body: "y", order: 0 })])).toBe(true);
    expect(sectionsAreEqual(a, [S({ id: "a", title: "z", body: "y", order: 0 })])).toBe(false);
    expect(sectionsAreEqual(a, [])).toBe(false);
  });
});

describe("applyInlineMarkup", () => {
  it("envolve a seleção e reposiciona", () => {
    const r = applyInlineMarkup("ola mundo", 0, 3, "**");
    expect(r.value).toBe("**ola** mundo");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("ola");
  });
  it("seleção vazia insere placeholder", () => {
    const r = applyInlineMarkup("", 0, 0, "*");
    expect(r.value).toBe("*texto*");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("texto");
  });
});

describe("applyLinePrefix", () => {
  it("prefixa cada linha da seleção", () => {
    const r = applyLinePrefix("um\ndois\ntres", 0, 8, "- ");
    expect(r.value).toBe("- um\n- dois\ntres");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-content-sections.unit.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `document-content-sections.ts`**

```ts
import type { DocumentContentSection } from "@workspace/api-client-react";

function reindexOrder(sections: DocumentContentSection[]): DocumentContentSection[] {
  return sections.map((s, i) => (s.order === i ? s : { ...s, order: i }));
}

export function createSection(title = ""): DocumentContentSection {
  return { id: crypto.randomUUID(), title, body: "", order: 0 };
}

export function addSection(
  sections: DocumentContentSection[],
  title = "",
): DocumentContentSection[] {
  return reindexOrder([...sections, { ...createSection(title), order: sections.length }]);
}

export function removeSection(
  sections: DocumentContentSection[],
  id: string,
): DocumentContentSection[] {
  return reindexOrder(sections.filter((s) => s.id !== id));
}

export function updateSection(
  sections: DocumentContentSection[],
  id: string,
  patch: Partial<Pick<DocumentContentSection, "title" | "body">>,
): DocumentContentSection[] {
  return sections.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function moveSection(
  sections: DocumentContentSection[],
  id: string,
  direction: "up" | "down",
): DocumentContentSection[] {
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) return sections;
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sections.length) return sections;
  const next = sections.slice();
  [next[idx], next[swap]] = [next[swap], next[idx]];
  return reindexOrder(next);
}

export function sectionsAreEqual(
  a: DocumentContentSection[],
  b: DocumentContentSection[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (s, i) =>
      s.id === b[i].id &&
      s.title === b[i].title &&
      s.body === b[i].body &&
      s.order === b[i].order,
  );
}

export interface MarkupResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyInlineMarkup(
  value: string,
  start: number,
  end: number,
  marker: string,
): MarkupResult {
  const selected = value.slice(start, end);
  const inner = selected || "texto";
  const next = value.slice(0, start) + marker + inner + marker + value.slice(end);
  const selStart = start + marker.length;
  return { value: next, selectionStart: selStart, selectionEnd: selStart + inner.length };
}

export function applyLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
): MarkupResult {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const afterEnd = value.indexOf("\n", end);
  const lineEnd = afterEnd === -1 ? value.length : afterEnd;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/lib/document-content-sections.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/lib/document-content-sections.ts artifacts/web/tests/lib/document-content-sections.unit.test.ts
git commit -m "feat(web/documentacao): módulo puro de seções de conteúdo + markup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3.2: Página do editor + rota + botão no detalhe

**Files:**
- Create: `artifacts/web/src/pages/app/qualidade/documentacao/conteudo.tsx`
- Modify: `artifacts/web/src/App.tsx`
- Modify: `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx`

- [ ] **Step 1: Criar `conteudo.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useGetDocument,
  getGetDocumentQueryKey,
  useUpdateDocumentContent,
} from "@workspace/api-client-react";
import type { DocumentContentSection } from "@workspace/api-client-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageTitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Bold,
  Italic,
  List,
  ListOrdered,
  Save,
} from "lucide-react";
import {
  addSection,
  removeSection,
  updateSection,
  moveSection,
  sectionsAreEqual,
  applyInlineMarkup,
  applyLinePrefix,
} from "@/lib/document-content-sections";

function SectionCard({
  section,
  index,
  total,
  canEdit,
  onChange,
  onRemove,
  onMove,
}: {
  section: DocumentContentSection;
  index: number;
  total: number;
  canEdit: boolean;
  onChange: (patch: Partial<Pick<DocumentContentSection, "title" | "body">>) => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const applyMarkup = (
    fn: typeof applyInlineMarkup | typeof applyLinePrefix,
    arg: string,
  ) => {
    const el = ref.current;
    if (!el) return;
    const res = fn(section.body, el.selectionStart, el.selectionEnd, arg);
    onChange({ body: res.value });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(res.selectionStart, res.selectionEnd);
    });
  };

  if (!canEdit) {
    return (
      <Card className="p-5 space-y-2">
        <h3 className="text-sm font-semibold">{section.title || "—"}</h3>
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {section.body || "_Sem conteúdo._"}
          </ReactMarkdown>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={section.title}
          placeholder="Título da seção"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <Button variant="ghost" size="icon" onClick={() => onMove("up")} disabled={index === 0} aria-label="Mover para cima">
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onMove("down")} disabled={index === total - 1} aria-label="Mover para baixo">
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} className="text-red-600 hover:text-red-700" aria-label="Remover seção">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => applyMarkup(applyInlineMarkup, "**")} aria-label="Negrito"><Bold className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => applyMarkup(applyInlineMarkup, "*")} aria-label="Itálico"><Italic className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => applyMarkup(applyLinePrefix, "- ")} aria-label="Lista"><List className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => applyMarkup(applyLinePrefix, "1. ")} aria-label="Lista numerada"><ListOrdered className="h-4 w-4" /></Button>
          </div>
          <Textarea
            ref={ref}
            value={section.body}
            placeholder="Escreva em Markdown…"
            className="min-h-[180px] font-mono text-xs"
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-background px-4 py-3 overflow-auto">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.body || "_Pré-visualização_"}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function DocumentContentEditorPage() {
  const params = useParams();
  const docId = Number(params.id);
  const [, navigate] = useLocation();
  const { organization } = useAuth();
  const orgId = organization?.id;
  const { canWriteModule } = usePermissions();
  const queryClient = useQueryClient();

  const { data: doc, isLoading } = useGetDocument(orgId!, docId, {
    query: {
      queryKey: getGetDocumentQueryKey(orgId!, docId),
      enabled: !!orgId && docId > 0,
    },
  });

  usePageTitle(doc ? `Conteúdo — ${doc.title}` : "Conteúdo do documento");

  const canEdit =
    canWriteModule("documents") &&
    (doc?.status === "draft" || doc?.status === "rejected");

  const [sections, setSections] = useState<DocumentContentSection[]>([]);
  const [baseline, setBaseline] = useState<DocumentContentSection[]>([]);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (doc?.contentSections) {
      setSections(doc.contentSections);
      setBaseline(doc.contentSections);
    }
  }, [doc?.contentSections]);

  const isDirty = useMemo(
    () => !sectionsAreEqual(sections, baseline),
    [sections, baseline],
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const updateMut = useUpdateDocumentContent();

  const handleSave = async () => {
    if (!orgId) return;
    try {
      await updateMut.mutateAsync({ orgId, docId, data: { contentSections: sections } });
      setBaseline(sections);
      queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(orgId, docId) });
      toast({ title: "Conteúdo salvo" });
    } catch {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o conteúdo.",
        variant: "destructive",
      });
    }
  };

  const goBack = () => navigate(`/qualidade/documentacao/${docId}`);
  const handleBack = () => (isDirty ? setDiscardOpen(true) : goBack());

  useHeaderActions(
    doc ? (
      <div className="flex items-center gap-2">
        <HeaderActionButton
          size="sm"
          variant="outline"
          onClick={handleBack}
          label="Voltar"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
        />
        {canEdit && (
          <HeaderActionButton
            size="sm"
            onClick={handleSave}
            isLoading={updateMut.isPending}
            disabled={!isDirty}
            label="Salvar"
            icon={<Save className="h-3.5 w-3.5" />}
          >
            Salvar
          </HeaderActionButton>
        )}
      </div>
    ) : null,
  );

  if (isLoading || !doc) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="max-w-4xl space-y-4">
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Somente leitura — o conteúdo só pode ser editado em rascunho ou após rejeição.
        </p>
      )}

      {sections.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          Nenhuma seção ainda.
          {canEdit && " Use “Adicionar seção” para começar."}
        </Card>
      )}

      {sections.map((section, index) => (
        <SectionCard
          key={section.id}
          section={section}
          index={index}
          total={sections.length}
          canEdit={canEdit}
          onChange={(patch) => setSections((prev) => updateSection(prev, section.id, patch))}
          onRemove={() => setSections((prev) => removeSection(prev, section.id))}
          onMove={(dir) => setSections((prev) => moveSection(prev, section.id, dir))}
        />
      ))}

      {canEdit && (
        <Button variant="outline" onClick={() => setSections((prev) => addSection(prev))}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar seção
        </Button>
      )}

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas no conteúdo. Se sair agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={goBack}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```
Notes:
- Read `@/components/layout/HeaderActionButton` to confirm it accepts `disabled` (it is used with `isLoading` in `[id].tsx`; if `disabled` isn't supported, gate by not rendering Salvar when `!isDirty`, or pass through). Adjust if needed.
- If `HeaderActionButton` requires `children` for some variants, the icon-only "Voltar" uses `label`; mirror how `[id].tsx` calls it.
- `crypto.randomUUID` is available in the browser and jsdom (Node 20+).

- [ ] **Step 2: Registrar a rota em `App.tsx`**

Adicionar o import (junto aos demais, ~linha 40):
```tsx
import DocumentContentEditorPage from "@/pages/app/qualidade/documentacao/conteudo";
```
E a rota ANTES de `/qualidade/documentacao/:id` (em `App.tsx:205-209`):
```tsx
      <Route path="/qualidade/documentacao" component={DocumentacaoPage} />
      <Route
        path="/qualidade/documentacao/:id/conteudo"
        component={DocumentContentEditorPage}
      />
      <Route
        path="/qualidade/documentacao/:id"
        component={DocumentDetailPage}
      />
```

- [ ] **Step 3: Botão "Conteúdo" no detalhe (`[id].tsx`)**

No bloco `useHeaderActions(...)` (`[id].tsx:598-698`), adicionar como PRIMEIRO botão dentro do `<div className="flex items-center gap-2">` (visível para qualquer um que veja o doc — leitura ou edição):
```tsx
        <HeaderActionButton
          size="sm"
          variant="outline"
          onClick={() => navigate(`/qualidade/documentacao/${docId}/conteudo`)}
          label="Conteúdo"
          icon={<FileText className="h-3.5 w-3.5" />}
        />
```
Confirmar que `FileText` (lucide-react) está importado em `[id].tsx`; se não, adicioná-lo ao import de `lucide-react`. `docId` e `navigate` já existem no arquivo.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/web typecheck`
Expected: PASS. (Resolver erros reais; não usar `any`/`as never` para mascarar.)

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/qualidade/documentacao/conteudo.tsx artifacts/web/src/App.tsx artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx
git commit -m "feat(web/documentacao): editor dedicado de conteúdo (seções markdown + preview) + rota + botão no detalhe

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3.3: Verificação final da Fase 3

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck` → PASS (todos os pacotes).

- [ ] **Step 2: web-unit**

Run: `pnpm exec vitest run --project web-unit` → PASS (inclui `document-content-sections.unit.test.ts`).

- [ ] **Step 3: Checklist manual (requer dev servers — NÃO subir pelo subagente; é o usuário quem roda, em portas seguras :3002 + docker DB, nunca :3001/PROD)**

1. Abrir um documento em rascunho → header mostra "Conteúdo" → navega para o editor.
2. Adicionar seção, escrever markdown (negrito/itálico/lista via toolbar) → preview ao vivo atualiza.
3. Reordenar (subir/descer), renomear, remover seções.
4. "Salvar" persiste (toast "Conteúdo salvo"); recarregar mantém o conteúdo.
5. Editar e tentar "Voltar" com alterações não salvas → AlertDialog "Descartar alterações?". Cancelar mantém; Descartar sai sem salvar.
6. Abrir o editor de um documento aprovado/distribuído → modo somente-leitura (markdown renderizado, sem controles, sem Salvar).

- [ ] **Step 4: Revisão de diff**

Run: `git diff --stat origin/main..HEAD` — confirmar apenas os arquivos previstos; sem gerados editados à mão.

---

## Self-Review (na escrita do plano)

- **Cobertura:** editor dedicado (seções add/renomear/reordenar/remover), toolbar markdown + preview, salvar via hook gerado, guarda de não-salvo (beforeunload + AlertDialog no Voltar), somente-leitura fora de draft/rejected, rota + botão no detalhe. Cobre §8 do spec.
- **Placeholders:** nenhum; pontos de "confirmar HeaderActionButton aceita disabled / FileText importado" referem-se a fatos verificáveis com instrução clara.
- **Tests:** lógica pura (ops de seção + markup) coberta por web-unit TDD; a página React (wiring/efeitos/markdown) por typecheck + checklist manual — render test pesado exercitaria sobretudo mocks e o roteador/contextos; desproporcional ao valor.
- **Consistência de tipos:** `DocumentContentSection` do client gerado em todo lugar; `useUpdateDocumentContent({orgId,docId,data:{contentSections}})` conforme assinatura real; `canEdit` igual ao do `[id].tsx`.

## Notas / limitações conhecidas (follow-ups)
- A guarda de não-salvo cobre fechar/recarregar a aba (beforeunload) e o botão "Voltar" da página (AlertDialog). Navegações por outros caminhos in-app (ex.: clicar na sidebar) NÃO são interceptadas no v1.
- "Aplicar template do tipo" no estado vazio fica para depois (precisaria do catálogo de templates no client); documentos novos já nascem com seções (Fase 1), então o estado vazio afeta sobretudo documentos antigos.
- Preview lado a lado; em telas estreitas pode-se evoluir para abas Editar/Pré-visualizar (fase futura).
