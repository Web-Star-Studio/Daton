import { useState } from "react";
import {
  useCreatePositionCompetencyRequirement,
  useUpdatePositionCompetencyRequirement,
  useDeletePositionCompetencyRequirement,
  useListCompetencyCatalog,
  useCreateCompetencyCatalogItem,
  getListCompetencyCatalogQueryKey,
  type PositionCompetencyRequirement,
  type CreatePositionCompetencyRequirementBodyCompetencyType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CompetencyBankPanel } from "../_components/competency-bank-panel";
import {
  VincularCompetenciaForm,
  type VincularCompetenciaFormValue,
} from "./_components/VincularCompetenciaForm";
import {
  COMPETENCY_TYPE_LABELS,
  levelLabel,
  levelBadgeClass,
  isCritical,
  levelBucket,
  competencyNamesToLink,
  resolveLinkedCompetencyType,
} from "./cargos-utils";

const LEVEL_OPTIONS = [
  { value: 1, label: "Básico" },
  { value: 3, label: "Intermediário" },
  { value: 5, label: "Avançado" },
];

const EMPTY_LINK: VincularCompetenciaFormValue = {
  competencyNames: [],
  newCompetencyType: "conhecimento",
  requiredLevel: 3,
};

export function CargoCompetenciasTab({
  orgId,
  positionId,
  canManage,
  requirements,
  isLoading,
  isError,
  onChanged,
}: {
  orgId: number;
  positionId: number;
  canManage: boolean;
  requirements: PositionCompetencyRequirement[];
  isLoading: boolean;
  isError: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const createReq = useCreatePositionCompetencyRequirement();
  const updateReq = useUpdatePositionCompetencyRequirement();
  const deleteReq = useDeletePositionCompetencyRequirement();
  const createBankItem = useCreateCompetencyCatalogItem();

  const { data: bankResult } = useListCompetencyCatalog(orgId, {
    query: {
      enabled: !!orgId,
      queryKey: getListCompetencyCatalogQueryKey(orgId),
    },
  });
  const bankItems = bankResult?.data ?? [];

  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<VincularCompetenciaFormValue>(EMPTY_LINK);
  const [bankOpen, setBankOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  const resetAdd = () => {
    setAdding(false);
    setLink(EMPTY_LINK);
  };

  // Vincula em lote as competências escolhidas. Cada vínculo é um POST próprio
  // (o backend não tem endpoint de lote); competências ausentes do catálogo são
  // cadastradas antes, reutilizáveis em outros cargos. Falhas parciais não
  // abortam as demais — as que falham ficam selecionadas para nova tentativa.
  const handleLink = async () => {
    const names = competencyNamesToLink(
      link.competencyNames,
      requirements.map((r) => r.competencyName),
    );
    if (names.length === 0) return;
    setLinking(true);
    try {
      // Nomes já no catálogo (case-insensitive); atualizado a cada criação para
      // não recadastrar dentro do mesmo lote.
      const existingKeys = new Set(
        bankItems.map((i) => i.name.trim().toLowerCase()),
      );
      let bankCreated = false;
      const failed: string[] = [];
      for (const name of names) {
        try {
          // O tipo é propriedade da COMPETÊNCIA (catálogo): existentes usam o
          // tipo do catálogo; novas usam o tipo CHA escolhido no formulário.
          const competencyType = resolveLinkedCompetencyType(
            bankItems,
            name,
            link.newCompetencyType,
          ) as CreatePositionCompetencyRequirementBodyCompetencyType;
          if (!existingKeys.has(name.trim().toLowerCase())) {
            await createBankItem.mutateAsync({
              orgId,
              data: { name, competencyType },
            });
            existingKeys.add(name.trim().toLowerCase());
            bankCreated = true;
          }
          await createReq.mutateAsync({
            orgId,
            posId: positionId,
            data: {
              competencyName: name,
              competencyType,
              requiredLevel: link.requiredLevel,
            },
          });
        } catch {
          failed.push(name);
        }
      }
      if (bankCreated) {
        queryClient.invalidateQueries({
          queryKey: getListCompetencyCatalogQueryKey(orgId),
        });
      }
      onChanged();
      if (failed.length > 0) {
        toast({
          title:
            failed.length === names.length
              ? "Não foi possível vincular as competências"
              : `Vinculadas ${names.length - failed.length} de ${names.length}`,
          description: `Falha em: ${failed.join(", ")}. Verifique se já não estavam vinculadas a este cargo.`,
          variant: "destructive",
        });
        // Mantém apenas as que falharam para nova tentativa.
        setLink((f) => ({ ...f, competencyNames: failed }));
      } else {
        resetAdd();
      }
    } finally {
      setLinking(false);
    }
  };

  const handleLevelChange = async (
    req: PositionCompetencyRequirement,
    requiredLevel: number,
  ) => {
    try {
      await updateReq.mutateAsync({
        orgId,
        posId: positionId,
        requirementId: req.id,
        data: {
          competencyName: req.competencyName,
          competencyType: req.competencyType,
          requiredLevel,
        },
      });
      onChanged();
    } catch {
      toast({
        title: "Não foi possível alterar o nível",
        variant: "destructive",
      });
    }
  };

  const handleRemove = async (req: PositionCompetencyRequirement) => {
    try {
      await deleteReq.mutateAsync({
        orgId,
        posId: positionId,
        requirementId: req.id,
      });
      onChanged();
    } catch {
      toast({
        title: "Não foi possível remover a competência",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setBankOpen(true)}
          >
            Gerenciar competências
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Vincular competência
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        <span className="text-red-600">●</span> crítica — nível requerido pelo
        cargo
      </p>

      {adding && canManage && (
        <VincularCompetenciaForm
          bankItems={bankItems}
          linkedNames={requirements.map((r) => r.competencyName)}
          value={link}
          onChange={setLink}
          onSubmit={handleLink}
          onCancel={resetAdd}
          submitting={linking}
        />
      )}

      {isError ? (
        <p className="py-6 text-center text-sm text-red-600">
          Não foi possível carregar as competências.
        </p>
      ) : isLoading ? (
        <p className="py-6 text-sm text-muted-foreground">Carregando...</p>
      ) : requirements.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Este cargo ainda não tem competências vinculadas.
        </p>
      ) : (
        <div className="divide-y">
          {requirements.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
                  {COMPETENCY_TYPE_LABELS[r.competencyType] ?? r.competencyType}
                </span>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <select
                    value={String(levelBucket(r.requiredLevel))}
                    onChange={(e) =>
                      handleLevelChange(r, Number(e.target.value))
                    }
                    aria-label="Nível requerido"
                    className={cn(
                      "h-7 cursor-pointer rounded-md border px-2 text-[11px] font-medium",
                      levelBadgeClass(r.requiredLevel),
                    )}
                  >
                    {LEVEL_OPTIONS.map((l) => (
                      <option
                        key={l.value}
                        value={l.value}
                        className="bg-background text-foreground"
                      >
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remover competência"
                    onClick={() => handleRemove(r)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Badge
                  className={cn(
                    "shrink-0 border",
                    levelBadgeClass(r.requiredLevel),
                  )}
                >
                  {levelLabel(r.requiredLevel)}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={bankOpen}
        onOpenChange={setBankOpen}
        title="Gerenciar competências"
        description="Catálogo de competências reutilizáveis da organização"
        size="lg"
      >
        <CompetencyBankPanel
          orgId={orgId}
          canWrite={canManage}
          onChange={onChanged}
        />
      </Dialog>
    </div>
  );
}
