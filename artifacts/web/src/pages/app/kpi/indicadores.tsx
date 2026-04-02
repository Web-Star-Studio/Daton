import { useState } from "react";
import { BarChart2, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { YearPicker } from "@/components/ui/year-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  PERIODICITY_LABELS,
  type KpiIndicator,
  type KpiObjective,
  useCreateKpiIndicatorWithInvalidation,
  useCreateKpiObjectiveWithInvalidation,
  useDeleteKpiIndicatorWithInvalidation,
  useDeleteKpiObjectiveWithInvalidation,
  useKpiIndicators,
  useKpiObjectives,
  useKpiYearData,
  useUpdateKpiIndicatorWithInvalidation,
  useUpdateKpiObjectiveWithInvalidation,
  useUpsertKpiYearConfigWithInvalidation,
} from "@/lib/kpi-client";

const DEFAULT_YEAR = new Date().getFullYear();

type IndicatorFormData = {
  name: string;
  measurement: string;
  unit: string;
  responsible: string;
  measureUnit: string;
  direction: "up" | "down";
  periodicity: "monthly" | "quarterly" | "semiannual" | "annual" | "monthly_15d" | "monthly_45d";
  objectiveId: string;
  goal: string;
};

const defaultIndicatorForm = (): IndicatorFormData => ({
  name: "",
  measurement: "",
  unit: "",
  responsible: "",
  measureUnit: "",
  direction: "up",
  periodicity: "monthly",
  objectiveId: "",
  goal: "",
});

