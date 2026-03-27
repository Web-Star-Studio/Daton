import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  createSupplierDocumentRequirement,
  listSupplierCategories,
  listSupplierDocumentRequirements,
  listSupplierTypes,
  suppliersKeys,
  updateSupplierDocumentRequirement,
} from "@/lib/suppliers-client";
import { ArrowLeft, Plus } from "lucide-react";

type RequirementFormState = {
  name: string;
  description: string;
  weight: string;
  categoryId: string;
  typeId: string;
  status: "active" | "inactive";
};

const emptyForm: RequirementFormState = {
  name: "",
  description: "",
  weight: "1",
  categoryId: "",
  typeId: "",
  status: "active",
};

function requirementStatusLabel(status: string) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export default function SupplierDocumentRequirementsPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageSuppliers = role === "org_admin" || role === "platform_admin";

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<RequirementFormState>(emptyForm);

  usePageTitle("Requisitos documentais");
  usePageSubtitle("Centralize o catálogo de documentos obrigatórios usados na análise dos fornecedores.");

  useHeaderActions(
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/fornecedores")}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Voltar
      </Button>
      {canManageSuppliers ? (
        <Button
          size="sm"
          onClick={() => {
            setIsCreatingNew(true);
            setSelectedId(null);
            setForm(emptyForm);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo requisito
        </Button>
      ) : null}
    </div>,
  );

  const categoriesQuery = useQuery({
    queryKey: suppliersKeys.categories(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierCategories(orgId!),
  });
  const typesQuery = useQuery({
    queryKey: suppliersKeys.types(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierTypes(orgId!),
  });
  const requirementsQuery = useQuery({
    queryKey: suppliersKeys.requirements(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierDocumentRequirements(orgId!),
  });

  const categories = categoriesQuery.data || [];
  const types = typesQuery.data || [];
  const requirements = requirementsQuery.data || [];
  const selectedRequirement = requirements.find((requirement) => requirement.id === selectedId) || null;

  useEffect(() => {
    if (isCreatingNew) return;
    if (requirements.length === 0) {
      setSelectedId(null);
      setForm(emptyForm);
      return;
    }
    if (!selectedId || !requirements.some((requirement) => requirement.id === selectedId)) {
      setSelectedId(requirements[0].id);
    }
  }, [isCreatingNew, requirements, selectedId]);

  useEffect(() => {
    if (!selectedRequirement || isCreatingNew) return;
    setForm({
      name: selectedRequirement.name,
      description: selectedRequirement.description || "",
      weight: String(selectedRequirement.weight),
      categoryId: selectedRequirement.categoryId ? String(selectedRequirement.categoryId) : "",
      typeId: selectedRequirement.typeId ? String(selectedRequirement.typeId) : "",
      status: selectedRequirement.status as "active" | "inactive",
    });
  }, [isCreatingNew, selectedRequirement]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const weight = Number(form.weight);
      if (!form.name.trim()) {
        throw new Error("Informe o nome do requisito documental.");
      }
      if (!Number.isFinite(weight) || weight < 1 || weight > 5) {
        throw new Error("O peso deve estar entre 1 e 5.");
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        weight,
        status: form.status,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        typeId: form.typeId ? Number(form.typeId) : null,
      };

      if (selectedRequirement && !isCreatingNew) {
        return {
          action: "update" as const,
          requirement: await updateSupplierDocumentRequirement(orgId!, selectedRequirement.id, payload),
        };
      }

      return {
        action: "create" as const,
        requirement: await createSupplierDocumentRequirement(orgId!, payload),
      };
    },
    onSuccess: ({ action, requirement }) => {
      refresh();
      setIsCreatingNew(false);
      setSelectedId(requirement.id);
      toast({
        title: action === "create" ? "Requisito criado" : "Requisito atualizado",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao salvar requisito documental",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Requisitos</CardTitle>
              <Badge variant="secondary">{requirements.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Gerencie o catálogo oficial de documentos exigidos nas submissões dos fornecedores.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {requirements.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Nenhum requisito documental cadastrado.
              </div>
            ) : (
              requirements.map((requirement) => {
                const categoryName = categories.find((category) => category.id === requirement.categoryId)?.name;
                const typeName = types.find((type) => type.id === requirement.typeId)?.name;

                return (
                  <button
                    key={requirement.id}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedId === requirement.id && !isCreatingNew
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-border"
                    }`}
                    onClick={() => {
                      setIsCreatingNew(false);
                      setSelectedId(requirement.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">{requirement.name}</div>
                      <Badge variant={requirement.status === "active" ? "default" : "secondary"}>
                        {requirementStatusLabel(requirement.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{categoryName || "Sem categoria"}</span>
                      <span>{typeName || "Sem tipo"}</span>
                      <span>Peso {requirement.weight}</span>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isCreatingNew ? "Novo requisito documental" : "Detalhes do requisito documental"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplier-requirement-name">Nome</Label>
                <Input
                  id="supplier-requirement-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={!canManageSuppliers}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-requirement-category">Categoria</Label>
                <Select
                  id="supplier-requirement-category"
                  value={form.categoryId}
                  onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                  disabled={!canManageSuppliers}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-requirement-type">Tipo</Label>
                <Select
                  id="supplier-requirement-type"
                  value={form.typeId}
                  onChange={(event) => setForm((current) => ({ ...current, typeId: event.target.value }))}
                  disabled={!canManageSuppliers}
                >
                  <option value="">Sem tipo</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-requirement-weight">Peso</Label>
                <Input
                  id="supplier-requirement-weight"
                  type="number"
                  min={1}
                  max={5}
                  value={form.weight}
                  onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
                  disabled={!canManageSuppliers}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-requirement-status">Status</Label>
                <Select
                  id="supplier-requirement-status"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as "active" | "inactive",
                    }))
                  }
                  disabled={!canManageSuppliers}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-requirement-description">Descrição</Label>
              <Textarea
                id="supplier-requirement-description"
                placeholder="Explique quando esse documento é exigido e como deve ser analisado."
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                disabled={!canManageSuppliers}
              />
            </div>

            {canManageSuppliers ? (
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreatingNew(false);
                    if (selectedRequirement) {
                      setForm({
                        name: selectedRequirement.name,
                        description: selectedRequirement.description || "",
                        weight: String(selectedRequirement.weight),
                        categoryId: selectedRequirement.categoryId ? String(selectedRequirement.categoryId) : "",
                        typeId: selectedRequirement.typeId ? String(selectedRequirement.typeId) : "",
                        status: selectedRequirement.status as "active" | "inactive",
                      });
                    } else {
                      setForm(emptyForm);
                    }
                  }}
                >
                  Descartar
                </Button>
                <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar requisito"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Você pode visualizar os requisitos, mas não tem permissão para editá-los.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
