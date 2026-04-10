import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Pencil, Plus, Trash2 } from "lucide-react";
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
import { resolveApiUrl } from "@/lib/api";
import { uploadFileToStorage, formatFileSize } from "@/lib/uploads";
import {
  useListMeasurementResources,
  useCreateMeasurementResource,
  useUpdateMeasurementResource,
  useDeleteMeasurementResource,
  useListMeasurementResourceCalibrations,
  useCreateMeasurementResourceCalibration,
  useDeleteMeasurementResourceCalibration,
  useListMeasurementResourceAttachments,
  useAddMeasurementResourceAttachment,
  useDeleteMeasurementResourceAttachment,
  getListMeasurementResourcesQueryKey,
  getListMeasurementResourceCalibrationsQueryKey,
  getListMeasurementResourceAttachmentsQueryKey,
  useListUnits,
  type MeasurementResource,
  type MeasurementResourceCalibration,
  type CreateMeasurementResourceBody,
  type CreateMeasurementResourceCalibrationBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// --- Constants ---

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  instrumento: "Instrumento",
  equipamento: "Equipamento",
  padrao: "Padrão",
};

const RESOURCE_TYPE_COLORS: Record<string, string> = {
  instrumento: "bg-blue-100 text-blue-700 border-blue-200",
  equipamento: "bg-purple-100 text-purple-700 border-purple-200",
  padrao: "bg-teal-100 text-teal-700 border-teal-200",
};

const RESULT_LABELS: Record<string, string> = {
  apto: "Apto",
  "nao-apto": "Não Apto",
};

// --- Helpers ---

function isExpired(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  return new Date(validUntil) < new Date();
}

function ResourceStatusBadge({ resource }: { resource: MeasurementResource }) {
  if (resource.calibrationCount === 0) {
    return <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Sem calibração</Badge>;
  }
  if (resource.lastCalibrationResult === "nao-apto") {
    return <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">Não Apto</Badge>;
  }
  if (isExpired(resource.validUntil)) {
    return (
      <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">
        Vencido
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200">Apto</Badge>;
}

function ValidityBadge({ validUntil }: { validUntil: string | null | undefined }) {
  if (!validUntil) return <span className="text-xs text-muted-foreground">—</span>;
  const date = new Date(validUntil);
  const now = new Date();
  const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = date.toLocaleDateString("pt-BR");

  if (daysLeft < 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <AlertTriangle className="h-3 w-3" /> {label}
      </span>
    );
  }
  if (daysLeft <= 30) {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-600">
        <AlertTriangle className="h-3 w-3" /> {label}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

// --- Calibration Attachments ---

function CalibrationAttachments({
  orgId,
  resourceId,
  calibration,
  canWrite,
}: {
  orgId: number;
  resourceId: number;
  calibration: MeasurementResourceCalibration;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data: attachments = [] } = useListMeasurementResourceAttachments(orgId, resourceId, calibration.id);
  const addMut = useAddMeasurementResourceAttachment();
  const deleteMut = useDeleteMeasurementResourceAttachment();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ref = await uploadFileToStorage(file);
      await addMut.mutateAsync({ orgId, resourceId, calibrationId: calibration.id, data: ref });
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourceAttachmentsQueryKey(orgId, resourceId, calibration.id) });
      toast({ title: "Certificado anexado" });
    } catch {
      toast({ title: "Erro ao anexar certificado", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(attachmentId: number) {
    try {
      await deleteMut.mutateAsync({ orgId, resourceId, calibrationId: calibration.id, attachmentId });
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourceAttachmentsQueryKey(orgId, resourceId, calibration.id) });
      toast({ title: "Certificado removido" });
    } catch {
      toast({ title: "Erro ao remover certificado", variant: "destructive" });
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
            <button
              onClick={() => handleDelete(a.id)}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      ))}
      {canWrite && (
        <label className={`text-[10px] text-blue-600 hover:underline cursor-pointer ${uploading ? "opacity-50" : ""}`}>
          {uploading ? "Enviando..." : "+ Anexar certificado"}
          <input type="file" className="hidden" disabled={uploading} onChange={handleFileChange} />
        </label>
      )}
    </div>
  );
}

// --- Calibrations Panel ---

