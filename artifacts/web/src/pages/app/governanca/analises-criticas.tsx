import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
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

type ReviewFormState = {
  title: string;
  reviewDate: string;
  chairUserId: string;
  status: "draft" | "completed" | "canceled";
  minutes: string;
};

const emptyReviewForm = (): ReviewFormState => ({
  title: "",
  reviewDate: "",
  chairUserId: "",
  status: "draft",
  minutes: "",
});

const emptyInputForm = {
  inputType: "other" as
    | "policy"
    | "audit_summary"
    | "nc_summary"
    | "objective_status"
    | "risk_status"
    | "process_performance"
    | "customer_feedback"
    | "other",
  summary: "",
  processId: "",
  nonconformityId: "",
};

const emptyOutputForm = {
  outputType: "decision" as "decision" | "action" | "resource" | "priority",
  description: "",
  responsibleUserId: "",
  dueDate: "",
  processId: "",
  nonconformityId: "",
  status: "open" as "open" | "done" | "canceled",
};

export default function GovernanceManagementReviewsPage() {
  usePageTitle("Análises Críticas");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState<ReviewFormState>(emptyReviewForm);
  const [inputForm, setInputForm] = useState(emptyInputForm);
  const [outputForm, setOutputForm] = useState(emptyOutputForm);

  const { data: reviewsList } = useManagementReviews(orgId, {
    search: search || undefined,
  });
  const reviews = reviewsList?.data ?? [];
  const { data: reviewDetail } = useManagementReview(orgId, selectedId);
  const createMutation = useManagementReviewMutation(orgId);
  const updateMutation = useManagementReviewMutation(orgId, selectedId);
  const inputMutation = useManagementReviewInputMutation(orgId, selectedId);
  const outputMutation = useManagementReviewOutputMutation(orgId, selectedId);
  const { data: users = [] } = useListUserOptions(orgId!, {}, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId!),
    },
  });
  const { data: processList } = useSgqProcesses(orgId, { status: "active" });
  const { data: ncList } = useNonconformities(orgId, { pageSize: 50 });
  const processes = processList?.data ?? [];
  const nonconformities = ncList?.data ?? [];

  useEffect(() => {
    if (!selectedId && reviews.length > 0) setSelectedId(reviews[0].id);
  }, [reviews, selectedId]);

  useEffect(() => {
    if (!reviewDetail) return;
    setForm({
      title: reviewDetail.title,
      reviewDate: reviewDetail.reviewDate,
      chairUserId: reviewDetail.chairUserId ? String(reviewDetail.chairUserId) : "",
      status: reviewDetail.status,
      minutes: reviewDetail.minutes ?? "",
    });
  }, [reviewDetail]);

  const handleNew = () => {
    setSelectedId(undefined);
    setForm(emptyReviewForm());
    setInputForm(emptyInputForm);
    setOutputForm(emptyOutputForm);
  };

  const handleSaveReview = async () => {
    try {
      const payload = {
        title: form.title,
        reviewDate: form.reviewDate,
        chairUserId: form.chairUserId ? Number(form.chairUserId) : null,
        status: form.status,
        minutes: form.minutes || null,
      };
      if (selectedId) {
        await updateMutation.mutateAsync({ method: "PATCH", body: payload });
        toast({ title: "Análise crítica atualizada" });
      } else {
        const created = await createMutation.mutateAsync({ method: "POST", body: payload });
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
  };

  const handleCreateInput = async () => {
    if (!selectedId) return;
    try {
      await inputMutation.mutateAsync({
        method: "POST",
        body: {
          inputType: inputForm.inputType,
          summary: inputForm.summary,
          processId: inputForm.processId ? Number(inputForm.processId) : null,
          nonconformityId: inputForm.nonconformityId
            ? Number(inputForm.nonconformityId)
            : null,
        },
      });
      setInputForm(emptyInputForm);
      toast({ title: "Entrada adicionada" });
    } catch (error) {
      toast({
        title: "Falha ao adicionar entrada",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleCreateOutput = async () => {
    if (!selectedId) return;
    try {
      await outputMutation.mutateAsync({
        method: "POST",
        body: {
          outputType: outputForm.outputType,
          description: outputForm.description,
          responsibleUserId: outputForm.responsibleUserId
            ? Number(outputForm.responsibleUserId)
            : null,
          dueDate: outputForm.dueDate || null,
          processId: outputForm.processId ? Number(outputForm.processId) : null,
          nonconformityId: outputForm.nonconformityId
            ? Number(outputForm.nonconformityId)
            : null,
          status: outputForm.status,
        },
      });
      setOutputForm(emptyOutputForm);
      toast({ title: "Saída adicionada" });
    } catch (error) {
      toast({
        title: "Falha ao adicionar saída",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

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
              onClick={() => setSelectedId(review.id)}
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
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{selectedId ? "Editar análise crítica" : "Nova análise crítica"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Título</Label>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Data da revisão</Label>
              <Input type="date" value={form.reviewDate} onChange={(event) => setForm((current) => ({ ...current, reviewDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ReviewFormState["status"] }))}>
                <option value="draft">Rascunho</option>
                <option value="completed">Concluída</option>
                <option value="canceled">Cancelada</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Presidente</Label>
              <Select value={form.chairUserId} onChange={(event) => setForm((current) => ({ ...current, chairUserId: event.target.value }))}>
                <option value="">Sem responsável</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Ata / minutos</Label>
              <Textarea rows={5} value={form.minutes} onChange={(event) => setForm((current) => ({ ...current, minutes: event.target.value }))} />
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button onClick={handleSaveReview}>Salvar análise crítica</Button>
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
                  <Select value={inputForm.inputType} onChange={(event) => setInputForm((current) => ({ ...current, inputType: event.target.value as typeof current.inputType }))}>
                    <option value="policy">Política</option>
                    <option value="audit_summary">Resumo de auditoria</option>
                    <option value="nc_summary">Resumo de NC</option>
                    <option value="objective_status">Status de objetivos</option>
                    <option value="risk_status">Status de riscos</option>
                    <option value="process_performance">Desempenho de processos</option>
                    <option value="customer_feedback">Feedback de clientes</option>
                    <option value="other">Outro</option>
                  </Select>
                  <Textarea rows={3} value={inputForm.summary} onChange={(event) => setInputForm((current) => ({ ...current, summary: event.target.value }))} placeholder="Resumo da entrada" />
                  <Select value={inputForm.processId} onChange={(event) => setInputForm((current) => ({ ...current, processId: event.target.value }))}>
                    <option value="">Sem processo vinculado</option>
                    {processes.map((process) => (
                      <option key={process.id} value={String(process.id)}>
                        {process.name}
                      </option>
                    ))}
                  </Select>
                  <Select value={inputForm.nonconformityId} onChange={(event) => setInputForm((current) => ({ ...current, nonconformityId: event.target.value }))}>
                    <option value="">Sem NC vinculada</option>
                    {nonconformities.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                  <Button onClick={handleCreateInput}>Adicionar entrada</Button>
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
                  <Select value={outputForm.outputType} onChange={(event) => setOutputForm((current) => ({ ...current, outputType: event.target.value as typeof current.outputType }))}>
                    <option value="decision">Decisão</option>
                    <option value="action">Ação</option>
                    <option value="resource">Recurso</option>
                    <option value="priority">Prioridade</option>
                  </Select>
                  <Textarea rows={3} value={outputForm.description} onChange={(event) => setOutputForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição da saída" />
                  <Select value={outputForm.responsibleUserId} onChange={(event) => setOutputForm((current) => ({ ...current, responsibleUserId: event.target.value }))}>
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                  <Input type="date" value={outputForm.dueDate} onChange={(event) => setOutputForm((current) => ({ ...current, dueDate: event.target.value }))} />
                  <Select value={outputForm.processId} onChange={(event) => setOutputForm((current) => ({ ...current, processId: event.target.value }))}>
                    <option value="">Sem processo vinculado</option>
                    {processes.map((process) => (
                      <option key={process.id} value={String(process.id)}>
                        {process.name}
                      </option>
                    ))}
                  </Select>
                  <Select value={outputForm.nonconformityId} onChange={(event) => setOutputForm((current) => ({ ...current, nonconformityId: event.target.value }))}>
                    <option value="">Sem NC vinculada</option>
                    {nonconformities.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.title}
                      </option>
                    ))}
                  </Select>
                  <Select value={outputForm.status} onChange={(event) => setOutputForm((current) => ({ ...current, status: event.target.value as typeof current.status }))}>
                    <option value="open">Aberta</option>
                    <option value="done">Concluída</option>
                    <option value="canceled">Cancelada</option>
                  </Select>
                  <Button onClick={handleCreateOutput}>Adicionar saída</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
