import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCompetencyCatalog,
  useCreateCompetencyCatalogItem,
  useUpdateCompetencyCatalogItem,
  useDeleteCompetencyCatalogItem,
  getListCompetencyCatalogQueryKey,
} from "@workspace/api-client-react";
import type { CompetencyCatalogItem } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

const TYPES = [
  { value: "conhecimento", label: "Conhecimento" },
  { value: "habilidade", label: "Habilidade" },
  { value: "atitude", label: "Atitude" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TYPES.map((t) => [t.value, t.label]),
);

/**
 * Banco de competências (catálogo gerenciável). Mesmo padrão do PerspectivesPanel
 * do SWOT: adicionar, listar com contagem de uso, renomear inline (propaga no
 * backend) e remover (só do catálogo).
 */
export function CompetencyBankPanel({
  orgId,
  canWrite,
}: {
  orgId: number;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: result, isLoading } = useListCompetencyCatalog(orgId, {
    query: {
      enabled: !!orgId,
      queryKey: getListCompetencyCatalogQueryKey(orgId),
    },
  });
  const items = result?.data ?? [];

  const createMutation = useCreateCompetencyCatalogItem();
  const updateMutation = useUpdateCompetencyCatalogItem();
  const deleteMutation = useDeleteCompetencyCatalogItem();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListCompetencyCatalogQueryKey(orgId),
    });

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("habilidade");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    await createMutation.mutateAsync({
      orgId,
      data: { name, competencyType: newType },
    });
    invalidate();
    setNewName("");
  };

  const saveEdit = async (item: CompetencyCatalogItem) => {
    const name = editName.trim();
    if (!name || name === item.name) {
      setEditingId(null);
      return;
    }
    await updateMutation.mutateAsync({ orgId, itemId: item.id, data: { name } });
    invalidate();
    setEditingId(null);
  };

  const remove = async (item: CompetencyCatalogItem) => {
    if (
      !window.confirm(
        `Remover "${item.name}" do banco? Os usos existentes preservam o texto.`,
      )
    )
      return;
    await deleteMutation.mutateAsync({ orgId, itemId: item.id });
    invalidate();
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Banco de competências</h3>
        <Badge className="bg-muted text-muted-foreground">{items.length}</Badge>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Catálogo reutilizável de competências. Renomear aqui atualiza os usos na
        matriz e nos colaboradores; remover só tira do catálogo.
      </p>

      {canWrite ? (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs font-semibold text-muted-foreground">
              Nova competência
            </Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitNew();
                }
              }}
              placeholder="Ex.: Direção segura"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">
              Tipo
            </Label>
            <Select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="mt-1 w-auto"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            onClick={() => void submitNew()}
            disabled={!newName.trim() || createMutation.isPending}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma competência no catálogo ainda{canWrite ? " — adicione acima" : ""}.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {items.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 bg-card px-3 py-2.5"
              >
                {isEditing ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveEdit(item);
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-8 flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-emerald-600"
                      onClick={() => void saveEdit(item)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm" title={item.name}>
                      {item.name}
                    </span>
                    {item.competencyType ? (
                      <Badge className="bg-blue-50 text-blue-700">
                        {TYPE_LABEL[item.competencyType] ?? item.competencyType}
                      </Badge>
                    ) : null}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.usageCount ? `${item.usageCount} uso(s)` : "não usada"}
                    </span>
                    {canWrite ? (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Renomear"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditName(item.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          title="Remover"
                          onClick={() => void remove(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
