import React, { useState } from "react";
import { useRoute, Link } from "wouter";
import { usePageTitle } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useCreateCompetency,
  useUpdateCompetency,
  useDeleteCompetency,
  useCreateTraining,
  useUpdateTraining,
  useDeleteTraining,
  useCreateAwareness,
  useUpdateAwareness,
  useDeleteAwareness,
  useListUnits,
  useLinkEmployeeUnit,
  useUnlinkEmployeeUnit,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
} from "@workspace/api-client-react";
import type {
  EmployeeCompetency,
  EmployeeTraining,
  EmployeeAwareness,
  LinkedUnit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  GraduationCap,
  Award,
  Lightbulb,
  User,
  Archive,
} from "lucide-react";
import { useLocation } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  on_leave: "Afastado",
};

const CONTRACT_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  intern: "Estagiário",
  temporary: "Temporário",
};

const TRAINING_STATUS: Record<string, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  vencido: "Vencido",
};

const TRAINING_STATUS_COLORS: Record<string, string> = {
  pendente: "bg-blue-50 text-blue-700 border-blue-200",
  concluido: "bg-emerald-50 text-emerald-700 border-emerald-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
};

const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  formacao: "Formação",
  experiencia: "Experiência",
  habilidade: "Habilidade",
};

function InlineField({
  label,
  value,
  fieldKey,
  type = "text",
  options,
  onSave,
}: {
  label: string;
  value: string | number | null | undefined;
  fieldKey: string;
  type?: "text" | "date" | "select" | "textarea";
  options?: { value: string; label: string }[];
  onSave: (key: string, val: string | number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  const save = () => {
    onSave(fieldKey, draft || null);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(String(value ?? ""));
    setEditing(false);
  };

  return (
    <div className="group py-2.5 border-b border-border/40 last:border-0">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {editing ? (
        <div className="flex items-center gap-1.5 mt-1">
          {type === "select" && options ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 h-8 rounded border border-input bg-background px-2 text-[13px]"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : type === "textarea" ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 text-[13px] min-h-[60px]"
            />
          ) : (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              type={type}
              className="flex-1 h-8 text-[13px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
            />
          )}
          <button onClick={save} className="p-1 text-primary hover:text-primary/80 cursor-pointer">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={cancel} className="p-1 text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          className="flex items-center gap-1 mt-1 cursor-pointer group/field"
          onClick={() => {
            setDraft(String(value ?? ""));
            setEditing(true);
          }}
        >
          <span className="text-[13px] text-foreground">
            {type === "select" && options
              ? options.find((o) => o.value === String(value))?.label || String(value ?? "—")
              : value || "—"}
          </span>
          <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover/field:text-muted-foreground/50 transition-colors" />
        </div>
      )}
    </div>
  );
}

function LevelBar({ level, max = 5 }: { level: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 w-4 rounded-full",
            i < level ? "bg-primary" : "bg-border"
          )}
        />
      ))}
    </div>
  );
}

function LinkedUnitsSection({
  linkedUnits,
  allUnits,
  orgId,
  empId,
}: {
  linkedUnits: LinkedUnit[];
  allUnits: { id: number; name: string }[];
  orgId: number;
  empId: number;
}) {
  const queryClient = useQueryClient();
  const linkMutation = useLinkEmployeeUnit();
  const unlinkMutation = useUnlinkEmployeeUnit();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const availableUnits = allUnits.filter((u) => !linkedUnits.some((lu) => lu.id === u.id));

  const handleLink = async () => {
    if (!selectedUnit) return;
    await linkMutation.mutateAsync({ orgId, empId, unitId: Number(selectedUnit) });
    invalidate();
    setSelectedUnit("");
    setShowAdd(false);
  };

  const handleUnlink = async (unitId: number) => {
    await unlinkMutation.mutateAsync({ orgId, empId, unitId });
    invalidate();
  };

  return (
    <div className="py-2.5 border-b border-border/40">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-muted-foreground">Unidades</p>
        {availableUnits.length > 0 && (
          <button onClick={() => setShowAdd(!showAdd)} className="text-[11px] text-primary hover:underline cursor-pointer">
            + Vincular
          </button>
        )}
      </div>
      {linkedUnits.length === 0 && !showAdd && (
        <p className="text-[13px] text-muted-foreground/50">Nenhuma unidade vinculada</p>
      )}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {linkedUnits.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border/60">
            {u.name}
            <button onClick={() => handleUnlink(u.id)} className="text-muted-foreground/40 hover:text-red-500 cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {showAdd && (
        <div className="flex items-center gap-2 mt-2">
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="flex h-8 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">Selecionar unidade...</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={String(u.id)}>{u.name}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={handleLink} disabled={!selectedUnit || linkMutation.isPending}>
            Vincular
          </Button>
        </div>
      )}
    </div>
  );
}

