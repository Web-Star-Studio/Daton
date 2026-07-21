import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useAllAnalysisMethods } from "@/lib/action-plans-client";
import {
  useUpdateAnalysisMethod,
  getListAnalysisMethodsQueryKey,
  type ActionPlanAnalysisMethod,
} from "@workspace/api-client-react";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "data" in err) {
    const message = (err as { data?: { error?: string } }).data?.error;
    if (message) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function AnalysisMethodRow({
  method,
  orgId,
  isFirst,
  isLast,
  reordering,
  onChanged,
  onMoveUp,
  onMoveDown,
}: {
  method: ActionPlanAnalysisMethod;
  orgId: number;
  isFirst: boolean;
  isLast: boolean;
  reordering: boolean;
  onChanged: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const updateMethodMut = useUpdateAnalysisMethod();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(method.label);

  const startEditing = () => {
    setLabel(method.label);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setLabel(method.label);
    setIsEditing(false);
  };

  const saveLabel = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === method.label) {
      setIsEditing(false);
      return;
    }
    try {
      await updateMethodMut.mutateAsync({
        orgId,
        methodId: method.id,
        data: { label: trimmed },
      });
      onChanged();
      setIsEditing(false);
    } catch (err) {
      toast({
        title: "Erro ao renomear tratativa",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const toggleActive = async () => {
    try {
      await updateMethodMut.mutateAsync({
        orgId,
        methodId: method.id,
        data: { active: !method.active },
      });
      onChanged();
    } catch (err) {
      toast({
        title: "Erro ao atualizar tratativa",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const toggleDefault = async () => {
    try {
      await updateMethodMut.mutateAsync({
        orgId,
        methodId: method.id,
        data: { isDefault: !method.isDefault },
      });
      onChanged();
    } catch (err) {
      toast({
        title: "Erro ao atualizar tratativa",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst || reordering}
          className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Mover para cima"
          aria-label="Mover para cima"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast || reordering}
          className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Mover para baixo"
          aria-label="Mover para baixo"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label="Novo nome da tratativa"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveLabel();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              className="h-8"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={saveLabel}
              isLoading={updateMethodMut.isPending}
              aria-label="Salvar"
              title="Salvar"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={cancelEditing}
              aria-label="Cancelar"
              title="Cancelar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={
                method.active
                  ? "truncate text-[13px] font-medium text-foreground"
                  : "truncate text-[13px] text-muted-foreground"
              }
            >
              {method.label}
            </span>
            {!method.active && (
              <Badge variant="neutral" className="text-[10px]">
                Inativa
              </Badge>
            )}
            {method.isDefault && (
              <Badge variant="secondary" className="text-[10px]">
                Padrão
              </Badge>
            )}
            <button
              type="button"
              onClick={startEditing}
              className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              title="Renomear"
              aria-label="Renomear"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Padrão</span>
          <Switch
            checked={method.isDefault}
            disabled={!method.active || updateMethodMut.isPending}
            onCheckedChange={toggleDefault}
            aria-label={method.isDefault ? "Remover como padrão" : "Marcar como padrão"}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {method.active ? "Ativa" : "Inativa"}
          </span>
          <Switch
            checked={method.active}
            disabled={updateMethodMut.isPending}
            onCheckedChange={toggleActive}
            aria-label={method.active ? "Desativar tratativa" : "Ativar tratativa"}
          />
        </div>
      </div>
    </div>
  );
}

export function OrganizationAnalysisMethodsSettingsSection() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const { data: methods = [], isLoading } = useAllAnalysisMethods(orgId ?? 0);
  const reorderMut = useUpdateAnalysisMethod();

  const invalidate = () => {
    if (!orgId) return;
    queryClient.invalidateQueries({ queryKey: getListAnalysisMethodsQueryKey(orgId) });
  };

  const moveMethod = async (index: number, direction: -1 | 1) => {
    if (!orgId) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= methods.length) return;
    const current = methods[index];
    const neighbor = methods[targetIndex];
    try {
      await Promise.all([
        reorderMut.mutateAsync({
          orgId,
          methodId: current.id,
          data: { sortOrder: neighbor.sortOrder },
        }),
        reorderMut.mutateAsync({
          orgId,
          methodId: neighbor.id,
          data: { sortOrder: current.sortOrder },
        }),
      ]);
      invalidate();
    } catch (err) {
      toast({
        title: "Erro ao reordenar tratativas",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  if (!orgId) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground">Tratativas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Métodos de análise de causa que os planos de ação da sua organização podem usar. Os
          marcados como <strong>padrão</strong> já vêm pré-selecionados ao criar um plano. Desative
          em vez de excluir: planos que já usam uma tratativa continuam exibindo-a.
        </p>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : methods.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            Nenhuma tratativa cadastrada ainda.
          </div>
        ) : (
          <div>
            {methods.map((method, index) => (
              <AnalysisMethodRow
                key={method.id}
                method={method}
                orgId={orgId}
                isFirst={index === 0}
                isLast={index === methods.length - 1}
                reordering={reorderMut.isPending}
                onChanged={invalidate}
                onMoveUp={() => moveMethod(index, -1)}
                onMoveDown={() => moveMethod(index, 1)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