export default function KpiIndicadoresPage() {
  const { organization } = useAuth();
  const orgId = organization!.id;

  usePageTitle("Indicadores");
  usePageSubtitle("Cadastro de KPIs e objetivos estratégicos");

  const [indicatorDialog, setIndicatorDialog] = useState(false);
  const [objectivesDialog, setObjectivesDialog] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<KpiIndicator | null>(null);
  const [indicatorForm, setIndicatorForm] = useState<IndicatorFormData>(defaultIndicatorForm());
  const [deleteConfirm, setDeleteConfirm] = useState<KpiIndicator | null>(null);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [searchQuery, setSearchQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("");

  const [objectiveForm, setObjectiveForm] = useState({ code: "", name: "" });
  const [editingObjective, setEditingObjective] = useState<KpiObjective | null>(null);

  const { data: indicators = [], isLoading } = useKpiIndicators(orgId);
  const { data: objectives = [] } = useKpiObjectives(orgId);
  const { data: yearRows = [] } = useKpiYearData(orgId, year);

  const createIndicator = useCreateKpiIndicatorWithInvalidation(orgId);
  const updateIndicator = useUpdateKpiIndicatorWithInvalidation(orgId);
  const deleteIndicator = useDeleteKpiIndicatorWithInvalidation(orgId);
  const createObjective = useCreateKpiObjectiveWithInvalidation(orgId);
  const updateObjective = useUpdateKpiObjectiveWithInvalidation(orgId);
  const deleteObjective = useDeleteKpiObjectiveWithInvalidation(orgId);
  const upsertYearConfig = useUpsertKpiYearConfigWithInvalidation(orgId, year);

  useHeaderActions(
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setObjectivesDialog(true)}>
        <Target className="h-4 w-4 mr-1.5" />
        Objetivos
      </Button>
      <HeaderActionButton
        label="Novo Indicador"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => {
          setEditingIndicator(null);
          setIndicatorForm(defaultIndicatorForm());
          setIndicatorDialog(true);
        }}
      />
    </div>,
  );

  const yearIndicatorIds = new Set(yearRows.map((r) => r.indicator.id));
  const indicatorsForYear = indicators.filter((i) => yearIndicatorIds.has(i.id));

  const uniqueUnits = [...new Set(indicatorsForYear.map((i) => i.unit).filter(Boolean) as string[])].sort();

  const filteredIndicators = indicatorsForYear.filter((ind) => {
    const matchesSearch = ind.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUnit = !unitFilter || (ind.unit ?? "") === unitFilter;
    return matchesSearch && matchesUnit;
  });

  async function handleSaveIndicator() {
    if (!indicatorForm.name.trim() || !indicatorForm.measurement.trim()) {
      toast({ title: "Preencha nome e medição", variant: "destructive" });
      return;
    }
    try {
      if (editingIndicator) {
        await updateIndicator.mutateAsync({ orgId, indicatorId: editingIndicator.id, data: {
          name: indicatorForm.name,
          measurement: indicatorForm.measurement,
          unit: indicatorForm.unit || undefined,
          responsible: indicatorForm.responsible || undefined,
          measureUnit: indicatorForm.measureUnit || undefined,
          direction: indicatorForm.direction,
          periodicity: indicatorForm.periodicity,
        }});
        await upsertYearConfig.mutateAsync({
          orgId,
          indicatorId: editingIndicator.id,
          year: year,
          data: {
            goal: indicatorForm.goal ? parseFloat(indicatorForm.goal) : null,
            objectiveId: indicatorForm.objectiveId ? parseInt(indicatorForm.objectiveId) : null,
          },
        });
        toast({ title: "Indicador atualizado" });
      } else {
        const created = await createIndicator.mutateAsync({
          orgId,
          data: {
            name: indicatorForm.name,
            measurement: indicatorForm.measurement,
            unit: indicatorForm.unit || undefined,
            responsible: indicatorForm.responsible || undefined,
            measureUnit: indicatorForm.measureUnit || undefined,
            direction: indicatorForm.direction,
            periodicity: indicatorForm.periodicity,
          },
        });
        if (indicatorForm.goal || indicatorForm.objectiveId) {
          await upsertYearConfig.mutateAsync({
            orgId,
            indicatorId: created.id,
            year: year,
            data: {
              goal: indicatorForm.goal ? parseFloat(indicatorForm.goal) : null,
              objectiveId: indicatorForm.objectiveId ? parseInt(indicatorForm.objectiveId) : null,
            },
          });
        }
        toast({ title: "Indicador criado" });
      }
      setIndicatorDialog(false);
    } catch {
      toast({ title: "Erro ao salvar indicador", variant: "destructive" });
    }
  }

  async function handleDeleteIndicator(ind: KpiIndicator) {
    try {
      await deleteIndicator.mutateAsync({ orgId, indicatorId: ind.id });
      toast({ title: "Indicador removido" });
      setDeleteConfirm(null);
    } catch {
      toast({ title: "Erro ao remover indicador", variant: "destructive" });
    }
  }

  async function handleSaveObjective() {
    if (!objectiveForm.name.trim()) {
      toast({ title: "Nome do objetivo é obrigatório", variant: "destructive" });
      return;
    }
    try {
      if (editingObjective) {
        await updateObjective.mutateAsync({ orgId, objectiveId: editingObjective.id, data: objectiveForm });
        toast({ title: "Objetivo atualizado" });
      } else {
        await createObjective.mutateAsync({ orgId, data: objectiveForm });
        toast({ title: "Objetivo criado" });
      }
      setObjectiveForm({ code: "", name: "" });
      setEditingObjective(null);
    } catch {
      toast({ title: "Erro ao salvar objetivo", variant: "destructive" });
    }
  }

  async function handleDeleteObjective(id: number) {
    try {
      await deleteObjective.mutateAsync({ orgId, objectiveId: id });
      toast({ title: "Objetivo removido" });
    } catch {
      toast({ title: "Erro ao remover objetivo", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <YearPicker value={year} onChange={setYear} />
        <Input
          placeholder="Buscar indicador..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="max-w-xs">
          <option value="">Todas as unidades</option>
          {uniqueUnits.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>
      </div>

      {/* Indicators table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Indicador</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Un. Medida</TableHead>
              <TableHead>Melhor</TableHead>
              <TableHead>Periodicidade</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredIndicators.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {indicators.length === 0
                    ? "Nenhum indicador cadastrado. Crie o primeiro clicando em \"Novo Indicador\"."
                    : indicatorsForYear.length === 0
                    ? `Nenhum indicador configurado para ${year}.`
                    : "Nenhum indicador encontrado com os filtros aplicados."}
                </TableCell>
              </TableRow>
            ) : (
              filteredIndicators.map((ind) => (
                <TableRow key={ind.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{ind.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{ind.measurement}</div>
                  </TableCell>
                  <TableCell className="text-sm">{ind.unit ?? "—"}</TableCell>
                  <TableCell className="text-sm">{ind.responsible ?? "—"}</TableCell>
                  <TableCell className="text-sm">{ind.measureUnit ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {ind.direction === "up" ? "↑ Maior" : "↓ Menor"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {PERIODICITY_LABELS[ind.periodicity as keyof typeof PERIODICITY_LABELS] ?? ind.periodicity}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingIndicator(ind);
                          const yearRow = yearRows.find((r) => r.indicator.id === ind.id);
                          setIndicatorForm({
                            name: ind.name,
                            measurement: ind.measurement,
                            unit: ind.unit ?? "",
                            responsible: ind.responsible ?? "",
                            measureUnit: ind.measureUnit ?? "",
                            direction: ind.direction as "up" | "down",
                            periodicity: ind.periodicity as IndicatorFormData["periodicity"],
                            objectiveId: yearRow?.yearConfig.objectiveId != null ? String(yearRow.yearConfig.objectiveId) : "",
                            goal: yearRow?.yearConfig.goal != null ? String(yearRow.yearConfig.goal) : "",
                          });
                          setIndicatorDialog(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(ind)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Indicator Dialog */}
      <Dialog
        open={indicatorDialog}
        onOpenChange={setIndicatorDialog}
        title={editingIndicator ? "Editar Indicador" : "Novo Indicador"}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Nome do indicador *</Label>
            <Input
              value={indicatorForm.name}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Atendimento do Prazo de Entrega"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Fórmula / medição *</Label>
            <Textarea
              value={indicatorForm.measurement}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, measurement: e.target.value }))}
              placeholder="Ex: Total de atrasos / Total de CT-e emitidos * 100"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unidade / filial</Label>
            <Input
              value={indicatorForm.unit}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="Ex: Porto Alegre"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Input
              value={indicatorForm.responsible}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, responsible: e.target.value }))}
              placeholder="Ex: Analista SGI"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unidade de medida</Label>
            <Input
              value={indicatorForm.measureUnit}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, measureUnit: e.target.value }))}
              placeholder="Ex: %, R$, Km/L, Hrs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Melhor resultado</Label>
            <Select
              value={indicatorForm.direction}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, direction: e.target.value as "up" | "down" }))}
            >
              <option value="up">↑ Quanto maior, melhor</option>
              <option value="down">↓ Quanto menor, melhor</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Periodicidade</Label>
            <Select
              value={indicatorForm.periodicity}
              onChange={(e) => setIndicatorForm((f) => ({ ...f, periodicity: e.target.value as IndicatorFormData["periodicity"] }))}
            >
              {Object.entries(PERIODICITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs text-muted-foreground mb-3">Meta e objetivo para {year} (opcional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Objetivo estratégico</Label>
                <Select
                  value={indicatorForm.objectiveId}
                  onChange={(e) => setIndicatorForm((f) => ({ ...f, objectiveId: e.target.value }))}
                >
                  <option value="">Sem objetivo vinculado</option>
                  {objectives.map((obj) => (
                    <option key={obj.id} value={String(obj.id)}>
                      {obj.code ? `${obj.code} — ` : ""}{obj.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Meta ({year})</Label>
                <Input
                  type="number"
                  value={indicatorForm.goal}
                  onChange={(e) => setIndicatorForm((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="Ex: 95"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIndicatorDialog(false)}>Cancelar</Button>
          <Button
            onClick={handleSaveIndicator}
            disabled={createIndicator.isPending || updateIndicator.isPending}
          >
            {editingIndicator ? "Salvar alterações" : "Criar indicador"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <Dialog
          open={true}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Remover indicador?"
          size="sm"
        >
          <p className="text-sm text-muted-foreground">
            Esta ação também removerá todos os dados de metas e valores mensais associados a "{deleteConfirm.name}".
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => handleDeleteIndicator(deleteConfirm)}
              disabled={deleteIndicator.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Objectives Dialog */}
      <Dialog
        open={objectivesDialog}
        onOpenChange={setObjectivesDialog}
        title="Objetivos Estratégicos"
        size="lg"
      >
        <div className="space-y-4">
          {/* Add/Edit form */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">{editingObjective ? "Editar objetivo" : "Novo objetivo"}</p>
            <div className="flex gap-3 items-end">
              <div className="w-24 space-y-1">
                <Label className="text-xs">Código</Label>
                <Input
                  value={objectiveForm.code}
                  onChange={(e) => setObjectiveForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Q2"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input
                  value={objectiveForm.name}
                  onChange={(e) => setObjectiveForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: AUMENTAR A EFICIÊNCIA OPERACIONAL DOS PROCESSOS"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={handleSaveObjective} disabled={createObjective.isPending || updateObjective.isPending}>
                  {editingObjective ? "Salvar" : "Adicionar"}
                </Button>
                {editingObjective && (
                  <Button size="sm" variant="ghost" onClick={() => { setEditingObjective(null); setObjectiveForm({ code: "", name: "" }); }}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {objectives.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum objetivo cadastrado.</p>
            ) : (
              objectives.map((obj) => (
                <div key={obj.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group">
                  <div className="flex items-center gap-2 min-w-0">
                    {obj.code && (
                      <Badge variant="outline" className="text-xs shrink-0">{obj.code}</Badge>
                    )}
                    <span className="text-sm truncate">{obj.name}</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditingObjective(obj);
                        setObjectiveForm({ code: obj.code ?? "", name: obj.name });
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteObjective(obj.id)}
                      disabled={deleteObjective.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setObjectivesDialog(false)}>Fechar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
