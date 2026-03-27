import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHeaderActions, usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { useListUnits, getListUnitsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  getSupplierDetail,
  listSupplierCategories,
  listSupplierTypes,
  suppliersKeys,
  updateSupplier,
} from "@/lib/suppliers-client";
import {
  formatSupplierLegalIdentifier,
  formatSupplierPostalCode,
  normalizeDigits,
  supplierLegalIdentifierPlaceholder,
} from "@/lib/supplier-formatters";
import { ArrowLeft, Save } from "lucide-react";

type SupplierMasterForm = {
  personType: "pj" | "pf";
  legalIdentifier: string;
  legalName: string;
  tradeName: string;
  responsibleName: string;
  categoryId: string;
  typeIds: number[];
  unitIds: number[];
  criticality: string;
  status: string;
  notes: string;
  email: string;
  phone: string;
  website: string;
  postalCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  stateRegistration: string;
  municipalRegistration: string;
  rg: string;
};

function validateMasterForm(form: SupplierMasterForm) {
  if (!form.legalName.trim()) return "Informe a razão social ou nome do fornecedor.";

  const identifierDigits = normalizeDigits(form.legalIdentifier);
  if (form.personType === "pj" && identifierDigits.length !== 14) {
    return "Informe um CNPJ com 14 dígitos.";
  }
  if (form.personType === "pf" && identifierDigits.length !== 11) {
    return "Informe um CPF com 11 dígitos.";
  }
  if (form.personType === "pj" && !form.responsibleName.trim()) {
    return "Informe o responsável para fornecedores PJ.";
  }
  if (form.personType === "pj" && !form.email.trim()) {
    return "Informe o e-mail para fornecedores PJ.";
  }
  return null;
}

