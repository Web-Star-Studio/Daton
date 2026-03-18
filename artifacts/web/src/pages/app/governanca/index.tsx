import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  governanceKeys,
  importGovernancePlan,
  useCreateGovernancePlan,
  useGovernancePlans,
  type GovernanceImportPayload,
} from "@/lib/governance-client";
import {
  parseGovernanceWorkbook,
  type GovernanceImportPreview,
} from "@/lib/governance-import";
import {
  formatGovernanceDate,
  GOVERNANCE_STATUS_LABELS,
} from "@/lib/governance-ui";
import { toast } from "@/hooks/use-toast";
import {
  ChevronRight,
  FileSpreadsheet,
  Landmark,
  Plus,
} from "lucide-react";

export default function GovernancePage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: plans = [], isLoading } = useGovernancePlans(orgId);
  const createPlanMutation = useCreateGovernancePlan(orgId);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState("Planejamento Estratégico");
  const [importPreview, setImportPreview] =
    useState<GovernanceImportPreview | null>(null);
  const [targetPlanId, setTargetPlanId] = useState<number | null>(null);

  usePageTitle("Planejamento Estratégico");
  usePageSubtitle(
    "Contexto, SWOT, partes interessadas, objetivos e evidências do requisito ISO 9001:2015 §4.1.",
  );

  const currentPlan =
    plans.find((plan) => plan.status !== "archived") || plans[0];

  const actionBreakdown = useMemo(() => {
    return currentPlan?.openActionsByUnit || [];
  }, [currentPlan]);

  useHeaderActions(
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
        <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
        Importar planilha
      </Button>
      <Button size="sm" onClick={() => setCreateOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Novo plano
      </Button>
    </div>,
  );

  const handleCreatePlan = async () => {
    if (!orgId) return;
    try {
      const plan = await createPlanMutation.mutateAsync({
        title: planTitle.trim() || "Planejamento Estratégico",
        standards: ["ISO 9001:2015", "ISO 9001:2015/Amd 1:2024"],
        reviewFrequencyMonths: 12,
      });
      setCreateOpen(false);
      navigate(`/governanca/planejamento/${plan.id}`);
    } catch (error) {
      toast({
        title: "Falha ao criar plano",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível criar o plano.",
      });
    }
  };

  const handleWorkbookSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const preview = await parseGovernanceWorkbook(file);
      setImportPreview(preview);
      const editablePlan = plans.find((plan) =>
        ["draft", "rejected"].includes(plan.status),
      );
      setTargetPlanId(editablePlan?.id ?? null);
    } catch (error) {
      toast({
        title: "Falha ao ler planilha",
        description:
          error instanceof Error
            ? error.message
            : "O arquivo não pôde ser processado.",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleImport = async () => {
    if (!orgId || !importPreview) return;

    try {
      let planId = targetPlanId;
      if (!planId && plans.length > 0) {
        toast({
          title: "Importação bloqueada",
          description:
            "Reabra o plano atual para rascunho antes de sobrescrever com uma planilha.",
        });
        return;
      }
      if (!planId) {
        const created = await createPlanMutation.mutateAsync(
          importPreview.payload.plan,
        );
        planId = created.id;
        setTargetPlanId(planId);
      }

      const payload: GovernanceImportPayload = {
        ...importPreview.payload,
        plan: {
          ...importPreview.payload.plan,
          title: importPreview.payload.plan.title || "Planejamento Estratégico",
        },
      };

      const result = await importGovernancePlan(orgId, planId, payload);
      await queryClient.invalidateQueries({
        queryKey: governanceKeys.list(orgId),
      });
      setImportOpen(false);
      setImportPreview(null);
      navigate(`/governanca/planejamento/${result.id}`);
    } catch (error) {
      toast({
        title: "Falha ao importar planilha",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível importar a planilha.",
      });
    }
  };

  return (
    <div className="px-6 py-6 space-y-10">
      {currentPlan ? (
        <>
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Plano Vigente
            </h3>
            <button
              type="button"
              onClick={() =>
                navigate(`/governanca/planejamento/${currentPlan.id}`)
              }
              className="group -mx-2 flex w-full items-center justify-between gap-4 rounded-lg border-b border-border/40 px-2 py-4 text-left transition-colors hover:bg-muted/20"
            >
              <div>
                <p className="text-[14px] font-medium text-foreground">
                  {currentPlan.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {currentPlan.executiveSummary ||
                    "Abra o plano para consolidar contexto, SWOT, partes interessadas e evidências formais."}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
            </button>
          </div>

          {actionBreakdown.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
                Ações Abertas por Unidade
              </h3>
              <div className="space-y-px">
                {actionBreakdown.map((item) => (
                  <div
                    key={item.unitId}
                    className="flex items-center justify-between py-3 border-b border-border/40"
                  >
                    <span className="text-[14px] font-medium text-foreground">
                      {item.unitName}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {item.openActionCount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
              Histórico e Versões
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                      Título
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                      Revisão ativa
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                      Próxima revisão
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                      Pendências
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr
                      key={plan.id}
                      className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() =>
                        navigate(`/governanca/planejamento/${plan.id}`)
                      }
                    >
                      <td className="px-3 py-3 font-medium text-foreground">
                        {plan.title}
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {GOVERNANCE_STATUS_LABELS[plan.status] || plan.status}
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        R{plan.activeRevisionNumber || 0}
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {formatGovernanceDate(plan.nextReviewAt)}
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {plan.complianceIssues.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Landmark className="h-9 w-9 text-muted-foreground/40" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            Nenhum planejamento estratégico cadastrado
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Crie um plano do zero ou importe a planilha atual.
          </p>
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Novo Planejamento"
        description="Cria um rascunho corporativo da organização."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="governance-plan-title">Título do plano</Label>
            <Input
              id="governance-plan-title"
              value={planTitle}
              onChange={(event) => setPlanTitle(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreatePlan}
            isLoading={createPlanMutation.isPending}
          >
            Criar rascunho
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportPreview(null);
        }}
        title="Importar Planilha"
        description="Lê a planilha Excel, gera um preview e cria ou sobrescreve um rascunho editável."
        size="lg"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-5">
            <Label htmlFor="governance-workbook">Arquivo .xlsx</Label>
            <Input
              id="governance-workbook"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleWorkbookSelect}
              className="mt-2"
            />
          </div>

          {importPreview && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Itens SWOT
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {importPreview.swotCount}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Partes interessadas
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {importPreview.interestedPartyCount}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Objetivos
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {importPreview.objectiveCount}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium">{importPreview.planTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {importPreview.workbookName}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {targetPlanId
                    ? "A importação vai sobrescrever o rascunho editável atual."
                    : "A importação vai criar um novo rascunho para a organização."}
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-950">
                  Alertas de consistência
                </p>
                {importPreview.anomalies.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-900">
                    Nenhuma anomalia identificada na leitura inicial.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 space-y-1">
                    {importPreview.anomalies.map((anomaly) => (
                      <li key={anomaly}>{anomaly}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setImportOpen(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!importPreview}
            isLoading={createPlanMutation.isPending}
          >
            Importar para rascunho
          </Button>
        </DialogFooter>
      </Dialog>

      {isLoading && (
        <div className="text-sm text-muted-foreground">
          Carregando planejamento estratégico...
        </div>
      )}
    </div>
  );
}
