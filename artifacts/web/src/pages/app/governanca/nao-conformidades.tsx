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
} from "@workspace/api-client-react";

const ncFormSchema = z.object({
  originType: z.enum(["audit_finding", "incident", "document", "process", "risk", "other"]),
  title: z.string().trim().min(1, "Informe o título da não conformidade"),
  description: z.string().trim().min(1, "Informe a descrição da não conformidade"),
  classification: z.string().default(""),
  rootCause: z.string().default(""),
  responsibleUserId: z.string().default(""),
  processId: z.string().default(""),
  status: z.enum([
    "open",
    "under_analysis",
    "action_in_progress",
    "awaiting_effectiveness",
    "closed",
    "canceled",
  ]),
});

const effectivenessFormSchema = z.object({
  result: z.enum(["effective", "ineffective"]),
  comment: z.string().default(""),
});

const actionFormSchema = z
  .object({
    title: z.string().trim().min(1, "Informe o título da ação corretiva"),
    description: z.string().trim().min(1, "Informe a descrição da ação corretiva"),
    responsibleUserId: z.string().default(""),
    dueDate: z.string().default(""),
    status: z.enum(["pending", "in_progress", "done", "canceled"]),
    executionNotes: z.string().default(""),
  })
  .superRefine((value, ctx) => {
    if (value.status === "done" && !value.executionNotes.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Ações concluídas exigem notas de execução",
        path: ["executionNotes"],
      });
    }
  });

type NcFormState = z.infer<typeof ncFormSchema>;
type EffectivenessFormState = z.infer<typeof effectivenessFormSchema>;
type ActionFormState = z.infer<typeof actionFormSchema>;

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

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

const emptyActionForm = (): ActionFormState => ({
  title: "",
  description: "",
  responsibleUserId: "",
  dueDate: "",
  status: "pending",
  executionNotes: "",
});

const emptyEffectivenessForm = (): EffectivenessFormState => ({
  result: "effective",
  comment: "",
});

