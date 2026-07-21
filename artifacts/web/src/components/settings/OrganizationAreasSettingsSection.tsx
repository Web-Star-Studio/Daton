import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useAllAreas } from "@/lib/areas-client";
import {
  useCreateArea,
  useUpdateArea,
  getListAreasQueryKey,
  type Area,
} from "@workspace/api-client-react";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "data" in err) {
    const message = (err as { data?: { error?: string } }).data?.error;
    if (message) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function AreaRow({
  area,
  orgId,
  onChanged,
}: {
  area: Area;
  orgId: number;
  onChanged: () => void;
}) {
  const updateAreaMut = useUpdateArea();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(area.label);

  const startEditing = () => {
    setLabel(area.label);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setLabel(area.label);
    setIsEditing(false);
  };

  const saveLabel = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === area.label) {
      setIsEditing(false);
      return;
    }
    try {
      await updateAreaMut.mutateAsync({
        orgId,
        areaId: area.id,
        data: { label: trimmed },
      });
      onChanged();
      setIsEditing(false);
    } catch (err) {
      toast({
        title: "Erro ao renomear área",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const toggleActive = async () => {
    try {
      await updateAreaMut.mutateAsync({
        orgId,
        areaId: area.id,
        data: { active: !area.active },
      });
      onChanged();
    } catch (err) {
      toast({
        title: "Erro ao atualizar área",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label="Novo nome da área"
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
              isLoading={updateAreaMut.isPending}
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
                area.active
                  ? "truncate text-[13px] font-medium text-foreground"
                  : "truncate text-[13px] text-muted-foreground"
              }
            >
              {area.label}
            </span>
            {!area.active && (
              <Badge variant="neutral" className="text-[10px]">
                Inativa
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
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {area.active ? "Ativa" : "Inativa"}
        </span>
        <Switch
          checked={area.active}
          disabled={updateAreaMut.isPending}
          onCheckedChange={toggleActive}
          aria-label={area.active ? "Desativar área" : "Ativar área"}
        />
      </div>
    </div>
  );
}

export function OrganizationAreasSettingsSection() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const { data: areas = [], isLoading } = useAllAreas(orgId ?? 0);
  const createAreaMut = useCreateArea();
  const [newLabel, setNewLabel] = useState("");

  const invalidate = () => {
    if (!orgId) return;
    queryClient.invalidateQueries({ queryKey: getListAreasQueryKey(orgId) });
  };

  const handleCreate = async () => {
    if (!orgId) return;
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    try {
      await createAreaMut.mutateAsync({ orgId, data: { label: trimmed } });
      setNewLabel("");
      invalidate();
    } catch (err) {
      toast({
        title: "Erro ao adicionar área",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  if (!orgId) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground">Áreas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Catálogo de áreas (setores) de cargo da organização. Essas áreas
          alimentam o seletor de "Área" no cadastro de cargos — desative em vez
          de excluir para preservar os cargos que já a referenciam.
        </p>
      </div>

      <div className="mt-5 flex items-end gap-2">
        <div className="max-w-sm flex-1">
          <Label htmlFor="new-area-label">Nova área</Label>
          <Input
            id="new-area-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="Ex.: Comercial, Segurança do Trabalho..."
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          isLoading={createAreaMut.isPending}
          disabled={!newLabel.trim()}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : areas.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            Nenhuma área cadastrada ainda.
          </div>
        ) : (
          <div>
            {areas.map((area) => (
              <AreaRow
                key={area.id}
                area={area}
                orgId={orgId}
                onChanged={invalidate}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
