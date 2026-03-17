import React, { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Plus, RefreshCcw, BookText, Archive, Upload, Sparkles } from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBootstrapProductKnowledgeArticles,
  useCreateProductKnowledgeArticle,
  useProductKnowledgeArticle,
  useProductKnowledgeArticles,
  useProductKnowledgeLifecycleAction,
  useUpdateProductKnowledgeArticle,
  type ProductKnowledgeArticleBody,
} from "@/lib/product-knowledge-api";
import { toast } from "@/hooks/use-toast";

const EMPTY_ARTICLE: ProductKnowledgeArticleBody = {
  slug: "",
  title: "",
  category: "",
  summary: "",
  bodyMarkdown: "# Novo artigo\n\nDescreva aqui o conteúdo oficial do produto.",
};

const productKnowledgeArticleSchema = z.object({
  slug: z.string().max(80).optional().nullable(),
  title: z.string().min(1, "Informe um título").max(160),
  category: z.string().min(1, "Informe uma categoria").max(80),
  summary: z.string().min(1, "Informe um resumo").max(400),
  bodyMarkdown: z.string().min(1, "Informe o conteúdo em markdown"),
});

const STATUS_LABELS = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
} as const;

const INDEX_STATUS_LABELS = {
  not_indexed: "Não indexado",
  indexing: "Indexando",
  indexed: "Indexado",
  failed: "Falhou",
} as const;

