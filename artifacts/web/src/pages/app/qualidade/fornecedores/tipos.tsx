import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHeaderActions,
  usePageSubtitle,
  usePageTitle,
} from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  createSupplierType,
  listSupplierCategories,
  listSupplierTypes,
  suppliersKeys,
  updateSupplierType,
} from "@/lib/suppliers-client";
import { ArrowLeft, Plus } from "lucide-react";

type SupplierTypeFormState = {
  name: string;
  description: string;
  documentThreshold: string;
  categoryId: string;
  parentTypeId: string;
  status: "active" | "inactive";
};

const emptyForm: SupplierTypeFormState = {
  name: "",
  description: "",
  documentThreshold: "80",
  categoryId: "",
  parentTypeId: "",
  status: "active",
};

function supplierTypeStatusLabel(status: string) {
  return status === "inactive" ? "Inativo" : "Ativo";
}

export default function SupplierTypesPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageSuppliers = role === "org_admin" || role === "platform_admin";

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<SupplierTypeFormState>(emptyForm);

  usePageTitle("Tipos de fornecedores");
  usePageSubtitle(
    "Defina os tipos operacionais e o threshold documental aplicado em cada um deles.",
  );

  useHeaderActions(
    <div className="flex items-center gap-2">
      <HeaderActionButton
        variant="outline"
        size="sm"
        onClick={() => navigate("/app/qualidade/fornecedores")}
        label="Voltar"
        icon={<ArrowLeft className="h-3.5 w-3.5" />}
      />
      {canManageSuppliers ? (
        <HeaderActionButton
          size="sm"
          onClick={() => {
            setIsCreatingNew(true);
            setSelectedId(null);
            setForm(emptyForm);
          }}
          label="Novo tipo"
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Novo tipo
        </HeaderActionButton>
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

  const categories = categoriesQuery.data || [];
  const types = typesQuery.data || [];
  const selectedType = types.find((type) => type.id === selectedId) || null;

  useEffect(() => {
    if (isCreatingNew) return;
    if (types.length === 0) {
      setSelectedId(null);
      setForm(emptyForm);
      return;
    }
    if (!selectedId || !types.some((type) => type.id === selectedId)) {
      setSelectedId(types[0].id);
    }
  }, [isCreatingNew, selectedId, types]);

  useEffect(() => {
    if (!selectedType || isCreatingNew) return;
    setForm({
      name: selectedType.name,
      description: selectedType.description || "",
      documentThreshold: String(selectedType.documentThreshold),
      categoryId: selectedType.categoryId
        ? String(selectedType.categoryId)
        : "",
      parentTypeId: selectedType.parentTypeId
        ? String(selectedType.parentTypeId)
        : "",
      status: selectedType.status as "active" | "inactive",
    });
  }, [isCreatingNew, selectedType]);

  const parentTypeOptions = useMemo(
    () => types.filter((type) => type.id !== selectedId),
    [selectedId, types],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const threshold = Number(form.documentThreshold);
      if (!form.name.trim()) {
        throw new Error("Informe o nome do tipo.");
      }
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        throw new Error("O threshold documental deve estar entre 0 e 100.");
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        documentThreshold: threshold,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        parentTypeId: form.parentTypeId ? Number(form.parentTypeId) : null,
        status: form.status,
      };

      if (selectedType && !isCreatingNew) {
        return {
          action: "update" as const,
          type: await updateSupplierType(orgId!, selectedType.id, payload),
        };
      }

      return {
        action: "create" as const,
        type: await createSupplierType(orgId!, payload),
      };
    },
    onSuccess: ({ action, type }) => {
      refresh();
      setIsCreatingNew(false);
      setSelectedId(type.id);
      toast({
        title: action === "create" ? "Tipo criado" : "Tipo atualizado",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao salvar tipo",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Tipos</CardTitle>
              <Badge variant="secondary">{types.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              O threshold documental agora fica no tipo e é aplicado
              automaticamente na avaliação AVA1.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {types.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Nenhum tipo cadastrado.
              </div>
            ) : (
              types.map((type) => {
                const categoryName = categories.find(
                  (category) => category.id === type.categoryId,
                )?.name;
                return (
                  <button
                    key={type.id}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedId === type.id && !isCreatingNew
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-border"
                    }`}
                    onClick={() => {
                      setIsCreatingNew(false);
                      setSelectedId(type.id);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">
                        {type.name}
                      </div>
                      <Badge
                        variant={
                          type.status === "active" ? "default" : "secondary"
                        }
                      >
                        {supplierTypeStatusLabel(type.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{categoryName || "Sem categoria"}</span>
                      <span>Threshold {type.documentThreshold}%</span>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {isCreatingNew ? "Novo tipo" : "Detalhes do tipo"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplier-type-name">Nome</Label>
                <Input
                  id="supplier-type-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  disabled={!canManageSuppliers}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-type-category">Categoria</Label>
                <Select
                  id="supplier-type-category"
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
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
                <Label htmlFor="supplier-type-parent">Tipo pai</Label>
                <Select
                  id="supplier-type-parent"
                  value={form.parentTypeId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      parentTypeId: event.target.value,
                    }))
                  }
                  disabled={!canManageSuppliers}
                >
                  <option value="">Nenhum</option>
                  {parentTypeOptions.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-type-threshold">
                  Threshold documental (%)
                </Label>
                <Input
                  id="supplier-type-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={form.documentThreshold}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      documentThreshold: event.target.value,
                    }))
                  }
                  disabled={!canManageSuppliers}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-type-status">Status</Label>
                <Select
                  id="supplier-type-status"
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
              <Label htmlFor="supplier-type-description">Descrição</Label>
              <Textarea
                id="supplier-type-description"
                placeholder="Descreva o escopo operacional desse tipo de fornecedor."
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
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
                    if (selectedType) {
                      setForm({
                        name: selectedType.name,
                        description: selectedType.description || "",
                        documentThreshold: String(
                          selectedType.documentThreshold,
                        ),
                        categoryId: selectedType.categoryId
                          ? String(selectedType.categoryId)
                          : "",
                        parentTypeId: selectedType.parentTypeId
                          ? String(selectedType.parentTypeId)
                          : "",
                        status: selectedType.status as "active" | "inactive",
                      });
                    } else {
                      setForm(emptyForm);
                    }
                  }}
                >
                  Descartar
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "Salvando..." : "Salvar tipo"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Você pode visualizar os tipos, mas não tem permissão para
                editá-los.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
