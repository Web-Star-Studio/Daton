import React, { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Plus,
  RefreshCcw,
  BookText,
  Archive,
  Upload,
  Sparkles,
  Search,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  slug: null,
  title: "",
  category: "",
  summary: "",
  bodyMarkdown: "# Novo artigo\n\nDescreva aqui o conteúdo oficial do produto.",
};

const productKnowledgeArticleSchema = z.object({
  slug: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().max(80).optional().nullable(),
  ),
  title: z.string().min(1, "Informe um título").max(160),
  category: z.string().min(1, "Informe uma categoria").max(80),
  summary: z.string().min(1, "Informe um resumo").max(400),
  bodyMarkdown: z.string().min(1, "Informe o conteúdo em markdown"),
});

const createArticleSchema = z.object({
  title: z.string().min(1, "Informe um título").max(160),
  category: z.string().min(1, "Informe uma categoria").max(80),
  summary: z.string().min(1, "Informe um resumo").max(400),
});

function normalizeArticleBody(
  values: ProductKnowledgeArticleBody,
): ProductKnowledgeArticleBody {
  return {
    ...values,
    slug:
      typeof values.slug === "string" && values.slug.trim() === ""
        ? null
        : values.slug ?? null,
  };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-50 text-gray-600 border-gray-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-amber-50 text-amber-700 border-amber-200",
};

