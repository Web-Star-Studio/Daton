import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { toast } from "@/hooks/use-toast";
import {
  createSupplierCatalogItem,
  listSupplierCatalogItems,
  suppliersKeys,
  updateSupplierCatalogItem,
} from "@/lib/suppliers-client";
import { ArrowLeft, Plus } from "lucide-react";

const catalogItemFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do item."),
  offeringType: z.enum(["product", "service"]),
  unitOfMeasure: z.string(),
  description: z.string(),
  status: z.enum(["active", "inactive"]),
});

type CatalogItemForm = z.infer<typeof catalogItemFormSchema>;

const emptyForm: CatalogItemForm = {
  name: "",
  offeringType: "service",
  unitOfMeasure: "",
  description: "",
  status: "active",
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs text-destructive">{message}</p> : null;
}

export default function SupplierCatalogItemsPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageSuppliers = role === "org_admin" || role === "platform_admin";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const form = useForm<CatalogItemForm>({
    resolver: zodResolver(catalogItemFormSchema),
    defaultValues: emptyForm,
  });

  usePageTitle("Catálogo de produtos e serviços");
  usePageSubtitle("Cadastre itens reutilizáveis e vincule-os aos fornecedores sem recriar escopos locais.");

  const catalogQuery = useQuery({
    queryKey: suppliersKeys.catalogItems(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierCatalogItems(orgId!),
  });

  const items = catalogQuery.data || [];
  const selectedItem = items.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    if (isCreatingNew) return;
    if (items.length === 0) {
      setSelectedId(null);
      form.reset(emptyForm);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [form, isCreatingNew, items, selectedId]);

  useEffect(() => {
    if (!selectedItem || isCreatingNew) return;
    form.reset({
      name: selectedItem.name,
      offeringType: selectedItem.offeringType,
      unitOfMeasure: selectedItem.unitOfMeasure || "",
      description: selectedItem.description || "",
      status: selectedItem.status as "active" | "inactive",
    });
  }, [form, isCreatingNew, selectedItem]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.catalogItems(orgId!) });
    queryClient.invalidateQueries({ queryKey: suppliersKeys.list(orgId!, {}) });
    queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: CatalogItemForm) => {
      const payload = {
        name: values.name.trim(),
        offeringType: values.offeringType,
        unitOfMeasure: values.unitOfMeasure.trim() || null,
        description: values.description.trim() || null,
        status: values.status,
      };

      if (selectedItem && !isCreatingNew) {
        return {
          action: "update" as const,
          item: await updateSupplierCatalogItem(orgId!, selectedItem.id, payload),
        };
      }

      return {
        action: "create" as const,
        item: await createSupplierCatalogItem(orgId!, payload),
      };
    },
    onSuccess: ({ action, item }) => {
      refresh();
      setIsCreatingNew(false);
      setSelectedId(item.id);
      form.reset({
        name: item.name,
        offeringType: item.offeringType,
        unitOfMeasure: item.unitOfMeasure || "",
        description: item.description || "",
        status: item.status as "active" | "inactive",
      });
      toast({ title: action === "create" ? "Item criado" : "Item atualizado" });
    },
    onError: (error) =>
      toast({
        title: "Falha ao salvar item do catálogo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      }),
  });

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
            form.reset(emptyForm);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo item
        </Button>
      ) : null}
    </div>,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Itens cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Nenhum item cadastrado.
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selectedId === item.id && !isCreatingNew
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-border"
                }`}
                onClick={() => {
                  setIsCreatingNew(false);
                  setSelectedId(item.id);
                }}
              >
                <div className="font-medium text-foreground">{item.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.offeringType === "product" ? "Produto" : "Serviço"} · {item.unitOfMeasure || "Sem unidade"} ·{" "}
                  {item.status === "active" ? "Ativo" : "Inativo"}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isCreatingNew ? "Novo item de catálogo" : "Detalhes do item"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="catalog-item-name">Nome</Label>
              <Input
                id="catalog-item-name"
                {...form.register("name")}
                disabled={!canManageSuppliers}
              />
              <FieldError message={form.formState.errors.name?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-item-type">Tipo</Label>
              <Select
                id="catalog-item-type"
                {...form.register("offeringType")}
                disabled={!canManageSuppliers}
              >
                <option value="service">Serviço</option>
                <option value="product">Produto</option>
              </Select>
              <FieldError message={form.formState.errors.offeringType?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-item-status">Status</Label>
              <Select
                id="catalog-item-status"
                {...form.register("status")}
                disabled={!canManageSuppliers}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </Select>
              <FieldError message={form.formState.errors.status?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-item-uom">Unidade de medida</Label>
              <Input
                id="catalog-item-uom"
                {...form.register("unitOfMeasure")}
                disabled={!canManageSuppliers}
              />
              <FieldError message={form.formState.errors.unitOfMeasure?.message} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="catalog-item-description">Descrição</Label>
            <Textarea
              id="catalog-item-description"
              {...form.register("description")}
              disabled={!canManageSuppliers}
            />
            <FieldError message={form.formState.errors.description?.message} />
          </div>

          {canManageSuppliers ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreatingNew(false);
                  if (selectedItem) {
                    form.reset({
                      name: selectedItem.name,
                      offeringType: selectedItem.offeringType,
                      unitOfMeasure: selectedItem.unitOfMeasure || "",
                      description: selectedItem.description || "",
                      status: selectedItem.status as "active" | "inactive",
                    });
                    return;
                  }
                  form.reset(emptyForm);
                }}
              >
                Descartar
              </Button>
              <Button
                onClick={form.handleSubmit((values) => saveMutation.mutate(values))}
                disabled={saveMutation.isPending || (!isCreatingNew && !form.formState.isDirty)}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar item"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
