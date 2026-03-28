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
  createSupplierCategory,
  listSupplierCategories,
  suppliersKeys,
  updateSupplierCategory,
} from "@/lib/suppliers-client";
import { ArrowLeft, Plus } from "lucide-react";

type CategoryFormState = {
  name: string;
  description: string;
  status: "active" | "inactive";
};

const emptyForm: CategoryFormState = {
  name: "",
  description: "",
  status: "active",
};

function categoryStatusLabel(status: string) {
  return status === "inactive" ? "Inativa" : "Ativa";
}

export default function SupplierCategoriesPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageSuppliers = role === "org_admin" || role === "platform_admin";

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);

  usePageTitle("Categorias de fornecedores");
  usePageSubtitle("Gerencie as categorias usadas no cadastro e na classificação dos fornecedores.");

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
          Nova categoria
        </Button>
      ) : null}
    </div>,
  );

  const categoriesQuery = useQuery({
    queryKey: suppliersKeys.categories(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierCategories(orgId!),
  });

  const categories = categoriesQuery.data || [];
  const selectedCategory = categories.find((category) => category.id === selectedId) || null;

  useEffect(() => {
    if (isCreatingNew) return;
    if (categories.length === 0) {
      setSelectedId(null);
      setForm(emptyForm);
      return;
    }
    if (!selectedId || !categories.some((category) => category.id === selectedId)) {
      setSelectedId(categories[0].id);
    }
  }, [categories, isCreatingNew, selectedId]);

  useEffect(() => {
    if (!selectedCategory || isCreatingNew) return;
    setForm({
      name: selectedCategory.name,
      description: selectedCategory.description || "",
      status: selectedCategory.status as "active" | "inactive",
    });
  }, [isCreatingNew, selectedCategory]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
      };

      if (!payload.name) {
        throw new Error("Informe o nome da categoria.");
      }

      if (selectedCategory && !isCreatingNew) {
        return {
          action: "update" as const,
          category: await updateSupplierCategory(orgId!, selectedCategory.id, payload),
        };
      }

      return {
        action: "create" as const,
        category: await createSupplierCategory(orgId!, payload),
      };
    },
    onSuccess: ({ action, category }) => {
      refresh();
      setIsCreatingNew(false);
      setSelectedId(category.id);
      toast({
        title: action === "create" ? "Categoria criada" : "Categoria atualizada",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao salvar categoria",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Categorias</CardTitle>
              <Badge variant="secondary">{categories.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Cada categoria organiza fornecedores, tipos e requisitos documentais relacionados.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Nenhuma categoria cadastrada.
              </div>
            ) : (
              categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedId === category.id && !isCreatingNew
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:border-border"
                  }`}
                  onClick={() => {
                    setIsCreatingNew(false);
                    setSelectedId(category.id);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-foreground">{category.name}</div>
                    <Badge variant={category.status === "active" ? "default" : "secondary"}>
                      {categoryStatusLabel(category.status)}
                    </Badge>
                  </div>
                  {category.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{category.description}</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Sem descrição cadastrada.</p>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isCreatingNew ? "Nova categoria" : "Detalhes da categoria"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplier-category-name">Nome</Label>
                <Input
                  id="supplier-category-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={!canManageSuppliers}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-category-status">Status</Label>
                <Select
                  id="supplier-category-status"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as "active" | "inactive",
                    }))
                  }
                  disabled={!canManageSuppliers}
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-category-description">Descrição</Label>
              <Textarea
                id="supplier-category-description"
                placeholder="Descreva quando essa categoria deve ser usada."
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
                    if (selectedCategory) {
                      setForm({
                        name: selectedCategory.name,
                        description: selectedCategory.description || "",
                        status: selectedCategory.status as "active" | "inactive",
                      });
                    } else {
                      setForm(emptyForm);
                    }
                  }}
                >
                  Descartar
                </Button>
                <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar categoria"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Você pode visualizar as categorias, mas não tem permissão para editá-las.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
