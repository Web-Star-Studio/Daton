import { useEffect, useMemo, useState } from "react";
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
  useSgqProcess,
  useSgqProcessLifecycleMutation,
  useSgqProcessMutation,
  useSgqProcesses,
  type SgqProcessInteraction,
} from "@/lib/governance-system-client";
import {
  getListUserOptionsQueryKey,
  useListUserOptions,
} from "@workspace/api-client-react";

type ProcessFormState = {
  name: string;
  objective: string;
  ownerUserId: string;
  inputsText: string;
  outputsText: string;
  criteria: string;
  indicators: string;
  status: "active" | "inactive";
  interactions: Array<{
    relatedProcessId: string;
    direction: "upstream" | "downstream";
    notes: string;
  }>;
};

const emptyForm = (): ProcessFormState => ({
  name: "",
  objective: "",
  ownerUserId: "",
  inputsText: "",
  outputsText: "",
  criteria: "",
  indicators: "",
  status: "active",
  interactions: [],
});

function parseList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatList(values?: string[]) {
  return (values ?? []).join("\n");
}

function toFormInteraction(item: SgqProcessInteraction) {
  return {
    relatedProcessId: item.relatedProcessId ? String(item.relatedProcessId) : "",
    direction: item.direction,
    notes: item.notes ?? "",
  };
}

