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

  const myTrainingsParams = { employeeId: employeeId ?? 0 };
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

  const teamParams = {
    unitId: employee?.unitId ?? 0,
    effectivenessStatus: "pending" as const,
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
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Meus treinamentos */}
          <Section title={`Meus treinamentos (${myTrainings.length})`}>
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
                      <span className="text-xs text-muted-foreground">
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
            title={`Eficácia pendente (${pendingEff.length})`}
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