function CalibrationsPanel({
  orgId,
  resource,
  canWrite,
}: {
  orgId: number;
  resource: MeasurementResource;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateMeasurementResourceCalibrationBody>({
    calibratedAt: new Date().toISOString().slice(0, 10),
    result: "apto",
  });

  const { data: calibrations = [] } = useListMeasurementResourceCalibrations(orgId, resource.id);
  const createMut = useCreateMeasurementResourceCalibration();
  const deleteMut = useDeleteMeasurementResourceCalibration();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createMut.mutateAsync({ orgId, resourceId: resource.id, data: form });
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourceCalibrationsQueryKey(orgId, resource.id) });
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourcesQueryKey(orgId) });
      setShowForm(false);
      setForm({ calibratedAt: new Date().toISOString().slice(0, 10), result: "apto" });
      toast({ title: "Calibração registrada" });
    } catch {
      toast({ title: "Erro ao registrar calibração", variant: "destructive" });
    }
  }

  async function handleDelete(calibrationId: number) {
    try {
      await deleteMut.mutateAsync({ orgId, resourceId: resource.id, calibrationId });
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourceCalibrationsQueryKey(orgId, resource.id) });
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourcesQueryKey(orgId) });
      toast({ title: "Calibração removida" });
    } catch {
      toast({ title: "Erro ao remover calibração", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {calibrations.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Nenhuma calibração registrada.</p>
      )}

      {calibrations.map((c) => {
        const expanded = expandedId === c.id;
        return (
          <div key={c.id} className="border rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/40 gap-2"
              onClick={() => setExpandedId(expanded ? null : c.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="text-xs font-medium">{new Date(c.calibratedAt + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${c.result === "apto" ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}
                >
                  {RESULT_LABELS[c.result]}
                </Badge>
                {c.certificateNumber && (
                  <span className="text-[10px] text-muted-foreground truncate">Cert. {c.certificateNumber}</span>
                )}
              </div>
              {canWrite && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {expanded && (
              <div className="px-3 pb-3 pt-1 border-t bg-muted/20 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {c.calibratedByName && (
                    <>
                      <span className="text-muted-foreground">Responsável</span>
                      <span>{c.calibratedByName}</span>
                    </>
                  )}
                  {c.nextDueAt && (
                    <>
                      <span className="text-muted-foreground">Próxima em</span>
                      <span>{new Date(c.nextDueAt + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                    </>
                  )}
                  {c.notes && (
                    <>
                      <span className="text-muted-foreground">Observações</span>
                      <span>{c.notes}</span>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Certificados</p>
                  <CalibrationAttachments orgId={orgId} resourceId={resource.id} calibration={c} canWrite={canWrite} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {showForm ? (
        <form onSubmit={handleSubmit} className="border rounded-lg p-3 flex flex-col gap-3 bg-muted/10">
          <p className="text-xs font-semibold">Nova calibração / verificação</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Data *</Label>
              <Input type="date" className="h-8 text-xs" value={form.calibratedAt} onChange={(e) => setForm((f) => ({ ...f, calibratedAt: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Resultado *</Label>
              <Select className="h-8 text-xs" value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value as "apto" | "nao-apto" }))}>
                <option value="apto">Apto</option>
                <option value="nao-apto">Não Apto</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Nº Certificado</Label>
              <Input className="h-8 text-xs" placeholder="Ex.: LAB-2025-001" value={form.certificateNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value || undefined }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Próxima calibração</Label>
              <Input type="date" className="h-8 text-xs" value={form.nextDueAt ?? ""} onChange={(e) => setForm((f) => ({ ...f, nextDueAt: e.target.value || undefined }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Observações</Label>
            <Textarea className="text-xs min-h-[60px]" value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || undefined }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={createMut.isPending}>Salvar</Button>
          </div>
        </form>
      ) : (
        canWrite && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Registrar calibração
          </Button>
        )
      )}
    </div>
  );
}

// --- Resource Detail Sheet ---

function ResourceDetailSheet({
  orgId,
  resource,
  canWrite,
  onClose,
  onEdit,
}: {
  orgId: number;
  resource: MeasurementResource | null;
  canWrite: boolean;
  onClose: () => void;
  onEdit: (r: MeasurementResource) => void;
}) {
  if (!resource) return null;

  return (
    <Sheet open={!!resource} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-6">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <SheetTitle className="text-base">{resource.name}</SheetTitle>
              {resource.identifier && (
                <p className="text-xs text-muted-foreground">ID: {resource.identifier}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ResourceStatusBadge resource={resource} />
              {canWrite && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(resource)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">Tipo</span>
          <span>{RESOURCE_TYPE_LABELS[resource.resourceType] ?? resource.resourceType}</span>
          {resource.unitName && (
            <>
              <span className="text-muted-foreground">Unidade</span>
              <span>{resource.unitName}</span>
            </>
          )}
          {resource.responsibleName && (
            <>
              <span className="text-muted-foreground">Responsável</span>
              <span>{resource.responsibleName}</span>
            </>
          )}
          <span className="text-muted-foreground">Validade</span>
          <ValidityBadge validUntil={resource.validUntil} />
          <span className="text-muted-foreground">Calibrações</span>
          <span>{resource.calibrationCount}</span>
          {resource.notes && (
            <>
              <span className="text-muted-foreground">Observações</span>
              <span className="text-xs">{resource.notes}</span>
            </>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Histórico de calibrações</h3>
          <CalibrationsPanel orgId={orgId} resource={resource} canWrite={canWrite} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Resource Form Dialog ---

const EMPTY_FORM: CreateMeasurementResourceBody = { name: "", resourceType: "instrumento" };

function ResourceDialog({
  orgId,
  open,
  initial,
  onClose,
}: {
  orgId: number;
  open: boolean;
  initial: MeasurementResource | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: units = [] } = useListUnits(orgId);
  const createMut = useCreateMeasurementResource();
  const updateMut = useUpdateMeasurementResource();

  const [form, setForm] = useState<CreateMeasurementResourceBody>(
    initial
      ? {
          name: initial.name,
          identifier: initial.identifier ?? undefined,
          resourceType: initial.resourceType as "instrumento" | "equipamento" | "padrao",
          unitId: initial.unitId ?? undefined,
          responsibleId: initial.responsibleId ?? undefined,
          validUntil: initial.validUntil ?? undefined,
          notes: initial.notes ?? undefined,
        }
      : EMPTY_FORM,
  );

  // Reset form when dialog opens
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setForm(
      initial
        ? {
            name: initial.name,
            identifier: initial.identifier ?? undefined,
            resourceType: initial.resourceType as "instrumento" | "equipamento" | "padrao",
            unitId: initial.unitId ?? undefined,
            responsibleId: initial.responsibleId ?? undefined,
            validUntil: initial.validUntil ?? undefined,
            notes: initial.notes ?? undefined,
          }
        : EMPTY_FORM,
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (initial) {
        await updateMut.mutateAsync({
          orgId,
          resourceId: initial.id,
          data: {
            ...form,
            status: initial.status as "ativo" | "inativo" | "vencido",
          },
        });
        toast({ title: "Recurso atualizado" });
      } else {
        await createMut.mutateAsync({ orgId, data: form });
        toast({ title: "Recurso cadastrado" });
      }
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourcesQueryKey(orgId) });
      onClose();
    } catch {
      toast({ title: "Erro ao salvar recurso", variant: "destructive" });
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  if (!open) return null;

  return createPortal(
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={initial ? "Editar instrumento" : "Novo instrumento de medição"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs">Nome *</Label>
            <Input className="h-8 text-xs" placeholder="Ex.: Termômetro digital" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Identificação / TAG</Label>
            <Input className="h-8 text-xs" placeholder="Ex.: INS-001" value={form.identifier ?? ""} onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value || undefined }))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Tipo</Label>
            <Select className="h-8 text-xs" value={form.resourceType ?? "instrumento"} onChange={(e) => setForm((f) => ({ ...f, resourceType: e.target.value as "instrumento" | "equipamento" | "padrao" }))}>
              <option value="instrumento">Instrumento</option>
              <option value="equipamento">Equipamento</option>
              <option value="padrao">Padrão</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Unidade</Label>
            <Select className="h-8 text-xs" value={String(form.unitId ?? "")} onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value ? Number(e.target.value) : undefined }))}>
              <option value="">— Todas —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Validade da calibração</Label>
            <Input type="date" className="h-8 text-xs" value={form.validUntil ?? ""} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value || undefined }))} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs">Observações</Label>
            <Textarea className="text-xs min-h-[60px]" value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || undefined }))} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={isPending}>{initial ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </form>
    </Dialog>,
    document.body,
  );
}

// --- Main Page ---

export default function MedicaoPage() {
  const { organization } = useAuth();
  const orgId = organization!.id;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("assets");

  const queryClient = useQueryClient();
  const { data: units = [] } = useListUnits(orgId);
  const [filterUnit, setFilterUnit] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MeasurementResource | null>(null);
  const [detailResourceId, setDetailResourceId] = useState<number | null>(null);

  const deleteMut = useDeleteMeasurementResource();

  usePageTitle("Instrumentos de Medição");
  usePageSubtitle("ISO §7.1.5 — Recursos de monitoramento e medição");
  useHeaderActions(
    canWrite ? (
      <HeaderActionButton icon={<Plus className="h-4 w-4" />} label="Novo instrumento" onClick={() => { setDialogOpen(true); setEditing(null); }} />
    ) : null,
  );

  const { data: resources = [], isLoading } = useListMeasurementResources(orgId, {
    unitId: filterUnit ? Number(filterUnit) : undefined,
    resourceType: filterType || undefined,
  });
  const detailResource = detailResourceId != null ? (resources.find((r) => r.id === detailResourceId) ?? null) : null;

  const filtered = resources.filter((r) =>
    !filterSearch ||
    r.name.toLowerCase().includes(filterSearch.toLowerCase()) ||
    (r.identifier ?? "").toLowerCase().includes(filterSearch.toLowerCase()),
  );

  async function handleDelete(resource: MeasurementResource) {
    if (!confirm(`Excluir "${resource.name}"?`)) return;
    try {
      await deleteMut.mutateAsync({ orgId, resourceId: resource.id });
      queryClient.invalidateQueries({ queryKey: getListMeasurementResourcesQueryKey(orgId) });
      toast({ title: "Instrumento excluído" });
    } catch {
      toast({ title: "Erro ao excluir instrumento", variant: "destructive" });
    }
  }

  const expiredCount = resources.filter((r) => isExpired(r.validUntil) || r.lastCalibrationResult === "nao-apto").length;
  const noCalibCount = resources.filter((r) => r.calibrationCount === 0).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Summary alerts */}
      {(expiredCount > 0 || noCalibCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {expiredCount} instrumento{expiredCount > 1 ? "s" : ""} vencido{expiredCount > 1 ? "s" : ""} ou não apto{expiredCount > 1 ? "s" : ""}
            </div>
          )}
          {noCalibCount > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
              <AlertTriangle className="h-4 w-4" />
              {noCalibCount} instrumento{noCalibCount > 1 ? "s" : ""} sem calibração registrada
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          className="h-8 text-xs w-48"
          placeholder="Buscar por nome ou ID..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <Select className="h-8 text-xs w-40" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
          <option value="">Todas as unidades</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Select className="h-8 text-xs w-36" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="instrumento">Instrumento</option>
          <option value="equipamento">Equipamento</option>
          <option value="padrao">Padrão</option>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Nome / ID</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Unidade</TableHead>
              <TableHead className="text-xs">Validade</TableHead>
              <TableHead className="text-xs">Calibrações</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              {canWrite && <TableHead className="text-xs w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                  Nenhum instrumento encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => setDetailResourceId(r.id)}
              >
                <TableCell className="text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{r.name}</span>
                    {r.identifier && <span className="text-muted-foreground">{r.identifier}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={`text-[10px] ${RESOURCE_TYPE_COLORS[r.resourceType]}`}>
                    {RESOURCE_TYPE_LABELS[r.resourceType]}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.unitName ?? "—"}</TableCell>
                <TableCell><ValidityBadge validUntil={r.validUntil} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.calibrationCount}</TableCell>
                <TableCell><ResourceStatusBadge resource={r} /></TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setEditing(r); setDialogOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ResourceDialog
        orgId={orgId}
        open={dialogOpen}
        initial={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />

      <ResourceDetailSheet
        orgId={orgId}
        resource={detailResource}
        canWrite={canWrite}
        onClose={() => setDetailResourceId(null)}
        onEdit={(r) => { setDetailResourceId(null); setEditing(r); setDialogOpen(true); }}
      />
    </div>
  );
}
