import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  getSupplierDetail,
  listSupplierCatalogItems,
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

const supplierMasterFormSchema = z
  .object({
    personType: z.enum(["pj", "pf"]),
    legalIdentifier: z.string(),
    legalName: z.string().trim().min(1, "Informe a razão social ou nome do fornecedor."),
    tradeName: z.string(),
    responsibleName: z.string(),
    categoryId: z.string(),
    typeIds: z.array(z.number()),
    unitIds: z.array(z.number()),
    catalogItemIds: z.array(z.number()),
    criticality: z.enum(["low", "medium", "high"]),
    status: z.enum(["draft", "pending_qualification", "approved", "restricted", "blocked", "expired", "inactive"]),
    notes: z.string(),
    email: z.string(),
    phone: z.string(),
    website: z.string(),
    postalCode: z.string(),
    street: z.string(),
    streetNumber: z.string(),
    complement: z.string(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string(),
    stateRegistration: z.string(),
    municipalRegistration: z.string(),
    rg: z.string(),
  })
  .superRefine((form, ctx) => {
    const identifierDigits = normalizeDigits(form.legalIdentifier);
    if (form.personType === "pj" && identifierDigits.length !== 14) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legalIdentifier"],
        message: "Informe um CNPJ com 14 dígitos.",
      });
    }
    if (form.personType === "pf" && identifierDigits.length !== 11) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legalIdentifier"],
        message: "Informe um CPF com 11 dígitos.",
      });
    }
    if (form.personType === "pj" && !form.responsibleName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsibleName"],
        message: "Informe o responsável para fornecedores PJ.",
      });
    }
    if (form.personType === "pj" && !form.email.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Informe o e-mail para fornecedores PJ.",
      });
    }
    if (form.email.trim() && !z.string().email().safeParse(form.email.trim()).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Informe um e-mail válido.",
      });
    }
  });

type SupplierMasterForm = z.infer<typeof supplierMasterFormSchema>;

const emptySupplierMasterForm: SupplierMasterForm = {
  personType: "pj",
  legalIdentifier: "",
  legalName: "",
  tradeName: "",
  responsibleName: "",
  categoryId: "",
  typeIds: [],
  unitIds: [],
  catalogItemIds: [],
  criticality: "medium",
  status: "draft",
  notes: "",
  email: "",
  phone: "",
  website: "",
  postalCode: "",
  street: "",
  streetNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  stateRegistration: "",
  municipalRegistration: "",
  rg: "",
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs text-destructive">{message}</p> : null;
}

