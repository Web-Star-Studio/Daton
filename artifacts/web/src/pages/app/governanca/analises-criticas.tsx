import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { toast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useManagementReview,
  useManagementReviewInputMutation,
  useManagementReviewMutation,
  useManagementReviewOutputMutation,
  useManagementReviews,
  useNonconformities,
  useSgqProcesses,
} from "@/lib/governance-system-client";
import {
  getListUserOptionsQueryKey,
  useListUserOptions,
} from "@workspace/api-client-react";

const reviewFormSchema = z.object({
  title: z.string().trim().min(1, "Informe o título da análise crítica"),
  reviewDate: z.string().min(1, "Informe a data da revisão"),
  chairUserId: z.string().default(""),
  status: z.enum(["draft", "completed", "canceled"]),
  minutes: z.string().default(""),
});

const reviewInputFormSchema = z.object({
  inputType: z.enum([
    "policy",
    "audit_summary",
    "nc_summary",
    "objective_status",
    "risk_status",
    "process_performance",
    "customer_feedback",
    "other",
  ]),
  summary: z.string().trim().min(1, "Informe o resumo da entrada"),
  processId: z.string().default(""),
  nonconformityId: z.string().default(""),
});

const reviewOutputFormSchema = z.object({
  outputType: z.enum(["decision", "action", "resource", "priority"]),
  description: z.string().trim().min(1, "Informe a descrição da saída"),
  responsibleUserId: z.string().default(""),
  dueDate: z.string().default(""),
  processId: z.string().default(""),
  nonconformityId: z.string().default(""),
  status: z.enum(["open", "done", "canceled"]),
});

type ReviewFormState = z.infer<typeof reviewFormSchema>;
type ReviewInputFormState = z.infer<typeof reviewInputFormSchema>;
type ReviewOutputFormState = z.infer<typeof reviewOutputFormSchema>;

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const emptyReviewForm = (): ReviewFormState => ({
  title: "",
  reviewDate: "",
  chairUserId: "",
  status: "draft",
  minutes: "",
});

const emptyInputForm = (): ReviewInputFormState => ({
  inputType: "other",
  summary: "",
  processId: "",
  nonconformityId: "",
});

const emptyOutputForm = (): ReviewOutputFormState => ({
  outputType: "decision",
  description: "",
  responsibleUserId: "",
  dueDate: "",
  processId: "",
  nonconformityId: "",
  status: "open",
});

