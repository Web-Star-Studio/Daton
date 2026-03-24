import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
  useAllActiveSgqProcesses,
  useAuditChecklistSyncMutation,
  useAuditFindingMutation,
  useInternalAudit,
  useInternalAuditMutation,
  useInternalAudits,
} from "@/lib/governance-system-client";
import {
  getListUserOptionsQueryKey,
  useListUserOptions,
} from "@workspace/api-client-react";

const auditFormSchema = z
  .object({
    title: z.string().trim().min(1, "Informe o título da auditoria"),
    scope: z.string().trim().min(1, "Informe o escopo da auditoria"),
    criteria: z.string().trim().min(1, "Informe os critérios da auditoria"),
    periodStart: z.string().min(1, "Informe a data inicial"),
    periodEnd: z.string().min(1, "Informe a data final"),
    auditorUserId: z.string().default(""),
    originType: z.enum(["internal", "external_manual"]),
    status: z.enum(["planned", "in_progress", "completed", "canceled"]),
  })
  .refine((values) => values.periodStart <= values.periodEnd, {
    message: "A data final deve ser maior ou igual à data inicial",
    path: ["periodEnd"],
  });

const checklistItemSchema = z.object({
  draftId: z.string(),
  label: z.string().trim().min(1, "Informe o item do checklist"),
  requirementRef: z.string().default(""),
  result: z.enum(["conformity", "nonconformity", "observation", "not_evaluated"]),
  notes: z.string().default(""),
});

const checklistFormSchema = z.object({
  items: z.array(checklistItemSchema),
});

const findingFormSchema = z.object({
  processId: z.string().default(""),
  requirementRef: z.string().default(""),
  classification: z.enum(["conformity", "observation", "nonconformity"]),
  description: z.string().trim().min(1, "Informe a descrição do achado"),
  responsibleUserId: z.string().default(""),
  dueDate: z.string().default(""),
});

type AuditFormState = z.infer<typeof auditFormSchema>;
type ChecklistDraftItem = z.infer<typeof checklistItemSchema>;
type FindingFormState = z.infer<typeof findingFormSchema>;

function createChecklistDraftItem(overrides?: Partial<Omit<ChecklistDraftItem, "draftId">>): ChecklistDraftItem {
  return {
    draftId: globalThis.crypto?.randomUUID?.() ?? `draft-${Math.random().toString(36).slice(2)}`,
    label: "",
    requirementRef: "",
    result: "not_evaluated",
    notes: "",
    ...overrides,
  };
}

const emptyAuditForm = (): AuditFormState => ({
  title: "",
  scope: "",
  criteria: "",
  periodStart: "",
  periodEnd: "",
  auditorUserId: "",
  originType: "internal",
  status: "planned",
});