export default function GovernanceProcessesPage() {
  usePageTitle("Processos SGQ");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState<ProcessFormState>(emptyForm);

  const { data: processList, isLoading } = useSgqProcesses(orgId, {
    search: search || undefined,
    status: statusFilter || undefined,
  });
  const processes = processList?.data ?? [];

  const { data: processDetail } = useSgqProcess(orgId, selectedId);
  const createMutation = useSgqProcessMutation(orgId);
  const updateMutation = useSgqProcessMutation(orgId, selectedId);
  const inactivateMutation = useSgqProcessLifecycleMutation(orgId, selectedId, "inactivate");
  const reactivateMutation = useSgqProcessLifecycleMutation(orgId, selectedId, "reactivate");

  const { data: users = [] } = useListUserOptions(orgId!, {}, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId!),
    },
  });

  useEffect(() => {
    if (!selectedId && processes.length > 0) {
      setSelectedId(processes[0].id);
    }
  }, [processes, selectedId]);

  useEffect(() => {
    if (!processDetail) return;
    setForm({
      name: processDetail.name,
      objective: processDetail.objective,
      ownerUserId: processDetail.ownerUserId ? String(processDetail.ownerUserId) : "",
      inputsText: formatList(processDetail.inputs),
      outputsText: formatList(processDetail.outputs),
      criteria: processDetail.criteria ?? "",
      indicators: processDetail.indicators ?? "",
      status: processDetail.status,
      interactions: processDetail.interactions.map(toFormInteraction),
    });
  }, [processDetail]);

  const activeProcessOptions = useMemo(
    () => processes.filter((item) => item.status === "active" || item.id === selectedId),
    [processes, selectedId],
  );

  const handleNew = () => {
    setSelectedId(undefined);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: form.name,
        objective: form.objective,
        ownerUserId: form.ownerUserId ? Number(form.ownerUserId) : null,
        inputs: parseList(form.inputsText),
        outputs: parseList(form.outputsText),
        criteria: form.criteria || null,
        indicators: form.indicators || null,
        status: form.status,
        interactions: form.interactions
          .filter((item) => item.relatedProcessId)
          .map((item) => ({
            relatedProcessId: Number(item.relatedProcessId),
            direction: item.direction,
            notes: item.notes || null,
          })),
      };

      if (selectedId) {
        await updateMutation.mutateAsync({ method: "PATCH", body: payload });
        toast({
          title: "Processo atualizado",
          description: "As mudanças do processo SGQ foram salvas.",
        });
      } else {
        const created = await createMutation.mutateAsync({ method: "POST", body: payload });
        setSelectedId(created.id);
        toast({
          title: "Processo criado",
          description: "O processo SGQ foi criado com sucesso.",
        });
      }
    } catch (error) {
      toast({
        title: "Falha ao salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleLifecycle = async () => {
    if (!selectedId || !processDetail) return;

    try {
      if (processDetail.status === "active") {
        await inactivateMutation.mutateAsync();
        toast({ title: "Processo inativado" });
      } else {
        await reactivateMutation.mutateAsync();
        toast({ title: "Processo reativado" });
      }
    } catch (error) {
      toast({
        title: "Falha ao alterar status",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Catálogo</CardTitle>
              <Button size="sm" onClick={handleNew}>
                Novo
              </Button>
            </div>
            <div className="space-y-3">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome ou objetivo"
              />
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
            {processes.map((process) => (
              <button
                key={process.id}
                type="button"
                onClick={() => setSelectedId(process.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  selectedId === process.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{process.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {process.objective}
                    </p>
                  </div>
                  <Badge variant={process.status === "active" ? "default" : "secondary"}>
                    {process.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Rev. {process.currentRevisionNumber}
                  {process.ownerName ? ` · ${process.ownerName}` : ""}
                </p>
              </button>
            ))}
            {!isLoading && processes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum processo encontrado com os filtros atuais.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>{selectedId ? "Editar processo" : "Novo processo"}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Estruture objetivo, entradas, saídas e interações do SGQ.
                </p>
              </div>
              {selectedId && processDetail ? (
                <Button variant="outline" onClick={handleLifecycle}>
                  {processDetail.status === "active" ? "Inativar" : "Reativar"}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Nome do processo</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Ex.: Controle de documentos"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Objetivo</Label>
                <Textarea
                  value={form.objective}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, objective: event.target.value }))
                  }
                  rows={3}
                  placeholder="Descreva a finalidade do processo."
                />
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select
                  value={form.ownerUserId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ownerUserId: event.target.value }))
                  }
                >
                  <option value="">Sem responsável definido</option>
                  {users.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as "active" | "inactive",
                    }))
                  }
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entradas</Label>
                <Textarea
                  value={form.inputsText}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, inputsText: event.target.value }))
                  }
                  rows={5}
                  placeholder="Uma entrada por linha"
                />
              </div>
              <div className="space-y-2">
                <Label>Saídas</Label>
                <Textarea
                  value={form.outputsText}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, outputsText: event.target.value }))
                  }
                  rows={5}
                  placeholder="Uma saída por linha"
                />
              </div>
              <div className="space-y-2">
                <Label>Critérios</Label>
                <Textarea
                  value={form.criteria}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, criteria: event.target.value }))
                  }
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Indicadores</Label>
                <Textarea
                  value={form.indicators}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, indicators: event.target.value }))
                  }
                  rows={4}
                />
              </div>
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Interações</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        interactions: [
                          ...current.interactions,
                          { relatedProcessId: "", direction: "upstream", notes: "" },
                        ],
                      }))
                    }
                  >
                    Adicionar interação
                  </Button>
                </div>
                <div className="space-y-3">
                  {form.interactions.map((interaction, index) => (
                    <div
                      key={`${interaction.relatedProcessId}-${index}`}
                      className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1.2fr_0.8fr_1fr_auto]"
                    >
                      <Select
                        value={interaction.relatedProcessId}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            interactions: current.interactions.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, relatedProcessId: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      >
                        <option value="">Selecione o processo relacionado</option>
                        {activeProcessOptions
                          .filter((option) => option.id !== selectedId)
                          .map((option) => (
                            <option key={option.id} value={String(option.id)}>
                              {option.name}
                            </option>
                          ))}
                      </Select>
                      <Select
                        value={interaction.direction}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            interactions: current.interactions.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    direction: event.target.value as "upstream" | "downstream",
                                  }
                                : item,
                            ),
                          }))
                        }
                      >
                        <option value="upstream">Upstream</option>
                        <option value="downstream">Downstream</option>
                      </Select>
                      <Input
                        value={interaction.notes}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            interactions: current.interactions.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, notes: event.target.value }
                                : item,
                            ),
                          }))
                        }
                        placeholder="Observações"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            interactions: current.interactions.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                  {form.interactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma interação cadastrada.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex justify-end md:col-span-2">
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {selectedId ? "Salvar mudanças" : "Criar processo"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {processDetail ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Interações ativas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {processDetail.interactions.map((interaction) => (
                    <div key={interaction.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{interaction.relatedProcessName}</p>
                        <Badge variant="secondary">{interaction.direction}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {interaction.notes || "Sem observações registradas."}
                      </p>
                    </div>
                  ))}
                  {processDetail.interactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Este processo ainda não tem interações registradas.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Histórico de revisões</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {processDetail.revisions.map((revision) => (
                    <div key={revision.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">Revisão {revision.revisionNumber}</p>
                        <span className="text-xs text-muted-foreground">
                          {revision.createdAt
                            ? new Date(revision.createdAt).toLocaleDateString("pt-BR")
                            : "—"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {revision.changeSummary || "Sem resumo informado."}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