export default function GovernanceNonconformitiesPage() {
  usePageTitle("Não Conformidades");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "open" | "under_analysis" | "action_in_progress" | "awaiting_effectiveness" | "closed" | "canceled"
  >("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const ncForm = useForm<NcFormState>({
    resolver: zodResolver(ncFormSchema),
    defaultValues: emptyNcForm(),
  });
  const effectivenessForm = useForm<EffectivenessFormState>({
    resolver: zodResolver(effectivenessFormSchema),
    defaultValues: emptyEffectivenessForm(),
  });
  const actionForm = useForm<ActionFormState>({
    resolver: zodResolver(actionFormSchema),
    defaultValues: emptyActionForm(),
  });

  const { data: ncList } = useNonconformities(orgId, {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  });
  const nonconformities = ncList?.data ?? [];
  const pagination = ncList?.pagination;
  const { data: ncDetail } = useNonconformity(orgId, selectedId);
  const createMutation = useNonconformityMutation(orgId);
  const updateMutation = useNonconformityMutation(orgId, selectedId);
  const effectivenessMutation = useEffectivenessReviewMutation(orgId, selectedId);
  const correctiveActionMutation = useCorrectiveActionMutation(orgId, selectedId);

  const { data: users = [] } = useListUserOptions(orgId ?? 0, {}, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId ?? 0),
    },
  });
  const { data: processList } = useSgqProcesses(orgId, { page: 1, pageSize: 100, status: "active" });
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
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (!ncDetail) return;
    ncForm.reset({
      originType: ncDetail.originType,
      title: ncDetail.title,
      description: ncDetail.description,
      classification: ncDetail.classification ?? "",
      rootCause: ncDetail.rootCause ?? "",
      responsibleUserId: ncDetail.responsibleUserId ? String(ncDetail.responsibleUserId) : "",
      processId: ncDetail.processId ? String(ncDetail.processId) : "",
      status: ncDetail.status,
    });
    effectivenessForm.reset({
      result: ncDetail.effectivenessResult ?? "effective",
      comment: "",
    });
  }, [effectivenessForm, ncDetail, ncForm]);

  const handleNew = () => {
    setIsCreatingNew(true);
    setSelectedId(undefined);
    ncForm.reset(emptyNcForm());
    actionForm.reset(emptyActionForm());
    effectivenessForm.reset(emptyEffectivenessForm());
  };

  const handleSaveNc = ncForm.handleSubmit(async (values) => {
    try {
      const payload = {
        originType: values.originType,
        title: values.title.trim(),
        description: values.description.trim(),
        classification: values.classification.trim() || null,
        rootCause: values.rootCause.trim() || null,
        responsibleUserId: values.responsibleUserId ? Number(values.responsibleUserId) : null,
        processId: values.processId ? Number(values.processId) : null,
        status: values.status,
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
  });

  const handleReview = effectivenessForm.handleSubmit(async (values) => {
    if (!selectedId) return;
    try {
      await effectivenessMutation.mutateAsync({
        result: values.result,
        comment: values.comment.trim() || null,
      });
      effectivenessForm.reset(emptyEffectivenessForm());
      toast({ title: "Verificação de eficácia registrada" });
    } catch (error) {
      toast({
        title: "Falha ao registrar eficácia",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  });

  const handleCreateAction = actionForm.handleSubmit(async (values) => {
    if (!selectedId) return;
    try {
      await correctiveActionMutation.mutateAsync({
        method: "POST",
        body: {
          title: values.title.trim(),
          description: values.description.trim(),
          responsibleUserId: values.responsibleUserId ? Number(values.responsibleUserId) : null,
          dueDate: values.dueDate || null,
          status: values.status,
          executionNotes: values.executionNotes.trim() || null,
        },
      });
      actionForm.reset(emptyActionForm());
      toast({ title: "Ação corretiva criada" });
    } catch (error) {
      toast({
        title: "Falha ao criar ação corretiva",
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
          <Select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | ""
                  | "open"
                  | "under_analysis"
                  | "action_in_progress"
                  | "awaiting_effectiveness"
                  | "closed"
                  | "canceled",
              )
            }
          >
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
              <Label htmlFor="nc-origin">Origem</Label>
              <Select id="nc-origin" {...ncForm.register("originType")}>
                <option value="audit_finding">Achado de auditoria</option>
                <option value="incident">Incidente</option>
                <option value="document">Documento</option>
                <option value="process">Processo</option>
                <option value="risk">Risco</option>
                <option value="other">Outro</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-status">Status</Label>
              <Select id="nc-status" {...ncForm.register("status")}>
                <option value="open">Aberta</option>
                <option value="under_analysis">Em análise</option>
                <option value="action_in_progress">Ação em andamento</option>
                <option value="awaiting_effectiveness">Aguardando eficácia</option>
                <option value="closed">Fechada</option>
                <option value="canceled">Cancelada</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nc-title">Título</Label>
              <Input id="nc-title" {...ncForm.register("title")} />
              {ncForm.formState.errors.title ? (
                <p className="text-sm text-destructive">{ncForm.formState.errors.title.message}</p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nc-description">Descrição</Label>
              <Textarea id="nc-description" rows={3} {...ncForm.register("description")} />
              {ncForm.formState.errors.description ? (
                <p className="text-sm text-destructive">
                  {ncForm.formState.errors.description.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-classification">Classificação</Label>
              <Input id="nc-classification" {...ncForm.register("classification")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-process">Processo SGQ</Label>
              <Select id="nc-process" {...ncForm.register("processId")}>
                <option value="">Sem processo vinculado</option>
                {processes.map((process) => (
                  <option key={process.id} value={String(process.id)}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-responsible">Responsável</Label>
              <Select id="nc-responsible" {...ncForm.register("responsibleUserId")}>
                <option value="">Sem responsável</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="nc-root-cause">Causa raiz</Label>
              <Textarea id="nc-root-cause" rows={3} {...ncForm.register("rootCause")} />
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button
                onClick={handleSaveNc}
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                Salvar não conformidade
              </Button>
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
                <Select {...effectivenessForm.register("result")}>
                  <option value="effective">Eficaz</option>
                  <option value="ineffective">Ineficaz</option>
                </Select>
                <Textarea
                  rows={3}
                  {...effectivenessForm.register("comment")}
                  placeholder="Comentário da verificação"
                />
                <Button onClick={handleReview} isLoading={effectivenessMutation.isPending}>
                  Registrar verificação
                </Button>
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
                  <Input {...actionForm.register("title")} placeholder="Título" />
                  {actionForm.formState.errors.title ? (
                    <p className="text-sm text-destructive">{actionForm.formState.errors.title.message}</p>
                  ) : null}
                  <Textarea
                    rows={3}
                    {...actionForm.register("description")}
                    placeholder="Descrição"
                  />
                  {actionForm.formState.errors.description ? (
                    <p className="text-sm text-destructive">
                      {actionForm.formState.errors.description.message}
                    </p>
                  ) : null}
                  <Select {...actionForm.register("responsibleUserId")}>
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                  <Input type="date" {...actionForm.register("dueDate")} />
                  <Select {...actionForm.register("status")}>
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                    <option value="canceled">Cancelada</option>
                  </Select>
                  <Textarea
                    rows={3}
                    {...actionForm.register("executionNotes")}
                    placeholder="Notas de execução"
                  />
                  {actionForm.formState.errors.executionNotes ? (
                    <p className="text-sm text-destructive">
                      {actionForm.formState.errors.executionNotes.message}
                    </p>
                  ) : null}
                  <Button onClick={handleCreateAction} isLoading={correctiveActionMutation.isPending}>
                    Criar ação
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
