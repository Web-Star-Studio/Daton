import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardPaste, Flag, Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { YearPicker } from "@/components/ui/year-picker";
import { CellRedActionsDialog } from "@/components/kpi/cell-red-actions-dialog";
import { FormulaBuilder } from "@/components/kpi/formula-builder";
import { FormulaCellEditor } from "@/components/kpi/formula-cell-editor";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  buildMeasurementLabel,
  formulaToNaturalText,
  hasValidFormula,
  parseNaturalFormula,
  validateFormula,
} from "@/lib/formula-evaluator";
import {
  MONTH_LABELS,
  PERIODICITY_LABELS,
  computeMonthlyStats,
  getTrafficLight,
  racColor,
  racLabel,
  trafficLightColor,
  type KpiYearRow,
  useKpiObjectives,
  useKpiYearData,
  useUpdateKpiIndicatorWithInvalidation,
  useUpsertKpiValuesWithInvalidation,
  useUpsertKpiYearConfigWithInvalidation,
} from "@/lib/kpi-client";

const CURRENT_YEAR = new Date().getFullYear();

type ConfigFormData = {
  objectiveId: string;
  seq: string;
  goal: string;
};

export default function KpiAlimentacaoPage() {
  const { organization } = useAuth();
  const orgId = organization!.id;

  usePageTitle("Lançamento de Dados");
  usePageSubtitle("Insira os valores mensais dos indicadores");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [unitFilter, setUnitFilter] = useState("");
  const [objectiveFilter, setObjectiveFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [configDialog, setConfigDialog] = useState<KpiYearRow | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormData>({ objectiveId: "", seq: "", goal: "" });

  const { data: allYearRows = [], isLoading } = useKpiYearData(orgId, year);
  const { data: objectives = [] } = useKpiObjectives(orgId);
  const upsertConfig = useUpsertKpiYearConfigWithInvalidation(orgId, year);
  const upsertValues = useUpsertKpiValuesWithInvalidation(orgId, year);
  const updateIndicator = useUpdateKpiIndicatorWithInvalidation(orgId);

  const [pasteDialog, setPasteDialog] = useState<KpiYearRow | null>(null);
  const [pasteInput, setPasteInput] = useState("");

  const [formulaDialog, setFormulaDialog] = useState<KpiYearRow | null>(null);
  const [formulaDraft, setFormulaDraft] = useState("");

  const [cellDialog, setCellDialog] = useState<{
    indicatorId: number;
    indicatorName: string;
    year: number;
    month: number;
    monthlyValueId: number | null;
    value: number | null;
    goal: number | null;
  } | null>(null);

  function openFormulaDialog(row: KpiYearRow) {
    const initial = formulaToNaturalText(
      row.indicator.formulaVariables ?? [],
      row.indicator.formulaExpression ?? "",
    );
    setFormulaDraft(initial);
    setFormulaDialog(row);
  }

  async function handleSaveFormula() {
    if (!formulaDialog) return;
    const parsed = parseNaturalFormula(formulaDraft);
    const check = validateFormula(parsed.expression, parsed.variables);
    if (!check.ok) {
      toast({ title: `Fórmula inválida: ${check.error}`, variant: "destructive" });
      return;
    }
    const measurement = buildMeasurementLabel(parsed.variables, parsed.expression);
    try {
      await updateIndicator.mutateAsync({
        orgId,
        indicatorId: formulaDialog.indicator.id,
        data: {
          name: formulaDialog.indicator.name,
          measurement,
          formulaVariables: parsed.variables,
          formulaExpression: parsed.expression,
          direction: formulaDialog.indicator.direction,
          periodicity: formulaDialog.indicator.periodicity,
        },
      });
      toast({ title: "Fórmula atualizada" });
      setFormulaDialog(null);
    } catch (err) {
      toast({
        title: "Falha ao salvar fórmula",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  const parsedPasteValues = useMemo((): (number | null)[] => {
    if (!pasteInput.trim()) return Array(12).fill(null);
    const parts = pasteInput.trim().split(/\t|  +/).map((s) => s.trim()).filter(Boolean);
    return Array.from({ length: 12 }, (_, i) => {
      if (i >= parts.length) return null;
      const n = parseFloat(parts[i].replace(",", "."));
      return isNaN(n) ? null : n;
    });
  }, [pasteInput]);

  const uniqueUnits = [...new Set(
    allYearRows.map((r) => r.indicator.unit).filter(Boolean) as string[]
  )].sort();

  const uniqueResponsibles = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of allYearRows) {
      if (r.indicator.responsibleUserId && r.indicator.responsibleUserName) {
        map.set(r.indicator.responsibleUserId, r.indicator.responsibleUserName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [allYearRows]);

  const hasUnlinkedRows = allYearRows.some((r) => !r.objective);
  const hasUnassignedRows = allYearRows.some((r) => !r.indicator.responsibleUserId);

  const yearRows = allYearRows.filter((r) => {
    if (unitFilter && r.indicator.unit !== unitFilter) return false;
    if (objectiveFilter === "none") return !r.objective;
    if (objectiveFilter && String(r.objective?.id ?? "") !== objectiveFilter) return false;
    if (responsibleFilter === "none") return !r.indicator.responsibleUserId;
    if (responsibleFilter && String(r.indicator.responsibleUserId ?? "") !== responsibleFilter) return false;
    return true;
  });

  function formatNumber(v: number | null | undefined): string {
    if (v === null || v === undefined) return "—";
    return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
  }

  function openConfigDialog(row: KpiYearRow) {
    setConfigDialog(row);
    setConfigForm({
      objectiveId: row.yearConfig.objectiveId != null ? String(row.yearConfig.objectiveId) : "",
      seq: row.yearConfig.seq != null ? String(row.yearConfig.seq) : "",
      goal: row.yearConfig.goal != null ? String(row.yearConfig.goal) : "",
    });
  }

  async function handleSaveConfig() {
    if (!configDialog) return;
    try {
      await upsertConfig.mutateAsync({
        orgId,
        indicatorId: configDialog.indicator.id,
        year,
        data: {
          objectiveId: configForm.objectiveId ? Number(configForm.objectiveId) : null,
          seq: configForm.seq ? Number(configForm.seq) : null,
          goal: configForm.goal ? Number(configForm.goal) : null,
        },
      });
      toast({ title: "Configuração salva" });
      setConfigDialog(null);
    } catch {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    }
  }

  async function saveCell(
    indicatorId: number,
    month: number,
    value: number | null,
    inputs: Record<string, number | null>,
    opts?: { isOverridden?: boolean },
  ) {
    try {
      await upsertValues.mutateAsync({
        orgId,
        indicatorId,
        year,
        data: { values: [{ month, value, inputs, ...(opts?.isOverridden !== undefined ? { isOverridden: opts.isOverridden } : {}) }] },
      });
    } catch {
      toast({ title: "Erro ao salvar valor", variant: "destructive" });
    }
  }

  /**
   * Limpa o override manual de uma célula de indicador Corporativo, deixando
   * o sistema recalcular automaticamente a partir das filhas no próximo read.
   * Salva value=null + isOverridden=false (sinal pro backend recomputar).
   */
  async function clearOverride(indicatorId: number, month: number) {
    try {
      await upsertValues.mutateAsync({
        orgId,
        indicatorId,
        year,
        data: { values: [{ month, value: null, inputs: {}, isOverridden: false }] },
      });
      toast({ title: "Override removido — valor passa a ser calculado automaticamente." });
    } catch {
      toast({ title: "Erro ao limpar override", variant: "destructive" });
    }
  }

  async function handleSavePaste() {
    if (!pasteDialog) return;
    const values = parsedPasteValues
      .map((value, i) => ({ month: i + 1, value, inputs: {} as Record<string, number | null> }))
      .filter((v) => v.value !== null);
    if (values.length === 0) {
      toast({ title: "Nenhum valor válido para salvar", variant: "destructive" });
      return;
    }
    try {
      await upsertValues.mutateAsync({
        orgId,
        indicatorId: pasteDialog.indicator.id,
        year,
        data: { values },
      });
      toast({ title: `${values.length} valor${values.length !== 1 ? "es" : ""} salvos` });
      setPasteDialog(null);
      setPasteInput("");
    } catch {
      toast({ title: "Erro ao salvar valores", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <YearPicker value={year} onChange={setYear} />

        <Select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="w-48">
          <option value="">Todas as unidades</option>
          {uniqueUnits.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>

        <Select value={objectiveFilter} onChange={(e) => setObjectiveFilter(e.target.value)} className="w-64">
          <option value="">Todos os objetivos</option>
          {objectives.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.code ? `${o.code} · ${o.name}` : o.name}
            </option>
          ))}
          {hasUnlinkedRows && <option value="none">Sem objetivo vinculado</option>}
        </Select>

        <Select value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)} className="w-56">
          <option value="">Todos os responsáveis</option>
          {uniqueResponsibles.map(([id, name]) => (
            <option key={id} value={String(id)}>{name}</option>
          ))}
          {hasUnassignedRows && <option value="none">Sem responsável</option>}
        </Select>

        <span className="text-sm text-muted-foreground">
          {yearRows.length} indicador{yearRows.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Spreadsheet table */}
      <div className="overflow-auto rounded-lg border max-h-[calc(100vh-14rem)]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="border px-2 py-2 text-left font-medium sticky top-0 left-0 z-30 bg-muted min-w-[200px]">Indicador</th>
              <th className="border px-2 py-2 text-left font-medium sticky top-0 z-20 bg-muted min-w-[120px]">Objetivo</th>
              <th className="border px-2 py-2 text-left font-medium sticky top-0 z-20 bg-muted min-w-[80px]">Unidade</th>
              <th className="border px-2 py-2 text-right font-medium sticky top-0 z-20 bg-muted min-w-[70px]">Tolerância</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="border px-2 py-2 text-right font-medium sticky top-0 z-20 bg-muted min-w-[55px]">{m}</th>
              ))}
              <th className="border px-2 py-2 text-right font-medium sticky top-0 z-20 bg-muted min-w-[60px]">Média</th>
              <th className="border px-2 py-2 text-right font-medium sticky top-0 z-20 bg-muted min-w-[70px]">Acumulado</th>
              <th className="border px-2 py-2 text-right font-medium sticky top-0 z-20 bg-muted min-w-[60px]">Progress.</th>
              <th className="border px-2 py-2 text-center font-medium sticky top-0 z-20 bg-muted min-w-[70px]">RAC 1°S</th>
              <th className="border px-2 py-2 text-center font-medium sticky top-0 z-20 bg-muted min-w-[70px]">RAC 2°S</th>
              <th className="border px-2 py-2 text-center font-medium sticky top-0 z-20 bg-muted min-w-[70px]">Status</th>
              <th className="border px-2 py-2 text-center font-medium sticky top-0 z-20 bg-muted min-w-[40px]" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={20} className="text-center py-10 text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : yearRows.length === 0 ? (
              <tr>
                <td colSpan={20} className="text-center py-10 text-muted-foreground">
                  Nenhum indicador configurado para {year}.
                  {" "}Configure indicadores e defina tolerâncias para começar.
                </td>
              </tr>
            ) : (
              yearRows.map((row) => {
                const monthValues = row.monthlyValues.map((mv) => mv.value ?? null);
                const direction = row.indicator.direction as "up" | "down";
                const { average, accumulated, progress, rac1, rac2 } = computeMonthlyStats(
                  monthValues,
                  row.yearConfig.goal,
                  direction,
                );

                const validFormula = hasValidFormula(
                  row.indicator.formulaVariables,
                  row.indicator.formulaExpression,
                );

                return (
                  <tr key={row.indicator.id} className="hover:bg-muted/20">
                    <td className="border px-2 py-1.5 sticky left-0 z-10 bg-card font-medium">
                      <div className="flex items-start gap-1.5">
                        <button
                          type="button"
                          className="line-clamp-2 leading-tight text-left hover:text-primary hover:underline underline-offset-2 cursor-pointer flex-1"
                          title="Ver e editar a fórmula deste indicador"
                          onClick={() => openFormulaDialog(row)}
                        >
                          {row.indicator.name}
                        </button>
                        {validFormula && (
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            title="Colar valores do Excel (12 meses de uma vez)"
                            onClick={() => { setPasteDialog(row); setPasteInput(""); }}
                          >
                            <ClipboardPaste className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!validFormula && (
                          <button
                            type="button"
                            className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                            title="Fórmula inválida ou ausente — clique para configurar"
                            onClick={() => openFormulaDialog(row)}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="text-muted-foreground text-[10px] mt-0.5">
                        {PERIODICITY_LABELS[row.indicator.periodicity as keyof typeof PERIODICITY_LABELS] ?? row.indicator.periodicity}
                        {" · "}
                        {row.indicator.direction === "up" ? "↑" : "↓"}
                        {row.indicator.measureUnit && ` · ${row.indicator.measureUnit}`}
                      </div>
                    </td>
                    <td className="border px-2 py-1.5 text-muted-foreground">
                      {row.objective ? (
                        <div className="line-clamp-2 leading-tight">
                          {row.objective.code && <span className="font-medium mr-1">{row.objective.code}</span>}
                          {row.objective.name}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="border px-2 py-1.5 text-muted-foreground">{row.indicator.unit ?? "—"}</td>
                    <td className="border px-2 py-1.5 text-right font-medium">
                      {row.yearConfig.goal != null ? formatNumber(row.yearConfig.goal) : "—"}
                    </td>

                    {/* Month cells */}
                    {MONTH_LABELS.map((_, idx) => {
                      const month = idx + 1;
                      const val = monthValues[idx];
                      const monthCell = row.monthlyValues[idx];
                      const status = getTrafficLight(val, row.yearConfig.goal, direction);
                      const monthlyValueId = monthCell?.monthlyValueId ?? null;
                      const justification = monthCell?.justification ?? null;
                      const plansCount = monthCell?.actionPlansCount ?? 0;
                      const showFlag = status === "red" && monthlyValueId !== null;
                      // Rollup awareness:
                      // - isComputed = valor exibido veio do cálculo on-read das filhas (Corporativo)
                      // - isOverridden = Ana entrou um valor manual sobre o rollup
                      // - hasRollup = o indicador é configurado como rollup (algum dos meses tem rollup state)
                      const isComputed = monthCell?.isComputed === true;
                      const isOverridden = monthCell?.isOverridden === true;
                      const hasRollup = row.monthlyValues.some((mv) => mv.isComputed === true || mv.isOverridden === true);
                      const flagColor = plansCount > 0
                        ? "text-amber-700 dark:text-amber-300"
                        : justification
                          ? "text-blue-700 dark:text-blue-300"
                          : "text-red-700/60 dark:text-red-300/70";

                      return (
                        <td
                          key={month}
                          className={cn(
                            "border px-1 py-0.5 text-right relative",
                            status && trafficLightColor(status),
                            // Subtle background quando valor é calculado (rollup, não-override)
                            isComputed && "bg-indigo-50/40 dark:bg-indigo-500/5",
                          )}
                          title={
                            isComputed
                              ? `Calculado automaticamente a partir de ${monthCell?.childrenWithData ?? 0}/${monthCell?.childrenTotal ?? 0} filiais. Editar abaixo sobrepõe.`
                              : isOverridden && hasRollup
                                ? "Override manual — clique no ↻ abaixo pra voltar ao cálculo automático"
                                : undefined
                          }
                        >
                          {/* Marker "auto" no canto pra valores calculados */}
                          {isComputed && (
                            <span
                              className="absolute top-0 left-0.5 text-[8px] font-medium text-indigo-600/70 dark:text-indigo-400/70 leading-none pt-0.5"
                              aria-label="Valor calculado automaticamente"
                            >
                              auto
                            </span>
                          )}
                          {validFormula ? (
                            <FormulaCellEditor
                              indicatorName={row.indicator.name}
                              variables={row.indicator.formulaVariables}
                              expression={row.indicator.formulaExpression}
                              measurement={row.indicator.measurement}
                              value={val}
                              inputs={monthCell?.inputs ?? {}}
                              formatNumber={formatNumber}
                              onSave={({ value, inputs }) =>
                                saveCell(row.indicator.id, month, value, inputs)
                              }
                            />
                          ) : (
                            <button
                              type="button"
                              className="w-full text-[10px] text-amber-600 dark:text-amber-400 italic underline-offset-2 hover:underline hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer"
                              onClick={() => openFormulaDialog(row)}
                              title="Configure uma fórmula válida para lançar valores"
                            >
                              {row.indicator.formulaVariables && row.indicator.formulaVariables.length > 0
                                ? "fórmula inválida"
                                : "sem fórmula"}
                            </button>
                          )}
                          {showFlag && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCellDialog({
                                  indicatorId: row.indicator.id,
                                  indicatorName: row.indicator.name,
                                  year,
                                  month,
                                  monthlyValueId,
                                  value: val,
                                  goal: row.yearConfig.goal ?? null,
                                });
                              }}
                              title={
                                plansCount > 0
                                  ? `${plansCount} plano${plansCount !== 1 ? "s" : ""} de ação`
                                  : justification
                                    ? "Justificativa registrada — clique para ver/editar"
                                    : "Adicionar justificativa ou plano de ação"
                              }
                              aria-label="Justificar ou criar plano de ação"
                              className={cn(
                                "absolute top-0.5 left-0.5 leading-none cursor-pointer hover:opacity-100 transition-opacity",
                                flagColor,
                                plansCount > 0 || justification ? "opacity-100" : "opacity-50",
                              )}
                            >
                              <Flag className="h-2.5 w-2.5" fill={plansCount > 0 || justification ? "currentColor" : "none"} />
                            </button>
                          )}
                          {/* Override manual num Corporativo com rollup → permitir voltar ao calculado */}
                          {isOverridden && hasRollup && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearOverride(row.indicator.id, month);
                              }}
                              title="Voltar ao cálculo automático (limpar override manual)"
                              aria-label="Usar valor calculado"
                              className="absolute bottom-0 right-0.5 text-[8px] leading-none text-indigo-600/70 dark:text-indigo-400/70 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer pb-0.5"
                            >
                              ↻ auto
                            </button>
                          )}
                        </td>
                      );
                    })}

                    <td className="border px-2 py-1.5 text-right">{formatNumber(average)}</td>
                    <td className="border px-2 py-1.5 text-right">{formatNumber(accumulated)}</td>
                    <td className="border px-2 py-1.5 text-right">
                      {progress != null ? `${Math.round(progress)}%` : "—"}
                    </td>
                    <td className={cn("border px-1 py-1.5 text-center text-[10px]", racColor(rac1))}>
                      {racLabel(rac1) === "Não precisa de plano de ação" ? "OK" : racLabel(rac1) === "Precisa de plano de ação" ? "RAC" : "—"}
                    </td>
                    <td className={cn("border px-1 py-1.5 text-center text-[10px]", racColor(rac2))}>
                      {racLabel(rac2) === "Não precisa de plano de ação" ? "OK" : racLabel(rac2) === "Precisa de plano de ação" ? "RAC" : "—"}
                    </td>
                    <td className="border px-1 py-1.5 text-center">
                      <Badge
                        variant={row.feedStatus === "fed" ? "success" : "warning"}
                        className="text-[10px] px-1"
                      >
                        {row.feedStatus === "fed" ? "OK" : "Vencido"}
                      </Badge>
                    </td>
                    <td className="border px-1 py-1.5 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        title="Configurar tolerância e objetivo"
                        onClick={() => openConfigDialog(row)}
                      >
                        <Settings2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Formula editor dialog */}
      {formulaDialog && (
        <Dialog
          open
          onOpenChange={() => setFormulaDialog(null)}
          title="Editar fórmula"
          description={formulaDialog.indicator.name}
          size="lg"
        >
          <div className="space-y-3 py-1">
            <FormulaBuilder value={formulaDraft} onChange={setFormulaDraft} />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormulaDialog(null)}
              disabled={updateIndicator.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveFormula} disabled={updateIndicator.isPending}>
              {updateIndicator.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Paste from Excel dialog */}
      {pasteDialog && (
        <Dialog
          open={true}
          onOpenChange={() => { setPasteDialog(null); setPasteInput(""); }}
          title="Colar valores do Excel"
          description={pasteDialog.indicator.name}
          size="lg"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cole os 12 valores mensais (Jan → Dez)</Label>
              <textarea
                autoFocus
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                placeholder={"Cole aqui uma linha copiada do Excel...\nEx: 99.51\t99.04\t99.64\t..."}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {pasteInput.trim() && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Preview</Label>
                <div className="grid grid-cols-6 gap-1">
                  {MONTH_LABELS.map((label, i) => {
                    const v = parsedPasteValues[i];
                    const status = pasteDialog.yearConfig.goal != null && v != null
                      ? getTrafficLight(v, pasteDialog.yearConfig.goal, pasteDialog.indicator.direction as "up" | "down")
                      : null;
                    return (
                      <div
                        key={label}
                        className={cn(
                          "rounded border px-2 py-1 text-center text-xs",
                          v !== null ? (status ? trafficLightColor(status) : "bg-muted/40") : "bg-muted/20 text-muted-foreground",
                        )}
                      >
                        <div className="font-medium text-[10px] text-muted-foreground">{label}</div>
                        <div>{v !== null ? (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)) : "—"}</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {parsedPasteValues.filter((v) => v !== null).length} de 12 valores reconhecidos
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasteDialog(null); setPasteInput(""); }}>Cancelar</Button>
            <Button
              onClick={handleSavePaste}
              disabled={upsertValues.isPending || parsedPasteValues.filter((v) => v !== null).length === 0}
            >
              <ClipboardPaste className="h-4 w-4 mr-1.5" />
              Salvar {parsedPasteValues.filter((v) => v !== null).length} valores
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Red cell actions: justification + action plans */}
      {cellDialog && (
        <CellRedActionsDialog
          context={{
            orgId,
            indicatorId: cellDialog.indicatorId,
            indicatorName: cellDialog.indicatorName,
            year: cellDialog.year,
            month: cellDialog.month,
            monthlyValueId: cellDialog.monthlyValueId,
            value: cellDialog.value,
            goal: cellDialog.goal,
          }}
          onClose={() => setCellDialog(null)}
        />
      )}

      {/* Config dialog */}
      {configDialog && (
        <Dialog
          open={true}
          onOpenChange={() => setConfigDialog(null)}
          title={`Configurar para ${year}`}
          description={`${configDialog.indicator.name} — ${configDialog.indicator.unit ?? ""}`}
          size="sm"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Objetivo estratégico</Label>
              <Select value={configForm.objectiveId} onChange={(e) => setConfigForm((f) => ({ ...f, objectiveId: e.target.value }))}>
                <option value="">Nenhum</option>
                {objectives.map((obj) => (
                  <option key={obj.id} value={String(obj.id)}>
                    {obj.code ? `${obj.code} — ` : ""}{obj.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Seq.</Label>
                <Input
                  type="number"
                  value={configForm.seq}
                  onChange={(e) => setConfigForm((f) => ({ ...f, seq: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tolerância *</Label>
                <Input
                  type="number"
                  value={configForm.goal}
                  onChange={(e) => setConfigForm((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="Ex: 98.9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(null)}>Cancelar</Button>
            <Button onClick={handleSaveConfig} disabled={upsertConfig.isPending}>Salvar</Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
