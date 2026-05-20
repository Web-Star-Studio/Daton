import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  PERIODICITY_LABELS,
  useCreateMeasurementWithInvalidation,
  useRoadSafetyFactors,
  useRoadSafetyMeasurements,
  type Periodicity,
} from "@/lib/road-safety-client";

type LancamentosScreenProps = {
  orgId: number;
  initialFactorId: number | null;
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtMonth(d: string): string {
  const [y, m] = d.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTHS[idx] ?? m} ${y}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Deviation vs goal, coloured by magnitude (direction-agnostic). */
function deviationTone(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 5) return "text-emerald-600 dark:text-emerald-400";
  if (abs <= 15) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function LancamentosScreen({ orgId, initialFactorId }: LancamentosScreenProps) {
  const { data: factors = [] } = useRoadSafetyFactors(orgId);
  const createMeasurement = useCreateMeasurementWithInvalidation(orgId);

  const [selectedId, setSelectedId] = useState<number>(initialFactorId ?? 0);
  const [value, setValue] = useState("");
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [note, setNote] = useState("");

  // Default to the first factor once the list loads.
  useEffect(() => {
    if (selectedId === 0 && factors.length > 0) setSelectedId(factors[0].id);
  }, [factors, selectedId]);

  const factor = useMemo(
    () => factors.find((f) => f.id === selectedId) ?? null,
    [factors, selectedId],
  );

  const { data: measurements = [], isLoading: loadingHistory } = useRoadSafetyMeasurements(
    orgId,
    selectedId,
  );

  // API returns measurements newest-first; chart wants chronological order.
  const chartData = useMemo(() => [...measurements].reverse().slice(-6), [measurements]);
  const chartMax = Math.max(1, ...chartData.map((m) => Math.abs(m.value)));

  async function handleSubmit() {
    if (!factor) {
      toast({ title: "Selecione um fator de desempenho", variant: "destructive" });
      return;
    }
    if (!value.trim() || Number.isNaN(Number(value))) {
      toast({ title: "Informe um valor numérico válido", variant: "destructive" });
      return;
    }
    if (!referenceDate) {
      toast({ title: "Informe a data de referência", variant: "destructive" });
      return;
    }
    try {
      await createMeasurement.mutateAsync({
        orgId,
        factorId: factor.id,
        data: { value: Number(value), referenceDate, note: note.trim() || undefined },
      });
      toast({ title: "Lançamento registrado" });
      setValue("");
      setNote("");
    } catch {
      toast({ title: "Erro ao registrar o lançamento", variant: "destructive" });
    }
  }

  if (factors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        Cadastre um fator de desempenho antes de lançar indicadores.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* New launch */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-foreground">Novo lançamento</h3>

        <div className="mb-3 flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Fator de Desempenho
          </label>
          <Select value={String(selectedId)} onChange={(e) => setSelectedId(Number(e.target.value))}>
            {factors.map((f) => (
              <option key={f.id} value={String(f.id)}>
                {f.code} — {f.name}
              </option>
            ))}
          </Select>
        </div>

        {factor ? (
          <div className="mb-4 rounded-lg bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground">
            <div className="mb-0.5 text-[13px] font-medium text-foreground">
              {factor.code} — {factor.name}
            </div>
            Unidade: <b className="text-foreground/80">{factor.measureUnit || "—"}</b> · Meta:{" "}
            <b className="text-foreground/80">
              {factor.goal != null ? fmtNum(factor.goal) : "—"}
            </b>{" "}
            · Periodicidade:{" "}
            <b className="text-foreground/80">
              {PERIODICITY_LABELS[factor.periodicity as Periodicity] ?? factor.periodicity}
            </b>
          </div>
        ) : null}

        <div className="mb-3 flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Valor atual
          </label>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex: 10400"
          />
        </div>

        <div className="mb-3 flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Data de referência
          </label>
          <Input
            type="date"
            value={referenceDate}
            onChange={(e) => setReferenceDate(e.target.value)}
          />
        </div>

        <div className="mb-4 flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Observação (opcional)
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: Aumento por viagem extra no feriado"
          />
        </div>

        <p className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden />
          Lançamentos são imutáveis. Correções geram um novo registro.
        </p>

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={createMeasurement.isPending}
        >
          {createMeasurement.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : null}
          Confirmar Lançamento
        </Button>
      </div>

      {/* History */}
      <div>
        <h3 className="mb-3 text-[13px] font-semibold text-foreground">
          Histórico de indicadores {factor ? `— ${factor.code}` : ""}
        </h3>
        <div className="rounded-xl border bg-card p-4">
          {loadingHistory ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Carregando...</p>
          ) : measurements.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhum lançamento registrado para este fator.
            </p>
          ) : (
            <>
              <ul className="divide-y">
                {measurements.map((m) => {
                  const goal = factor?.goal ?? null;
                  const dev =
                    goal != null && goal !== 0 ? ((m.value - goal) / goal) * 100 : null;
                  return (
                    <li key={m.id} className="flex items-center justify-between py-2 text-xs">
                      <span className="text-muted-foreground">{fmtMonth(m.referenceDate)}</span>
                      <div className="text-right">
                        <div className="font-medium tabular-nums text-foreground">
                          {fmtNum(m.value)} {factor?.measureUnit ?? ""}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {goal != null ? `Meta: ${fmtNum(goal)}` : "Sem meta"}
                          {dev != null ? (
                            <span className={cn("ml-1 font-medium", deviationTone(dev))}>
                              · {dev > 0 ? "+" : ""}
                              {dev.toFixed(0)}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {chartData.length > 1 ? (
                <div className="mt-4">
                  <div className="mb-1.5 text-[11px] text-muted-foreground">
                    Tendência (últimos {chartData.length} lançamentos)
                  </div>
                  <div className="flex h-12 items-end gap-1">
                    {chartData.map((m) => (
                      <div
                        key={m.id}
                        className="flex-1 rounded-t bg-blue-500/70 dark:bg-blue-400/60"
                        style={{
                          height: `${Math.max(4, (Math.abs(m.value) / chartMax) * 100)}%`,
                        }}
                        title={`${fmtMonth(m.referenceDate)}: ${fmtNum(m.value)}`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
