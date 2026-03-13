import React, { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
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
  const [, params] = useRoute("/app/organizacao/unidades/:id");
  const unitId = parseInt(params?.id || "0");

  const { organization } = useAuth();
  const orgId = organization?.id;
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

  if (isLoading || !unit) return <AppLayout><div className="p-8 text-center text-muted-foreground">Carregando...</div></AppLayout>;

  const headerActions = (
    <div className="flex items-center gap-2">
      <Link href="/app/organizacao/unidades">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
      </Link>
      <Button variant="secondary" size="sm" onClick={() => setQuestionnaireOpen(true)}>
        <ClipboardList className="w-4 h-4 mr-1" /> Questionário de Compliance
      </Button>
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
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="w-4 h-4 mr-1" /> Editar
        </Button>
      )}
    </div>
  );

  const Field = ({ label, field, placeholder, disabled }: { label: string; field: string; placeholder?: string; disabled?: boolean }) => (
    <div>
      <Label>{label}</Label>
      {editing && !disabled ? (
        <Input
          value={formData[field] || ""}
          onChange={e => updateField(field, e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <p className="text-[13px] text-foreground mt-1 min-h-[20px]">{formData[field] || <span className="text-muted-foreground">—</span>}</p>
      )}
    </div>
  );

  const SelectField = ({ label, field, options }: { label: string; field: string; options: { value: string; label: string }[] }) => (
    <div>
      <Label>{label}</Label>
      {editing ? (
        <Select value={formData[field] || ""} onChange={e => updateField(field, e.target.value)}>
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ) : (
        <p className="text-[13px] text-foreground mt-1 capitalize">{options.find(o => o.value === formData[field])?.label || formData[field]}</p>
      )}
    </div>
  );

  return (
    <AppLayout pageTitle={unit.name} headerActions={headerActions}>
      <div className="max-w-3xl space-y-8">
        <section className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-base font-semibold text-foreground">Informações Gerais</h2>
            <Badge variant={unit.type === 'sede' ? 'default' : 'secondary'} className="uppercase text-[10px]">{unit.type}</Badge>
            <Badge variant={unit.status === 'ativa' ? 'success' : 'secondary'} className="text-[10px]">{unit.status}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <Field label="Nome" field="name" placeholder="Nome da unidade" />
            <Field label="Código" field="code" placeholder="FIL-001" />
            <SelectField label="Tipo" field="type" options={[{ value: "sede", label: "Sede" }, { value: "filial", label: "Filial" }]} />
            <Field label="CNPJ" field="cnpj" placeholder="00.000.000/0000-00" />
            <SelectField label="Status" field="status" options={[{ value: "ativa", label: "Ativa" }, { value: "inativa", label: "Inativa" }]} />
            <Field label="Telefone" field="phone" placeholder="(00) 0000-0000" />
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-6">Endereço</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <Field label="CEP" field="cep" placeholder="00000-000" />
            <div className="col-span-2">
              <Field label="Endereço" field="address" placeholder="Rua, Avenida..." />
            </div>
            <Field label="Número" field="streetNumber" placeholder="100" />
            <Field label="Bairro" field="neighborhood" placeholder="Centro" />
            <Field label="Cidade" field="city" placeholder="São Paulo" />
            <Field label="Estado (UF)" field="state" placeholder="SP" />
            <Field label="País" field="country" placeholder="Brasil" />
          </div>
        </section>
      </div>

      <QuestionnaireModal
        isOpen={questionnaireOpen}
        onClose={() => setQuestionnaireOpen(false)}
        orgId={orgId!}
        unitId={unitId}
        unitName={unit.name}
      />
    </AppLayout>
  );
}