export default function SupplierMasterEditPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const { organization, role } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const canManageGeneral = role === "org_admin" || role === "platform_admin";

  const form = useForm<SupplierMasterForm>({
    resolver: zodResolver(supplierMasterFormSchema),
    defaultValues: emptySupplierMasterForm,
  });

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
  const catalogItemsQuery = useQuery({
    queryKey: suppliersKeys.catalogItems(orgId || 0),
    enabled: !!orgId,
    queryFn: () => listSupplierCatalogItems(orgId!),
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
  const catalogItems = catalogItemsQuery.data || [];
  const units = unitsQuery.data || [];

  useEffect(() => {
    if (!detail) return;

    form.reset({
      personType: detail.personType,
      legalIdentifier: formatSupplierLegalIdentifier(detail.legalIdentifier, detail.personType),
      legalName: detail.legalName,
      tradeName: detail.tradeName || "",
      responsibleName: detail.responsibleName || "",
      categoryId: detail.category ? String(detail.category.id) : "",
      typeIds: detail.types.map((type) => type.id),
      unitIds: detail.units.map((unit) => unit.id),
      catalogItemIds: detail.offerings
        .map((offering) => offering.catalogItemId)
        .filter((catalogItemId): catalogItemId is number => catalogItemId !== null),
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
  }, [detail, form]);

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
  const catalogItemOptions = useMemo(
    () =>
      catalogItems.map((item) => ({
        value: item.id,
        label: item.name,
        keywords: [item.offeringType, item.unitOfMeasure || "", item.status],
      })),
    [catalogItems],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: suppliersKeys.detail(orgId!, supplierId) });
    queryClient.invalidateQueries({ queryKey: suppliersKeys.list(orgId!, {}) });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: SupplierMasterForm) =>
      updateSupplier(orgId!, supplierId, {
        personType: values.personType,
        legalIdentifier: normalizeDigits(values.legalIdentifier),
        legalName: values.legalName,
        tradeName: values.tradeName || null,
        responsibleName: values.responsibleName || null,
        categoryId: values.categoryId ? Number(values.categoryId) : null,
        typeIds: values.typeIds,
        unitIds: values.unitIds,
        catalogItemIds: values.catalogItemIds,
        criticality: values.criticality,
        status: values.status,
        notes: values.notes || null,
        email: values.email || null,
        phone: values.phone || null,
        website: values.website || null,
        postalCode: values.postalCode || null,
        street: values.street || null,
        streetNumber: values.streetNumber || null,
        complement: values.complement || null,
        neighborhood: values.neighborhood || null,
        city: values.city || null,
        state: values.state || null,
        stateRegistration: values.stateRegistration || null,
        municipalRegistration: values.municipalRegistration || null,
        rg: values.rg || null,
      }),
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

  const currentPersonType = form.watch("personType");

  useHeaderActions(
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => navigate(`/app/qualidade/fornecedores/${supplierId}`)}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Voltar ao fornecedor
      </Button>
      {canManageGeneral ? (
        <Button
          size="sm"
          onClick={() => void form.handleSubmit((values) => saveMutation.mutate(values))()}
          disabled={detailQuery.isLoading}
          isLoading={saveMutation.isPending}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Salvar cadastro
        </Button>
      ) : null}
    </div>,
  );

  if (detailQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Carregando cadastro do fornecedor...</div>;
  }

  if (!detail) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-5 py-6 text-sm text-muted-foreground">
        Fornecedor não encontrado.
      </div>
    );
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
                    <Controller
                      control={form.control}
                      name="personType"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onChange={(event) => {
                            const nextPersonType = event.target.value as "pj" | "pf";
                            field.onChange(nextPersonType);
                            form.setValue(
                              "legalIdentifier",
                              formatSupplierLegalIdentifier(form.getValues("legalIdentifier"), nextPersonType),
                              { shouldValidate: true, shouldDirty: true },
                            );
                          }}
                        >
                          <option value="pj">Pessoa jurídica</option>
                          <option value="pf">Pessoa física</option>
                        </Select>
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{currentPersonType === "pj" ? "CNPJ" : "CPF"}</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="legalIdentifier"
                      render={({ field }) => (
                        <Input
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(formatSupplierLegalIdentifier(event.target.value, currentPersonType))
                          }
                          placeholder={supplierLegalIdentifierPlaceholder(currentPersonType)}
                        />
                      )}
                    />
                    <FieldError message={form.formState.errors.legalIdentifier?.message} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{currentPersonType === "pj" ? "Razão social" : "Nome completo"}</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("legalName")} />
                    <FieldError message={form.formState.errors.legalName?.message} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Nome fantasia</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("tradeName")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Responsável</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("responsibleName")} />
                    <FieldError message={form.formState.errors.responsibleName?.message} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Status cadastral</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <Select value={field.value} onChange={field.onChange}>
                          <option value="draft">Rascunho</option>
                          <option value="pending_qualification">Pendente</option>
                          <option value="approved">Aprovado</option>
                          <option value="restricted">Restrito</option>
                          <option value="blocked">Bloqueado</option>
                          <option value="expired">Vencido</option>
                          <option value="inactive">Inativo</option>
                        </Select>
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Categoria</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <Select value={field.value} onChange={field.onChange}>
                          <option value="">Sem categoria</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Criticidade</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="criticality"
                      render={({ field }) => (
                        <Select value={field.value} onChange={field.onChange}>
                          <option value="low">Baixa</option>
                          <option value="medium">Média</option>
                          <option value="high">Alta</option>
                        </Select>
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Inscrição estadual</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("stateRegistration")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Inscrição municipal</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("municipalRegistration")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>RG</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("rg")} />
                  </FieldContent>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Unidades vinculadas</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="unitIds"
                      render={({ field }) => (
                        <SearchableMultiSelect
                          options={unitOptions}
                          selected={field.value}
                          onToggle={(id) =>
                            field.onChange(
                              field.value.includes(id)
                                ? field.value.filter((value) => value !== id)
                                : [...field.value, id],
                            )
                          }
                          placeholder="Selecione as unidades"
                          searchPlaceholder="Buscar unidade"
                          emptyMessage="Nenhuma unidade encontrada."
                        />
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Tipos de fornecedor</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="typeIds"
                      render={({ field }) => (
                        <SearchableMultiSelect
                          options={typeOptions}
                          selected={field.value}
                          onToggle={(id) =>
                            field.onChange(
                              field.value.includes(id)
                                ? field.value.filter((value) => value !== id)
                                : [...field.value, id],
                            )
                          }
                          placeholder="Selecione os tipos"
                          searchPlaceholder="Buscar tipo"
                          emptyMessage="Nenhum tipo encontrado."
                        />
                      )}
                    />
                  </FieldContent>
                </Field>
              </div>

              <Field>
                <FieldLabel>Produtos e serviços vinculados</FieldLabel>
                <FieldContent>
                  <Controller
                    control={form.control}
                    name="catalogItemIds"
                    render={({ field }) => (
                      <SearchableMultiSelect
                        options={catalogItemOptions}
                        selected={field.value}
                        onToggle={(id) =>
                          field.onChange(
                            field.value.includes(id)
                              ? field.value.filter((value) => value !== id)
                              : [...field.value, id],
                          )
                        }
                        placeholder="Selecione itens do catálogo"
                        searchPlaceholder="Buscar item"
                        emptyMessage="Nenhum item de catálogo encontrado."
                      />
                    )}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>Observações</FieldLabel>
                <FieldContent>
                  <Textarea rows={4} {...form.register("notes")} />
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
                    <Input type="email" {...form.register("email")} />
                    <FieldError message={form.formState.errors.email?.message} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Telefone</FieldLabel>
                  <FieldContent>
                    <Input type="tel" {...form.register("phone")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Website</FieldLabel>
                  <FieldContent>
                    <Input type="url" {...form.register("website")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>CEP</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <Input
                          value={field.value}
                          onChange={(event) => field.onChange(formatSupplierPostalCode(event.target.value))}
                          placeholder="00000-000"
                        />
                      )}
                    />
                  </FieldContent>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Logradouro</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("street")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Número</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("streetNumber")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Complemento</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("complement")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Bairro</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("neighborhood")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Cidade</FieldLabel>
                  <FieldContent>
                    <Input {...form.register("city")} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>UF</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <Input
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value.toUpperCase().slice(0, 2))}
                        />
                      )}
                    />
                  </FieldContent>
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>
    </div>
  );
}
