import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useHeaderActions, usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import {
  useGetUnit,
  useUpdateUnit,
  useListOrgUsers,
  useSetUnitManagers,
  getGetUnitQueryKey,
  getListUnitsQueryKey,
  getListOrgUsersQueryKey,
  type UpdateUnitBody,
  type UpdateUnitBodyType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SearchableMultiSelect,
  type SearchableMultiSelectOption,
} from "@/components/ui/searchable-multi-select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ArrowLeft, ClipboardList, Pencil, X } from "lucide-react";
import { QuestionnaireModal } from "@/components/questionnaire/QuestionnaireModal";
import { toast } from "@/hooks/use-toast";

type UnitFormData = {
  name: string;
  code: string;
  type: UpdateUnitBodyType;
  cnpj: string;
  status: "ativa" | "inativa";
  cep: string;
  address: string;
  streetNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  phone: string;
};

type UnitLike = Partial<{
  name: string | null;
  code: string | null;
  type: UpdateUnitBodyType | null;
  cnpj: string | null;
  status: "ativa" | "inativa" | null;
  cep: string | null;
  address: string | null;
  streetNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
}>;

const editSteps = ["Identidade", "Operação", "Endereço", "Gestores"];
const editStepDescriptions = [
  "Defina os dados principais que identificam a unidade na organização.",
  "Ajuste o status operacional e os canais de contato da unidade.",
  "Revise o endereço completo antes de salvar as alterações.",
  "Defina os usuários que supervisionam esta filial.",
];

function getManagerIds(
  unit?: { managers?: Array<{ userId: number }> } | null,
): number[] {
  return (unit?.managers ?? []).map((manager) => manager.userId);
}

function getUnitFormData(unit?: UnitLike | null): UnitFormData {
  return {
    name: unit?.name || "",
    code: unit?.code || "",
    type: unit?.type || "filial",
    cnpj: unit?.cnpj || "",
    status: unit?.status || "ativa",
    cep: unit?.cep || "",
    address: unit?.address || "",
    streetNumber: unit?.streetNumber || "",
    neighborhood: unit?.neighborhood || "",
    city: unit?.city || "",
    state: unit?.state || "",
    country: unit?.country || "Brasil",
    phone: unit?.phone || "",
  };
}

