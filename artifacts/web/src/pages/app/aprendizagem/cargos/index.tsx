import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPositions,
  getListPositionsQueryKey,
  useListPositionCompetencyRequirements,
  getListPositionCompetencyRequirementsQueryKey,
  useDeletePosition,
} from "@workspace/api-client-react";
import type {
  Position,
  PositionCompetencyRequirement,
} from "@workspace/api-client-react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAllNorms, buildNormLabelMap } from "@/lib/norms-client";
import { PositionFormDialog } from "./position-form-dialog";
import { CargoCompetenciasTab } from "./cargo-competencias-tab";
import { deriveAreas, filterPositions, buildPositionSubline } from "./cargos-utils";

type DetailTab = "desc" | "comp" | "hab";

export default function AprendizagemCargosPage() {
  usePageTitle("Cargos e competências");
  const { user } = useAuth();
  const orgId = user?.organizationId ?? 0;
  const { canWriteModule, hasModuleAccess } = usePermissions();
  const canWrite = canWriteModule("employees");
  const canManagePositions = canWriteModule("positions");
  const canAccess = hasModuleAccess("employees");
  const queryClient = useQueryClient();

  const {
    data: positions,
    isLoading: positionsLoading,
    isError: positionsError,
  } = useListPositions(orgId, {
    query: {
      enabled: !!orgId && canAccess,
      queryKey: getListPositionsQueryKey(orgId),
    },
  });
  const positionList = positions ?? [];

  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelMap = buildNormLabelMap(allNorms);
  const normLabelOf = (id?: number | null): string | null =>
    id != null ? normLabelMap.get(id) ?? null : null;

  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const areas = deriveAreas(positionList);
  const filtered = filterPositions(positionList, search, areaFilter);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const effectiveSelectedId =
    (selectedId != null && filtered.some((p) => p.id === selectedId)
      ? selectedId
      : filtered[0]?.id) ?? null;
  const selectedPosition =
    positionList.find((p) => p.id === effectiveSelectedId) ?? null;

  const [tab, setTab] = useState<DetailTab>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const deleteMut = useDeletePosition();

  const {
    data: requirements,
    isLoading: reqsLoading,
    isError: reqsError,
  } = useListPositionCompetencyRequirements(orgId, effectiveSelectedId ?? 0, {
    query: {
      enabled: !!orgId && !!effectiveSelectedId && canAccess,
      queryKey: getListPositionCompetencyRequirementsQueryKey(
        orgId,
        effectiveSelectedId ?? 0,
      ),
    },
  });
  const sortedReqs: PositionCompetencyRequirement[] = [
    ...(requirements ?? []),
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  const invalidatePositions = () =>
    queryClient.invalidateQueries({ queryKey: getListPositionsQueryKey(orgId) });

  const onCompetenciesChanged = () => {
    queryClient.invalidateQueries({
      queryKey: getListPositionCompetencyRequirementsQueryKey(
        orgId,
        effectiveSelectedId ?? 0,
      ),
    });
    invalidatePositions();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMut.mutateAsync({ orgId, posId: deleting.id });
      invalidatePositions();
      setDeleting(null);
    } catch {
      toast({
        title: "Não foi possível excluir o cargo",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (!orgId) return null;
  if (!canAccess) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Você não tem acesso a este módulo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Cargos e competências
          </h1>
          <p className="text-sm text-muted-foreground">
            Matriz de competências requeridas por cargo — ISO 10015 §4.2
          </p>
        </div>
        {canManagePositions && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Novo cargo
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar cargo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <Select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="h-10 w-52 text-[13px]"
        >
          <option value="">Todas as áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tabela de cargos */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Cargos cadastrados</span>
            <Badge className="bg-muted text-muted-foreground">
              {filtered.length} cargo{filtered.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {positionsError ? (
            <p className="px-4 py-8 text-center text-sm text-red-600">
              Não foi possível carregar os cargos. Tente novamente.
            </p>
          ) : positionsLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhum cargo encontrado.
            </p>
          ) : (
            <div className="max-h-[62vh] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Cargo</th>
                    <th className="px-4 py-2.5">Área</th>
                    <th className="px-4 py-2.5">Competências</th>
                    <th className="px-4 py-2.5">ISO</th>
                    {canManagePositions && <th className="px-4 py-2.5 w-20" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((p) => {
                    const active = p.id === effectiveSelectedId;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "cursor-pointer text-[13px] transition-colors",
                          active ? "bg-primary/5" : "hover:bg-muted/40",
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.area || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.competencyCount ?? 0} competências
                        </td>
                        <td className="px-4 py-3">
                          {normLabelOf(p.principalNormId) ? (
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {normLabelOf(p.principalNormId)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {canManagePositions && (
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                aria-label="Editar cargo"
                                onClick={() => {
                                  setEditing(p);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                aria-label="Excluir cargo"
                                onClick={() => setDeleting(p)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Painel de detalhe */}
        <div className="rounded-xl border bg-card shadow-sm">
          {!selectedPosition ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Selecione um cargo para ver os detalhes.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selectedPosition.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {buildPositionSubline({
                      area: selectedPosition.area,
                      competencyCount: selectedPosition.competencyCount,
                      normLabel: normLabelOf(selectedPosition.principalNormId),
                    })}
                  </p>
                </div>
                {normLabelOf(selectedPosition.principalNormId) ? (
                  <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {normLabelOf(selectedPosition.principalNormId)}
                  </span>
                ) : null}
              </div>

              <div className="flex gap-1 border-b px-3 pt-2 text-[13px]">
                {(
                  [
                    ["desc", "Descrição"],
                    ["comp", "Competências"],
                    ["hab", "Habilidades"],
                  ] as [DetailTab, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cn(
                      "border-b-2 px-2 py-1.5 transition-colors",
                      tab === key
                        ? "border-primary font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="px-4 py-3">
                {tab === "desc" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                          Escolaridade mínima
                        </p>
                        <p className="mt-0.5 text-xs font-medium">
                          {selectedPosition.education || "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                          Experiência mínima
                        </p>
                        <p className="mt-0.5 text-xs font-medium">
                          {selectedPosition.experience || "—"}
                        </p>
                      </div>
                    </div>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                      {selectedPosition.description ||
                        "Sem descrição cadastrada."}
                    </p>
                  </div>
                )}

                {tab === "comp" && (
                  <CargoCompetenciasTab
                    orgId={orgId}
                    positionId={selectedPosition.id}
                    canManage={canWrite}
                    requirements={sortedReqs}
                    isLoading={reqsLoading}
                    isError={reqsError}
                    onChanged={onCompetenciesChanged}
                  />
                )}

                {tab === "hab" && (
                  <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                    {selectedPosition.requirements ||
                      "Nenhuma habilidade requerida cadastrada."}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>


      {canManagePositions && (
        <PositionFormDialog
          orgId={orgId}
          open={dialogOpen}
          position={editing}
          positions={positionList}
          onClose={() => setDialogOpen(false)}
          onSaved={invalidatePositions}
        />
      )}

      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Excluir cargo"
        description={deleting ? `"${deleting.name}"` : undefined}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Excluir o cargo {deleting ? `"${deleting.name}"` : ""}? Esta ação não
            pode ser desfeita.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deleteMut.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
