import React, { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useHeaderActions, usePageTitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import {
  useGetUnit,
  useUpdateUnit,
  getGetUnitQueryKey,
  getListUnitsQueryKey,
  type UpdateUnitBody,
  type UpdateUnitBodyType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Pencil, Save, X, ClipboardList } from "lucide-react";
import { QuestionnaireModal } from "@/components/questionnaire/QuestionnaireModal";

export default function UnitDetailPage() {
  const params = useParams<{ id: string }>();
  const unitId = parseInt(params?.id || "0");

  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization?.id;
  const canWriteUnits = canWriteModule("units");
  const queryClient = useQueryClient();

  const { data: unit, isLoading } = useGetUnit(orgId!, unitId, {
    query: { queryKey: getGetUnitQueryKey(orgId!, unitId), enabled: !!orgId && !!unitId },
  });
  const updateMut = useUpdateUnit();

  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);

  useEffect(() => {
    if (unit) {
      setFormData({
        name: unit.name || "",
        code: unit.code || "",
        type: unit.type || "filial",
        cnpj: unit.cnpj || "",
        status: unit.status || "ativa",
        cep: unit.cep || "",
        address: unit.address || "",
        streetNumber: unit.streetNumber || "",
        neighborhood: unit.neighborhood || "",
        city: unit.city || "",
        state: unit.state || "",
        country: unit.country || "Brasil",
        phone: unit.phone || "",
      });
    }
  }, [unit]);

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
    await updateMut.mutateAsync({ orgId, unitId, data: body });
    queryClient.invalidateQueries({ queryKey: getGetUnitQueryKey(orgId, unitId) });
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(orgId) });
    setEditing(false);
  };

  const handleCancel = () => {
    if (unit) {
      setFormData({
        name: unit.name || "",
        code: unit.code || "",
        type: unit.type || "filial",
        cnpj: unit.cnpj || "",
        status: unit.status || "ativa",
        cep: unit.cep || "",
        address: unit.address || "",
        streetNumber: unit.streetNumber || "",
        neighborhood: unit.neighborhood || "",
        city: unit.city || "",
        state: unit.state || "",
        country: unit.country || "Brasil",
        phone: unit.phone || "",
      });
    }
    setEditing(false);
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const typeLabel =
    formData.type === "sede" ? "Sede" : formData.type === "filial" ? "Filial" : "—";
  const statusLabel =
    formData.status === "ativa" ? "Ativa" : formData.status === "inativa" ? "Inativa" : "—";
  const locationLine = [formData.city, formData.state, formData.country]
    .filter(Boolean)
    .join(", ");
  const addressLine = [formData.address, formData.streetNumber].filter(Boolean).join(", ");
  const neighborhoodLine = formData.neighborhood || "";

  usePageTitle(unit?.name);
  useHeaderActions(
    unit ? (
      <div className="flex items-center gap-2">
        <Link href="/organizacao/unidades">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </Link>
        {canWriteUnits && <Button variant="secondary" size="sm" onClick={() => setQuestionnaireOpen(true)}>
          <ClipboardList className="w-4 h-4 mr-1" /> Questionário de Compliance
        </Button>}
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} isLoading={updateMut.isPending}>
              <Save className="w-4 h-4 mr-1" /> Salvar
            </Button>
          </>
        ) : (
          canWriteUnits && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4 mr-1" /> Editar
          </Button>
        )}
      </div>
    ) : null
  );

  if (isLoading || !unit) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;

  const Field = ({
    label,
    field,
    placeholder,
    disabled,
    className,
  }: {
    label: string;
    field: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
  }) => (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      {editing && !disabled ? (
        <Input
          value={formData[field] || ""}
          onChange={e => updateField(field, e.target.value)}
          placeholder={placeholder}
          className={className}
        />
      ) : (
        <p className="text-[14px] font-medium text-foreground min-h-[20px]">
          {formData[field] || <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </div>
  );

  const SelectField = ({ label, field, options }: { label: string; field: string; options: { value: string; label: string }[] }) => (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      {editing ? (
        <Select value={formData[field] || ""} onChange={e => updateField(field, e.target.value)}>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ) : (
        <p className="text-[14px] font-medium text-foreground">
          {options.find(o => o.value === formData[field])?.label || formData[field]}
        </p>
      )}
    </div>
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
                <div className="absolute bottom-5 left-5 bg-white/95 backdrop-blur rounded-2xl shadow-sm border border-white/70 p-5 max-w-md">
                  <div className="flex items-center gap-2.5 mb-2">
                    <p className="text-[18px] font-semibold text-foreground">
                      {formData.name || "Unidade sem nome"}
                    </p>
                    <Badge variant={formData.type === "sede" ? "default" : "secondary"} className="uppercase text-[10px]">
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
                    <span className={`inline-block h-2 w-2 rounded-full ${formData.status === "ativa" ? "bg-emerald-500" : "bg-slate-400"}`} />
                    <span className="text-[13px] font-medium text-foreground">{statusLabel}</span>
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
              <Field label="Nome" field="name" placeholder="Nome da unidade" />
              <Field label="Código" field="code" placeholder="FIL-001" />
              <SelectField label="Tipo" field="type" options={[{ value: "sede", label: "Sede" }, { value: "filial", label: "Filial" }]} />
              <Field label="CNPJ" field="cnpj" placeholder="00.000.000/0000-00" />
              <SelectField label="Status Operacional" field="status" options={[{ value: "ativa", label: "Ativa" }, { value: "inativa", label: "Inativa" }]} />
              <Field label="Telefone" field="phone" placeholder="(00) 0000-0000" />
            </div>
          </div>

          <div className="border-t border-border/70 pt-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-5">
              Endereço
            </h3>
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
              <Field label="CEP" field="cep" placeholder="00000-000" />
              <div className="md:col-span-2">
                <Field label="Endereço" field="address" placeholder="Rua, Avenida..." />
              </div>
              <Field label="Número" field="streetNumber" placeholder="100" />
              <Field label="Bairro" field="neighborhood" placeholder="Centro" />
              <Field label="Cidade" field="city" placeholder="São Paulo" />
              <Field label="Estado (UF)" field="state" placeholder="SP" />
              <Field label="País" field="country" placeholder="Brasil" />
            </div>
          </div>
        </section>
      </div>

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