export default function SupplierMasterEditPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageGeneral = role === "org_admin" || role === "platform_admin";
  const [form, setForm] = useState<SupplierMasterForm | null>(null);

  const detailQuery = useQuery({
    queryKey: suppliersKeys.detail(orgId || 0, supplierId),
    enabled: !!orgId && Number.isFinite(supplierId) && supplierId > 0,
    queryFn: () => getSupplierDetail(orgId!, supplierId),
  });
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
  const unitsQuery = useListUnits(orgId!, {
    query: {
      queryKey: getListUnitsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });

  const detail = detailQuery.data;
  const categories = categoriesQuery.data || [];
  const types = typesQuery.data || [];
  const units = unitsQuery.data || [];

  useEffect(() => {
    if (!detail) return;

    setForm({
      personType: detail.personType,
      legalIdentifier: formatSupplierLegalIdentifier(detail.legalIdentifier, detail.personType),
      legalName: detail.legalName,
      tradeName: detail.tradeName || "",
      responsibleName: detail.responsibleName || "",
      categoryId: detail.category ? String(detail.category.id) : "",
      typeIds: detail.types.map((type) => type.id),
      unitIds: detail.units.map((unit) => unit.id),
      criticality: detail.criticality,
      status: detail.status,
      notes: detail.notes || "",
      email: detail.email || "",
      phone: detail.phone || "",
      website: detail.website || "",
      postalCode: detail.postalCode || "",
      street: detail.street || "",
      streetNumber: detail.streetNumber || "",
      complement: detail.complement || "",
      neighborhood: detail.neighborhood || "",
      city: detail.city || "",
      state: detail.state || "",
      stateRegistration: detail.stateRegistration || "",
      municipalRegistration: detail.municipalRegistration || "",
      rg: detail.rg || "",
    });
  }, [detail]);

  usePageTitle(detail ? `Cadastro · ${detail.tradeName || detail.legalName}` : "Cadastro do fornecedor");
  usePageSubtitle("Altere os dados mestres fora do fluxo operacional de avaliação.");

  const unitOptions = useMemo(
    () =>
      units.map((unit) => ({
        value: unit.id,
        label: unit.name,
      })),
    [units],
  );
  const typeOptions = useMemo(
    () =>
      types.map((type) => ({
        value: type.id,
        label: type.name,
        keywords: [type.description || "", type.status],
      })),
    [types],
  );

  const updateForm = (updater: (current: SupplierMasterForm) => SupplierMasterForm) => {
    setForm((current) => (current ? updater(current) : current));
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.detail(orgId!, supplierId) });
    queryClient.invalidateQueries({ queryKey: suppliersKeys.list(orgId!, {}) });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error("Fornecedor ainda não carregado.");
      }

      const validationError = validateMasterForm(form);
      if (validationError) {
        throw new Error(validationError);
      }

      return updateSupplier(orgId!, supplierId, {
        personType: form.personType,
        legalIdentifier: normalizeDigits(form.legalIdentifier),
        legalName: form.legalName,
        tradeName: form.tradeName || null,
        responsibleName: form.responsibleName || null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        typeIds: form.typeIds,
        unitIds: form.unitIds,
        criticality: form.criticality,
        status: form.status,
        notes: form.notes || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
        postalCode: form.postalCode || null,
        street: form.street || null,
        streetNumber: form.streetNumber || null,
        complement: form.complement || null,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        state: form.state || null,
        stateRegistration: form.stateRegistration || null,
        municipalRegistration: form.municipalRegistration || null,
        rg: form.rg || null,
      });
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Cadastro atualizado" });
      navigate(`/app/qualidade/fornecedores/${supplierId}`);
    },
    onError: (error) =>
      toast({
        title: "Falha ao salvar cadastro",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      }),
  });

  useHeaderActions(
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate(`/app/qualidade/fornecedores/${supplierId}`)}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Voltar ao fornecedor
      </Button>
      {canManageGeneral ? (
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!form} isLoading={saveMutation.isPending}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Salvar cadastro
        </Button>
      ) : null}
    </div>,
  );

  if (detailQuery.isLoading || !form) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Carregando cadastro do fornecedor...</div>;
  }

  if (!canManageGeneral) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-5 py-6 text-sm text-muted-foreground">
        Você pode consultar o fornecedor, mas não possui permissão para alterar o cadastro mestre.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identificação e classificação</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldSet>
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field>
                  <FieldLabel>Tipo de pessoa</FieldLabel>
                  <FieldContent>
                    <Select
                      value={form.personType}
                      onChange={(event) =>
                        updateForm((current) => {
                          const nextPersonType = event.target.value as "pj" | "pf";
                          return {
                            ...current,
                            personType: nextPersonType,
                            legalIdentifier: formatSupplierLegalIdentifier(current.legalIdentifier, nextPersonType),
                          };
                        })
                      }
                    >
                      <option value="pj">Pessoa jurídica</option>
                      <option value="pf">Pessoa física</option>
                    </Select>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{form.personType === "pj" ? "CNPJ" : "CPF"}</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.legalIdentifier}
                      onChange={(event) =>
                        updateForm((current) => ({
                          ...current,
                          legalIdentifier: formatSupplierLegalIdentifier(event.target.value, current.personType),
                        }))
                      }
                      placeholder={supplierLegalIdentifierPlaceholder(form.personType)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{form.personType === "pj" ? "Razão social" : "Nome completo"}</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.legalName}
                      onChange={(event) => updateForm((current) => ({ ...current, legalName: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Nome fantasia</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.tradeName}
                      onChange={(event) => updateForm((current) => ({ ...current, tradeName: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Responsável</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.responsibleName}
                      onChange={(event) => updateForm((current) => ({ ...current, responsibleName: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Status cadastral</FieldLabel>
                  <FieldContent>
                    <Select
                      value={form.status}
                      onChange={(event) => updateForm((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="draft">Rascunho</option>
                      <option value="pending_qualification">Pendente</option>
                      <option value="approved">Aprovado</option>
                      <option value="restricted">Restrito</option>
                      <option value="blocked">Bloqueado</option>
                      <option value="expired">Vencido</option>
                      <option value="inactive">Inativo</option>
                    </Select>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Categoria</FieldLabel>
                  <FieldContent>
                    <Select
                      value={form.categoryId}
                      onChange={(event) => updateForm((current) => ({ ...current, categoryId: event.target.value }))}
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Criticidade</FieldLabel>
                  <FieldContent>
                    <Select
                      value={form.criticality}
                      onChange={(event) => updateForm((current) => ({ ...current, criticality: event.target.value }))}
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                    </Select>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Inscrição estadual</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.stateRegistration}
                      onChange={(event) => updateForm((current) => ({ ...current, stateRegistration: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Inscrição municipal</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.municipalRegistration}
                      onChange={(event) =>
                        updateForm((current) => ({ ...current, municipalRegistration: event.target.value }))
                      }
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>RG</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.rg}
                      onChange={(event) => updateForm((current) => ({ ...current, rg: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Unidades vinculadas</FieldLabel>
                  <FieldContent>
                    <SearchableMultiSelect
                      options={unitOptions}
                      selected={form.unitIds}
                      onToggle={(id) =>
                        updateForm((current) => ({
                          ...current,
                          unitIds: current.unitIds.includes(id)
                            ? current.unitIds.filter((value) => value !== id)
                            : [...current.unitIds, id],
                        }))
                      }
                      placeholder="Selecione as unidades"
                      searchPlaceholder="Buscar unidade"
                      emptyMessage="Nenhuma unidade encontrada."
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Tipos de fornecedor</FieldLabel>
                  <FieldContent>
                    <SearchableMultiSelect
                      options={typeOptions}
                      selected={form.typeIds}
                      onToggle={(id) =>
                        updateForm((current) => ({
                          ...current,
                          typeIds: current.typeIds.includes(id)
                            ? current.typeIds.filter((value) => value !== id)
                            : [...current.typeIds, id],
                        }))
                      }
                      placeholder="Selecione os tipos"
                      searchPlaceholder="Buscar tipo"
                      emptyMessage="Nenhum tipo encontrado."
                    />
                  </FieldContent>
                </Field>
              </div>

              <Field>
                <FieldLabel>Observações</FieldLabel>
                <FieldContent>
                  <Textarea
                    rows={4}
                    value={form.notes}
                    onChange={(event) => updateForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato e endereço</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldSet>
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field>
                  <FieldLabel>E-mail</FieldLabel>
                  <FieldContent>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(event) => updateForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Telefone</FieldLabel>
                  <FieldContent>
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(event) => updateForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Website</FieldLabel>
                  <FieldContent>
                    <Input
                      type="url"
                      value={form.website}
                      onChange={(event) => updateForm((current) => ({ ...current, website: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>CEP</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.postalCode}
                      onChange={(event) =>
                        updateForm((current) => ({
                          ...current,
                          postalCode: formatSupplierPostalCode(event.target.value),
                        }))
                      }
                      placeholder="00000-000"
                    />
                  </FieldContent>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Logradouro</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.street}
                      onChange={(event) => updateForm((current) => ({ ...current, street: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Número</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.streetNumber}
                      onChange={(event) => updateForm((current) => ({ ...current, streetNumber: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Complemento</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.complement}
                      onChange={(event) => updateForm((current) => ({ ...current, complement: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Bairro</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.neighborhood}
                      onChange={(event) => updateForm((current) => ({ ...current, neighborhood: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Cidade</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.city}
                      onChange={(event) => updateForm((current) => ({ ...current, city: event.target.value }))}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>UF</FieldLabel>
                  <FieldContent>
                    <Input
                      value={form.state}
                      onChange={(event) =>
                        updateForm((current) => ({ ...current, state: event.target.value.toUpperCase().slice(0, 2) }))
                      }
                    />
                  </FieldContent>
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        O cadastro mestre foi separado da operação. Avaliação documental, homologação, recebimentos e desempenho
        continuam no detalhe do fornecedor.
      </div>
    </div>
  );
}
