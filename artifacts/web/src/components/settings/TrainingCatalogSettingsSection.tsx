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
import {
  useAllTrainingCatalogOptions,
  optionsOfKind,
  type TrainingCatalogOption,
  type TrainingCatalogOptionKind,
} from "@/lib/training-catalog-options-client";
import {
  useCreateTrainingCatalogOption,
  useUpdateTrainingCatalogOption,
  getListTrainingCatalogOptionsQueryKey,
} from "@workspace/api-client-react";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "data" in err) {
    const message = (err as { data?: { error?: string } }).data?.error;
    if (message) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function OptionRow({
  option,
  orgId,
  onChanged,
}: {
  option: TrainingCatalogOption;
  orgId: number;
  onChanged: () => void;
}) {
  const updateMut = useUpdateTrainingCatalogOption();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(option.label);
  const isEvidence = option.kind === "evidence_type";

  const startEditing = () => {
    setLabel(option.label);
    setIsEditing(true);
  };
  const cancelEditing = () => {
    setLabel(option.label);
    setIsEditing(false);
  };

  const patch = async (
    data: Parameters<typeof updateMut.mutateAsync>[0]["data"],
    errorTitle: string,
  ) => {
    try {
      await updateMut.mutateAsync({ orgId, optionId: option.id, data });
      onChanged();
      return true;
    } catch (err) {
      toast({
        title: errorTitle,
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
      return false;
    }
  };

  const saveLabel = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === option.label) {
      setIsEditing(false);
      return;
    }
    if (await patch({ label: trimmed }, "Erro ao renomear")) {
      setIsEditing(false);
    }
  };

  return (
    <div className="border-b border-border/60 py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                aria-label="Novo nome da opção"
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
                isLoading={updateMut.isPending}
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
                  option.active
                    ? "truncate text-[13px] font-medium text-foreground"
                    : "truncate text-[13px] text-muted-foreground"
                }
              >
                {option.label}
              </span>
              {!option.active && (
                <Badge variant="neutral" className="text-[10px]">
                  Inativo
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
            {option.active ? "Ativo" : "Inativo"}
          </span>
          <Switch
            checked={option.active}
            disabled={updateMut.isPending}
            onCheckedChange={(v) =>
              void patch({ active: v }, "Erro ao atualizar opção")
            }
            aria-label={option.active ? "Desativar opção" : "Ativar opção"}
          />
        </div>
      </div>

      {/* Semântica do tipo de evidência (só p/ evidence_type). */}
      {isEvidence && (
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 pl-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
            <Switch
              checked={option.provesCompetency}
              disabled={updateMut.isPending}
              onCheckedChange={(v) =>
                void patch(
                  { provesCompetency: v },
                  "Erro ao atualizar tipo de evidência",
                )
              }
              aria-label="Comprova competência"
            />
            Comprova competência
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
            <Switch
              checked={option.requiresValidity}
              disabled={updateMut.isPending}
              onCheckedChange={(v) =>
                void patch(
                  { requiresValidity: v },
                  "Erro ao atualizar tipo de evidência",
                )
              }
              aria-label="Tem validade"
            />
            Tem validade
          </label>
        </div>
      )}
    </div>
  );
}

function OptionListManager({
  orgId,
  kind,
  title,
  description,
  placeholder,
  options,
  onChanged,
}: {
  orgId: number;
  kind: TrainingCatalogOptionKind;
  title: string;
  description: string;
  placeholder: string;
  options: TrainingCatalogOption[];
  onChanged: () => void;
}) {
  const createMut = useCreateTrainingCatalogOption();
  const [newLabel, setNewLabel] = useState("");
  const [newProves, setNewProves] = useState(false);
  const [newValidity, setNewValidity] = useState(false);
  const isEvidence = kind === "evidence_type";

  const handleCreate = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    try {
      await createMut.mutateAsync({
        orgId,
        data: isEvidence
          ? {
              kind,
              label: trimmed,
              provesCompetency: newProves,
              requiresValidity: newValidity,
            }
          : { kind, label: trimmed },
      });
      setNewLabel("");
      setNewProves(false);
      setNewValidity(false);
      onChanged();
    } catch (err) {
      toast({
        title: "Erro ao adicionar",
        description: extractErrorMessage(err, "Tente novamente."),
        variant: "destructive",
      });
    }
  };

  const inputId = `new-training-option-${kind}`;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-end gap-2">
          <div className="max-w-sm flex-1">
            <Label htmlFor={inputId}>Nova opção</Label>
            <Input
              id={inputId}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder={placeholder}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleCreate}
            isLoading={createMut.isPending}
            disabled={!newLabel.trim()}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Adicionar
          </Button>
        </div>
        {isEvidence && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
              <Switch
                checked={newProves}
                onCheckedChange={setNewProves}
                aria-label="Comprova competência"
              />
              Comprova competência
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
              <Switch
                checked={newValidity}
                onCheckedChange={setNewValidity}
                aria-label="Tem validade"
              />
              Tem validade
            </label>
          </div>
        )}
      </div>

      <div className="mt-6">
        {options.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            Nenhuma opção cadastrada ainda.
          </div>
        ) : (
          <div>
            {options.map((option) => (
              <OptionRow
                key={option.id}
                option={option}
                orgId={orgId}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function TrainingCatalogSettingsSection() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const { data: all = [], isLoading } = useAllTrainingCatalogOptions(
    orgId ?? 0,
  );

  const invalidate = () => {
    if (!orgId) return;
    queryClient.invalidateQueries({
      queryKey: getListTrainingCatalogOptionsQueryKey(orgId),
    });
  };

  if (!orgId) return null;

  const categories = optionsOfKind(all, "category");
  const modalities = optionsOfKind(all, "modality");
  const evidenceTypes = optionsOfKind(all, "evidence_type");
  const developmentNatures = optionsOfKind(all, "development_nature");
  const knowledgeAreas = optionsOfKind(all, "knowledge_area");

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OptionListManager
        orgId={orgId}
        kind="category"
        title="Tipos de treinamento"
        description="Alimentam o seletor “Tipo de Treinamento” do catálogo de treinamentos. Desative em vez de excluir para preservar os treinamentos que já usam o tipo."
        placeholder="Ex.: Onboarding"
        options={categories}
        onChanged={invalidate}
      />
      <OptionListManager
        orgId={orgId}
        kind="modality"
        title="Modalidades de treinamento"
        description="Alimentam o seletor “Modalidade” do catálogo de treinamentos (presencial, EAD, etc.). Desative em vez de excluir para preservar o que já está em uso."
        placeholder="Ex.: Autoinstrucional"
        options={modalities}
        onChanged={invalidate}
      />
      <OptionListManager
        orgId={orgId}
        kind="evidence_type"
        title="Tipos de evidência"
        description="Classificam o que um treinamento comprova. “Comprova competência” liga o treino à competência-alvo (capacitação/habilitação); os que não comprovam (conscientização) não geram vínculo. “Tem validade” sinaliza treinos com vencimento (ex.: habilitação). Alterar “Comprova competência” afeta os treinamentos já classificados com o tipo."
        placeholder="Ex.: Palestra"
        options={evidenceTypes}
        onChanged={invalidate}
      />
      <OptionListManager
        orgId={orgId}
        kind="development_nature"
        title="Natureza do desenvolvimento"
        description="Alimenta o seletor “Natureza do desenvolvimento” do catálogo de treinamentos. Começa sem opções — cadastre as usadas pela sua organização."
        placeholder="Ex.: Interno"
        options={developmentNatures}
        onChanged={invalidate}
      />
      <OptionListManager
        orgId={orgId}
        kind="knowledge_area"
        title="Áreas do conhecimento"
        description="Alimenta o seletor “Área do conhecimento” do catálogo de treinamentos. Começa sem opções — cadastre as áreas usadas pela sua organização."
        placeholder="Ex.: Segurança do trabalho"
        options={knowledgeAreas}
        onChanged={invalidate}
      />
    </div>
  );
}