export default function GovernanceManagementReviewsPage() {
  usePageTitle("Análises Críticas");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const reviewForm = useForm<ReviewFormState>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: emptyReviewForm(),
  });
  const inputForm = useForm<ReviewInputFormState>({
    resolver: zodResolver(reviewInputFormSchema),
    defaultValues: emptyInputForm(),
  });
  const outputForm = useForm<ReviewOutputFormState>({
    resolver: zodResolver(reviewOutputFormSchema),
    defaultValues: emptyOutputForm(),
  });

  const { data: reviewsList } = useManagementReviews(orgId, {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });
  const reviews = reviewsList?.data ?? [];
  const pagination = reviewsList?.pagination;
  const { data: reviewDetail } = useManagementReview(orgId, selectedId);
  const createMutation = useManagementReviewMutation(orgId);
  const updateMutation = useManagementReviewMutation(orgId, selectedId);
  const inputMutation = useManagementReviewInputMutation(orgId, selectedId);
  const outputMutation = useManagementReviewOutputMutation(orgId, selectedId);
  const { data: users = [] } = useListUserOptions(orgId ?? 0, {}, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId ?? 0),
    },
  });
  const { data: processList } = useSgqProcesses(orgId, { page: 1, pageSize: 100, status: "active" });
  const { data: ncList } = useNonconformities(orgId, { page: 1, pageSize: 100 });
  const processes = processList?.data ?? [];
  const nonconformities = ncList?.data ?? [];

  useEffect(() => {
    if (isCreatingNew) return;
    if (reviews.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !reviews.some((item) => item.id === selectedId)) {
      setSelectedId(reviews[0].id);
    }
  }, [isCreatingNew, reviews, selectedId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!reviewDetail) return;
    reviewForm.reset({
      title: reviewDetail.title,
      reviewDate: reviewDetail.reviewDate,
      chairUserId: reviewDetail.chairUserId ? String(reviewDetail.chairUserId) : "",
      status: reviewDetail.status,
      minutes: reviewDetail.minutes ?? "",
    });
  }, [reviewDetail, reviewForm]);

  const handleNew = () => {
    setIsCreatingNew(true);
    setSelectedId(undefined);
    reviewForm.reset(emptyReviewForm());
    inputForm.reset(emptyInputForm());
    outputForm.reset(emptyOutputForm());
  };

  const handleSaveReview = reviewForm.handleSubmit(async (values) => {
    try {
      const payload = {
        title: values.title.trim(),
        reviewDate: values.reviewDate,
        chairUserId: values.chairUserId ? Number(values.chairUserId) : null,
        status: values.status,
        minutes: values.minutes.trim() || null,
      };
      if (selectedId) {
        await updateMutation.mutateAsync({ method: "PATCH", body: payload });
        setIsCreatingNew(false);
        toast({ title: "Análise crítica atualizada" });
      } else {
        const created = await createMutation.mutateAsync({ method: "POST", body: payload });
        setIsCreatingNew(false);
        setSelectedId(created.id);
        toast({ title: "Análise crítica criada" });
      }
    } catch (error) {
      toast({
        title: "Falha ao salvar análise crítica",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  });

  const handleCreateInput = inputForm.handleSubmit(async (values) => {
    if (!selectedId) return;
    try {
      await inputMutation.mutateAsync({
        method: "POST",
        body: {
          inputType: values.inputType,
          summary: values.summary.trim(),
          processId: values.processId ? Number(values.processId) : null,
          nonconformityId: values.nonconformityId ? Number(values.nonconformityId) : null,
        },
      });
      inputForm.reset(emptyInputForm());
      toast({ title: "Entrada adicionada" });
    } catch (error) {
      toast({
        title: "Falha ao adicionar entrada",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  });

  const handleCreateOutput = outputForm.handleSubmit(async (values) => {
    if (!selectedId) return;
    try {
      await outputMutation.mutateAsync({
        method: "POST",
        body: {
          outputType: values.outputType,
          description: values.description.trim(),
          responsibleUserId: values.responsibleUserId ? Number(values.responsibleUserId) : null,
          dueDate: values.dueDate || null,
          processId: values.processId ? Number(values.processId) : null,
          nonconformityId: values.nonconformityId ? Number(values.nonconformityId) : null,
          status: values.status,
        },
      });
      outputForm.reset(emptyOutputForm());
      toast({ title: "Saída adicionada" });
    } catch (error) {
      toast({
        title: "Falha ao adicionar saída",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle>Revisões</CardTitle>
            <Button size="sm" onClick={handleNew}>
              Nova
            </Button>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por título"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {reviews.map((review) => (
            <button
              key={review.id}
              type="button"
              onClick={() => {
                setIsCreatingNew(false);
                setSelectedId(review.id);
              }}
              className={`w-full rounded-xl border px-3 py-3 text-left ${
                selectedId === review.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{review.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{review.reviewDate}</p>
                </div>
                <Badge variant="secondary">{review.status}</Badge>
              </div>
            </button>
          ))}
          <PaginationControls
            page={pagination?.page ?? page}
            pageSize={pagination?.pageSize ?? PAGE_SIZE}
            total={pagination?.total ?? 0}
            totalPages={pagination?.totalPages ?? 0}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{selectedId ? "Editar análise crítica" : "Nova análise crítica"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="review-title">Título</Label>
              <Input id="review-title" {...reviewForm.register("title")} />
              {reviewForm.formState.errors.title ? (
                <p className="text-sm text-destructive">{reviewForm.formState.errors.title.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-date">Data da revisão</Label>
              <Input id="review-date" type="date" {...reviewForm.register("reviewDate")} />
              {reviewForm.formState.errors.reviewDate ? (
                <p className="text-sm text-destructive">
                  {reviewForm.formState.errors.reviewDate.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-status">Status</Label>
              <Select id="review-status" {...reviewForm.register("status")}>
                <option value="draft">Rascunho</option>
                <option value="completed">Concluída</option>
                <option value="canceled">Cancelada</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="review-chair">Presidente</Label>
              <Select id="review-chair" {...reviewForm.register("chairUserId")}>
                <option value="">Sem responsável</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="review-minutes">Ata / minutos</Label>
              <Textarea id="review-minutes" rows={5} {...reviewForm.register("minutes")} />
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button
                onClick={handleSaveReview}
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                Salvar análise crítica
              </Button>
            </div>
          </CardContent>
        </Card>

        {selectedId && reviewDetail ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Entradas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reviewDetail.inputs.map((input) => (
                  <div key={input.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{input.inputType}</p>
                      <Badge variant="secondary">#{input.id}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{input.summary}</p>
                  </div>
                ))}
                <div className="rounded-xl border p-3 space-y-3">
                  <Label>Nova entrada</Label>
                  <Select {...inputForm.register("inputType")}>
                    <option value="policy">Política</option>
                    <option value="audit_summary">Resumo de auditoria</option>
                    <option value="nc_summary">Resumo de NC</option>
                    <option value="objective_status">Status de objetivos</option>
                    <option value="risk_status">Status de riscos</option>
                    <option value="process_performance">Desempenho de processos</option>
                    <option value="customer_feedback">Feedback de clientes</option>
                    <option value="other">Outro</option>
                  </Select>
                  <Textarea
                    rows={3}
                    {...inputForm.register("summary")}
                    placeholder="Resumo da entrada"
                  />
                  {inputForm.formState.errors.summary ? (
                    <p className="text-sm text-destructive">{inputForm.formState.errors.summary.message}</p>
                  ) : null}
                  <Select {...inputForm.register("processId")}>
                    <option value="">Sem processo vinculado</option>
                    {processes.map((process) => (
                      <option key={process.id} value={String(process.id)}>
                        {process.name}
                      </option>
                    ))}
                  </Select>
                  <Select {...inputForm.register("nonconformityId")}>
                    <option value="">Sem NC vinculada</option>
                    {nonconformities.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                  <Button onClick={handleCreateInput} isLoading={inputMutation.isPending}>
                    Adicionar entrada
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saídas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reviewDetail.outputs.map((output) => (
                  <div key={output.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{output.outputType}</p>
                      <Badge variant="secondary">{output.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{output.description}</p>
                  </div>
                ))}
                <div className="rounded-xl border p-3 space-y-3">
                  <Label>Nova saída</Label>
                  <Select {...outputForm.register("outputType")}>
                    <option value="decision">Decisão</option>
                    <option value="action">Ação</option>
                    <option value="resource">Recurso</option>
                    <option value="priority">Prioridade</option>
                  </Select>
                  <Textarea
                    rows={3}
                    {...outputForm.register("description")}
                    placeholder="Descrição da saída"
                  />
                  {outputForm.formState.errors.description ? (
                    <p className="text-sm text-destructive">
                      {outputForm.formState.errors.description.message}
                    </p>
                  ) : null}
                  <Select {...outputForm.register("responsibleUserId")}>
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                  <Input type="date" {...outputForm.register("dueDate")} />
                  <Select {...outputForm.register("processId")}>
                    <option value="">Sem processo vinculado</option>
                    {processes.map((process) => (
                      <option key={process.id} value={String(process.id)}>
                        {process.name}
                      </option>
                    ))}
                  </Select>
                  <Select {...outputForm.register("nonconformityId")}>
                    <option value="">Sem NC vinculada</option>
                    {nonconformities.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                  <Select {...outputForm.register("status")}>
                    <option value="open">Aberta</option>
                    <option value="done">Concluída</option>
                    <option value="canceled">Cancelada</option>
                  </Select>
                  <Button onClick={handleCreateOutput} isLoading={outputMutation.isPending}>
                    Adicionar saída
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