export default function ProductKnowledgeAdminPage() {
  const { role } = useAuth();
  const { isPlatformAdmin } = usePermissions();
  const isAdmin = isPlatformAdmin && role === "platform_admin";
  const { data: articles = [] } = useProductKnowledgeArticles({ enabled: isAdmin });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useProductKnowledgeArticle(selectedId, { enabled: isAdmin && !!selectedId });
  const createMutation = useCreateProductKnowledgeArticle({ enabled: isAdmin });
  const updateMutation = useUpdateProductKnowledgeArticle(selectedId, { enabled: isAdmin });
  const publishMutation = useProductKnowledgeLifecycleAction("publish", selectedId, { enabled: isAdmin });
  const reindexMutation = useProductKnowledgeLifecycleAction("reindex", selectedId, { enabled: isAdmin });
  const archiveMutation = useProductKnowledgeLifecycleAction("archive", selectedId, { enabled: isAdmin });
  const bootstrapMutation = useBootstrapProductKnowledgeArticles({ enabled: isAdmin });
  const [activeTab, setActiveTab] = useState("editor");
  const form = useForm<ProductKnowledgeArticleBody>({
    resolver: zodResolver(productKnowledgeArticleSchema),
    defaultValues: EMPTY_ARTICLE,
  });
  const {
    register,
    reset,
    watch,
    getValues,
    handleSubmit,
    formState: { errors, isDirty },
  } = form;
  const watchedForm = watch();

  usePageTitle("Base de Conhecimento");
  usePageSubtitle(
    "Conteúdo global do produto usado pelo Daton AI para responder dúvidas sobre fluxos, módulos e funcionamento do sistema.",
  );

  useHeaderActions(
    isAdmin ? (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              const result = await bootstrapMutation.mutateAsync();
              if (result.articles[0]) {
                setSelectedId(result.articles[0].id);
              }
              toast({
                title: "Artigos iniciais carregados",
                description:
                  result.insertedCount > 0
                    ? `${result.insertedCount} artigos criados em rascunho.`
                    : "Os artigos iniciais já estavam disponíveis.",
              });
            } catch (error) {
              toast({
                title: "Falha ao carregar artigos iniciais",
                description: error instanceof Error ? error.message : "Tente novamente.",
              });
            }
          }}
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Carregar artigos iniciais
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            try {
              const created = await createMutation.mutateAsync({
                ...EMPTY_ARTICLE,
                title: "Novo artigo",
                category: "Geral",
                summary: "Resumo breve do conteúdo oficial do produto.",
              });
              setSelectedId(created.id);
            } catch (error) {
              toast({
                title: "Falha ao criar artigo",
                description: error instanceof Error ? error.message : "Tente novamente.",
              });
            }
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo artigo
        </Button>
      </div>
    ) : null,
  );

  useEffect(() => {
    if (!selectedId && articles[0]) {
      setSelectedId(articles[0].id);
    }
  }, [articles, selectedId]);

  useEffect(() => {
    if (detail) {
      reset({
        slug: detail.slug,
        title: detail.title,
        category: detail.category,
        summary: detail.summary,
        bodyMarkdown: detail.bodyMarkdown,
      });
      return;
    }
    reset(EMPTY_ARTICLE);
  }, [detail, reset]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8">
        <p className="text-sm text-muted-foreground">
          Esta área é restrita à administração global da plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border/60 bg-card">
          <div className="border-b border-border/60 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Artigos
            </p>
            <h2 className="mt-2 text-lg font-semibold">Knowledge base global</h2>
          </div>

          {articles.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <BookText className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-4 text-sm font-medium">
                Nenhum artigo cadastrado na base global.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Carregue os artigos iniciais ou crie o primeiro conteúdo manualmente.
              </p>
            </div>
          ) : (
            <div className="max-h-[72vh] overflow-y-auto p-2">
              {articles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => setSelectedId(article.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    selectedId === article.id
                      ? "border-foreground/20 bg-muted/40"
                      : "border-transparent hover:border-border/70 hover:bg-muted/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{article.title}</p>
                    <Badge variant="secondary">
                      {STATUS_LABELS[article.status] || article.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{article.category}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {article.summary}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>v{article.version}</span>
                    <span>•</span>
                    <span>{INDEX_STATUS_LABELS[article.lastIndexStatus] || article.lastIndexStatus}</span>
                    {article.hasUnpublishedChanges && (
                      <>
                        <span>•</span>
                        <span>Alterações não publicadas</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-card">
          {!detail ? (
            <div className="px-8 py-12 text-center text-sm text-muted-foreground">
              Selecione um artigo para editar o conteúdo e publicar na base do Daton AI.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{detail.title}</h2>
                    <Badge variant="secondary">
                      {STATUS_LABELS[detail.status] || detail.status}
                    </Badge>
                    {detail.hasUnpublishedChanges && (
                      <Badge variant="outline">Alterações não publicadas</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Versão atual: v{detail.version} • Indexação:{" "}
                    {INDEX_STATUS_LABELS[detail.lastIndexStatus] || detail.lastIndexStatus}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSubmit(async (values) => {
                      try {
                        await updateMutation.mutateAsync(values);
                        toast({
                          title: "Artigo salvo",
                          description: "O conteúdo foi atualizado com sucesso.",
                        });
                      } catch (error) {
                        toast({
                          title: "Falha ao salvar artigo",
                          description: error instanceof Error ? error.message : "Tente novamente.",
                        });
                      }
                    })}
                    disabled={!isDirty}
                    isLoading={updateMutation.isPending}
                  >
                    Salvar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const updated = await reindexMutation.mutateAsync();
                        setSelectedId(updated.id);
                        toast({
                          title: "Artigo reindexado",
                          description: "A versão publicada foi sincronizada novamente com o vector store.",
                        });
                      } catch (error) {
                        toast({
                          title: "Falha ao reindexar",
                          description: error instanceof Error ? error.message : "Tente novamente.",
                        });
                      }
                    }}
                    disabled={detail.status !== "published" || detail.hasUnpublishedChanges}
                    isLoading={reindexMutation.isPending}
                  >
                    <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reindexar
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        if (isDirty) {
                          await updateMutation.mutateAsync(getValues());
                        }
                        const updated = await publishMutation.mutateAsync();
                        setSelectedId(updated.id);
                        toast({
                          title: "Artigo publicado",
                          description: "O conteúdo foi indexado e já pode ser usado pelo Daton AI.",
                        });
                      } catch (error) {
                        toast({
                          title: "Falha ao publicar",
                          description: error instanceof Error ? error.message : "Tente novamente.",
                        });
                      }
                    }}
                    disabled={detail.status === "archived"}
                    isLoading={publishMutation.isPending}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Publicar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const updated = await archiveMutation.mutateAsync();
                        setSelectedId(updated.id);
                        toast({
                          title: "Artigo arquivado",
                          description: "O conteúdo foi removido da base ativa do produto.",
                        });
                      } catch (error) {
                        toast({
                          title: "Falha ao arquivar",
                          description: error instanceof Error ? error.message : "Tente novamente.",
                        });
                      }
                    }}
                    disabled={detail.status === "archived"}
                    isLoading={archiveMutation.isPending}
                  >
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                    Arquivar
                  </Button>
                </div>
              </div>

              {detail.lastIndexError && (
                <div className="border-b border-border/60 bg-red-50 px-5 py-3 text-sm text-red-700">
                  {detail.lastIndexError}
                </div>
              )}

              <div className="p-5">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="history">Publicações</TabsTrigger>
                  </TabsList>

                  <TabsContent value="editor" className="mt-5 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Título</Label>
                        <Input
                          {...register("title")}
                        />
                        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                      </div>
                      <div>
                        <Label>Slug</Label>
                        <Input {...register("slug")} />
                        {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
                      </div>
                    </div>
                    <div>
                      <Label>Categoria</Label>
                      <Input {...register("category")} />
                      {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
                    </div>
                    <div>
                      <Label>Resumo</Label>
                      <Textarea rows={3} {...register("summary")} />
                      {errors.summary && <p className="text-xs text-destructive">{errors.summary.message}</p>}
                    </div>
                    <div>
                      <Label>Corpo em Markdown</Label>
                      <Textarea rows={20} {...register("bodyMarkdown")} />
                      {errors.bodyMarkdown && <p className="text-xs text-destructive">{errors.bodyMarkdown.message}</p>}
                    </div>
                  </TabsContent>

                  <TabsContent value="preview" className="mt-5">
                    <div className="rounded-2xl border border-border/60 bg-background px-6 py-6">
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {`# ${watchedForm.title || "Sem título"}\n\n${watchedForm.summary || ""}\n\n${watchedForm.bodyMarkdown || ""}`}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-5">
                    <div className="space-y-3">
                      {detail.revisions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Ainda não há versões publicadas deste artigo.
                        </p>
                      ) : (
                        detail.revisions.map((revision) => (
                          <div
                            key={revision.id}
                            className="rounded-2xl border border-border/60 bg-background px-4 py-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">
                                Versão {revision.version}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {new Date(revision.publishedAt).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {revision.summary}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