function DialogStepTabs({
  steps,
  step,
  onStepChange,
}: {
  steps: string[];
  step: number;
  onStepChange: (step: number) => void;
}) {
  return (
    <div className="mb-6 flex items-center gap-1">
      {steps.map((label, index) => (
        <React.Fragment key={label}>
          {index > 0 && <div className="h-px flex-1 bg-border/80" />}
          <button
            type="button"
            onClick={() => onStepChange(index)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
              step === index
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function DialogStepFooter({
  step,
  totalSteps,
  onBack,
  onCancel,
  onNext,
  onSubmit,
  isPending,
  disabled,
}: {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
  onSubmit: () => void;
  isPending?: boolean;
  disabled?: boolean;
}) {
  return (
    <DialogFooter>
      {step > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Anterior
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      )}
      {step < totalSteps - 1 ? (
        <Button type="button" size="sm" onClick={onNext} disabled={disabled}>
          Próximo
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          isLoading={isPending}
          disabled={disabled}
        >
          Salvar alterações
        </Button>
      )}
    </DialogFooter>
  );
}

function DisplayField({
  label,
  value,
  className,
}: {
  label: string;
  value?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-[14px] font-medium text-foreground min-h-[20px]">
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function EditSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border rounded-xl px-3"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default function UnitDetailPage() {
  const params = useParams<{ id: string }>();
  const unitId = parseInt(params?.id || "0");

  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization?.id;
  const canWriteUnits = canWriteModule("units");
  const queryClient = useQueryClient();

  const { data: unit, isLoading } = useGetUnit(orgId!, unitId, {
    query: {
      queryKey: getGetUnitQueryKey(orgId!, unitId),
      enabled: !!orgId && !!unitId,
    },
  });
  const updateMut = useUpdateUnit();
  const setManagersMut = useSetUnitManagers();

  const { data: orgUsersData, isLoading: isLoadingOrgUsers } = useListOrgUsers(
    orgId!,
    {
      query: {
        queryKey: getListOrgUsersQueryKey(orgId!),
        enabled: !!orgId,
      },
    },
  );
  const orgUsers = orgUsersData?.users ?? [];

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editStep, setEditStep] = useState(0);
  const [formData, setFormData] = useState<UnitFormData>(getUnitFormData());
  const [managerIds, setManagerIds] = useState<number[]>([]);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);

  useEffect(() => {
    setFormData(getUnitFormData(unit));
    setManagerIds(getManagerIds(unit));
  }, [unit]);

  // Nome dos usuários por id — combina a lista de usuários da org com os
  // gestores já vinculados (garante rótulo mesmo que a lista ainda esteja
  // carregando ou o usuário não apareça na org).
  const userNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const manager of unit?.managers ?? []) {
      map.set(manager.userId, manager.userName);
    }
    for (const user of orgUsers) {
      map.set(user.id, user.name);
    }
    return map;
  }, [unit?.managers, orgUsers]);

  const managerOptions = useMemo<SearchableMultiSelectOption[]>(
    () =>
      orgUsers.map((user) => ({
        value: user.id,
        label: user.name,
        keywords: [user.email],
      })),
    [orgUsers],
  );

  const toggleManager = (userId: number) =>
    setManagerIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );

  const handleSave = async () => {
    if (!orgId) return;
    const body: UpdateUnitBody = {
      name: formData.name,
      code: formData.code || undefined,
      type: formData.type as UpdateUnitBodyType,
      cnpj: formData.cnpj || undefined,
      status: formData.status as "ativa" | "inativa",
      cep: formData.cep || undefined,
      address: formData.address || undefined,
      streetNumber: formData.streetNumber || undefined,
      neighborhood: formData.neighborhood || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      country: formData.country || undefined,
      phone: formData.phone || undefined,
    };
    try {
      await updateMut.mutateAsync({ orgId, unitId, data: body });
      await setManagersMut.mutateAsync({
        orgId,
        unitId,
        data: { userIds: managerIds },
      });
      queryClient.invalidateQueries({
        queryKey: getGetUnitQueryKey(orgId, unitId),
      });
      queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
      toast({ title: "Unidade atualizada" });
      setEditModalOpen(false);
      setEditStep(0);
    } catch {
      toast({
        title: "Não foi possível salvar a unidade",
        variant: "destructive",
      });
    }
  };

  const openEditModal = () => {
    setFormData(getUnitFormData(unit));
    setManagerIds(getManagerIds(unit));
    setEditStep(0);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setFormData(getUnitFormData(unit));
    setManagerIds(getManagerIds(unit));
    setEditStep(0);
    setEditModalOpen(false);
  };

  const updateField = <K extends keyof UnitFormData>(
    field: K,
    value: UnitFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const unitView = getUnitFormData(unit);
  const typeLabel =
    unitView.type === "sede"
      ? "Sede"
      : unitView.type === "filial"
        ? "Filial"
        : "—";
  const statusLabel =
    unitView.status === "ativa"
      ? "Ativa"
      : unitView.status === "inativa"
        ? "Inativa"
        : "—";
  const locationLine = [unitView.city, unitView.state, unitView.country]
    .filter(Boolean)
    .join(", ");
  const addressLine = [unitView.address, unitView.streetNumber]
    .filter(Boolean)
    .join(", ");
  const neighborhoodLine = unitView.neighborhood || "";
  const canAdvance = editStep === 0 ? Boolean(formData.name.trim()) : true;

  usePageTitle(unit?.name);
  useHeaderActions(
    unit ? (
      <div className="flex items-center gap-2">
        <Link href="/organizacao/unidades">
          <HeaderActionButton
            variant="ghost"
            size="sm"
            label="Voltar"
            icon={<ArrowLeft className="h-4 w-4" />}
          />
        </Link>
        {canWriteUnits && (
          <HeaderActionButton
            variant="secondary"
            size="sm"
            onClick={() => setQuestionnaireOpen(true)}
            label="Questionário de Compliance"
            icon={<ClipboardList className="h-4 w-4" />}
          />
        )}
        {canWriteUnits && (
          <HeaderActionButton
            variant="secondary"
            size="sm"
            onClick={openEditModal}
            label="Editar"
            icon={<Pencil className="h-4 w-4" />}
          />
        )}
      </div>
    ) : null,
  );

  if (isLoading || !unit)
    return (
      <div className="p-8 text-center text-muted-foreground">Carregando...</div>
    );

  return (
    <>
      <div className="max-w-6xl space-y-10 pb-8">
        <section className="space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Visão Geral da Unidade
            </h2>
            <div className="bg-muted/30 rounded-2xl overflow-hidden border border-border/50">
              <div className="relative h-44 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.75),transparent_45%)]" />
                <div className="absolute bottom-5 left-5 bg-card/95 backdrop-blur rounded-2xl shadow-sm border border-card/70 p-5 max-w-md">
                  <div className="flex items-center gap-2.5 mb-2">
                    <p className="text-[18px] font-semibold text-foreground">
                      {unitView.name || "Unidade sem nome"}
                    </p>
                    <Badge
                      variant={
                        unitView.type === "sede" ? "default" : "secondary"
                      }
                      className="uppercase text-[10px]"
                    >
                      {typeLabel}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {locationLine || "Localização não informada"}
                  </p>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    {addressLine || "Endereço não informado"}
                    {neighborhoodLine ? ` • ${neighborhoodLine}` : ""}
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${unitView.status === "ativa" ? "bg-emerald-500" : "bg-slate-400"}`}
                    />
                    <span className="text-[13px] font-medium text-foreground">
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/70 pt-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-5">
              Dados Cadastrais
            </h3>
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
              <DisplayField label="Nome" value={unitView.name} />
              <DisplayField label="Código" value={unitView.code} />
              <DisplayField label="Tipo" value={typeLabel} />
              <DisplayField label="CNPJ" value={unitView.cnpj} />
              <DisplayField label="Status Operacional" value={statusLabel} />
              <DisplayField label="Telefone" value={unitView.phone} />
            </div>
          </div>

          <div className="border-t border-border/70 pt-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-5">
              Endereço
            </h3>
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
              <DisplayField label="CEP" value={unitView.cep} />
              <DisplayField
                label="Endereço"
                value={unitView.address}
                className="md:col-span-2"
              />
              <DisplayField label="Número" value={unitView.streetNumber} />
              <DisplayField label="Bairro" value={unitView.neighborhood} />
              <DisplayField label="Cidade" value={unitView.city} />
              <DisplayField label="Estado (UF)" value={unitView.state} />
              <DisplayField label="País" value={unitView.country} />
            </div>
          </div>
        </section>
      </div>

      <Dialog
        open={canWriteUnits && editModalOpen}
        onOpenChange={(open) => {
          if (!open) closeEditModal();
        }}
        title="Editar unidade"
        description={editStepDescriptions[editStep]}
        size="lg"
      >
        <DialogStepTabs
          steps={editSteps}
          step={editStep}
          onStepChange={setEditStep}
        />

        <div className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Resumo da edição
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-[16px] font-semibold text-foreground">
                {formData.name || "Nova configuração da unidade"}
              </p>
              <Badge
                variant={formData.type === "sede" ? "default" : "secondary"}
                className="uppercase text-[10px]"
              >
                {formData.type === "sede" ? "Sede" : "Filial"}
              </Badge>
              <Badge variant="outline" className="uppercase text-[10px]">
                {formData.status === "ativa" ? "Ativa" : "Inativa"}
              </Badge>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {[
                [formData.address, formData.streetNumber]
                  .filter(Boolean)
                  .join(", "),
                [formData.city, formData.state].filter(Boolean).join(", "),
              ]
                .filter(Boolean)
                .join(" • ") ||
                "Complete as etapas para revisar os dados antes de salvar."}
            </p>
          </div>

          {editStep === 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <EditField
                label="Nome da unidade"
                value={formData.name}
                onChange={(value) => updateField("name", value)}
                placeholder="Transportes Gabardo LTDA"
              />
              <EditField
                label="Código"
                value={formData.code}
                onChange={(value) => updateField("code", value)}
                placeholder="POA"
              />
              <EditSelectField
                label="Tipo"
                value={formData.type}
                onChange={(value) =>
                  updateField("type", value as UpdateUnitBodyType)
                }
                options={[
                  { value: "sede", label: "Sede" },
                  { value: "filial", label: "Filial" },
                ]}
              />
              <EditField
                label="CNPJ"
                value={formData.cnpj}
                onChange={(value) => updateField("cnpj", value)}
                placeholder="00.000.000/0000-00"
              />
            </div>
          )}

          {editStep === 1 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <EditSelectField
                label="Status operacional"
                value={formData.status}
                onChange={(value) =>
                  updateField("status", value as "ativa" | "inativa")
                }
                options={[
                  { value: "ativa", label: "Ativa" },
                  { value: "inativa", label: "Inativa" },
                ]}
              />
              <EditField
                label="Telefone"
                value={formData.phone}
                onChange={(value) => updateField("phone", value)}
                placeholder="(51) 3373-3020"
              />
            </div>
          )}

          {editStep === 2 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <EditField
                label="CEP"
                value={formData.cep}
                onChange={(value) => updateField("cep", value)}
                placeholder="90200-230"
              />
              <div className="md:col-span-2">
                <EditField
                  label="Endereço"
                  value={formData.address}
                  onChange={(value) => updateField("address", value)}
                  placeholder="Rua, avenida ou rodovia"
                />
              </div>
              <EditField
                label="Número"
                value={formData.streetNumber}
                onChange={(value) => updateField("streetNumber", value)}
                placeholder="735"
              />
              <EditField
                label="Bairro"
                value={formData.neighborhood}
                onChange={(value) => updateField("neighborhood", value)}
                placeholder="Anchieta"
              />
              <EditField
                label="Cidade"
                value={formData.city}
                onChange={(value) => updateField("city", value)}
                placeholder="Porto Alegre"
              />
              <EditField
                label="Estado (UF)"
                value={formData.state}
                onChange={(value) => updateField("state", value)}
                placeholder="RS"
              />
              <EditField
                label="País"
                value={formData.country}
                onChange={(value) => updateField("country", value)}
                placeholder="Brasil"
              />
            </div>
          )}

          {editStep === 3 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Gestores da filial
                </Label>
                <p className="text-[13px] text-muted-foreground">
                  Usuários que supervisionam esta filial (podem ser vários).
                </p>
              </div>

              <SearchableMultiSelect
                options={managerOptions}
                selected={managerIds}
                onToggle={toggleManager}
                placeholder="Selecione os gestores"
                searchPlaceholder="Buscar por nome ou e-mail"
                emptyMessage={
                  isLoadingOrgUsers
                    ? "Carregando usuários..."
                    : "Nenhum usuário encontrado"
                }
                disabled={isLoadingOrgUsers}
              />

              {managerIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {managerIds.map((userId) => (
                    <Badge
                      key={userId}
                      variant="secondary"
                      className="flex items-center gap-1.5 py-1 pl-3 pr-1.5"
                    >
                      <span className="text-[12px] font-medium">
                        {userNameById.get(userId) ?? `Usuário #${userId}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleManager(userId)}
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                        aria-label={`Remover ${userNameById.get(userId) ?? "gestor"}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Nenhum gestor definido para esta filial.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogStepFooter
          step={editStep}
          totalSteps={editSteps.length}
          onBack={() => setEditStep((current) => current - 1)}
          onCancel={closeEditModal}
          onNext={() => setEditStep((current) => current + 1)}
          onSubmit={handleSave}
          isPending={updateMut.isPending || setManagersMut.isPending}
          disabled={!canAdvance}
        />
      </Dialog>

      <QuestionnaireModal
        isOpen={canWriteUnits && questionnaireOpen}
        onClose={() => setQuestionnaireOpen(false)}
        orgId={orgId!}
        unitId={unitId}
        unitName={unit.name}
      />
    </>
  );
}
