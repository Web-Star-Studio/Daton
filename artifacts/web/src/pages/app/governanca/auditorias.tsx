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
  useAuditChecklistSyncMutation,
  useAuditFindingMutation,
  useInternalAudit,
  useInternalAuditMutation,
  useInternalAudits,
  useSgqProcesses,
} from "@/lib/governance-system-client";
import {
  getListUserOptionsQueryKey,
  useListUserOptions,
} from "@workspace/api-client-react";

type AuditFormState = {
  title: string;
  scope: string;
  criteria: string;
  periodStart: string;
  periodEnd: string;
  auditorUserId: string;
  originType: "internal" | "external_manual";
  status: "planned" | "in_progress" | "completed" | "canceled";
};

type ChecklistDraftItem = {
  label: string;
  requirementRef: string;
  result: "conformity" | "nonconformity" | "observation" | "not_evaluated";
  notes: string;
};

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

const emptyFindingForm = {
  processId: "",
  requirementRef: "",
  classification: "observation" as "conformity" | "observation" | "nonconformity",
  description: "",
  responsibleUserId: "",
  dueDate: "",
};

export default function GovernanceAuditsPage() {
  usePageTitle("Auditorias");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState<AuditFormState>(emptyAuditForm);
  const [checklistDraft, setChecklistDraft] = useState<ChecklistDraftItem[]>([]);
  const [findingForm, setFindingForm] = useState(emptyFindingForm);

  const { data: auditList } = useInternalAudits(orgId, {
    search: search || undefined,
    status: statusFilter || undefined,
  });
  const audits = auditList?.data ?? [];
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
  const { data: processList } = useSgqProcesses(orgId, { status: "active" });
  const processes = processList?.data ?? [];

  useEffect(() => {
    if (!selectedId && audits.length > 0) setSelectedId(audits[0].id);
  }, [audits, selectedId]);

  useEffect(() => {
    if (!auditDetail) return;
    setForm({
      title: auditDetail.title,
      scope: auditDetail.scope,
      criteria: auditDetail.criteria,
      periodStart: auditDetail.periodStart,
      periodEnd: auditDetail.periodEnd,
      auditorUserId: auditDetail.auditorUserId ? String(auditDetail.auditorUserId) : "",
      originType: auditDetail.originType,
      status: auditDetail.status,
    });
    setChecklistDraft(
      auditDetail.checklistItems.map((item) => ({
        label: item.label,
        requirementRef: item.requirementRef ?? "",
        result: item.result,
        notes: item.notes ?? "",
      })),
    );
  }, [auditDetail]);

  const handleNew = () => {
    setSelectedId(undefined);
    setForm(emptyAuditForm());
    setChecklistDraft([]);
    setFindingForm(emptyFindingForm);
  };

  const handleSaveAudit = async () => {
    try {
      const payload = {
        ...form,
        auditorUserId: form.auditorUserId ? Number(form.auditorUserId) : null,
      };
      if (selectedId) {
        await updateMutation.mutateAsync({ method: "PATCH", body: payload });
        toast({ title: "Auditoria atualizada" });
      } else {
        const created = await createMutation.mutateAsync({ method: "POST", body: payload });
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
  };

  const handleSaveChecklist = async () => {
    if (!selectedId) return;
    try {
      await checklistMutation.mutateAsync(
        checklistDraft.map((item, index) => ({
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
  };

  const handleCreateFinding = async () => {
    if (!selectedId) return;
    try {
      await findingMutation.mutateAsync({
        method: "POST",
        body: {
          processId: findingForm.processId ? Number(findingForm.processId) : null,
          requirementRef: findingForm.requirementRef || null,
          classification: findingForm.classification,
          description: findingForm.description,
          responsibleUserId: findingForm.responsibleUserId
            ? Number(findingForm.responsibleUserId)
            : null,
          dueDate: findingForm.dueDate || null,
        },
      });
      setFindingForm(emptyFindingForm);
      toast({ title: "Achado registrado" });
    } catch (error) {
      toast({
        title: "Falha ao registrar achado",
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
            onChange={(event) => setStatusFilter(event.target.value)}
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
              onClick={() => setSelectedId(audit.id)}
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
              <Input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Escopo</Label>
              <Textarea value={form.scope} onChange={(e) => setForm((c) => ({ ...c, scope: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Critérios</Label>
              <Textarea value={form.criteria} onChange={(e) => setForm((c) => ({ ...c, criteria: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => setForm((c) => ({ ...c, periodStart: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="date" value={form.periodEnd} onChange={(e) => setForm((c) => ({ ...c, periodEnd: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Auditor</Label>
              <Select value={form.auditorUserId} onChange={(e) => setForm((c) => ({ ...c, auditorUserId: e.target.value }))}>
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
              <Select value={form.originType} onChange={(e) => setForm((c) => ({ ...c, originType: e.target.value as AuditFormState["originType"] }))}>
                <option value="internal">Interna</option>
                <option value="external_manual">Externa (manual)</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as AuditFormState["status"] }))}>
                <option value="planned">Planejada</option>
                <option value="in_progress">Em andamento</option>
                <option value="completed">Concluída</option>
                <option value="canceled">Cancelada</option>
              </Select>
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button onClick={handleSaveAudit}>Salvar auditoria</Button>
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
                    setChecklistDraft((current) => [
                      ...current,
                      {
                        label: "",
                        requirementRef: "",
                        result: "not_evaluated",
                        notes: "",
                      },
                    ])
                  }
                >
                  Novo item
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {checklistDraft.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-xl border p-3 space-y-3">
                    <Input
                      value={item.label}
                      onChange={(event) =>
                        setChecklistDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                      placeholder="Item do checklist"
                    />
                    <Input
                      value={item.requirementRef}
                      onChange={(event) =>
                        setChecklistDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, requirementRef: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder="Referência"
                    />
                    <Select
                      value={item.result}
                      onChange={(event) =>
                        setChecklistDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  result: event.target.value as ChecklistDraftItem["result"],
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="not_evaluated">Não avaliado</option>
                      <option value="conformity">Conforme</option>
                      <option value="observation">Observação</option>
                      <option value="nonconformity">Não conformidade</option>
                    </Select>
                    <Textarea
                      rows={3}
                      value={item.notes}
                      onChange={(event) =>
                        setChecklistDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, notes: event.target.value } : entry,
                          ),
                        )
                      }
                      placeholder="Notas"
                    />
                  </div>
                ))}
                <Button onClick={handleSaveChecklist}>Sincronizar checklist</Button>
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
                  <Select
                    value={findingForm.classification}
                    onChange={(event) =>
                      setFindingForm((current) => ({
                        ...current,
                        classification: event.target.value as typeof current.classification,
                      }))
                    }
                  >
                    <option value="conformity">Conformidade</option>
                    <option value="observation">Observação</option>
                    <option value="nonconformity">Não conformidade</option>
                  </Select>
                  <Textarea
                    rows={3}
                    value={findingForm.description}
                    onChange={(event) =>
                      setFindingForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Descrição do achado"
                  />
                  <Input
                    value={findingForm.requirementRef}
                    onChange={(event) =>
                      setFindingForm((current) => ({
                        ...current,
                        requirementRef: event.target.value,
                      }))
                    }
                    placeholder="Referência do requisito"
                  />
                  <Select
                    value={findingForm.processId}
                    onChange={(event) =>
                      setFindingForm((current) => ({ ...current, processId: event.target.value }))
                    }
                  >
                    <option value="">Sem processo vinculado</option>
                    {processes.map((process) => (
                      <option key={process.id} value={String(process.id)}>
                        {process.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={findingForm.responsibleUserId}
                    onChange={(event) =>
                      setFindingForm((current) => ({
                        ...current,
                        responsibleUserId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Sem responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={String(user.id)}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="date"
                    value={findingForm.dueDate}
                    onChange={(event) =>
                      setFindingForm((current) => ({ ...current, dueDate: event.target.value }))
                    }
                  />
                  <Button onClick={handleCreateFinding}>Registrar achado</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
