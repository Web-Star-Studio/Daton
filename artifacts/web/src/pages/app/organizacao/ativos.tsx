import { useState } from "react";
import { Building2, ChevronDown, ChevronRight, ClipboardList, FileText, Pencil, Plus, Trash2, Wrench, X } from "lucide-react";
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
import { useDocumentMultiPicker } from "@/hooks/use-document-multi-picker";
import {
  useListAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useListAssetDocuments,
  useAddAssetDocument,
  useRemoveAssetDocument,
  useListAssetMaintenancePlans,
  useCreateAssetMaintenancePlan,
  useUpdateAssetMaintenancePlan,
  useDeleteAssetMaintenancePlan,
  useListAssetMaintenanceRecords,
  useCreateAssetMaintenanceRecord,
  useDeleteAssetMaintenanceRecord,
  useListMaintenanceRecordAttachments,
  useAddMaintenanceRecordAttachment,
  useDeleteMaintenanceRecordAttachment,
  getListAssetsQueryKey,
  getListAssetDocumentsQueryKey,
  getListAssetMaintenancePlansQueryKey,
  getListAssetMaintenanceRecordsQueryKey,
  getListMaintenanceRecordAttachmentsQueryKey,
  useListUnits,
  type Asset,
  type AssetDocument,
  type AssetMaintenancePlan,
  type AssetMaintenanceRecord,
  type CreateAssetBody,
  type CreateAssetMaintenancePlanBody,
  type CreateAssetMaintenanceRecordBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { resolveApiUrl, getAuthHeaders } from "@/lib/api";
import { uploadFileToStorage, formatFileSize } from "@/lib/uploads";

const CRITICALITY_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const CRITICALITY_COLORS: Record<string, string> = {
  alta: "bg-red-100 text-red-700 border-red-200",
  media: "bg-yellow-100 text-yellow-700 border-yellow-200",
  baixa: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  em_manutencao: "Em manutenção",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-100 text-green-700 border-green-200",
  inativo: "bg-gray-100 text-gray-600 border-gray-200",
  em_manutencao: "bg-orange-100 text-orange-700 border-orange-200",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  manual: "Manual",
  procedure: "Procedimento",
  instruction: "Instrução",
  form: "Formulário",
  policy: "Política",
};

type AssetForm = {
  name: string;
  assetType: string;
  criticality: string;
  status: string;
  location: string;
  impactedProcess: string;
  responsibleId: number | null;
  description: string;
  unitId: string;
};

const defaultForm = (): AssetForm => ({
  name: "",
  assetType: "",
  criticality: "media",
  status: "ativo",
  location: "",
  impactedProcess: "",
  responsibleId: null,
  description: "",
  unitId: "",
});

// --- Asset detail sheet ---

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function AssetDocumentsSection({
  orgId,
  asset,
  canWrite,
}: {
  orgId: number;
  asset: Asset;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [addingDoc, setAddingDoc] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>("");

  const { data: linkedDocs = [], isLoading } = useListAssetDocuments(orgId, asset.id);
  const addMut = useAddAssetDocument();
  const removeMut = useRemoveAssetDocument();

  const linkedIds = linkedDocs.map((d) => d.documentId);
  const docPicker = useDocumentMultiPicker({
    orgId,
    selectedIds: [],
    excludeIds: linkedIds,
    enabled: addingDoc,
  });

  async function handleAdd() {
    if (!selectedDocId) return;
    try {
      await addMut.mutateAsync({ orgId, assetId: asset.id, data: { documentId: Number(selectedDocId) } });
      queryClient.invalidateQueries({ queryKey: getListAssetDocumentsQueryKey(orgId, asset.id) });
      setSelectedDocId("");
      setAddingDoc(false);
      toast({ title: "Documento vinculado" });
    } catch {
      toast({ title: "Erro ao vincular documento", variant: "destructive" });
    }
  }

  async function handleRemove(doc: AssetDocument) {
    try {
      await removeMut.mutateAsync({ orgId, assetId: asset.id, documentId: doc.documentId });
      queryClient.invalidateQueries({ queryKey: getListAssetDocumentsQueryKey(orgId, asset.id) });
      toast({ title: "Documento desvinculado" });
    } catch {
      toast({ title: "Erro ao desvincular documento", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Documentos e instruções</span>
        {canWrite && !addingDoc && (
          <Button size="sm" variant="outline" onClick={() => setAddingDoc(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Vincular
          </Button>
        )}
      </div>

      {addingDoc && (
        <div className="flex gap-2 items-end">
          <div className="flex-1 flex flex-col gap-1">
            <Label className="text-xs">Selecionar documento</Label>
            <Select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="text-sm"
            >
              <option value="">Escolha um documento...</option>
              {docPicker.options.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!selectedDocId || addMut.isPending}>
            Adicionar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddingDoc(false); setSelectedDocId(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : linkedDocs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum documento vinculado.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {linkedDocs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={`/qualidade/documentacao/${doc.documentId}`}
                className="flex-1 truncate text-blue-600 hover:underline"
              >
                {doc.documentTitle}
              </a>
              <Badge variant="outline" className="text-xs shrink-0">
                {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </Badge>
              {canWrite && (
                <button
                  onClick={() => handleRemove(doc)}
                  className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Desvincular"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Maintenance constants ---

const PLAN_TYPE_LABELS: Record<string, string> = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  inspecao: "Inspeção",
};

const PLAN_TYPE_COLORS: Record<string, string> = {
  preventiva: "bg-blue-100 text-blue-700 border-blue-200",
  corretiva: "bg-orange-100 text-orange-700 border-orange-200",
  inspecao: "bg-purple-100 text-purple-700 border-purple-200",
};

const PERIODICITY_LABELS: Record<string, string> = {
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  unica: "Única",
};

const RECORD_STATUS_LABELS: Record<string, string> = {
  concluida: "Concluída",
  parcial: "Parcial",
  cancelada: "Cancelada",
};

const RECORD_STATUS_COLORS: Record<string, string> = {
  concluida: "bg-green-100 text-green-700 border-green-200",
  parcial: "bg-yellow-100 text-yellow-700 border-yellow-200",
  cancelada: "bg-gray-100 text-gray-600 border-gray-200",
};

function MaintenanceStatusCell({ asset }: { asset: Asset }) {
  const { activePlanCount, overdueCount, nearestDueAt } = asset;

  if (activePlanCount === 0) {
    return <span className="text-xs text-muted-foreground">Sem planos</span>;
  }

  if (!nearestDueAt) {
    return <span className="text-xs text-muted-foreground">Sem data</span>;
  }

  const due = parsePlanDate(nearestDueAt);
  if (!due) return <span className="text-xs text-muted-foreground">Sem data</span>;

  const diffDays = dateDiffDays(due);
  const dateLabel = due.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  if (overdueCount > 0) {
    return (
      <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">
        {overdueCount > 1 ? `${overdueCount} vencidos` : "Vencido"} · há {Math.abs(diffDays)}d
      </Badge>
    );
  }

  if (diffDays === 0) {
    return <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">Vence hoje</Badge>;
  }

  if (diffDays <= 7) {
    return (
      <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200">
        Vence em {diffDays}d · {dateLabel}
      </Badge>
    );
  }

  return (
    <span className="text-xs text-green-700">
      Em dia · {due.toLocaleDateString("pt-BR")}
    </span>
  );
}

function parsePlanDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00"); // force local time, not UTC
}

function dateDiffDays(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function PlanDueBadge({ nextDueAt, recordCount }: { nextDueAt: string | null | undefined; recordCount: number }) {
  const due = parsePlanDate(nextDueAt);

  if (recordCount === 0) {
    if (!due) return <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Sem execução</Badge>;
    const diff = dateDiffDays(due);
    if (diff < 0) return <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">Vencido · sem execução</Badge>;
    return <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Sem execução</Badge>;
  }

  if (!due) return <span className="text-xs text-muted-foreground">Sem data</span>;

  const diff = dateDiffDays(due);
  const dateLabel = due.toLocaleDateString("pt-BR");

  if (diff < 0) {
    return <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">Vencido · há {Math.abs(diff)}d</Badge>;
  }
  if (diff <= 7) {
    return <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200">Vence em {diff}d · {due.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</Badge>;
  }
  return <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Em dia · {dateLabel}</Badge>;
}

type PlanForm = {
  title: string;
  type: string;
  periodicity: string;
  responsibleId: string;
  nextDueAt: string;
  checklistItems: string; // newline-separated
};

const defaultPlanForm = (): PlanForm => ({
  title: "",
  type: "preventiva",
  periodicity: "mensal",
  responsibleId: "",
  nextDueAt: "",
  checklistItems: "",
});

type RecordForm = {
  executedAt: string;
  executedById: string;
  status: string;
  notes: string;
};

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const defaultRecordForm = (): RecordForm => ({
  executedAt: toLocalDatetimeString(new Date()),
  executedById: "",
  status: "concluida",
  notes: "",
});

function RecordAttachments({
  orgId,
  assetId,
  planId,
  record,
  canWrite,
}: {
  orgId: number;
  assetId: number;
  planId: number;
  record: AssetMaintenanceRecord;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data: attachments = [] } = useListMaintenanceRecordAttachments(orgId, assetId, planId, record.id);
  const addMut = useAddMaintenanceRecordAttachment();
  const deleteMut = useDeleteMaintenanceRecordAttachment();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ref = await uploadFileToStorage(file);
      await addMut.mutateAsync({
        orgId,
        assetId,
        planId,
        recordId: record.id,
        data: ref,
      });
      queryClient.invalidateQueries({ queryKey: getListMaintenanceRecordAttachmentsQueryKey(orgId, assetId, planId, record.id) });
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
      await deleteMut.mutateAsync({ orgId, assetId, planId, recordId: record.id, attachmentId });
      queryClient.invalidateQueries({ queryKey: getListMaintenanceRecordAttachmentsQueryKey(orgId, assetId, planId, record.id) });
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
            {...getAuthHeaders() && {}}
          >
            {a.fileName}
          </a>
          <span className="text-muted-foreground shrink-0">{formatFileSize(a.fileSize)}</span>
          {canWrite && (
            <button onClick={() => handleDelete(a.id)} className="text-muted-foreground hover:text-destructive shrink-0">
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

function PlanRecordsPanel({
  orgId,
  assetId,
  plan,
  canWrite,
  employees,
}: {
  orgId: number;
  assetId: number;
  plan: AssetMaintenancePlan;
  canWrite: boolean;
  employees: { id: number; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [addingRecord, setAddingRecord] = useState(false);
  const [recordForm, setRecordForm] = useState<RecordForm>(defaultRecordForm());

  const { data: records = [], isLoading } = useListAssetMaintenanceRecords(orgId, assetId, plan.id);
  const createRecordMut = useCreateAssetMaintenanceRecord();
  const deleteRecordMut = useDeleteAssetMaintenanceRecord();

  async function handleAddRecord(e: React.FormEvent) {
    e.preventDefault();
    const body: CreateAssetMaintenanceRecordBody = {
      executedAt: new Date(recordForm.executedAt).toISOString(),
      executedById: recordForm.executedById ? Number(recordForm.executedById) : null,
      status: recordForm.status as CreateAssetMaintenanceRecordBody["status"],
      notes: recordForm.notes || null,
    };
    try {
      await createRecordMut.mutateAsync({ orgId, assetId, planId: plan.id, data: body });
      queryClient.invalidateQueries({ queryKey: getListAssetMaintenanceRecordsQueryKey(orgId, assetId, plan.id) });
      queryClient.invalidateQueries({ queryKey: getListAssetMaintenancePlansQueryKey(orgId, assetId) });
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      setAddingRecord(false);
      setRecordForm(defaultRecordForm());
      toast({ title: "Execução registrada" });
    } catch {
      toast({ title: "Erro ao registrar execução", variant: "destructive" });
    }
  }

  async function handleDeleteRecord(recordId: number) {
    try {
      await deleteRecordMut.mutateAsync({ orgId, assetId, planId: plan.id, recordId });
      queryClient.invalidateQueries({ queryKey: getListAssetMaintenanceRecordsQueryKey(orgId, assetId, plan.id) });
      queryClient.invalidateQueries({ queryKey: getListAssetMaintenancePlansQueryKey(orgId, assetId) });
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      toast({ title: "Registro removido" });
    } catch {
      toast({ title: "Erro ao remover registro", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-2 pl-2 border-l">
      {canWrite && !addingRecord && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setAddingRecord(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Registrar execução
        </Button>
      )}

      {addingRecord && (
        <form onSubmit={handleAddRecord} className="flex flex-col gap-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Data/hora *</Label>
              <Input
                type="datetime-local"
                required
                value={recordForm.executedAt}
                onChange={(e) => setRecordForm((f) => ({ ...f, executedAt: e.target.value }))}
                className="text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status *</Label>
              <Select
                value={recordForm.status}
                onChange={(e) => setRecordForm((f) => ({ ...f, status: e.target.value }))}
                className="text-xs"
              >
                <option value="concluida">Concluída</option>
                <option value="parcial">Parcial</option>
                <option value="cancelada">Cancelada</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Executado por</Label>
            <Select
              value={recordForm.executedById}
              onChange={(e) => setRecordForm((f) => ({ ...f, executedById: e.target.value }))}
              className="text-xs"
            >
              <option value="">Nenhum</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={recordForm.notes}
              onChange={(e) => setRecordForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="text-xs"
              placeholder="Descreva o que foi feito..."
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createRecordMut.isPending}>Salvar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingRecord(false); setRecordForm(defaultRecordForm()); }}>Cancelar</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : records.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma execução registrada.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {records.map((rec) => (
            <div key={rec.id} className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${RECORD_STATUS_COLORS[rec.status]}`}>
                    {RECORD_STATUS_LABELS[rec.status]}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(rec.executedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  {rec.executedByName && <span className="text-muted-foreground">· {rec.executedByName}</span>}
                </div>
                {rec.notes && <p className="text-muted-foreground mt-0.5">{rec.notes}</p>}
                <RecordAttachments
                  orgId={orgId}
                  assetId={assetId}
                  planId={plan.id}
                  record={rec}
                  canWrite={canWrite}
                />
              </div>
              {canWrite && (
                <button
                  onClick={() => handleDeleteRecord(rec.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenancePlansSection({
  orgId,
  asset,
  canWrite,
}: {
  orgId: number;
  asset: Asset;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [addingPlan, setAddingPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AssetMaintenancePlan | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(defaultPlanForm());

  const { data: plans = [], isLoading } = useListAssetMaintenancePlans(orgId, asset.id);
  const createPlanMut = useCreateAssetMaintenancePlan();
  const updatePlanMut = useUpdateAssetMaintenancePlan();
  const deletePlanMut = useDeleteAssetMaintenancePlan();
  const employeePicker = useEmployeeMultiPicker({ orgId, selectedIds: [] });

  function openAddPlan() {
    setEditingPlan(null);
    setPlanForm(defaultPlanForm());
    setAddingPlan(true);
  }

  function openEditPlan(plan: AssetMaintenancePlan) {
    setEditingPlan(plan);
    setPlanForm({
      title: plan.title,
      type: plan.type,
      periodicity: plan.periodicity,
      responsibleId: plan.responsibleId != null ? String(plan.responsibleId) : "",
      nextDueAt: plan.nextDueAt ?? "",
      checklistItems: plan.checklistItems.join("\n"),
    });
    setAddingPlan(true);
  }

  async function handleSubmitPlan(e: React.FormEvent) {
    e.preventDefault();
    const items = planForm.checklistItems
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const body: CreateAssetMaintenancePlanBody = {
      title: planForm.title,
      type: planForm.type as CreateAssetMaintenancePlanBody["type"],
      periodicity: planForm.periodicity as CreateAssetMaintenancePlanBody["periodicity"],
      checklistItems: items,
      responsibleId: planForm.responsibleId ? Number(planForm.responsibleId) : null,
      nextDueAt: planForm.nextDueAt || null,
    };
    try {
      if (editingPlan) {
        await updatePlanMut.mutateAsync({ orgId, assetId: asset.id, planId: editingPlan.id, data: body });
        toast({ title: "Plano atualizado" });
      } else {
        await createPlanMut.mutateAsync({ orgId, assetId: asset.id, data: body });
        toast({ title: "Plano criado" });
      }
      queryClient.invalidateQueries({ queryKey: getListAssetMaintenancePlansQueryKey(orgId, asset.id) });
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      setAddingPlan(false);
      setEditingPlan(null);
    } catch {
      toast({ title: "Erro ao salvar plano", variant: "destructive" });
    }
  }

  async function handleDeletePlan(plan: AssetMaintenancePlan) {
    try {
      await deletePlanMut.mutateAsync({ orgId, assetId: asset.id, planId: plan.id });
      queryClient.invalidateQueries({ queryKey: getListAssetMaintenancePlansQueryKey(orgId, asset.id) });
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      if (expandedPlanId === plan.id) setExpandedPlanId(null);
      toast({ title: "Plano removido" });
    } catch {
      toast({ title: "Erro ao remover plano", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Planos de manutenção</span>
        </div>
        {canWrite && !addingPlan && (
          <Button size="sm" variant="outline" onClick={openAddPlan}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Novo plano
          </Button>
        )}
      </div>

      {addingPlan && (
        <form onSubmit={handleSubmitPlan} className="flex flex-col gap-3 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Título *</Label>
              <Input
                required
                value={planForm.title}
                onChange={(e) => setPlanForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Manutenção preventiva mensal"
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={planForm.type}
                onChange={(e) => setPlanForm((f) => ({ ...f, type: e.target.value }))}
                className="text-sm"
              >
                <option value="preventiva">Preventiva</option>
                <option value="corretiva">Corretiva</option>
                <option value="inspecao">Inspeção</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Periodicidade</Label>
              <Select
                value={planForm.periodicity}
                onChange={(e) => setPlanForm((f) => ({ ...f, periodicity: e.target.value }))}
                className="text-sm"
              >
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
                <option value="unica">Única vez</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Próxima execução</Label>
              <Input
                type="date"
                value={planForm.nextDueAt}
                onChange={(e) => setPlanForm((f) => ({ ...f, nextDueAt: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Responsável</Label>
              <Select
                value={planForm.responsibleId}
                onChange={(e) => setPlanForm((f) => ({ ...f, responsibleId: e.target.value }))}
                className="text-sm"
              >
                <option value="">Nenhum</option>
                {employeePicker.options.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Checklist (um item por linha)</Label>
              <Textarea
                value={planForm.checklistItems}
                onChange={(e) => setPlanForm((f) => ({ ...f, checklistItems: e.target.value }))}
                rows={3}
                placeholder={"Verificar nível de óleo\nLimpar filtros\nTestar pressão"}
                className="text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createPlanMut.isPending || updatePlanMut.isPending}>
              {editingPlan ? "Salvar alterações" : "Criar plano"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingPlan(false); setEditingPlan(null); }}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : plans.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum plano de manutenção cadastrado.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {plans.map((plan) => {
            const expanded = expandedPlanId === plan.id;
            return (
              <div key={plan.id} className="rounded-md border overflow-hidden">
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedPlanId(expanded ? null : plan.id)}
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 text-sm font-medium truncate">{plan.title}</span>
                  <Badge variant="outline" className={`text-xs shrink-0 ${PLAN_TYPE_COLORS[plan.type]}`}>
                    {PLAN_TYPE_LABELS[plan.type]}
                  </Badge>
                  <PlanDueBadge nextDueAt={plan.nextDueAt} recordCount={plan.recordCount} />
                  {canWrite && (
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="text-muted-foreground hover:text-foreground p-0.5"
                        onClick={() => openEditPlan(plan)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive p-0.5"
                        onClick={() => handleDeletePlan(plan)}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="border-t px-3 py-2 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Periodicidade: <strong className="text-foreground">{PERIODICITY_LABELS[plan.periodicity]}</strong></span>
                      {plan.responsibleName && <span>Responsável: <strong className="text-foreground">{plan.responsibleName}</strong></span>}
                    </div>
                    {plan.checklistItems.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ClipboardList className="h-3 w-3" />
                          Checklist
                        </div>
                        <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5 pl-1">
                          {plan.checklistItems.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                    <PlanRecordsPanel
                      orgId={orgId}
                      assetId={asset.id}
                      plan={plan}
                      canWrite={canWrite}
                      employees={employeePicker.options}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssetDetailSheet({
  asset,
  units,
  orgId,
  canWrite,
  onEdit,
  onClose,
}: {
  asset: Asset | null;
  units: { id: number; name: string }[];
  orgId: number;
  canWrite: boolean;
  onEdit: (asset: Asset) => void;
  onClose: () => void;
}) {
  if (!asset) return null;

  const unit = units.find((u) => u.id === asset.unitId);

  return (
    <Sheet open={!!asset} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-start justify-between gap-2 pr-6">
            <SheetTitle className="text-base leading-tight">{asset.name}</SheetTitle>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => onEdit(asset)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Editar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className={CRITICALITY_COLORS[asset.criticality]}>
              {CRITICALITY_LABELS[asset.criticality] ?? asset.criticality}
            </Badge>
            <Badge variant="outline" className={STATUS_COLORS[asset.status]}>
              {STATUS_LABELS[asset.status] ?? asset.status}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5">
          {/* Informações principais */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <DetailField label="Tipo" value={asset.assetType} />
            <DetailField label="Unidade" value={unit?.name} />
            <DetailField label="Localização" value={asset.location} />
            <DetailField label="Processo impactado" value={asset.impactedProcess} />
            <DetailField label="Responsável" value={asset.responsibleName} />
          </div>

          {asset.description && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Descrição</span>
              <p className="text-sm text-muted-foreground leading-relaxed">{asset.description}</p>
            </div>
          )}

          <div className="border-t pt-4">
            <AssetDocumentsSection orgId={orgId} asset={asset} canWrite={canWrite} />
          </div>

          <div className="border-t pt-4">
            <MaintenancePlansSection orgId={orgId} asset={asset} canWrite={canWrite} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Main page ---

export default function AtivosPage() {
  const { organization } = useAuth();
  const { canWriteModule } = usePermissions();
  const orgId = organization!.id;
  const queryClient = useQueryClient();
  const canWrite = canWriteModule("assets");

  usePageTitle("Ativos");
  usePageSubtitle("Cadastro de ativos críticos de infraestrutura (ISO 9001:2015 §7.1.3)");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState<AssetForm>(defaultForm());
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");

  const { data: assets = [], isLoading } = useListAssets(orgId);
  const { data: units = [] } = useListUnits(orgId);
  const employeePicker = useEmployeeMultiPicker({ orgId, selectedIds: form.responsibleId ? [form.responsibleId] : [] });
  const createMut = useCreateAsset();
  const updateMut = useUpdateAsset();
  const deleteMut = useDeleteAsset();

  useHeaderActions(
    canWrite ? (
      <HeaderActionButton
        icon={<Plus className="h-4 w-4" />}
        label="Novo Ativo"
        onClick={() => {
          setEditingAsset(null);
          setForm(defaultForm());
          setDialogOpen(true);
        }}
      />
    ) : null,
  );

  const filtered = assets.filter((a) => {
    if (unitFilter && String(a.unitId ?? "") !== unitFilter) return false;
    if (criticalityFilter && a.criticality !== criticalityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.assetType.toLowerCase().includes(q) ||
        (a.impactedProcess ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  function openEdit(asset: Asset) {
    setDetailAsset(null);
    setEditingAsset(asset);
    setForm({
      name: asset.name,
      assetType: asset.assetType,
      criticality: asset.criticality,
      status: asset.status,
      location: asset.location ?? "",
      impactedProcess: asset.impactedProcess ?? "",
      responsibleId: asset.responsibleId ?? null,
      description: asset.description ?? "",
      unitId: asset.unitId != null ? String(asset.unitId) : "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const body: CreateAssetBody = {
      name: form.name,
      assetType: form.assetType,
      criticality: form.criticality as CreateAssetBody["criticality"],
      status: form.status as CreateAssetBody["status"],
      location: form.location || null,
      impactedProcess: form.impactedProcess || null,
      responsibleId: form.responsibleId ?? null,
      description: form.description || null,
      unitId: form.unitId ? Number(form.unitId) : null,
    };

    try {
      if (editingAsset) {
        const updated = await updateMut.mutateAsync({ orgId, assetId: editingAsset.id, data: body });
        toast({ title: "Ativo atualizado" });
        // Sync detail sheet if it was the asset being viewed
        if (detailAsset?.id === editingAsset.id) setDetailAsset(updated);
      } else {
        await createMut.mutateAsync({ orgId, data: body });
        toast({ title: "Ativo cadastrado" });
      }
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      setDialogOpen(false);
    } catch {
      toast({ title: "Erro ao salvar ativo", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ orgId, assetId: deleteTarget.id });
      queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey(orgId) });
      if (detailAsset?.id === deleteTarget.id) setDetailAsset(null);
      toast({ title: "Ativo removido" });
    } catch {
      toast({ title: "Erro ao remover ativo", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, tipo ou processo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="w-48"
        >
          <option value="">Todas as unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          value={criticalityFilter}
          onChange={(e) => setCriticalityFilter(e.target.value)}
          className="w-40"
        >
          <option value="">Todas as criticidades</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {search || unitFilter || criticalityFilter
              ? "Nenhum ativo encontrado para os filtros selecionados."
              : "Nenhum ativo cadastrado."}
          </p>
          {canWrite && !search && (
            <Button
              size="sm"
              onClick={() => {
                setEditingAsset(null);
                setForm(defaultForm());
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Cadastrar ativo
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Processo impactado</TableHead>
              <TableHead>Criticidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Manutenção</TableHead>
              {canWrite && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((asset) => {
              const unit = units.find((u) => u.id === asset.unitId);
              return (
                <TableRow
                  key={asset.id}
                  className="cursor-pointer"
                  onClick={() => setDetailAsset(asset)}
                >
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell>{asset.assetType}</TableCell>
                  <TableCell>{unit?.name ?? "—"}</TableCell>
                  <TableCell>{asset.impactedProcess ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={CRITICALITY_COLORS[asset.criticality]}
                    >
                      {CRITICALITY_LABELS[asset.criticality] ?? asset.criticality}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[asset.status]}
                    >
                      {STATUS_LABELS[asset.status] ?? asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{asset.responsibleName ?? "—"}</TableCell>
                  <TableCell><MaintenanceStatusCell asset={asset} /></TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(asset)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(asset)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Detail sheet */}
      <AssetDetailSheet
        asset={detailAsset}
        units={units}
        orgId={orgId}
        canWrite={canWrite}
        onEdit={openEdit}
        onClose={() => setDetailAsset(null)}
      />

      {/* Create / Edit dialog */}
      {dialogOpen &&
        createPortal(
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              if (!open) setDialogOpen(false);
            }}
            title={editingAsset ? "Editar ativo" : "Novo ativo"}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Nome *</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Compressor de ar"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo *</Label>
                  <Input
                    required
                    value={form.assetType}
                    onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))}
                    placeholder="Ex: Equipamento, Veículo, Instalação"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Criticidade</Label>
                  <Select
                    value={form.criticality}
                    onChange={(e) => setForm((f) => ({ ...f, criticality: e.target.value }))}
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Status operacional</Label>
                  <Select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="em_manutencao">Em manutenção</option>
                    <option value="inativo">Inativo</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Unidade</Label>
                  <Select
                    value={form.unitId}
                    onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
                  >
                    <option value="">Nenhuma</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Localização</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Ex: Galpão A, Sala de servidores"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Processo impactado</Label>
                  <Input
                    value={form.impactedProcess}
                    onChange={(e) => setForm((f) => ({ ...f, impactedProcess: e.target.value }))}
                    placeholder="Ex: Produção, Logística"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Responsável</Label>
                  <Select
                    value={form.responsibleId != null ? String(form.responsibleId) : ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        responsibleId: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Nenhum</option>
                    {employeePicker.options.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Descrição</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Informações adicionais sobre o ativo"
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                >
                  {editingAsset ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </form>
          </Dialog>,
          document.body,
        )}

      {/* Delete confirmation dialog */}
      {deleteTarget &&
        createPortal(
          <Dialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
            title="Remover ativo"
          >
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja remover o ativo{" "}
              <strong>{deleteTarget.name}</strong>? Esta ação não pode ser
              desfeita.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMut.isPending}
              >
                Remover
              </Button>
            </DialogFooter>
          </Dialog>,
          document.body,
        )}
    </div>
  );
}
