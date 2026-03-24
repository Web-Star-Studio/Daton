import { useEffect, useMemo, useState } from "react";
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
  useSgqProcess,
  useSgqProcessLifecycleMutation,
  useSgqProcessMutation,
  useSgqProcesses,
} from "@/lib/governance-system-client";
import {
  getListUserOptionsQueryKey,
  useListUserOptions,
} from "@workspace/api-client-react";

const interactionSchema = z.object({
  relatedProcessId: z.string().min(1, "Selecione o processo relacionado"),
  direction: z.enum(["upstream", "downstream"]),
  notes: z.string().default(""),
});

const processFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do processo"),
  objective: z.string().trim().min(1, "Informe o objetivo do processo"),
  ownerUserId: z.string().default(""),
  inputsText: z.string().default(""),
  outputsText: z.string().default(""),
  criteria: z.string().default(""),
  indicators: z.string().default(""),
  status: z.enum(["active", "inactive"]),
  interactions: z.array(interactionSchema),
});

type ProcessFormState = z.infer<typeof processFormSchema>;

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

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

export default function GovernanceProcessesPage() {
  usePageTitle("Processos SGQ");
  const { organization } = useAuth();
  const orgId = organization?.id;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const form = useForm<ProcessFormState>({
    resolver: zodResolver(processFormSchema),
    defaultValues: emptyForm(),
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "interactions",
  });

  const { data: processList, isLoading } = useSgqProcesses(orgId, {
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  });
  const { data: processOptionsList } = useSgqProcesses(orgId, {
    page: 1,
    pageSize: 100,
    status: "active",
  });
  const processes = processList?.data ?? [];
  const pagination = processList?.pagination;

  const { data: processDetail } = useSgqProcess(orgId, selectedId);
  const createMutation = useSgqProcessMutation(orgId);
  const updateMutation = useSgqProcessMutation(orgId, selectedId);
  const inactivateMutation = useSgqProcessLifecycleMutation(orgId, selectedId, "inactivate");
  const reactivateMutation = useSgqProcessLifecycleMutation(orgId, selectedId, "reactivate");

  const { data: users = [] } = useListUserOptions(orgId ?? 0, {}, {
    query: {
      enabled: !!orgId,
      queryKey: getListUserOptionsQueryKey(orgId ?? 0),
    },
  });

  useEffect(() => {
    if (isCreatingNew) return;
    if (processes.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !processes.some((item) => item.id === selectedId)) {
      setSelectedId(processes[0].id);
    }
  }, [isCreatingNew, processes, selectedId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (!processDetail) return;
    reset({
      name: processDetail.name,
      objective: processDetail.objective,
      ownerUserId: processDetail.ownerUserId ? String(processDetail.ownerUserId) : "",
      inputsText: formatList(processDetail.inputs),
      outputsText: formatList(processDetail.outputs),
      criteria: processDetail.criteria ?? "",
      indicators: processDetail.indicators ?? "",
      status: processDetail.status,
      interactions: processDetail.interactions.map((item) => ({
        relatedProcessId: String(item.relatedProcessId),
        direction: item.direction,
        notes: item.notes ?? "",
      })),
    });
  }, [processDetail, reset]);

  const activeProcessOptions = useMemo(() => {
    const options = [...(processOptionsList?.data ?? [])];
    if (
      processDetail &&
      !options.some((option) => option.id === processDetail.id) &&
      (processDetail.status === "active" || processDetail.id === selectedId)
    ) {
      options.push({
        id: processDetail.id,
        organizationId: processDetail.organizationId,
        name: processDetail.name,
        objective: processDetail.objective,
        ownerUserId: processDetail.ownerUserId,
        ownerName: processDetail.ownerName,
        status: processDetail.status,
        currentRevisionNumber: processDetail.currentRevisionNumber,
        createdAt: processDetail.createdAt,
        updatedAt: processDetail.updatedAt,
      });
    }

    return options.filter((item) => item.status === "active" || item.id === selectedId);
  }, [processOptionsList?.data, processDetail, selectedId]);

  const handleNew = () => {
    setIsCreatingNew(true);
    setSelectedId(undefined);
    reset(emptyForm());
  };

  const handleSave = handleSubmit(async (values) => {
    try {
      const payload = {
        name: values.name.trim(),
        objective: values.objective.trim(),
        ownerUserId: values.ownerUserId ? Number(values.ownerUserId) : null,
        inputs: parseList(values.inputsText),
        outputs: parseList(values.outputsText),
        criteria: values.criteria.trim() || null,
        indicators: values.indicators.trim() || null,
        status: values.status,
        interactions: values.interactions.map((item) => ({
          relatedProcessId: Number(item.relatedProcessId),
          direction: item.direction,
          notes: item.notes.trim() || null,
        })),
      };

      if (selectedId) {
        await updateMutation.mutateAsync({ method: "PATCH", body: payload });
        setIsCreatingNew(false);
        toast({
          title: "Processo atualizado",
          description: "As mudanças do processo SGQ foram salvas.",
        });
      } else {
        const created = await createMutation.mutateAsync({ method: "POST", body: payload });
        setIsCreatingNew(false);
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
  });

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
                onChange={(event) =>
                  setStatusFilter(event.target.value as "" | "active" | "inactive")
                }
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
                onClick={() => {
                  setIsCreatingNew(false);
                  setSelectedId(process.id);
                }}
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
            <PaginationControls
              page={pagination?.page ?? page}
              pageSize={pagination?.pageSize ?? PAGE_SIZE}
              total={pagination?.total ?? 0}
              totalPages={pagination?.totalPages ?? 0}
              disabled={isLoading}
              onPageChange={setPage}
            />
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
                <Button
                  variant="outline"
                  onClick={handleLifecycle}
                  isLoading={inactivateMutation.isPending || reactivateMutation.isPending}
                >
                  {processDetail.status === "active" ? "Inativar" : "Reativar"}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="process-name">Nome do processo</Label>
                <Input
                  id="process-name"
                  {...register("name")}
                  placeholder="Ex.: Controle de documentos"
                />
                {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="process-objective">Objetivo</Label>
                <Textarea
                  id="process-objective"
                  {...register("objective")}
                  rows={3}
                  placeholder="Descreva a finalidade do processo."
                />
                {errors.objective ? (
                  <p className="text-sm text-destructive">{errors.objective.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="process-owner">Responsável</Label>
                <Select id="process-owner" {...register("ownerUserId")}>
                  <option value="">Sem responsável definido</option>
                  {users.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="process-status">Status</Label>
                <Select id="process-status" {...register("status")}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="process-inputs">Entradas</Label>
                <Textarea
                  id="process-inputs"
                  {...register("inputsText")}
                  rows={5}
                  placeholder="Uma entrada por linha"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="process-outputs">Saídas</Label>
                <Textarea
                  id="process-outputs"
                  {...register("outputsText")}
                  rows={5}
                  placeholder="Uma saída por linha"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="process-criteria">Critérios</Label>
                <Textarea id="process-criteria" {...register("criteria")} rows={4} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="process-indicators">Indicadores</Label>
                <Textarea id="process-indicators" {...register("indicators")} rows={4} />
              </div>
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Interações</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        relatedProcessId: "",
                        direction: "upstream",
                        notes: "",
                      })
                    }
                  >
                    Adicionar interação
                  </Button>
                </div>
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1.2fr_0.8fr_1fr_auto]"
                    >
                      <div className="space-y-2">
                        <Select {...register(`interactions.${index}.relatedProcessId`)}>
                          <option value="">Selecione o processo relacionado</option>
                          {activeProcessOptions
                            .filter((option) => option.id !== selectedId)
                            .map((option) => (
                              <option key={option.id} value={String(option.id)}>
                                {option.name}
                              </option>
                            ))}
                        </Select>
                        {errors.interactions?.[index]?.relatedProcessId ? (
                          <p className="text-sm text-destructive">
                            {errors.interactions[index]?.relatedProcessId?.message}
                          </p>
                        ) : null}
                      </div>
                      <Select {...register(`interactions.${index}.direction`)}>
                        <option value="upstream">Upstream</option>
                        <option value="downstream">Downstream</option>
                      </Select>
                      <Input
                        {...register(`interactions.${index}.notes`)}
                        placeholder="Observações"
                      />
                      <Button type="button" variant="ghost" onClick={() => remove(index)}>
                        Remover
                      </Button>
                    </div>
                  ))}
                  {fields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma interação cadastrada.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex justify-end md:col-span-2">
                <Button
                  onClick={handleSave}
                  isLoading={createMutation.isPending || updateMutation.isPending}
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