type CompetencyForm = { name: string; description: string; type: string; requiredLevel: number; acquiredLevel: number; evidence: string };

function CompetencyFormFields({ form, setForm }: { form: CompetencyForm; setForm: (f: CompetencyForm) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Nome *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Ex: Gestão de Resíduos" />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Tipo</Label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="formacao">Formação</option>
            <option value="experiencia">Experiência</option>
            <option value="habilidade">Habilidade</option>
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Nível Requerido</Label>
          <Input type="number" min={0} max={5} value={form.requiredLevel} onChange={(e) => setForm({ ...form, requiredLevel: Number(e.target.value) })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Nível Adquirido</Label>
          <Input type="number" min={0} max={5} value={form.acquiredLevel} onChange={(e) => setForm({ ...form, acquiredLevel: Number(e.target.value) })} className="mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Evidência</Label>
        <Input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} className="mt-1" placeholder="Ex: Certificado XYZ" />
      </div>
    </div>
  );
}

function CompetenciasTab({
  competencies,
  orgId,
  empId,
}: {
  competencies: EmployeeCompetency[];
  orgId: number;
  empId: number;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<EmployeeCompetency | null>(null);
  const createMutation = useCreateCompetency();
  const updateMutation = useUpdateCompetency();
  const deleteMutation = useDeleteCompetency();

  const emptyForm: CompetencyForm = { name: "", description: "", type: "formacao", requiredLevel: 3, acquiredLevel: 0, evidence: "" };
  const [form, setForm] = useState<CompetencyForm>(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const handleCreate = async () => {
    await createMutation.mutateAsync({ orgId, empId, data: form });
    invalidate();
    setCreateOpen(false);
    setForm(emptyForm);
  };

  const openEdit = (comp: EmployeeCompetency) => {
    setEditingComp(comp);
    setForm({
      name: comp.name,
      description: comp.description || "",
      type: comp.type,
      requiredLevel: comp.requiredLevel,
      acquiredLevel: comp.acquiredLevel,
      evidence: comp.evidence || "",
    });
  };

  const handleUpdate = async () => {
    if (!editingComp) return;
    await updateMutation.mutateAsync({
      orgId, empId, compId: editingComp.id,
      data: {
        name: form.name,
        description: form.description || undefined,
        type: form.type,
        requiredLevel: form.requiredLevel,
        acquiredLevel: form.acquiredLevel,
        evidence: form.evidence || undefined,
      },
    });
    invalidate();
    setEditingComp(null);
    setForm(emptyForm);
  };

  const handleDelete = async (compId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, compId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Competências necessárias e adquiridas conforme ISO 9001:2015 §7.2
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Competência
        </Button>
      </div>

      {competencies.length === 0 ? (
        <div className="text-center py-12">
          <Award className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhuma competência registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {competencies.map((comp) => (
            <div key={comp.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => openEdit(comp)}>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-foreground">{comp.name}</p>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      {COMPETENCY_TYPE_LABELS[comp.type] || comp.type}
                    </span>
                  </div>
                  {comp.description && (
                    <p className="text-xs text-muted-foreground mt-1">{comp.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Nível Requerido</p>
                      <div className="flex items-center gap-2">
                        <LevelBar level={comp.requiredLevel} />
                        <span className="text-xs text-muted-foreground">{comp.requiredLevel}/5</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Nível Adquirido</p>
                      <div className="flex items-center gap-2">
                        <LevelBar level={comp.acquiredLevel} />
                        <span className="text-xs text-muted-foreground">{comp.acquiredLevel}/5</span>
                        {comp.acquiredLevel < comp.requiredLevel && (
                          <span className="text-[10px] text-red-600 font-medium">Gap</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {comp.evidence && (
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">Evidência:</span> {comp.evidence}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(comp); }} className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(comp.id); }} className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setCreateOpen} title="Nova Competência">
        <CompetencyFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={!form.name || createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!editingComp} onOpenChange={(open) => { if (!open) { setEditingComp(null); setForm(emptyForm); } }} title="Editar Competência">
        <CompetencyFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setEditingComp(null); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={handleUpdate} disabled={!form.name || updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

type TrainingForm = { title: string; description: string; institution: string; workloadHours: number; completionDate: string; expirationDate: string; status: string };
type AwarenessForm = { topic: string; description: string; date: string; verificationMethod: string; result: string };

function TrainingFormFields({ form, setForm }: { form: TrainingForm; setForm: (f: TrainingForm) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Título *</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" placeholder="Ex: NR-12 Segurança" />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Instituição</Label>
          <Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Carga Horária (h)</Label>
          <Input type="number" value={form.workloadHours} onChange={(e) => setForm({ ...form, workloadHours: Number(e.target.value) })} className="mt-1" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="pendente">Pendente</option>
            <option value="concluido">Concluído</option>
            <option value="vencido">Vencido</option>
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Data Conclusão</Label>
          <Input type="date" value={form.completionDate} onChange={(e) => setForm({ ...form, completionDate: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Validade</Label>
          <Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} className="mt-1" />
        </div>
      </div>
    </div>
  );
}

function TreinamentosTab({
  trainings,
  orgId,
  empId,
}: {
  trainings: EmployeeTraining[];
  orgId: number;
  empId: number;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<EmployeeTraining | null>(null);
  const createMutation = useCreateTraining();
  const deleteMutation = useDeleteTraining();
  const updateMutation = useUpdateTraining();

  const emptyForm = { title: "", description: "", institution: "", workloadHours: 0, completionDate: "", expirationDate: "", status: "pendente" };
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      orgId,
      empId,
      data: {
        ...form,
        workloadHours: form.workloadHours || undefined,
        completionDate: form.completionDate || undefined,
        expirationDate: form.expirationDate || undefined,
      },
    });
    invalidate();
    setCreateOpen(false);
    setForm(emptyForm);
  };

  const openEdit = (t: EmployeeTraining) => {
    setEditingTraining(t);
    setForm({
      title: t.title,
      description: t.description || "",
      institution: t.institution || "",
      workloadHours: t.workloadHours || 0,
      completionDate: t.completionDate || "",
      expirationDate: t.expirationDate || "",
      status: t.status,
    });
  };

  const handleUpdate = async () => {
    if (!editingTraining) return;
    await updateMutation.mutateAsync({
      orgId,
      empId,
      trainId: editingTraining.id,
      data: {
        title: form.title,
        description: form.description || undefined,
        institution: form.institution || undefined,
        workloadHours: form.workloadHours || undefined,
        completionDate: form.completionDate || undefined,
        expirationDate: form.expirationDate || undefined,
        status: form.status,
      },
    });
    invalidate();
    setEditingTraining(null);
    setForm(emptyForm);
  };

  const handleDelete = async (trainId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, trainId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Registro de treinamentos conforme ISO 9001:2015 §7.2
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Treinamento
        </Button>
      </div>

      {trainings.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhum treinamento registrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trainings.map((t) => (
            <div key={t.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => openEdit(t)}>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-foreground">{t.title}</p>
                    <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full border font-medium", TRAINING_STATUS_COLORS[t.status] || "bg-gray-50 text-gray-500 border-gray-200")}>
                      {TRAINING_STATUS[t.status] || t.status}
                    </span>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    {t.institution && <span>{t.institution}</span>}
                    {t.workloadHours && <span>{t.workloadHours}h</span>}
                    {t.completionDate && <span>Concluído: {t.completionDate}</span>}
                    {t.expirationDate && <span>Validade: {t.expirationDate}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(t)} className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setCreateOpen} title="Novo Treinamento">
        <TrainingFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={!form.title || createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!editingTraining} onOpenChange={(open) => { if (!open) { setEditingTraining(null); setForm(emptyForm); } }} title="Editar Treinamento">
        <TrainingFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setEditingTraining(null); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={handleUpdate} disabled={!form.title || updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function AwarenessFormFields({ form, setForm }: { form: AwarenessForm; setForm: (f: AwarenessForm) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Tema *</Label>
        <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="mt-1" placeholder="Ex: Política da Qualidade" />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Data *</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Método de Verificação</Label>
          <Input value={form.verificationMethod} onChange={(e) => setForm({ ...form, verificationMethod: e.target.value })} className="mt-1" placeholder="Ex: Questionário" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-muted-foreground">Resultado</Label>
          <Input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="mt-1" placeholder="Ex: Aprovado" />
        </div>
      </div>
    </div>
  );
}

function ConscientizacaoTab({
  awareness,
  orgId,
  empId,
}: {
  awareness: EmployeeAwareness[];
  orgId: number;
  empId: number;
}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingAwareness, setEditingAwareness] = useState<EmployeeAwareness | null>(null);
  const createMutation = useCreateAwareness();
  const deleteMutation = useDeleteAwareness();
  const updateMutation = useUpdateAwareness();

  const emptyForm = { topic: "", description: "", date: new Date().toISOString().split("T")[0], verificationMethod: "", result: "" };
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId, empId) });

  const handleCreate = async () => {
    await createMutation.mutateAsync({ orgId, empId, data: form });
    invalidate();
    setCreateOpen(false);
    setForm(emptyForm);
  };

  const openEdit = (a: EmployeeAwareness) => {
    setEditingAwareness(a);
    setForm({
      topic: a.topic,
      description: a.description || "",
      date: a.date,
      verificationMethod: a.verificationMethod || "",
      result: a.result || "",
    });
  };

  const handleUpdate = async () => {
    if (!editingAwareness) return;
    await updateMutation.mutateAsync({
      orgId,
      empId,
      awaId: editingAwareness.id,
      data: {
        topic: form.topic,
        description: form.description || undefined,
        date: form.date,
        verificationMethod: form.verificationMethod || undefined,
        result: form.result || undefined,
      },
    });
    invalidate();
    setEditingAwareness(null);
    setForm(emptyForm);
  };

  const handleDelete = async (awaId: number) => {
    await deleteMutation.mutateAsync({ orgId, empId, awaId });
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Registros de conscientização conforme ISO 9001:2015 §7.3
        </p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Registro
        </Button>
      </div>

      {awareness.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">Nenhum registro de conscientização</p>
        </div>
      ) : (
        <div className="space-y-2">
          {awareness.map((a) => (
            <div key={a.id} className="bg-white border border-border/60 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => openEdit(a)}>
                  <p className="text-[13px] font-medium text-foreground">{a.topic}</p>
                  {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{a.date}</span>
                    {a.verificationMethod && <span>Método: {a.verificationMethod}</span>}
                    {a.result && <span>Resultado: {a.result}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(a)} className="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors cursor-pointer">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setCreateOpen} title="Novo Registro de Conscientização">
        <AwarenessFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} disabled={!form.topic || !form.date || createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!editingAwareness} onOpenChange={(open) => { if (!open) { setEditingAwareness(null); setForm(emptyForm); } }} title="Editar Registro de Conscientização">
        <AwarenessFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setEditingAwareness(null); setForm(emptyForm); }}>Cancelar</Button>
          <Button size="sm" onClick={handleUpdate} disabled={!form.topic || !form.date || updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

export default function ColaboradorDetailPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const [, params] = useRoute("/app/qualidade/colaboradores/:id");
  const empId = Number(params?.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"dados" | "competencias" | "treinamentos" | "conscientizacao">("dados");

  const { data: employee, isLoading, error } = useGetEmployee(orgId!, empId);
  const { data: units = [] } = useListUnits(orgId!);
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(orgId!, empId) });

  const handleFieldSave = async (key: string, val: string | number | null) => {
    const data: Record<string, string | number | null | undefined> = {};
    if (key === "unitId") {
      data.unitId = val ? Number(val) : null;
    } else {
      data[key] = val;
    }
    await updateMutation.mutateAsync({ orgId: orgId!, empId, data });
    invalidate();
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(orgId!) });
  };

  const handleArchive = async () => {
    if (!confirm("Tem certeza que deseja arquivar este colaborador? O status será alterado para Inativo.")) return;
    await deleteMutation.mutateAsync({ orgId: orgId!, empId });
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(orgId!) });
    navigate("/app/qualidade/colaboradores");
  };

  usePageTitle(employee?.name);

  if (!orgId) return null;

  if (isLoading) {
    return <div className="text-center py-20 text-[13px] text-muted-foreground">Carregando...</div>;
  }

  if (error || !employee) {
    return (
      <div className="text-center py-20">
        <p className="text-[13px] text-muted-foreground">Colaborador não encontrado</p>
        <Link href="/app/qualidade/colaboradores">
          <Button variant="outline" size="sm" className="mt-4 cursor-pointer">
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const tabs = [
    { key: "dados" as const, label: "Dados", icon: User },
    { key: "competencias" as const, label: "Competências", icon: Award, count: employee.competencies?.length },
    { key: "treinamentos" as const, label: "Treinamentos", icon: GraduationCap, count: employee.trainings?.length },
    { key: "conscientizacao" as const, label: "Conscientização", icon: Lightbulb, count: employee.awareness?.length },
  ];

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/app/qualidade/colaboradores">
              <button className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground transition-colors cursor-pointer">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{employee.name}</h1>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {employee.position || "Sem cargo"} {employee.department ? `· ${employee.department}` : ""}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={handleArchive}>
            <Archive className="h-3.5 w-3.5 mr-1.5" />
            Arquivar
          </Button>
        </div>

        <div className="mb-1">
          <div className="inline-flex items-center gap-1 rounded-xl p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer",
                  activeTab === tab.key
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "dados" && (
          <div className="grid grid-cols-2 gap-8">
            <div className="bg-white border border-border/60 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Informações Pessoais
              </h3>
              <InlineField label="Nome" value={employee.name} fieldKey="name" onSave={handleFieldSave} />
              <InlineField label="CPF" value={employee.cpf} fieldKey="cpf" onSave={handleFieldSave} />
              <InlineField label="E-mail" value={employee.email} fieldKey="email" onSave={handleFieldSave} />
              <InlineField label="Telefone" value={employee.phone} fieldKey="phone" onSave={handleFieldSave} />
            </div>
            <div className="bg-white border border-border/60 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Informações Profissionais
              </h3>
              <InlineField label="Cargo" value={employee.position} fieldKey="position" onSave={handleFieldSave} />
              <InlineField label="Departamento" value={employee.department} fieldKey="department" onSave={handleFieldSave} />
              <LinkedUnitsSection
                linkedUnits={employee.units || []}
                allUnits={units}
                orgId={orgId}
                empId={empId}
              />
              <InlineField
                label="Tipo de Contrato"
                value={employee.contractType}
                fieldKey="contractType"
                type="select"
                options={[
                  { value: "clt", label: "CLT" },
                  { value: "pj", label: "PJ" },
                  { value: "intern", label: "Estagiário" },
                  { value: "temporary", label: "Temporário" },
                ]}
                onSave={handleFieldSave}
              />
              <InlineField
                label="Status"
                value={employee.status}
                fieldKey="status"
                type="select"
                options={[
                  { value: "active", label: "Ativo" },
                  { value: "inactive", label: "Inativo" },
                  { value: "on_leave", label: "Afastado" },
                ]}
                onSave={handleFieldSave}
              />
              <InlineField label="Data de Admissão" value={employee.admissionDate} fieldKey="admissionDate" type="date" onSave={handleFieldSave} />
              <InlineField label="Data de Desligamento" value={employee.terminationDate} fieldKey="terminationDate" type="date" onSave={handleFieldSave} />
            </div>
          </div>
        )}

        {activeTab === "competencias" && (
          <CompetenciasTab competencies={employee.competencies || []} orgId={orgId} empId={empId} />
        )}

        {activeTab === "treinamentos" && (
          <TreinamentosTab trainings={employee.trainings || []} orgId={orgId} empId={empId} />
        )}

        {activeTab === "conscientizacao" && (
          <ConscientizacaoTab awareness={employee.awareness || []} orgId={orgId} empId={empId} />
        )}
      </div>
    </>
  );
}
