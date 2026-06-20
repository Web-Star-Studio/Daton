import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocumentContentSection } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Bold,
  Italic,
  List,
  ListOrdered,
} from "lucide-react";
import {
  addSection,
  removeSection,
  updateSection,
  moveSection,
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
        <div className="prose prose-sm max-w-none dark:prose-invert">
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
          aria-label={`Título da seção ${index + 1}`}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-invalid={!section.title.trim()}
          className={!section.title.trim() ? "border-red-400" : undefined}
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            aria-label={`Conteúdo da seção ${index + 1} em Markdown`}
            className="min-h-[180px] font-mono text-xs"
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-background px-4 py-3 overflow-auto">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.body || "_Pré-visualização_"}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DocumentSectionEditor({
  sections,
  canEdit,
  onChange,
}: {
  sections: DocumentContentSection[];
  canEdit: boolean;
  onChange: (next: DocumentContentSection[]) => void;
}) {
  return (
    <>
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
          onChange={(patch) => onChange(updateSection(sections, section.id, patch))}
          onRemove={() => onChange(removeSection(sections, section.id))}
          onMove={(dir) => onChange(moveSection(sections, section.id, dir))}
        />
      ))}

      {canEdit && (
        <Button variant="outline" onClick={() => onChange(addSection(sections))}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar seção
        </Button>
      )}
    </>
  );
}
