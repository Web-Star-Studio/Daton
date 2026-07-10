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
import { useAllNorms } from "@/lib/norms-client";
import {
  useCreateNorm,
  useUpdateNorm,
  getListNormsQueryKey,
  type RegulatoryNorm,
} from "@workspace/api-client-react";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "data" in err) {
    const message = (err as { data?: { error?: string } }).data?.error;
    if (message) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function NormRow({
  norm,
  orgId,
  onChanged,
}: {
  norm: RegulatoryNorm;
  orgId: number;
  onChanged: () => void;
}) {
  const updateNormMut = useUpdateNorm();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(norm.label);

  const startEditing = () => {
    setLabel(norm.label);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setLabel(norm.label);
    setIsEditing(false);
  };

  const saveLabel = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === norm.label) {
      setIsEditing(false);
      return;
    }
    try {
      await updateNormMut.mutateAsync({
        orgId,
        normId: norm.id,
        data: { label: trimmed },
      });
      onChanged();
      setIsEditing(false);
    } catch (err) {
      toast({
        title: "Erro ao renomear norma",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const toggleActive = async () => {
    try {
      await updateNormMut.mutateAsync({
        orgId,
        normId: norm.id,
        data: { active: !norm.active },
      });
      onChanged();
    } catch (err) {
      toast({
        title: "Erro ao atualizar norma",
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
              isLoading={updateNormMut.isPending}
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
                norm.active
                  ? "truncate text-[13px] font-medium text-foreground"
                  : "truncate text-[13px] text-muted-foreground"
              }
            >
              {norm.label}
            </span>
            {!norm.active && (
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
          {norm.active ? "Ativa" : "Inativa"}
        </span>
        <Switch
          checked={norm.active}
          disabled={updateNormMut.isPending}
          onCheckedChange={toggleActive}
          aria-label={norm.active ? "Desativar norma" : "Ativar norma"}
        />
      </div>
    </div>
  );
}

export function OrganizationNormsSettingsSection() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const { data: norms = [], isLoading } = useAllNorms(orgId ?? 0);
  const createNormMut = useCreateNorm();
  const [newLabel, setNewLabel] = useState("");

  const invalidate = () => {
    if (!orgId) return;
    queryClient.invalidateQueries({ queryKey: getListNormsQueryKey(orgId) });
  };

  const handleCreate = async () => {
    if (!orgId) return;
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    try {
      await createNormMut.mutateAsync({ orgId, data: { label: trimmed } });
      setNewLabel("");
      invalidate();
    } catch (err) {
      toast({
        title: "Erro ao adicionar norma",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  if (!orgId) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground">Normas</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Catálogo de normas regulatórias da organização. Essas normas alimentam
          os seletores de obrigatoriedade de treinamento e de indicadores —
          desative em vez de excluir para preservar referências já existentes.
        </p>
      </div>

      <div className="mt-5 flex items-end gap-2">
        <div className="max-w-sm flex-1">
          <Label htmlFor="new-norm-label">Nova norma</Label>
          <Input
            id="new-norm-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="Ex.: ISO 14001:2015"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          isLoading={createNormMut.isPending}
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
        ) : norms.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            Nenhuma norma cadastrada ainda.
          </div>
        ) : (
          <div>
            {norms.map((norm) => (
              <NormRow
                key={norm.id}
                norm={norm}
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
