import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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
import { ArrowLeft, Save } from "lucide-react";
import { sectionsAreEqual } from "@/lib/document-content-sections";
import { seedSectionsForType } from "@/lib/document-section-templates";
import { DocumentSectionEditor } from "@/components/documents/document-section-editor";

export default function DocumentContentEditorPage() {
  const params = useParams();
  const docId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const { organization } = useAuth();
  const orgId = organization?.id;
  const { canWriteModule } = usePermissions();
  const queryClient = useQueryClient();

  const { data: doc, isLoading, isError } = useGetDocument(orgId!, docId, {
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

  const isDirty = useMemo(
    () => !sectionsAreEqual(sections, baseline),
    [sections, baseline],
  );

  const initializedDocId = useRef<number | null>(null);
  useEffect(() => {
    if (!doc?.contentSections) return;
    // Adota o conteúdo do servidor ao trocar de documento OU quando o editor
    // está limpo. Com edição não salva pendente, não sobrescreve (preserva o
    // trabalho local até salvar ou descartar).
    if (initializedDocId.current !== docId || !isDirty) {
      setSections(doc.contentSections);
      setBaseline(doc.contentSections);
      initializedDocId.current = docId;
    }
  }, [doc?.contentSections, docId, isDirty]);

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

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando…</div>;
  }

  if (isError || !doc) {
    return (
      <div className="max-w-4xl space-y-3">
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar o conteúdo deste documento.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate("/qualidade/documentacao")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Documentação
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Somente leitura — o conteúdo só pode ser editado em rascunho ou após rejeição.
        </p>
      )}

      <DocumentSectionEditor
        sections={sections}
        canEdit={canEdit}
        onChange={setSections}
        onSeedTemplate={
          canEdit ? () => setSections(seedSectionsForType(doc.type)) : undefined
        }
      />

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
