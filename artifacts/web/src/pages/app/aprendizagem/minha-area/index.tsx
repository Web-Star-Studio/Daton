import React, { useState } from "react";
import {
  useGetEmployee,
  getGetEmployeeQueryKey,
  useListOrganizationTrainings,
  getListOrganizationTrainingsQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock } from "lucide-react";

const TRAINING_STATUS_BADGE: Record<string, string> = {
  concluido: "bg-green-50 text-green-700",
  pendente: "bg-amber-50 text-amber-700",
  vencido: "bg-red-50 text-red-700",
};

export default function MinhaAreaPage() {
  usePageTitle("Minha área");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const orgId = user?.organizationId;
  const employeeId = user?.employeeId ?? null;
  const [view, setView] = useState<"colaborador" | "gestor">("colaborador");

  const { data: employee } = useGetEmployee(orgId ?? 0, employeeId ?? 0, {
    query: {
      enabled: !!orgId && !!employeeId,
      queryKey: getGetEmployeeQueryKey(orgId ?? 0, employeeId ?? 0),
    },
  });

  const myTrainingsParams = { employeeId: employeeId ?? 0, pageSize: 200 };
  const { data: myTrainingsResult } = useListOrganizationTrainings(
    orgId ?? 0,
    myTrainingsParams,
    {
      query: {
        enabled: !!orgId && !!employeeId,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId ?? 0,
          myTrainingsParams,
        ),
      },
    },
  );
  const myTrainings = myTrainingsResult?.data ?? [];
  const pendingEff = myTrainings.filter(
    (t) => t.status === "concluido" && t.effectivenessStatus === "pending",
  );
  // Contagens do agregado do servidor (cobre o conjunto inteiro, não só a
  // página de 200). Sem as stats, cai para o cálculo pela página — sempre
  // coerente entre si (nunca total do servidor com demais zerados).
  const s = myTrainingsResult?.stats;
  const counts = s
    ? {
        total: s.total,
        concluidos: s.concluido,
        pendentes: s.pendente,
        vencidos: s.vencido,
      }
    : {
        total: myTrainings.length,
        concluidos: myTrainings.filter((t) => t.status === "concluido").length,
        pendentes: myTrainings.filter((t) => t.status === "pendente").length,
        vencidos: myTrainings.filter((t) => t.status === "vencido").length,
      };

  const teamParams = {
    unitId: employee?.unitId ?? 0,
    effectivenessStatus: "pending" as const,
    pageSize: 200,
  };
  const { data: teamResult } = useListOrganizationTrainings(
    orgId ?? 0,
    teamParams,
    {
      query: {
        enabled: !!orgId && view === "gestor" && !!employee?.unitId,
        queryKey: getListOrganizationTrainingsQueryKey(orgId ?? 0, teamParams),
      },
    },
  );
  const teamPending = teamResult?.data ?? [];

  if (!employeeId) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-16 text-center text-sm text-muted-foreground">
        Sua conta não está vinculada a um colaborador. Peça ao RH para vincular
        seu usuário a um cadastro de colaborador.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho + toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">{employee?.name ?? "—"}</h2>
          <p className="text-sm text-muted-foreground">
            {[employee?.position, employee?.department]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border p-0.5 text-xs">
          <button
            onClick={() => setView("colaborador")}
            className={`rounded-md px-3 py-1 font-medium ${
              view === "colaborador"
                ? "bg-blue-50 text-blue-700"
                : "text-muted-foreground"
            }`}
          >
            Colaborador
          </button>
          <button
            onClick={() => setView("gestor")}
            className={`rounded-md px-3 py-1 font-medium ${
              view === "gestor"
                ? "bg-blue-50 text-blue-700"
                : "text-muted-foreground"
            }`}
          >
            Gestor (filial)
          </button>
        </div>
      </div>

      {view === "colaborador" ? (
        <>
          {/* Tiles de contagem */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Treinamentos" value={counts.total} />
            <StatTile label="Concluídos" value={counts.concluidos} tone="green" />
            <StatTile label="Pendentes" value={counts.pendentes} tone="amber" />
            <StatTile label="Vencidos" value={counts.vencidos} tone="red" />
          </div>

          {/* Alertas do colaborador */}
          {(counts.vencidos > 0 || counts.pendentes > 0) && (
            <div className="space-y-2">
              {counts.vencidos > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Você tem {counts.vencidos} treinamento
                  {counts.vencidos > 1 ? "s" : ""} vencido
                  {counts.vencidos > 1 ? "s" : ""} — regularize com seu gestor/RH.
                </div>
              )}
              {counts.pendentes > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <Clock className="h-4 w-4 shrink-0" />
                  {counts.pendentes} treinamento
                  {counts.pendentes > 1 ? "s" : ""} pendente
                  {counts.pendentes > 1 ? "s" : ""} a concluir.
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
          {/* Meus treinamentos */}
          <Section title={`Meus treinamentos (${counts.total})`}>
            {myTrainings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum treinamento.
              </p>
            ) : (
              <ul className="divide-y">
                {myTrainings.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 py-2 text-sm"
                  >
                    <span className="flex-1 truncate">{t.title}</span>
                    <Badge className={TRAINING_STATUS_BADGE[t.status] ?? ""}>
                      {t.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Minhas competências */}
          <Section title="Minhas competências">
            {(employee?.competencies ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma competência registrada.
              </p>
            ) : (
              <ul className="divide-y">
                {(employee?.competencies ?? []).map((c) => {
                  const gap = (c.acquiredLevel ?? 0) < (c.requiredLevel ?? 0);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 py-2 text-sm"
                    >
                      <span className="flex-1 truncate">{c.name}</span>
                      <CompetencyDots
                        acquired={c.acquiredLevel ?? 0}
                        required={c.requiredLevel ?? 0}
                      />
                      <span className="w-8 text-right text-xs text-muted-foreground">
                        {c.acquiredLevel ?? 0}/{c.requiredLevel ?? 0}
                      </span>
                      {gap ? (
                        <Badge className="bg-amber-50 text-amber-700">
                          Gap
                        </Badge>
                      ) : (
                        <Badge className="bg-green-50 text-green-700">OK</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Avaliações de eficácia pendentes */}
          <Section
            title={`Eficácia pendente (${s?.effectivenessPending ?? pendingEff.length})`}
            className="lg:col-span-2"
          >
            {pendingEff.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma avaliação de eficácia pendente.
              </p>
            ) : (
              <ul className="divide-y">
                {pendingEff.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 py-2 text-sm"
                  >
                    <span className="flex-1 truncate">{t.title}</span>
                    <Badge className="bg-amber-50 text-amber-700">
                      A avaliar
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          </div>
        </>
      ) : (
        <Section
          title={`Pendências de eficácia na filial (${teamPending.length})`}
        >
          {!employee?.unitId ? (
            <p className="text-sm text-muted-foreground">
              Sem filial vinculada ao seu cadastro.
            </p>
          ) : teamPending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma pendência de eficácia na filial.
            </p>
          ) : (
            <ul className="divide-y">
              {teamPending.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1 truncate">
                    {t.employeeName} · {t.title}
                  </span>
                  <Badge className="bg-amber-50 text-amber-700">
                    A avaliar
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/aprendizagem/eficacia")}
            >
              Abrir avaliação de eficácia
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 shadow-sm ${className ?? ""}`}
    >
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const STAT_TONE: Record<string, string> = {
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone ? STAT_TONE[tone] : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** Matriz visual de nível: escala = max(adquirido, requerido). Bolinhas cheias
 *  (nível adquirido) e contorno âmbar (lacuna até o requerido). */
function CompetencyDots({
  acquired,
  required,
}: {
  acquired: number;
  required: number;
}) {
  const total = Math.max(acquired, required, 1);
  return (
    <div className="flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            i < acquired ? "bg-emerald-500" : "border border-amber-400",
          )}
        />
      ))}
    </div>
  );
}
