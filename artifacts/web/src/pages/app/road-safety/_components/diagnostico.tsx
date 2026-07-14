import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  formatDateOnly,
  todayDateOnly,
  useCreateDiagnosisWithInvalidation,
  useRoadSafetyDiagnoses,
  type RoadSafetyFactor,
  type RoadSafetyFactorDiagnosis,
} from "@/lib/road-safety-client";
import { DiagnosisBadge } from "./badges";

/** Autor nulo = registro migrado do texto livre antigo — não inventamos autoria. */
function authorLabel(d: RoadSafetyFactorDiagnosis): string {
  if (d.diagnosedByUserName) return d.diagnosedByUserName;
  return d.diagnosedByUserId === null
    ? "Registro anterior ao histórico — autor não registrado"
    : "Autor removido";
}

export function DiagnosisSection({
  orgId,
  factor,
}: {
  orgId: number;
  factor: RoadSafetyFactor;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [content, setContent] = useState("");
  const [referenceDate, setReferenceDate] = useState(todayDateOnly());

  const { data: history = [], isLoading } = useRoadSafetyDiagnoses(
    orgId,
    factor.id,
  );
  const createDiagnosis = useCreateDiagnosisWithInvalidation(orgId);

  const last = factor.lastDiagnosis ?? null;

  async function submit() {
    const text = content.trim();
    if (!text) {
      toast({
        title: "Escreva o diagnóstico antes de salvar",
        variant: "destructive",
      });
      return;
    }
    try {
      await createDiagnosis.mutateAsync({
        orgId,
        factorId: factor.id,
        data: { content: text, referenceDate },
      });
      toast({ title: "Diagnóstico registrado" });
      setOpen(false);
      setContent("");
      setReferenceDate(todayDateOnly());
    } catch {
      toast({
        title: "Não foi possível registrar o diagnóstico",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="sm:col-span-2 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Stethoscope className="h-4 w-4 text-muted-foreground" />
          Diagnóstico atual
          <DiagnosisBadge
            status={factor.diagnosisStatus}
            nextDate={factor.nextDiagnosisDate ?? null}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Registrar novo diagnóstico
        </Button>
      </div>

      {last ? (
        <div className="space-y-1">
          <p className="whitespace-pre-wrap text-[13px] text-foreground">
            {last.content}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatDateOnly(last.referenceDate)} · {authorLabel(last)}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Nenhum diagnóstico registrado ainda.
        </p>
      )}

      {history.length > 1 ? (
        <div>
          <button
            type="button"
            className="text-[12px] font-medium text-blue-600 hover:underline"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory
              ? "Ocultar histórico"
              : `Histórico (${history.length})`}
          </button>
          {showHistory ? (
            <ul className="mt-2 space-y-2 border-t border-border/60 pt-2">
              {history.map((d) => (
                <li key={d.id} className="space-y-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {formatDateOnly(d.referenceDate)} · {authorLabel(d)}
                  </p>
                  <p className="whitespace-pre-wrap text-[12px] text-foreground">
                    {d.content}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">
          Carregando histórico…
        </p>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Registrar novo diagnóstico"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase text-muted-foreground">
              Diagnóstico
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Estado atual do fator — o diagnóstico que embasa a análise GUT..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase text-muted-foreground">
              Data de referência
            </label>
            <Input
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            O registro é permanente: uma correção entra como um diagnóstico
            novo, assinado por você.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={createDiagnosis.isPending}>
            {createDiagnosis.isPending ? "Salvando…" : "Salvar diagnóstico"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