const emptyFindingForm = (): FindingFormState => ({
  processId: "",
  requirementRef: "",
  classification: "observation",
  description: "",
  responsibleUserId: "",
  dueDate: "",
});

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export default function GovernanceAuditsPage() {
  usePageTitle("Auditorias");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "planned" | "in_progress" | "completed" | "canceled"
  >("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const auditForm = useForm<AuditFormState>({
    resolver: zodResolver(auditFormSchema),
    defaultValues: emptyAuditForm(),
  });
  const checklistForm = useForm<{ items: ChecklistDraftItem[] }>({
    resolver: zodResolver(checklistFormSchema),
    defaultValues: { items: [] },
  });
  const findingForm = useForm<FindingFormState>({
    resolver: zodResolver(findingFormSchema),
    defaultValues: emptyFindingForm(),
  });
  const {
    register: registerAudit,
    handleSubmit: handleAuditSubmit,
    reset: resetAuditForm,
    formState: { errors: auditErrors },
  } = auditForm;
  const {
    control: checklistControl,
    handleSubmit: handleChecklistSubmit,
    reset: resetChecklistForm,
    register: registerChecklist,
    formState: { errors: checklistErrors },
  } = checklistForm;
  const checklistFieldsArray = useFieldArray({
    control: checklistControl,
    name: "items",
  });
  const {
    fields: checklistDraft,
    append: appendChecklistItem,
    remove: removeChecklistItem,
  } = checklistFieldsArray;
  const {
    register: registerFinding,
    handleSubmit: handleFindingSubmit,
    reset: resetFindingForm,
    formState: { errors: findingErrors },
  } = findingForm;

  const { data: auditList } = useInternalAudits(orgId, {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  });
  const audits = auditList?.data ?? [];
  const pagination = auditList?.pagination;
  const { data: auditDetail } = useInternalAudit(orgId, selectedId);
  const createMutation = useInternalAuditMutation(orgId);
  const updateMutation = useInternalAuditMutation(orgId, selectedId);
  const checklistMutation = useAuditChecklistSyncMutation(orgId, selectedId);
  const findingMutation = useAuditFindingMutation(orgId, selectedId);

  const { data: users = [] } = useListUserOptions(orgId!, {}, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId!),
    },
  });
  const { data: processes = [] } = useAllActiveSgqProcesses(orgId);

  useEffect(() => {
    if (isCreatingNew) return;
    if (audits.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !audits.some((item) => item.id === selectedId)) {
      setSelectedId(audits[0].id);
    }
  }, [audits, isCreatingNew, selectedId]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (!auditDetail) return;
    resetAuditForm({
      title: auditDetail.title,
      scope: auditDetail.scope,
      criteria: auditDetail.criteria,
      periodStart: auditDetail.periodStart,
      periodEnd: auditDetail.periodEnd,
      auditorUserId: auditDetail.auditorUserId ? String(auditDetail.auditorUserId) : "",
      originType: auditDetail.originType,
      status: auditDetail.status,
    });
    resetChecklistForm({
      items: auditDetail.checklistItems.map((item) =>
        createChecklistDraftItem({
          label: item.label,
          requirementRef: item.requirementRef ?? "",
          result: item.result,
          notes: item.notes ?? "",
        }),
      ),
    });
    resetFindingForm(emptyFindingForm());
  }, [auditDetail, resetAuditForm, resetChecklistForm, resetFindingForm]);

  const handleNew = () => {
    setIsCreatingNew(true);
    setSelectedId(undefined);
    resetAuditForm(emptyAuditForm());
    resetChecklistForm({ items: [] });
    resetFindingForm(emptyFindingForm());
  };

  const handleSaveAudit = handleAuditSubmit(async (values) => {
    if (createMutation.isPending || updateMutation.isPending) return;
    try {
      const payload = {
        ...values,
        auditorUserId: values.auditorUserId ? Number(values.auditorUserId) : null,
      };
      if (selectedId) {
        await updateMutation.mutateAsync({ method: "PATCH", body: payload });
        setIsCreatingNew(false);
        toast({ title: "Auditoria atualizada" });
      } else {
        const created = await createMutation.mutateAsync({ method: "POST", body: payload });
        setIsCreatingNew(false);
        setSelectedId(created.id);
        toast({ title: "Auditoria criada" });
      }
    } catch (error) {
      toast({
        title: "Falha ao salvar auditoria",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  });

  const handleSaveChecklist = handleChecklistSubmit(async (values) => {
    if (!selectedId || checklistMutation.isPending) return;
    try {
      await checklistMutation.mutateAsync(
        values.items.map(({ draftId: _draftId, ...item }, index) => ({
          label: item.label,
          requirementRef: item.requirementRef || null,
          result: item.result,
          notes: item.notes || null,
          sortOrder: index,
        })),
      );
      toast({ title: "Checklist sincronizado" });
    } catch (error) {
      toast({
        title: "Falha ao sincronizar checklist",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  });

  const handleCreateFinding = handleFindingSubmit(async (values) => {
    if (!selectedId || findingMutation.isPending) return;
    try {
      await findingMutation.mutateAsync({
        method: "POST",
        body: {
          processId: values.processId ? Number(values.processId) : null,
          requirementRef: values.requirementRef || null,
          classification: values.classification,
          description: values.description.trim(),
          responsibleUserId: values.responsibleUserId
            ? Number(values.responsibleUserId)
            : null,
          dueDate: values.dueDate || null,
        },
      });
      resetFindingForm(emptyFindingForm());
      toast({ title: "Achado registrado" });
    } catch (error) {
      toast({
        title: "Falha ao registrar achado",
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
            <CardTitle>Auditorias</CardTitle>
            <Button size="sm" onClick={handleNew}>
              Nova
            </Button>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por título ou escopo"
          />
          <Select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "" | "planned" | "in_progress" | "completed" | "canceled",
              )
            }
          >
            <option value="">Todos os status</option>
            <option value="planned">Planejada</option>
            <option value="in_progress">Em andamento</option>
            <option value="completed">Concluída</option>
            <option value="canceled">Cancelada</option>
          </Select>
        </CardHeader>
        <CardContent className="space-y-3">
          {audits.map((audit) => (
            <button
              key={audit.id}
              type="button"
              onClick={() => {
                setIsCreatingNew(false);
                setSelectedId(audit.id);
              }}
              className={`w-full rounded-xl border px-3 py-3 text-left ${
                selectedId === audit.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{audit.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{audit.scope}</p>
                </div>
                <Badge variant="secondary">{audit.status}</Badge>
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
            <CardTitle>{selectedId ? "Editar auditoria" : "Nova auditoria"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Título</Label>
              <Input {...registerAudit("title")} />
              {auditErrors.title ? <p className="text-sm text-destructive">{auditErrors.title.message}</p> : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Escopo</Label>
              <Textarea rows={3} {...registerAudit("scope")} />
              {auditErrors.scope ? <p className="text-sm text-destructive">{auditErrors.scope.message}</p> : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Critérios</Label>
              <Textarea rows={3} {...registerAudit("criteria")} />
              {auditErrors.criteria ? <p className="text-sm text-destructive">{auditErrors.criteria.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" {...registerAudit("periodStart")} />
              {auditErrors.periodStart ? <p className="text-sm text-destructive">{auditErrors.periodStart.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="date" {...registerAudit("periodEnd")} />
              {auditErrors.periodEnd ? <p className="text-sm text-destructive">{auditErrors.periodEnd.message}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Auditor</Label>
              <Select {...registerAudit("auditorUserId")}>
                <option value="">Sem auditor definido</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select {...registerAudit("originType")}>
                <option value="internal">Interna</option>
                <option value="external_manual">Externa (manual)</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Status</Label>
              <Select {...registerAudit("status")}>
                <option value="planned">Planejada</option>
                <option value="in_progress">Em andamento</option>
                <option value="completed">Concluída</option>
                <option value="canceled">Cancelada</option>
              </Select>
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button
                onClick={handleSaveAudit}
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                Salvar auditoria
              </Button>
            </div>
          </CardContent>
        </Card>

        {selectedId ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Checklist</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    appendChecklistItem(createChecklistDraftItem())
                  }
                >
                  Novo item
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {checklistDraft.map((item, index) => (
                  <div key={item.id} className="rounded-xl border p-3 space-y-3">
                    <input type="hidden" {...registerChecklist(`items.${index}.draftId`)} />
                    <Input
                      {...registerChecklist(`items.${index}.label`)}
                      placeholder="Item do checklist"
                    />
                    {checklistErrors.items?.[index]?.label ? (
                      <p className="text-sm text-destructive">
                        {checklistErrors.items[index]?.label?.message}
                      </p>
                    ) : null}
                    <Input
                      {...registerChecklist(`items.${index}.requirementRef`)}
                      placeholder="Referência"
                    />
                    <Select
                      {...registerChecklist(`items.${index}.result`)}
                    >
                      <option value="not_evaluated">Não avaliado</option>
                      <option value="conformity">Conforme</option>
                      <option value="observation">Observação</option>
                      <option value="nonconformity">Não conformidade</option>
                    </Select>
                    <Textarea
                      rows={3}
                      {...registerChecklist(`items.${index}.notes`)}
                      placeholder="Notas"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => removeChecklistItem(index)}>
                        Remover item
                      </Button>
                    </div>
                  </div>
                ))}
                <Button onClick={handleSaveChecklist} isLoading={checklistMutation.isPending}>
                  Sincronizar checklist
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Achados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {auditDetail?.findings.map((finding) => (
                  <div key={finding.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{finding.classification}</p>
                      <Badge variant="secondary">{finding.processName || "Sem processo"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{finding.description}</p>
                  </div>
                ))}

                <div className="rounded-xl border p-3 space-y-3">
                  <Label>Novo achado</Label>
                  <Select {...registerFinding("classification")}>
                    <option value="conformity">Conformidade</option>
                    <option value="observation">Observação</option>
                    <option value="nonconformity">Não conformidade</option>
                  </Select>
                  <Textarea
                    rows={3}
                    {...registerFinding("description")}
                    placeholder="Descrição do achado"
                  />
                  {findingErrors.description ? (
                    <p className="text-sm text-destructive">{findingErrors.description.message}</p>
                  ) : null}
                  <Input
                    {...registerFinding("requirementRef")}
                    placeholder="Referência do requisito"
                  />
                  <Select {...registerFinding("processId")}>
                    <option value="">Sem processo vinculado</option>
                    {processes.map((process) => (
                      <option key={process.id} value={String(process.id)}>
                        {process.name}
                      </option>
                    ))}
                  </Select>
                  <Select {...registerFinding("responsibleUserId")}>
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                  <Input type="date" {...registerFinding("dueDate")} />
                  <Button onClick={handleCreateFinding} isLoading={findingMutation.isPending}>
                    Registrar achado
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
