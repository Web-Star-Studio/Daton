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
import { PaginationControls } from "@/components/ui/pagination-controls";
import { toast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useCorrectiveActionMutation,
  useEffectivenessReviewMutation,
  useNonconformity,
  useNonconformityMutation,
  useNonconformities,
  useSgqProcesses,
} from "@/lib/governance-system-client";
import {
  getListUserOptionsQueryKey,
  useListUserOptions,
  type NonconformityStatus,
} from "@workspace/api-client-react";

type NcFormState = {
  originType: "audit_finding" | "incident" | "document" | "process" | "risk" | "other";
  title: string;
  description: string;
  classification: string;
  rootCause: string;
  responsibleUserId: string;
  processId: string;
  status:
    | "open"
    | "under_analysis"
    | "action_in_progress"
    | "awaiting_effectiveness"
    | "closed"
    | "canceled";
};

const emptyNcForm = (): NcFormState => ({
  originType: "other",
  title: "",
  description: "",
  classification: "",
  rootCause: "",
  responsibleUserId: "",
  processId: "",
  status: "open",
});

const emptyActionForm = {
  title: "",
  description: "",
  responsibleUserId: "",
  dueDate: "",
  status: "pending" as "pending" | "in_progress" | "done" | "canceled",
  executionNotes: "",
};

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export default function GovernanceNonconformitiesPage() {
  usePageTitle("Não Conformidades");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<NcFormState>(emptyNcForm);
  const [effectivenessResult, setEffectivenessResult] = useState<"effective" | "ineffective">(
    "effective",
  );
  const [effectivenessComment, setEffectivenessComment] = useState("");
  const [actionForm, setActionForm] = useState(emptyActionForm);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const { data: ncList } = useNonconformities(orgId, {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: (statusFilter || undefined) as NonconformityStatus | undefined,
  });
  const nonconformities = ncList?.data ?? [];
  const pagination = ncList?.pagination;
  const { data: ncDetail } = useNonconformity(orgId, selectedId);
  const createMutation = useNonconformityMutation(orgId);
  const updateMutation = useNonconformityMutation(orgId, selectedId);
  const effectivenessMutation = useEffectivenessReviewMutation(orgId, selectedId);
  const correctiveActionMutation = useCorrectiveActionMutation(orgId, selectedId);

  const { data: users = [] } = useListUserOptions(orgId!, {}, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId!),
    },
  });
  const { data: processList } = useSgqProcesses(orgId, { status: "active" });
  const processes = processList?.data ?? [];

  useEffect(() => {
    if (isCreatingNew) return;
    if (nonconformities.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !nonconformities.some((item) => item.id === selectedId)) {
      setSelectedId(nonconformities[0].id);
    }
  }, [isCreatingNew, nonconformities, selectedId]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!ncDetail) return;
    setForm({
      originType: ncDetail.originType,
      title: ncDetail.title,
      description: ncDetail.description,
      classification: ncDetail.classification ?? "",
      rootCause: ncDetail.rootCause ?? "",
      responsibleUserId: ncDetail.responsibleUserId ? String(ncDetail.responsibleUserId) : "",
      processId: ncDetail.processId ? String(ncDetail.processId) : "",
      status: ncDetail.status,
    });
  }, [ncDetail]);

  const handleNew = () => {
    setIsCreatingNew(true);
    setSelectedId(undefined);
    setForm(emptyNcForm());
    setActionForm(emptyActionForm);
    setEffectivenessComment("");
    setEffectivenessResult("effective");
  };

  const handleSaveNc = async () => {
    try {
      const payload = {
        originType: form.originType,
        title: form.title,
        description: form.description,
        classification: form.classification || null,
        rootCause: form.rootCause || null,
        responsibleUserId: form.responsibleUserId ? Number(form.responsibleUserId) : null,
        processId: form.processId ? Number(form.processId) : null,
        status: form.status,
      };
      if (selectedId) {
        await updateMutation.mutateAsync({ method: "PATCH", body: payload });
        setIsCreatingNew(false);
        toast({ title: "Não conformidade atualizada" });
      } else {
        const created = await createMutation.mutateAsync({ method: "POST", body: payload });
        setIsCreatingNew(false);
        setSelectedId(created.id);
        toast({ title: "Não conformidade criada" });
      }
    } catch (error) {
      toast({
        title: "Falha ao salvar não conformidade",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleReview = async () => {
    if (!selectedId) return;
    try {
      await effectivenessMutation.mutateAsync({
        result: effectivenessResult,
        comment: effectivenessComment || null,
      });
      setEffectivenessComment("");
      toast({ title: "Verificação de eficácia registrada" });
    } catch (error) {
      toast({
        title: "Falha ao registrar eficácia",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleCreateAction = async () => {
    if (!selectedId) return;
    try {
      await correctiveActionMutation.mutateAsync({
        method: "POST",
        body: {
          title: actionForm.title,
          description: actionForm.description,
          responsibleUserId: actionForm.responsibleUserId
            ? Number(actionForm.responsibleUserId)
            : null,
          dueDate: actionForm.dueDate || null,
          status: actionForm.status,
          executionNotes: actionForm.executionNotes || null,
        },
      });
      setActionForm(emptyActionForm);
      toast({ title: "Ação corretiva criada" });
    } catch (error) {
      toast({
        title: "Falha ao criar ação corretiva",
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
            <CardTitle>NCs</CardTitle>
            <Button size="sm" onClick={handleNew}>
              Nova
            </Button>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por título ou descrição"
          />
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos os status</option>
            <option value="open">Aberta</option>
            <option value="under_analysis">Em análise</option>
            <option value="action_in_progress">Ação em andamento</option>
            <option value="awaiting_effectiveness">Aguardando eficácia</option>
            <option value="closed">Fechada</option>
            <option value="canceled">Cancelada</option>
          </Select>
        </CardHeader>
        <CardContent className="space-y-3">
          {nonconformities.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setIsCreatingNew(false);
                setSelectedId(item.id);
              }}
              className={`w-full rounded-xl border px-3 py-3 text-left ${
                selectedId === item.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                </div>
                <Badge variant="secondary">{item.status}</Badge>
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
            <CardTitle>{selectedId ? "Editar não conformidade" : "Nova não conformidade"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={form.originType} onChange={(event) => setForm((current) => ({ ...current, originType: event.target.value as NcFormState["originType"] }))}>
                <option value="audit_finding">Achado de auditoria</option>
                <option value="incident">Incidente</option>
                <option value="document">Documento</option>
                <option value="process">Processo</option>
                <option value="risk">Risco</option>
                <option value="other">Outro</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as NcFormState["status"] }))}>
                <option value="open">Aberta</option>
                <option value="under_analysis">Em análise</option>
                <option value="action_in_progress">Ação em andamento</option>
                <option value="awaiting_effectiveness">Aguardando eficácia</option>
                <option value="closed">Fechada</option>
                <option value="canceled">Cancelada</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Título</Label>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Classificação</Label>
              <Input value={form.classification} onChange={(event) => setForm((current) => ({ ...current, classification: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Processo SGQ</Label>
              <Select value={form.processId} onChange={(event) => setForm((current) => ({ ...current, processId: event.target.value }))}>
                <option value="">Sem processo vinculado</option>
                {processes.map((process) => (
                  <option key={process.id} value={String(process.id)}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={form.responsibleUserId} onChange={(event) => setForm((current) => ({ ...current, responsibleUserId: event.target.value }))}>
                <option value="">Sem responsável</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Causa raiz</Label>
              <Textarea rows={3} value={form.rootCause} onChange={(event) => setForm((current) => ({ ...current, rootCause: event.target.value }))} />
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button onClick={handleSaveNc}>Salvar não conformidade</Button>
            </div>
          </CardContent>
        </Card>

        {selectedId && ncDetail ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Verificação de eficácia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border p-3">
                  <p className="text-sm text-muted-foreground">
                    Último resultado: {ncDetail.effectivenessResult || "não registrado"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ncDetail.effectivenessComment || "Sem comentário."}
                  </p>
                </div>
                <Select value={effectivenessResult} onChange={(event) => setEffectivenessResult(event.target.value as "effective" | "ineffective")}>
                  <option value="effective">Eficaz</option>
                  <option value="ineffective">Ineficaz</option>
                </Select>
                <Textarea rows={3} value={effectivenessComment} onChange={(event) => setEffectivenessComment(event.target.value)} placeholder="Comentário da verificação" />
                <Button onClick={handleReview}>Registrar verificação</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ações corretivas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ncDetail.correctiveActions.map((action) => (
                  <div key={action.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{action.title}</p>
                      <Badge variant="secondary">{action.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>
                  </div>
                ))}
                <div className="rounded-xl border p-3 space-y-3">
                  <Label>Nova ação corretiva</Label>
                  <Input value={actionForm.title} onChange={(event) => setActionForm((current) => ({ ...current, title: event.target.value }))} placeholder="Título" />
                  <Textarea rows={3} value={actionForm.description} onChange={(event) => setActionForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição" />
                  <Select value={actionForm.responsibleUserId} onChange={(event) => setActionForm((current) => ({ ...current, responsibleUserId: event.target.value }))}>
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                  <Input type="date" value={actionForm.dueDate} onChange={(event) => setActionForm((current) => ({ ...current, dueDate: event.target.value }))} />
                  <Select value={actionForm.status} onChange={(event) => setActionForm((current) => ({ ...current, status: event.target.value as typeof current.status }))}>
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                    <option value="canceled">Cancelada</option>
                  </Select>
                  <Textarea rows={3} value={actionForm.executionNotes} onChange={(event) => setActionForm((current) => ({ ...current, executionNotes: event.target.value }))} placeholder="Notas de execução" />
                  <Button onClick={handleCreateAction}>Criar ação</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
