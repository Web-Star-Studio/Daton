import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrganizationTrainings,
  useCreateTrainingEffectivenessReview,
  getListOrganizationTrainingsQueryKey,
} from "@workspace/api-client-react";
import type { OrganizationTraining } from "@workspace/api-client-react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { CriarAcaoButton } from "@/pages/app/planos-acao/_components/criar-acao-button";
import { AcoesVinculadas } from "@/pages/app/planos-acao/_components/acoes-vinculadas";

const CRITERIA = [
  { key: "behavior", label: "Aplica no dia a dia (comportamento · L3)" },
  { key: "result", label: "Melhorou o desempenho / reduziu incidentes (resultado · L4)" },
  { key: "transfer", label: "Multiplica o conhecimento para a equipe (transferência)" },
] as const;

type CriteriaKey = (typeof CRITERIA)[number]["key"];

export default function EficaciaPage() {
  usePageTitle("Avaliação de eficácia");
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params = { status: "concluido" as const };
  const { data: result, isLoading } = useListOrganizationTrainings(
    orgId ?? 0,
    params,
    {
      query: {
        enabled: !!orgId,
        queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, params),
      },
    },
  );
  const trainings = result?.data ?? [];

  const groups = useMemo(() => {
    const pendentes: OrganizationTraining[] = [];
    const concluidas: OrganizationTraining[] = [];
    for (const t of trainings) {
      if (t.effectivenessStatus === "effective" || t.effectivenessStatus === "ineffective") {
        concluidas.push(t);
      } else {
        pendentes.push(t);
      }
    }
    return { pendentes, concluidas };
  }, [trainings]);

  const metrics = useMemo(() => {
    const eficazes = trainings.filter((t) => t.effectivenessStatus === "effective").length;
    const naoEficazes = trainings.filter((t) => t.effectivenessStatus === "ineffective").length;
    return {
      pendentes: groups.pendentes.length,
      eficazes,
      naoEficazes,
      avaliadas: eficazes + naoEficazes,
    };
  }, [trainings, groups]);

  const invalidate = () => {
    if (orgId)
      queryClient.invalidateQueries({
        queryKey: getListOrganizationTrainingsQueryKey(orgId),
      });
  };

  // avaliação modal
  const reviewMutation = useCreateTrainingEffectivenessReview();
  const [target, setTarget] = useState<OrganizationTraining | null>(null);
  const [scores, setScores] = useState<Record<CriteriaKey, number>>({
    behavior: 3,
    result: 3,
    transfer: 3,
  });
  const [comments, setComments] = useState("");

  const openEval = (t: OrganizationTraining) => {
    setTarget(t);
    setScores({ behavior: 3, result: 3, transfer: 3 });
    setComments("");
  };

  const avg = (scores.behavior + scores.result + scores.transfer) / 3;
  const isEffective = avg >= 3;

  const handleSaveReview = async () => {
    if (!orgId || !target) return;
    const today = new Date().toISOString().slice(0, 10);
    await reviewMutation.mutateAsync({
      orgId,
      empId: target.employeeId,
      trainId: target.id,
      data: {
        evaluationDate: today,
        score: Math.round(avg * 2 * 10) / 10, // 0–10
        isEffective,
        resultLevel: Math.round(avg), // 1–5
        comments: comments || undefined,
      },
    });
    invalidate();
    setTarget(null);
    toast({
      title: "Avaliação registrada",
      description: isEffective ? "Resultado: Eficaz" : "Resultado: Não eficaz",
    });
  };

  const renderCard = (t: OrganizationTraining) => {
    const ineffective = t.effectivenessStatus === "ineffective";
    return (
      <div key={t.id} className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="text-sm font-medium">{t.employeeName}</div>
        <div className="text-xs text-muted-foreground">{t.title}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {t.effectivenessStatus === "effective" ? (
            <Badge className="bg-green-50 text-green-700">Eficaz</Badge>
          ) : ineffective ? (
            <Badge className="bg-red-50 text-red-700">Não eficaz</Badge>
          ) : (
            <Badge className="bg-amber-50 text-amber-700">A avaliar</Badge>
          )}
        </div>
        {canWrite &&
        !(t.effectivenessStatus === "effective" || t.effectivenessStatus === "ineffective") ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full"
            onClick={() => openEval(t)}
          >
            Avaliar eficácia
          </Button>
        ) : null}
        {ineffective && orgId ? (
          <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
            <AcoesVinculadas orgId={orgId} sourceModule="training" refId={t.id} />
            {canWrite ? (
              <CriarAcaoButton
                orgId={orgId}
                source={{ sourceModule: "training", sourceRef: { trainingId: t.id } }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Pendentes" value={metrics.pendentes} accent="text-amber-700" />
        <Metric label="Eficazes" value={metrics.eficazes} accent="text-green-700" />
        <Metric label="Não eficazes" value={metrics.naoEficazes} accent="text-red-700" />
        <Metric label="Avaliadas" value={metrics.avaliadas} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Column title="Pendentes" count={groups.pendentes.length}>
            {groups.pendentes.map(renderCard)}
            {groups.pendentes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nada pendente.</p>
            ) : null}
          </Column>
          <Column title="Concluídas" count={groups.concluidas.length}>
            {groups.concluidas.map(renderCard)}
            {groups.concluidas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma avaliação ainda.</p>
            ) : null}
          </Column>
        </div>
      )}

      <Dialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Avaliação de eficácia"
        description={
          target ? `${target.employeeName} · ${target.title}` : ""
        }
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Avalie os critérios (1–5). Resultado eficaz quando a média ≥ 3.
          </p>
          {CRITERIA.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{c.label}</span>
              <Select
                value={String(scores[c.key])}
                onChange={(e) =>
                  setScores((s) => ({ ...s, [c.key]: Number(e.target.value) }))
                }
                className="w-auto"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Observação
            </Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              isEffective ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            Média atual: <strong>{avg.toFixed(1)}/5</strong> · Resultado:{" "}
            <strong>{isEffective ? "Eficaz" : "Não eficaz"}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTarget(null)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSaveReview()}
            disabled={reviewMutation.isPending}
          >
            Salvar avaliação
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {title}
        </h3>
        <Badge className="bg-muted text-muted-foreground">{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
