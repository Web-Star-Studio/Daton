import { useState } from "react";
import {
  useListPositions,
  useListPositionCompetencyRequirements,
  getListPositionCompetencyRequirementsQueryKey,
} from "@workspace/api-client-react";
import type { PositionCompetencyRequirement } from "@workspace/api-client-react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CompetencyBankPanel } from "../_components/competency-bank-panel";

const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  conhecimento: "Conhecimento",
  habilidade: "Habilidade",
  atitude: "Atitude",
};

// Nível requerido (0–5) → rótulo e cor, seguindo a leitura do mockup
// (Básico / Intermediário / Avançado).
function levelLabel(level: number): string {
  if (level >= 4) return "Avançado";
  if (level >= 3) return "Intermediário";
  if (level >= 1) return "Básico";
  return "—";
}

function levelBadgeClass(level: number): string {
  if (level >= 4) return "bg-red-50 text-red-700 border-red-200";
  if (level >= 3) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

// Domínio: nível requerido alto (>= 4) marca a competência como crítica —
// mesma régua usada no gap de competências do colaborador.
function isCritical(level: number): boolean {
  return level >= 4;
}

export default function AprendizagemCargosPage() {
  usePageTitle("Cargos e competências");
  const { user } = useAuth();
  const orgId = user?.organizationId ?? 0;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("employees");

  const { data: positions, isLoading: positionsLoading } = useListPositions(
    orgId,
    { query: { enabled: !!orgId } },
  );
  const positionList = positions ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Pré-seleciona o primeiro cargo (o mockup abre já com um cargo em detalhe).
  const effectiveSelectedId =
    selectedId ?? (positionList.length > 0 ? positionList[0].id : null);
  const selectedPosition =
    positionList.find((p) => p.id === effectiveSelectedId) ?? null;

  const { data: requirements, isLoading: reqsLoading } =
    useListPositionCompetencyRequirements(orgId, effectiveSelectedId ?? 0, {
      query: {
        enabled: !!orgId && !!effectiveSelectedId,
        queryKey: getListPositionCompetencyRequirementsQueryKey(
          orgId,
          effectiveSelectedId ?? 0,
        ),
      },
    });
  const sortedReqs: PositionCompetencyRequirement[] = [
    ...(requirements ?? []),
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  if (!orgId) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Matriz de competências requeridas por cargo — ISO 10015 §4.2
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cargos cadastrados */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Cargos cadastrados</span>
            <Badge className="bg-muted text-muted-foreground">
              {positionList.length} cargo{positionList.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {positionsLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : positionList.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhum cargo cadastrado.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {positionList.map((p) => {
                const active = p.id === effectiveSelectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-b px-4 py-3 text-left transition-colors last:border-0",
                      active ? "bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {p.name}
                      </p>
                      {p.level ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {p.level}
                        </p>
                      ) : null}
                    </div>
                    {active ? (
                      <span className="shrink-0 text-xs font-medium text-primary">
                        Selecionado
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhe — cargo selecionado */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <span className="truncate text-sm font-semibold">
              {selectedPosition
                ? `Detalhe — ${selectedPosition.name}`
                : "Detalhe"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {selectedPosition ? `${sortedReqs.length} · ` : ""}
              <span className="text-red-600">●</span> crítica
            </span>
          </div>
          {!selectedPosition ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Selecione um cargo para ver a matriz de competências.
            </p>
          ) : reqsLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : sortedReqs.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Este cargo ainda não tem competências requeridas definidas.
            </p>
          ) : (
            <div className="divide-y">
              {sortedReqs.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {isCritical(r.requiredLevel) ? (
                      <span
                        className="shrink-0 text-red-600"
                        title="Competência crítica"
                      >
                        ●
                      </span>
                    ) : null}
                    <span className="truncate text-[13px] text-foreground">
                      {r.competencyName}
                    </span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {COMPETENCY_TYPE_LABELS[r.competencyType] ??
                        r.competencyType}
                    </span>
                  </div>
                  <Badge
                    className={cn(
                      "shrink-0 border",
                      levelBadgeClass(r.requiredLevel),
                    )}
                  >
                    {levelLabel(r.requiredLevel)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Banco de competências */}
      <CompetencyBankPanel orgId={orgId} canWrite={canWrite} />
    </div>
  );
}
