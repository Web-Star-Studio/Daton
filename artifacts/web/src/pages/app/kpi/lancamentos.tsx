import { useCallback, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { YearPicker } from "@/components/ui/year-picker";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
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
  const [configDialog, setConfigDialog] = useState<KpiYearRow | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormData>({ objectiveId: "", seq: "", goal: "" });

  const { data: allYearRows = [], isLoading } = useKpiYearData(orgId, year);
  const { data: objectives = [] } = useKpiObjectives(orgId);
  const upsertConfig = useUpsertKpiYearConfigWithInvalidation(orgId, year);
  const upsertValues = useUpsertKpiValuesWithInvalidation(orgId, year);

  const [editingCell, setEditingCell] = useState<{ rowId: number; month: number } | null>(null);
  const [cellValue, setCellValue] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pasteDialog, setPasteDialog] = useState<KpiYearRow | null>(null);
  const [pasteInput, setPasteInput] = useState("");

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

  const yearRows = unitFilter
    ? allYearRows.filter((r) => r.indicator.unit === unitFilter)
    : allYearRows;

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

  const commitCellValue = useCallback(
    async (indicatorId: number, month: number, rawValue: string) => {
      const numValue = rawValue.trim() === "" ? null : parseFloat(rawValue.replace(",", "."));
      if (rawValue.trim() !== "" && (numValue === null || isNaN(numValue))) return;

      try {
        await upsertValues.mutateAsync({
          orgId,
          indicatorId,
          year,
          data: { values: [{ month, value: numValue }] },
        });
      } catch {
        toast({ title: "Erro ao salvar valor", variant: "destructive" });
      }
    },
    [orgId, year, upsertValues],
  );

  async function handleSavePaste() {
    if (!pasteDialog) return;
    const values = parsedPasteValues
      .map((value, i) => ({ month: i + 1, value }))
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
        data: { values: values as { month: number; value: number }[] },
      });
      toast({ title: `${values.length} valor${values.length !== 1 ? "es" : ""} salvos` });
      setPasteDialog(null);
      setPasteInput("");
    } catch {
      toast({ title: "Erro ao salvar valores", variant: "destructive" });
    }
  }

  function handleCellBlur(row: KpiYearRow, month: number) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      commitCellValue(row.indicator.id, month, cellValue);
      setEditingCell(null);
    }, 100);
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

        <span className="text-sm text-muted-foreground">
          {yearRows.length} indicador{yearRows.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Spreadsheet table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="border px-2 py-2 text-left font-medium sticky left-0 bg-muted/60 min-w-[200px]">Indicador</th>
              <th className="border px-2 py-2 text-left font-medium min-w-[120px]">Objetivo</th>
              <th className="border px-2 py-2 text-left font-medium min-w-[80px]">Unidade</th>
              <th className="border px-2 py-2 text-right font-medium min-w-[70px]">Meta</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="border px-2 py-2 text-right font-medium min-w-[55px]">{m}</th>
              ))}
              <th className="border px-2 py-2 text-right font-medium min-w-[60px]">Média</th>
              <th className="border px-2 py-2 text-right font-medium min-w-[70px]">Acumulado</th>
              <th className="border px-2 py-2 text-right font-medium min-w-[60px]">Progress.</th>
              <th className="border px-2 py-2 text-center font-medium min-w-[70px]">RAC 1°S</th>
              <th className="border px-2 py-2 text-center font-medium min-w-[70px]">RAC 2°S</th>
              <th className="border px-2 py-2 text-center font-medium min-w-[70px]">Status</th>
              <th className="border px-2 py-2 text-center font-medium min-w-[40px]" />
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
                  {" "}Configure indicadores e defina metas para começar.
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

                return (
                  <tr key={row.yearConfig.id} className="hover:bg-muted/20">
                    <td className="border px-2 py-1.5 sticky left-0 bg-white font-medium">
                      <button
                        type="button"
                        className="line-clamp-2 leading-tight text-left hover:text-primary hover:underline underline-offset-2 cursor-pointer w-full"
                        title="Colar valores do Excel"
                        onClick={() => { setPasteDialog(row); setPasteInput(""); }}
                      >
                        {row.indicator.name}
                      </button>
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
                      const status = getTrafficLight(val, row.yearConfig.goal, direction);
                      const isEditing = editingCell?.rowId === row.yearConfig.id && editingCell.month === month;

                      return (
                        <td
                          key={month}
                          className={cn(
                            "border px-1 py-0.5 text-right cursor-pointer",
                            !isEditing && status && trafficLightColor(status),
                          )}
                          onClick={() => {
                            setEditingCell({ rowId: row.yearConfig.id, month });
                            setCellValue(val != null ? String(val) : "");
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={cellValue}
                              onChange={(e) => setCellValue(e.target.value)}
                              onBlur={() => handleCellBlur(row, month)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  handleCellBlur(row, month);
                                }
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              className="w-full text-right bg-transparent outline-none border-b border-primary text-xs"
                              style={{ minWidth: 40 }}
                            />
                          ) : (
                            <span>{val != null ? formatNumber(val) : ""}</span>
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
                        variant="outline"
                        className={cn("text-[10px] px-1", row.feedStatus === "fed" ? "border-green-500 text-green-700" : "border-orange-500 text-orange-700")}
                      >
                        {row.feedStatus === "fed" ? "OK" : "Vencido"}
                      </Badge>
                    </td>
                    <td className="border px-1 py-1.5 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        title="Configurar meta e objetivo"
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
                <Label>Meta *</Label>
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