const INDEX_STATUS_LABELS: Record<string, string> = {
  not_indexed: "Não indexado",
  indexing: "Indexando",
  indexed: "Indexado",
  failed: "Falhou",
};

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
  const [createOpen, setCreateOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

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

  const createForm = useForm<{ title: string; category: string; summary: string }>({
    resolver: zodResolver(createArticleSchema),
    defaultValues: { title: "", category: "", summary: "" },
  });

  usePageTitle("Base de Conhecimento");
  usePageSubtitle(
    "Conteúdo global do produto usado pelo Daton AI para responder dúvidas sobre fluxos, módulos e funcionamento do sistema.",
  );

  useHeaderActions(
    selectedId ? (
      <div className="flex items-center gap-2">
        {detail && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSubmit(async (values) => {
                try {
                  await updateMutation.mutateAsync(normalizeArticleBody(values));
                  toast({ title: "Artigo salvo", description: "O conteúdo foi atualizado com sucesso." });
                } catch (error) {
                  toast({ title: "Falha ao salvar artigo", description: error instanceof Error ? error.message : "Tente novamente." });
                }
              })}
              disabled={!isDirty}
              isLoading={updateMutation.isPending}
            >
              Salvar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const updated = await reindexMutation.mutateAsync();
                  setSelectedId(updated.id);
                  toast({ title: "Artigo reindexado", description: "A versão publicada foi sincronizada novamente com o vector store." });
                } catch (error) {
                  toast({ title: "Falha ao reindexar", description: error instanceof Error ? error.message : "Tente novamente." });
                }
              }}
              disabled={detail.status !== "published" || detail.hasUnpublishedChanges}
              isLoading={reindexMutation.isPending}
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Reindexar
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  if (isDirty) {
                    await updateMutation.mutateAsync(normalizeArticleBody(getValues()));
                  }
                  const updated = await publishMutation.mutateAsync();
                  setSelectedId(updated.id);
                  toast({ title: "Artigo publicado", description: "O conteúdo foi indexado e já pode ser usado pelo Daton AI." });
                } catch (error) {
                  toast({ title: "Falha ao publicar", description: error instanceof Error ? error.message : "Tente novamente." });
                }
              }}
              disabled={detail.status === "archived"}
              isLoading={publishMutation.isPending}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Publicar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const updated = await archiveMutation.mutateAsync();
                  setSelectedId(updated.id);
                  toast({ title: "Artigo arquivado", description: "O conteúdo foi removido da base ativa do produto." });
                } catch (error) {
                  toast({ title: "Falha ao arquivar", description: error instanceof Error ? error.message : "Tente novamente." });
                }
              }}
              disabled={detail.status === "archived"}
              isLoading={archiveMutation.isPending}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              Arquivar
            </Button>
          </>
        )}
      </div>
    ) : (
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
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo artigo
        </Button>
      </div>
    ),
  );

  // Filtered articles
  const categories = useMemo(() => {
    const set = new Set(articles.map((a) => a.category).filter(Boolean));
    return Array.from(set).sort();
  }, [articles]);

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      if (statusFilter && article.status !== statusFilter) return false;
      if (categoryFilter && article.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          article.title.toLowerCase().includes(q) ||
          article.summary.toLowerCase().includes(q) ||
          article.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [articles, search, statusFilter, categoryFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = articles.length;
    const published = articles.filter((a) => a.status === "published").length;
    const draft = articles.filter((a) => a.status === "draft").length;
    const archived = articles.filter((a) => a.status === "archived").length;
    return { total, published, draft, archived };
  }, [articles]);

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

  const handleCreateArticle = async (values: { title: string; category: string; summary: string }) => {
    try {
      const created = await createMutation.mutateAsync(
        normalizeArticleBody({
          ...EMPTY_ARTICLE,
          title: values.title,
          category: values.category,
          summary: values.summary,
        }),
      );
      setSelectedId(created.id);
      setCreateOpen(false);
      createForm.reset();
    } catch (error) {
      toast({
        title: "Falha ao criar artigo",
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  // Detail view
  if (selectedId) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setActiveTab("editor");
          }}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para lista
        </button>

        {detail ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{detail.title}</h2>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLORS[detail.status] || STATUS_COLORS.draft}`}
                  >
                    {STATUS_LABELS[detail.status] || detail.status}
                  </span>
                  {detail.hasUnpublishedChanges && (
                    <Badge variant="outline">Alterações não publicadas</Badge>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Versão atual: v{detail.version} · Indexação:{" "}
                  {INDEX_STATUS_LABELS[detail.lastIndexStatus] || detail.lastIndexStatus}
                </p>
              </div>
            </div>

            {detail.lastIndexError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                {detail.lastIndexError}
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="history">Publicações</TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="space-y-5">
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground">Título</Label>
                    <Input {...register("title")} />
                    {errors.title && <p className="mt-1.5 text-xs text-destructive">{errors.title.message}</p>}
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground">Slug</Label>
                    <Input {...register("slug")} />
                    {errors.slug && <p className="mt-1.5 text-xs text-destructive">{errors.slug.message}</p>}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Categoria</Label>
                  <Input {...register("category")} />
                  {errors.category && <p className="mt-1.5 text-xs text-destructive">{errors.category.message}</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Resumo</Label>
                  <Textarea rows={3} {...register("summary")} />
                  {errors.summary && <p className="mt-1.5 text-xs text-destructive">{errors.summary.message}</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Corpo em Markdown</Label>
                  <Textarea rows={20} {...register("bodyMarkdown")} />
                  {errors.bodyMarkdown && <p className="mt-1.5 text-xs text-destructive">{errors.bodyMarkdown.message}</p>}
                </div>
              </TabsContent>

              <TabsContent value="preview">
                <div className="rounded-xl border border-border/60 bg-background px-6 py-6">
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {`# ${watchedForm.title || "Sem título"}\n\n${watchedForm.summary || ""}\n\n${watchedForm.bodyMarkdown || ""}`}
                    </ReactMarkdown>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history">
                <div className="space-y-px">
                  {detail.revisions.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground py-6">
                      Ainda não há versões publicadas deste artigo.
                    </p>
                  ) : (
                    detail.revisions.map((revision) => (
                      <div
                        key={revision.id}
                        className="flex items-center justify-between gap-3 py-3 border-b border-border/40"
                      >
                        <div>
                          <p className="text-[14px] font-medium text-foreground">
                            Versão {revision.version}
                          </p>
                          <p className="mt-1 text-[13px] text-muted-foreground">
                            {revision.summary}
                          </p>
                        </div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(revision.publishedAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="text-center py-16 text-[13px] text-muted-foreground">
            Carregando artigo...
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <>
      <div className="space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Total</p>
            <p className="text-xl font-semibold text-foreground mt-0.5">{stats.total}</p>
          </div>
          <div className="bg-white border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Publicados</p>
            <p className="text-xl font-semibold text-emerald-600 mt-0.5">{stats.published}</p>
          </div>
          <div className="bg-white border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Rascunhos</p>
            <p className="text-xl font-semibold text-gray-500 mt-0.5">{stats.draft}</p>
          </div>
          <div className="bg-white border border-border/60 rounded-xl px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Arquivados</p>
            <p className="text-xl font-semibold text-amber-600 mt-0.5">{stats.archived}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por título ou resumo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-[13px]"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 text-[13px] w-40"
          >
            <option value="">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </Select>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 text-[13px] w-44"
          >
            <option value="">Todas as categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </div>

        {/* Table or empty state */}
        {filteredArticles.length === 0 ? (
          <div className="text-center py-16">
            <BookText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">
              {articles.length === 0
                ? "Nenhum artigo cadastrado na base global"
                : "Nenhum artigo encontrado com os filtros aplicados"}
            </p>
            {articles.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Novo artigo
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    Título
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    Categoria
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    Versão
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    Indexação
                  </th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map((article) => (
                  <tr
                    key={article.id}
                    className="border-b border-border/40 last:border-0 transition-colors hover:bg-secondary/30 cursor-pointer"
                    onClick={() => setSelectedId(article.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-foreground">
                        {article.title}
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
                        {article.summary}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">
                      {article.category}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLORS[article.status] || STATUS_COLORS.draft}`}
                      >
                        {STATUS_LABELS[article.status] || article.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">
                      v{article.version}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">
                      {INDEX_STATUS_LABELS[article.lastIndexStatus] || article.lastIndexStatus}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create article dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createForm.reset();
        }}
        title="Novo Artigo"
        description="Crie um artigo em rascunho para a knowledge base global do Daton AI."
      >
        <form
          onSubmit={createForm.handleSubmit(handleCreateArticle)}
          className="space-y-5"
        >
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Título *</Label>
            <Input
              {...createForm.register("title")}
              className="mt-1"
              placeholder="Ex: Como funciona o módulo de documentação"
            />
            {createForm.formState.errors.title && (
              <p className="mt-1.5 text-xs text-destructive">
                {createForm.formState.errors.title.message}
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Categoria *</Label>
            <Input
              {...createForm.register("category")}
              className="mt-1"
              placeholder="Ex: Módulos, Fluxos, Configuração"
            />
            {createForm.formState.errors.category && (
              <p className="mt-1.5 text-xs text-destructive">
                {createForm.formState.errors.category.message}
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Resumo *</Label>
            <Textarea
              rows={3}
              {...createForm.register("summary")}
              className="mt-1"
              placeholder="Descrição breve do conteúdo do artigo"
            />
            {createForm.formState.errors.summary && (
              <p className="mt-1.5 text-xs text-destructive">
                {createForm.formState.errors.summary.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={createMutation.isPending}
            >
              Criar rascunho
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
