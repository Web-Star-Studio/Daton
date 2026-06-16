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
  const docId = parseInt(params.id ?? "0", 10);
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

  const initializedDocId = useRef<number | null>(null);
  useEffect(() => {
    if (doc?.contentSections && initializedDocId.current !== docId) {
      setSections(doc.contentSections);
      setBaseline(doc.contentSections);
      initializedDocId.current = docId;
    }
  }, [doc?.contentSections, docId]);

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
    if (sections.some((s) => !s.title.trim())) {
      toast({
        title: "Título obrigatório",
        description: "Todas as seções precisam de um título antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await updateMut.mutateAsync({
        orgId,
        docId,
        data: { contentSections: sections },
      });
      setBaseline(sections);
      queryClient.setQueryData(getGetDocumentQueryKey(orgId, docId), result);
      toast({ title: "Conteúdo salvo" });
    } catch (err) {
      const serverMessage =
        (err as { data?: { error?: string } })?.data?.error ??
        (err instanceof Error ? err.message : undefined);
      toast({
        title: "Erro ao salvar",
        description: serverMessage ?? "Não foi possível salvar o conteúdo.",
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
        {canEdit && isDirty && (
          <HeaderActionButton
            size="sm"
            onClick={handleSave}
            isLoading={updateMut.isPending}
            label="Salvar"
            icon={<Save className="h-3.5 w-3.5" />}
          />
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
