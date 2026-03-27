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
import { toast } from "@/hooks/use-toast";
import {
  createSupplierCatalogItem,
  listSupplierCatalogItems,
  suppliersKeys,
  updateSupplierCatalogItem,
} from "@/lib/suppliers-client";
import { ArrowLeft, Plus } from "lucide-react";

type CatalogItemForm = {
  name: string;
  offeringType: "product" | "service";
  unitOfMeasure: string;
  description: string;
  status: "active" | "inactive";
};

const emptyForm: CatalogItemForm = {
  name: "",
  offeringType: "service",
  unitOfMeasure: "",
  description: "",
  status: "active",
};

export default function SupplierCatalogItemsPage() {
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageSuppliers = role === "org_admin" || role === "platform_admin";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<CatalogItemForm>(emptyForm);

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
      setForm(emptyForm);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [isCreatingNew, items, selectedId]);

  useEffect(() => {
    if (!selectedItem || isCreatingNew) return;
    setForm({
      name: selectedItem.name,
      offeringType: selectedItem.offeringType,
      unitOfMeasure: selectedItem.unitOfMeasure || "",
      description: selectedItem.description || "",
      status: selectedItem.status as "active" | "inactive",
    });
  }, [isCreatingNew, selectedItem]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.catalogItems(orgId!) });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do item.");

      const payload = {
        name: form.name.trim(),
        offeringType: form.offeringType,
        unitOfMeasure: form.unitOfMeasure.trim() || null,
        description: form.description.trim() || null,
        status: form.status,
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
            setForm(emptyForm);
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
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                disabled={!canManageSuppliers}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-item-type">Tipo</Label>
              <Select
                id="catalog-item-type"
                value={form.offeringType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, offeringType: event.target.value as "product" | "service" }))
                }
                disabled={!canManageSuppliers}
              >
                <option value="service">Serviço</option>
                <option value="product">Produto</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-item-status">Status</Label>
              <Select
                id="catalog-item-status"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}
                disabled={!canManageSuppliers}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-item-uom">Unidade de medida</Label>
              <Input
                id="catalog-item-uom"
                value={form.unitOfMeasure}
                onChange={(event) => setForm((current) => ({ ...current, unitOfMeasure: event.target.value }))}
                disabled={!canManageSuppliers}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="catalog-item-description">Descrição</Label>
            <Textarea
              id="catalog-item-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              disabled={!canManageSuppliers}
            />
          </div>

          {canManageSuppliers ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreatingNew(false);
                  if (selectedItem) {
                    setForm({
                      name: selectedItem.name,
                      offeringType: selectedItem.offeringType,
                      unitOfMeasure: selectedItem.unitOfMeasure || "",
                      description: selectedItem.description || "",
                      status: selectedItem.status as "active" | "inactive",
                    });
                    return;
                  }
                  setForm(emptyForm);
                }}
              >
                Descartar
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar item"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
