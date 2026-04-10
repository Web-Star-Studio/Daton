import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageTitle, usePageSubtitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useEmployeeMultiPicker } from "@/hooks/use-employee-multi-picker";
import { resolveApiUrl } from "@/lib/api";
import { uploadFileToStorage, formatFileSize } from "@/lib/uploads";
import {
  useListWorkEnvironmentControls,
  useCreateWorkEnvironmentControl,
  useUpdateWorkEnvironmentControl,
  useDeleteWorkEnvironmentControl,
  useListWorkEnvironmentVerifications,
  useCreateWorkEnvironmentVerification,
  useDeleteWorkEnvironmentVerification,
  useListWorkEnvironmentAttachments,
  useAddWorkEnvironmentAttachment,
  useDeleteWorkEnvironmentAttachment,
  getListWorkEnvironmentControlsQueryKey,
  getListWorkEnvironmentVerificationsQueryKey,
  getListWorkEnvironmentAttachmentsQueryKey,
  useListUnits,
  type WorkEnvironmentControl,
  type WorkEnvironmentVerification,
  type CreateWorkEnvironmentControlBody,
  type CreateWorkEnvironmentVerificationBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";

// --- Constants ---

const FACTOR_TYPE_LABELS: Record<string, string> = {
  fisico: "Físico",
  social: "Social",
  psicologico: "Psicológico",
};

const FACTOR_TYPE_COLORS: Record<string, string> = {
  fisico: "bg-blue-100 text-blue-700 border-blue-200",
  social: "bg-purple-100 text-purple-700 border-purple-200",
  psicologico: "bg-pink-100 text-pink-700 border-pink-200",
};

const RESULT_LABELS: Record<string, string> = {
  adequado: "Adequado",
  parcial: "Parcial",
  inadequado: "Inadequado",
};

const RESULT_COLORS: Record<string, string> = {
  adequado: "bg-green-100 text-green-700 border-green-200",
  parcial: "bg-yellow-100 text-yellow-700 border-yellow-200",
  inadequado: "bg-red-100 text-red-700 border-red-200",
};

const FREQUENCY_LABELS: Record<string, string> = {
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const FREQUENCY_DAYS: Record<string, number> = {
  semanal: 7,
  mensal: 30,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

const STATUS_LABELS: Record<string, string> = { ativo: "Ativo", inativo: "Inativo" };
const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-100 text-green-700 border-green-200",
  inativo: "bg-gray-100 text-gray-600 border-gray-200",
};

// --- Helpers ---

function nextDueDate(lastVerifiedAt: string, frequency: string): Date {
  const days = FREQUENCY_DAYS[frequency] ?? 30;
  return new Date(new Date(lastVerifiedAt).getTime() + days * 24 * 60 * 60 * 1000);
}

function isOverdue(lastVerifiedAt: string, frequency: string): boolean {
  return nextDueDate(lastVerifiedAt, frequency) < new Date();
}

function VerificationDueBadge({
  lastVerifiedAt,
  frequency,
}: {
  lastVerifiedAt: string | null | undefined;
  frequency: string;
}) {
  if (!lastVerifiedAt) return <span className="text-xs text-muted-foreground">—</span>;

  const freqDays = FREQUENCY_DAYS[frequency] ?? 30;
  const due = nextDueDate(lastVerifiedAt, frequency);
  const now = new Date();
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = due.toLocaleDateString("pt-BR");
  const warningDays = Math.max(3, Math.floor(freqDays * 0.2));

  if (daysLeft < 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <AlertTriangle className="h-3 w-3" /> {label}
      </span>
    );
  }
  if (daysLeft <= warningDays) {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-600">
        <AlertTriangle className="h-3 w-3" /> {label}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

function controlAlertStatus(ctrl: WorkEnvironmentControl): "desvio" | "sem-verificacao" | "ok" {
  if (ctrl.verificationCount === 0) return "sem-verificacao";
  if (ctrl.lastResult === "inadequado") return "desvio";
  return "ok";
}

function ControlStatusBadge({ ctrl }: { ctrl: WorkEnvironmentControl }) {
  const alert = controlAlertStatus(ctrl);
  if (alert === "desvio") {
    const hasAction = !!ctrl.lastActionTaken;
    return (
      <Badge variant="outline" className={`text-xs ${hasAction ? "bg-yellow-100 text-yellow-700 border-yellow-200" : "bg-red-100 text-red-700 border-red-200"}`}>
        {hasAction ? "Desvio c/ ação" : "Desvio sem ação"}
      </Badge>
    );
  }
  if (alert === "sem-verificacao") {
    return <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Sem verificação</Badge>;
  }
  if (ctrl.lastResult) {
    return <Badge variant="outline" className={`text-xs ${RESULT_COLORS[ctrl.lastResult]}`}>{RESULT_LABELS[ctrl.lastResult]}</Badge>;
  }
  return null;
}

// --- Verification attachments ---

function VerificationAttachments({
  orgId,
  controlId,
  verification,
  canWrite,
}: {
  orgId: number;
  controlId: number;
  verification: WorkEnvironmentVerification;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data: attachments = [] } = useListWorkEnvironmentAttachments(orgId, controlId, verification.id);
  const addMut = useAddWorkEnvironmentAttachment();
  const deleteMut = useDeleteWorkEnvironmentAttachment();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ref = await uploadFileToStorage(file);
      await addMut.mutateAsync({ orgId, controlId, verificationId: verification.id, data: ref });
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentAttachmentsQueryKey(orgId, controlId, verification.id) });
      toast({ title: "Evidência anexada" });
    } catch {
      toast({ title: "Erro ao anexar evidência", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(attachmentId: number) {
    try {
      await deleteMut.mutateAsync({ orgId, controlId, verificationId: verification.id, attachmentId });
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentAttachmentsQueryKey(orgId, controlId, verification.id) });
      toast({ title: "Evidência removida" });
    } catch {
      toast({ title: "Erro ao remover evidência", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-1 mt-1">
      {attachments.map((a) => (
        <div key={a.id} className="flex items-center gap-1.5 text-[10px]">
          <FileText className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
          <a
            href={resolveApiUrl(`/api/storage${a.objectPath}`)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate text-blue-600 hover:underline"
          >
            {a.fileName}
          </a>
          <span className="text-muted-foreground shrink-0">{formatFileSize(a.fileSize)}</span>
          {canWrite && (
            <button onClick={() => handleDelete(a.id)} className="text-muted-foreground hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      ))}
      {canWrite && (
        <label className={`flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground w-fit ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <Plus className="h-2.5 w-2.5" />
          {uploading ? "Enviando..." : "Anexar evidência"}
          <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
      )}
    </div>
  );
}

// --- Verifications panel ---

type VerifForm = {
  verifiedAt: string;
  verifiedById: string;
  result: string;
  notes: string;
  actionTaken: string;
};

const defaultVerifForm = (): VerifForm => ({
  verifiedAt: new Date().toISOString().slice(0, 16),
  verifiedById: "",
  result: "adequado",
  notes: "",
  actionTaken: "",
});

function VerificationsPanel({
  orgId,
  control,
  canWrite,
  employees,
}: {
  orgId: number;
  control: WorkEnvironmentControl;
  canWrite: boolean;
  employees: { id: number; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [verifForm, setVerifForm] = useState<VerifForm>(defaultVerifForm());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: verifications = [], isLoading } = useListWorkEnvironmentVerifications(orgId, control.id);
  const createMut = useCreateWorkEnvironmentVerification();
  const deleteMut = useDeleteWorkEnvironmentVerification();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const body: CreateWorkEnvironmentVerificationBody = {
      verifiedAt: new Date(verifForm.verifiedAt).toISOString(),
      verifiedById: verifForm.verifiedById ? Number(verifForm.verifiedById) : null,
      result: verifForm.result as CreateWorkEnvironmentVerificationBody["result"],
      notes: verifForm.notes || null,
      actionTaken: verifForm.actionTaken || null,
    };
    try {
      await createMut.mutateAsync({ orgId, controlId: control.id, data: body });
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentVerificationsQueryKey(orgId, control.id) });
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentControlsQueryKey(orgId) });
      setAdding(false);
      setVerifForm(defaultVerifForm());
      toast({ title: "Verificação registrada" });
    } catch {
      toast({ title: "Erro ao registrar verificação", variant: "destructive" });
    }
  }

  async function handleDelete(verificationId: number) {
    try {
      await deleteMut.mutateAsync({ orgId, controlId: control.id, verificationId });
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentVerificationsQueryKey(orgId, control.id) });
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentControlsQueryKey(orgId) });
      if (expandedId === verificationId) setExpandedId(null);
      toast({ title: "Verificação removida" });
    } catch {
      toast({ title: "Erro ao remover verificação", variant: "destructive" });
    }
  }

  const needsAction = (v: WorkEnvironmentVerification) =>
    (v.result === "inadequado" || v.result === "parcial") && !v.actionTaken;

  return (
    <div className="flex flex-col gap-2">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : verifications.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">Nenhuma verificação registrada.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {verifications.map((v) => {
            const expanded = expandedId === v.id;
            const alert = needsAction(v);
            return (
              <div key={v.id} className="rounded-md border overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40"
                  onClick={() => setExpandedId(expanded ? null : v.id)}
                >
                  {expanded
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${RESULT_COLORS[v.result]}`}>
                    {RESULT_LABELS[v.result]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.verifiedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  {v.verifiedByName && <span className="text-xs text-muted-foreground">· {v.verifiedByName}</span>}
                  {alert && (
                    <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200 ml-auto shrink-0">
                      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                      Sem ação
                    </Badge>
                  )}
                  {canWrite && (
                    <button
                      className="ml-auto text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}
                      aria-label="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="border-t px-3 py-2 flex flex-col gap-1.5 text-xs">
                    {v.notes && <p className="text-muted-foreground">{v.notes}</p>}
                    {v.actionTaken && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground font-medium">Ação tomada:</span>
                        <p className="text-muted-foreground">{v.actionTaken}</p>
                      </div>
                    )}
                    <VerificationAttachments
                      orgId={orgId}
                      controlId={v.controlId}
                      verification={v}
                      canWrite={canWrite}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Data/hora *</Label>
              <Input type="datetime-local" required value={verifForm.verifiedAt}
                onChange={(e) => setVerifForm((f) => ({ ...f, verifiedAt: e.target.value }))}
                className="text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Resultado *</Label>
              <Select value={verifForm.result}
                onChange={(e) => setVerifForm((f) => ({ ...f, result: e.target.value }))}
                className="text-xs">
                <option value="adequado">Adequado</option>
                <option value="parcial">Parcial</option>
                <option value="inadequado">Inadequado</option>
            </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Verificado por</Label>
            <Select value={verifForm.verifiedById}
              onChange={(e) => setVerifForm((f) => ({ ...f, verifiedById: e.target.value }))}
              className="text-xs">
              <option value="">Nenhum</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Observações</Label>
            <Textarea value={verifForm.notes}
              onChange={(e) => setVerifForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} className="text-xs" placeholder="Descreva o que foi observado..." />
          </div>
          {(verifForm.result === "inadequado" || verifForm.result === "parcial") && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-yellow-600" />
                Ação tomada
              </Label>
              <Textarea value={verifForm.actionTaken}
                onChange={(e) => setVerifForm((f) => ({ ...f, actionTaken: e.target.value }))}
                rows={2} className="text-xs" placeholder="Descreva a ação corretiva ou de melhoria..." />
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createMut.isPending}>Salvar</Button>
            <Button type="button" size="sm" variant="ghost"
              onClick={() => { setAdding(false); setVerifForm(defaultVerifForm()); }}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {canWrite && !adding && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Registrar verificação
        </Button>
      )}
    </div>
  );
}

// --- Control detail sheet ---

type ControlForm = {
  title: string;
  factorType: string;
  frequency: string;
  unitId: string;
  responsibleId: string;
  description: string;
  status: string;
};

const defaultControlForm = (): ControlForm => ({
  title: "",
  factorType: "fisico",
  frequency: "mensal",
  unitId: "",
  responsibleId: "",
  description: "",
  status: "ativo",
});

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function ControlDetailSheet({
  control,
  units,
  orgId,
  canWrite,
  onEdit,
  onClose,
}: {
  control: WorkEnvironmentControl | null;
  units: { id: number; name: string }[];
  orgId: number;
  canWrite: boolean;
  onEdit: (ctrl: WorkEnvironmentControl) => void;
  onClose: () => void;
}) {
  const employeePicker = useEmployeeMultiPicker({ orgId, selectedIds: [] });

  if (!control) return null;

  return (
    <Sheet open={!!control} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-start justify-between gap-2 pr-6">
            <SheetTitle className="text-base leading-tight">{control.title}</SheetTitle>
            {canWrite && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => onEdit(control)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Editar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className={FACTOR_TYPE_COLORS[control.factorType]}>
              {FACTOR_TYPE_LABELS[control.factorType]}
            </Badge>
            <Badge variant="outline" className={STATUS_COLORS[control.status]}>
              {STATUS_LABELS[control.status]}
            </Badge>
            <ControlStatusBadge ctrl={control} />
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <DetailField label="Unidade" value={control.unitName} />
            <DetailField label="Frequência" value={FREQUENCY_LABELS[control.frequency]} />
            <DetailField label="Responsável" value={control.responsibleName} />
            <DetailField
              label="Última verificação"
              value={control.lastVerifiedAt ? new Date(control.lastVerifiedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : undefined}
            />
            <DetailField
              label="Próxima verificação"
              value={<VerificationDueBadge lastVerifiedAt={control.lastVerifiedAt} frequency={control.frequency} />}
            />
          </div>
          {control.description && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Descrição</span>
              <p className="text-sm text-muted-foreground leading-relaxed">{control.description}</p>
            </div>
          )}

          <div className="border-t pt-4 flex flex-col gap-3">
            <span className="text-sm font-medium">Verificações</span>
            <VerificationsPanel
              orgId={orgId}
              control={control}
              canWrite={canWrite}
              employees={employeePicker.options}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Main page ---

export default function AmbientePage() {
  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization!.id;
  const queryClient = useQueryClient();
  const canWrite = canWriteModule("assets");

  usePageTitle("Ambiente Operacional");
  usePageSubtitle("Controles do ambiente de trabalho físico, social e psicológico (ISO 9001:2015 §7.1.4)");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingControl, setEditingControl] = useState<WorkEnvironmentControl | null>(null);
  const [detailControlId, setDetailControlId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkEnvironmentControl | null>(null);
  const [form, setForm] = useState<ControlForm>(defaultControlForm());
  const [unitFilter, setUnitFilter] = useState("");
  const [factorFilter, setFactorFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: controls = [], isLoading } = useListWorkEnvironmentControls(orgId);
  const detailControl = detailControlId != null ? (controls.find((c) => c.id === detailControlId) ?? null) : null;
  const { data: units = [] } = useListUnits(orgId);
  const employeePicker = useEmployeeMultiPicker({ orgId, selectedIds: [] });
  const createMut = useCreateWorkEnvironmentControl();
  const updateMut = useUpdateWorkEnvironmentControl();
  const deleteMut = useDeleteWorkEnvironmentControl();

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        icon={<Plus className="h-4 w-4" />}
        label="Novo Controle"
        onClick={() => {
          setEditingControl(null);
          setForm(defaultControlForm());
          setDialogOpen(true);
        }}
      />
    ) : null,
  );

  const filtered = controls.filter((c) => {
    if (unitFilter && String(c.unitId ?? "") !== unitFilter) return false;
    if (factorFilter && c.factorType !== factorFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.title.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  function openEdit(ctrl: WorkEnvironmentControl) {
    setDetailControlId(null);
    setEditingControl(ctrl);
    setForm({
      title: ctrl.title,
      factorType: ctrl.factorType,
      frequency: ctrl.frequency,
      unitId: ctrl.unitId != null ? String(ctrl.unitId) : "",
      responsibleId: ctrl.responsibleId != null ? String(ctrl.responsibleId) : "",
      description: ctrl.description ?? "",
      status: ctrl.status,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base = {
      title: form.title,
      factorType: form.factorType as CreateWorkEnvironmentControlBody["factorType"],
      frequency: form.frequency as CreateWorkEnvironmentControlBody["frequency"],
      unitId: form.unitId ? Number(form.unitId) : null,
      responsibleId: form.responsibleId ? Number(form.responsibleId) : null,
      description: form.description || null,
    };
    try {
      if (editingControl) {
        await updateMut.mutateAsync({ orgId, controlId: editingControl.id, data: { ...base, status: form.status as "ativo" | "inativo" } });
        toast({ title: "Controle atualizado" });
      } else {
        await createMut.mutateAsync({ orgId, data: base });
        toast({ title: "Controle cadastrado" });
      }
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentControlsQueryKey(orgId) });
      setDialogOpen(false);
    } catch {
      toast({ title: "Erro ao salvar controle", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ orgId, controlId: deleteTarget.id });
      queryClient.invalidateQueries({ queryKey: getListWorkEnvironmentControlsQueryKey(orgId) });
      if (detailControlId === deleteTarget.id) setDetailControlId(null);
      toast({ title: "Controle removido" });
    } catch {
      toast({ title: "Erro ao remover controle", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  }

  const desvioSemAcaoCount = controls.filter(
    (c) => c.status === "ativo" && c.lastResult === "inadequado" && !c.lastActionTaken,
  ).length;
  const semVerificacaoCount = controls.filter(
    (c) => c.status === "ativo" && c.verificationCount === 0,
  ).length;
  const vencidaCount = controls.filter(
    (c) => c.status === "ativo" && c.verificationCount > 0 && c.lastVerifiedAt != null && isOverdue(c.lastVerifiedAt, c.frequency),
  ).length;

  return (
    <div className="flex flex-col gap-4 p-6">
      {(vencidaCount > 0 || desvioSemAcaoCount > 0 || semVerificacaoCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {vencidaCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {vencidaCount} verificaç{vencidaCount > 1 ? "ões vencidas" : "ão vencida"}
            </div>
          )}
          {desvioSemAcaoCount > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              {desvioSemAcaoCount} desvio{desvioSemAcaoCount > 1 ? "s" : ""} sem ação tomada
            </div>
          )}
          {semVerificacaoCount > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
              <AlertTriangle className="h-4 w-4" />
              {semVerificacaoCount} controle{semVerificacaoCount > 1 ? "s" : ""} sem verificação registrada
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por título ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="w-48">
          <option value="">Todas as unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
        <Select value={factorFilter} onChange={(e) => setFactorFilter(e.target.value)} className="w-44">
          <option value="">Todos os fatores</option>
          <option value="fisico">Físico</option>
          <option value="social">Social</option>
          <option value="psicologico">Psicológico</option>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {search || unitFilter || factorFilter
              ? "Nenhum controle encontrado para os filtros selecionados."
              : "Nenhum controle de ambiente cadastrado."}
          </p>
          {canWrite && !search && (
            <Button size="sm" onClick={() => { setEditingControl(null); setForm(defaultControlForm()); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />
              Cadastrar controle
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Fator</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Próx. verificação</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Verificações</TableHead>
              <TableHead>Status</TableHead>
              {canWrite && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((ctrl) => (
              <TableRow key={ctrl.id} className="cursor-pointer" onClick={() => setDetailControlId(ctrl.id)}>
                <TableCell className="font-medium">{ctrl.title}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={FACTOR_TYPE_COLORS[ctrl.factorType]}>
                    {FACTOR_TYPE_LABELS[ctrl.factorType]}
                  </Badge>
                </TableCell>
                <TableCell>{ctrl.unitName ?? "—"}</TableCell>
                <TableCell>
                  <VerificationDueBadge lastVerifiedAt={ctrl.lastVerifiedAt} frequency={ctrl.frequency} />
                </TableCell>
                <TableCell>{ctrl.responsibleName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{ctrl.verificationCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 items-center">
                    {ctrl.status === "inativo" && (
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS.inativo}`}>
                        {STATUS_LABELS.inativo}
                      </Badge>
                    )}
                    <ControlStatusBadge ctrl={ctrl} />
                  </div>
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(ctrl)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(ctrl)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ControlDetailSheet
        control={detailControl}
        units={units}
        orgId={orgId}
        canWrite={canWrite}
        onEdit={openEdit}
        onClose={() => setDetailControlId(null)}
      />

      {/* Create / Edit dialog */}
      {dialogOpen && createPortal(
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => { if (!open) setDialogOpen(false); }}
          title={editingControl ? "Editar controle" : "Novo controle de ambiente"}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Título *</Label>
              <Input required value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Nível de ruído no galpão A" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Fator</Label>
                <Select value={form.factorType}
                  onChange={(e) => setForm((f) => ({ ...f, factorType: e.target.value }))}>
                  <option value="fisico">Físico</option>
                  <option value="social">Social</option>
                  <option value="psicologico">Psicológico</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Frequência</Label>
                <Select value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Unidade</Label>
                <Select value={form.unitId}
                  onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}>
                  <option value="">Nenhuma</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Responsável</Label>
                <Select value={form.responsibleId}
                  onChange={(e) => setForm((f) => ({ ...f, responsibleId: e.target.value }))}>
                  <option value="">Nenhum</option>
                  {employeePicker.options.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Descrição</Label>
              <Textarea value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descreva o que é monitorado e como" rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {editingControl ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>,
        document.body,
      )}

      {/* Delete confirmation */}
      {deleteTarget && createPortal(
        <Dialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title="Remover controle"
        >
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover o controle <strong>{deleteTarget.title}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMut.isPending}>Remover</Button>
          </DialogFooter>
        </Dialog>,
        document.body,
      )}
    </div>
  );
}
