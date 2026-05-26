import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Download,
  FileBadge2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  History,
  Pencil,
  Plus,
  Table as TableIcon,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportRegulatoryToExcel, exportRegulatoryToPdf } from "./_export";
import { RegulatoryImportDialog } from "./_import-dialog";
import { RegulatoryCalendarView } from "./_calendar-view";
// Note: alertas são processados automaticamente pelo governance-scheduler
// no backend (boot + a cada GOVERNANCE_MAINTENANCE_INTERVAL_MINUTES, default 60min).
// Nenhuma ação manual é necessária — não há botão "Processar alertas".
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageTitle, usePageSubtitle, useHeaderActions } from "@/contexts/LayoutContext";
import { HeaderActionButton } from "@/components/layout/HeaderActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  useListRegulatoryDocuments,
  useCreateRegulatoryDocument,
  useUpdateRegulatoryDocument,
  useDeleteRegulatoryDocument,
  useListRegulatoryDocumentRenewals,
  useCreateRegulatoryDocumentRenewal,
  useUpdateRegulatoryDocumentRenewal,
  useDeleteRegulatoryDocumentRenewal,
  useListRegulatoryDocumentAttachments,
  useAddRegulatoryDocumentAttachment,
  useDeleteRegulatoryDocumentAttachment,
  useListRegulatoryDocumentAudit,
  useListOrgUsers,
  useListUnits,
  getListOrgUsersQueryKey,
  getListRegulatoryDocumentsQueryKey,
  getListRegulatoryDocumentRenewalsQueryKey,
  getListRegulatoryDocumentAttachmentsQueryKey,
  getListRegulatoryDocumentAuditQueryKey,
  type RegulatoryDocument,
  type RegulatoryDocumentRenewal,
  type RegulatoryDocumentAuditEntry,
  type CreateRegulatoryDocumentBody,
  type CreateRegulatoryDocumentRenewalBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// --- Constants ---

const IDENTIFIER_TYPE_LABELS: Record<string, string> = {
  licenca_ambiental: "Licença Ambiental",
  avcb: "AVCB",
  alvara: "Alvará",
  outorga: "Outorga",
  certidao: "Certidão",
  outro: "Outro",
};

const IDENTIFIER_TYPE_COLORS: Record<string, string> = {
  licenca_ambiental: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30",
  avcb: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  alvara: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  outorga: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
  certidao: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  outro: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30",
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  vigente: "Vigente",
  a_vencer: "A vencer",
  vencido: "Vencido",
};

const RENEWAL_STATUS_LABELS: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  protocolado: "Protocolado",
  renovado: "Renovado",
  indeferido: "Indeferido",
};

// Quick-filter por janela de vencimento. O valor é o número máximo de dias
// até a expiração (negativos = vencidos contam todos). Útil pra reunião
// semanal de compliance — "o que tá pra vencer nos próximos 30 dias".
const DAYS_WINDOW_LABELS: Record<string, string> = {
  "7": "Próximos 7 dias",
  "30": "Próximos 30 dias",
  "60": "Próximos 60 dias",
  "90": "Próximos 90 dias",
};

// --- Helpers ---

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Severity rank pra default sort: maior = mais urgente, aparece primeiro.
// 4 = vencido crítico (30+d) | 3 = vencido 8-30d | 2 = vencido recente (<=7d)
// 1 = a vencer  | 0 = vigente
function severityRank(d: { status: string; expirationDate: string }): number {
  if (d.status === "vencido") {
    const overdue = Math.abs(daysUntil(d.expirationDate) ?? 0);
    if (overdue > 30) return 4;
    if (overdue > 7) return 3;
    return 2;
  }
  if (d.status === "a_vencer") return 1;
  return 0;
}

// --- Sortable table head ---

type SortCol = "identifier" | "type" | "issuingBody" | "unit" | "expiration" | "status" | "renewal" | "attachments";

function SortableHead({
  label,
  col,
  sortBy,
  sortDir,
  onClick,
}: {
  label: string;
  col: SortCol;
  sortBy: SortCol | null;
  sortDir: "asc" | "desc";
  onClick: (col: SortCol) => void;
}) {
  const active = sortBy === col;
  return (
    <TableHead className="text-xs">
      <button
        type="button"
        onClick={() => onClick(col)}
        className="flex items-center gap-1 hover:text-foreground transition"
      >
        {label}
        {active ? (
          sortDir === "asc"
            ? <ChevronUp className="h-3 w-3 text-foreground" />
            : <ChevronDown className="h-3 w-3 text-foreground" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground/40" />
        )}
      </button>
    </TableHead>
  );
}

// --- Badges ---

// Severidade visual dentro de "Vencido" — empresas reais precisam triar entre
// "acabou de vencer (1-7d, regularização tranquila)" vs "30+ dias (multa/embargo iminente)".
// Mesma label "Vencido" mas peso visual cresce com os dias de atraso.
function DocumentStatusBadge({ status, expirationDate }: { status: string; expirationDate?: string | null }) {
  if (status === "vencido") {
    const overdueDays = expirationDate ? Math.abs(daysUntil(expirationDate) ?? 0) : 0;
    if (overdueDays > 30) {
      // Crítico: pode estar em multa, perdeu janela de regularização.
      return (
        <Badge variant="danger" className="text-xs font-semibold ring-2 ring-red-500/40 ring-offset-1 dark:ring-red-500/60">
          Vencido +{overdueDays}d
        </Badge>
      );
    }
    if (overdueDays > 7) {
      // Crítico moderado.
      return <Badge variant="danger" className="text-xs">Vencido {overdueDays}d</Badge>;
    }
    // Recente — vencido mas dentro da janela de regularização "tranquila".
    return <Badge variant="orange" className="text-xs">Vencido recente</Badge>;
  }
  if (status === "a_vencer") return <Badge variant="orange" className="text-xs">A vencer</Badge>;
  return <Badge variant="success" className="text-xs">Vigente</Badge>;
}

function RenewalStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const colorByStatus: Record<string, "neutral" | "success" | "danger" | "orange" | "outline"> = {
    nao_iniciado: "neutral",
    em_andamento: "orange",
    protocolado: "outline",
    renovado: "success",
    indeferido: "danger",
  };
  return (
    <Badge variant={colorByStatus[status] ?? "neutral"} className="text-[10px]">
      {RENEWAL_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function ValidityCell({ expirationDate, status }: { expirationDate: string; status: string }) {
  const left = daysUntil(expirationDate);
  const label = fmtDate(expirationDate);
  if (status === "vencido") {
    const overdueDays = Math.abs(left ?? 0);
    const tone = overdueDays > 30 ? "text-red-700 font-semibold" : "text-red-600";
    return (
      <span className="flex flex-col text-xs">
        <span className={`flex items-center gap-1 ${tone}`}>
          <AlertTriangle className="h-3 w-3" /> {label}
        </span>
        <span className="text-[10px] text-red-600/70">
          vencido há {overdueDays} dia{overdueDays === 1 ? "" : "s"}
        </span>
      </span>
    );
  }
  if (status === "a_vencer") {
    return (
      <span className="flex flex-col text-xs">
        <span className="flex items-center gap-1 text-yellow-700">
          <AlertTriangle className="h-3 w-3" /> {label}
        </span>
        {left !== null && <span className="text-[10px] text-muted-foreground">em {left} dia{left === 1 ? "" : "s"}</span>}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

// --- Attachments (per renewal or doc-level) ---

function RegulatoryAttachments({
  orgId,
  docId,
  renewalId,
  canWrite,
}: {
  orgId: number;
  docId: number;
  renewalId: number | null;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data: allAttachments = [] } = useListRegulatoryDocumentAttachments(orgId, docId);
  const addMut = useAddRegulatoryDocumentAttachment();
  const deleteMut = useDeleteRegulatoryDocumentAttachment();

  // Filter to this renewal (or doc-level if renewalId is null).
  const attachments = useMemo(
    () => allAttachments.filter((a) => (renewalId == null ? a.renewalId == null : a.renewalId === renewalId)),
    [allAttachments, renewalId],
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ref = await uploadFileToStorage(file);
      await addMut.mutateAsync({
        orgId,
        docId,
        data: { ...ref, renewalId: renewalId ?? undefined },
      });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentAttachmentsQueryKey(orgId, docId) });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });
      toast({ title: "Arquivo anexado" });
    } catch {
      toast({ title: "Erro ao anexar arquivo", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(attachmentId: number) {
    try {
      await deleteMut.mutateAsync({ orgId, docId, attachmentId });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentAttachmentsQueryKey(orgId, docId) });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });
      toast({ title: "Arquivo removido" });
    } catch {
      toast({ title: "Erro ao remover arquivo", variant: "destructive" });
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
          {uploading ? "Enviando..." : "+ Anexar arquivo"}
          <input type="file" className="hidden" disabled={uploading} onChange={handleFileChange} />
        </label>
      )}
    </div>
  );
}

// --- Renewals panel ---

function RenewalsPanel({
  orgId,
  document,
  canWrite,
}: {
  orgId: number;
  document: RegulatoryDocument;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateRegulatoryDocumentRenewalBody>({
    status: "em_andamento",
  });

  const { data: renewals = [] } = useListRegulatoryDocumentRenewals(orgId, document.id);
  const createMut = useCreateRegulatoryDocumentRenewal();
  const updateMut = useUpdateRegulatoryDocumentRenewal();
  const deleteMut = useDeleteRegulatoryDocumentRenewal();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.status === "renovado" && !form.newExpirationDate) {
      toast({ title: "Informe a nova validade para concluir a renovação", variant: "destructive" });
      return;
    }
    try {
      await createMut.mutateAsync({ orgId, docId: document.id, data: form });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentRenewalsQueryKey(orgId, document.id) });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });
      setShowForm(false);
      setForm({ status: "em_andamento" });
      toast({ title: "Renovação registrada" });
    } catch {
      toast({ title: "Erro ao registrar renovação", variant: "destructive" });
    }
  }

  async function handleQuickConclude(renewal: RegulatoryDocumentRenewal, newExpirationDate: string) {
    try {
      await updateMut.mutateAsync({
        orgId,
        docId: document.id,
        renewalId: renewal.id,
        data: { status: "renovado", newExpirationDate },
      });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentRenewalsQueryKey(orgId, document.id) });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });
      toast({ title: "Renovação concluída" });
    } catch {
      toast({ title: "Erro ao concluir renovação", variant: "destructive" });
    }
  }

  async function handleDelete(renewalId: number) {
    try {
      await deleteMut.mutateAsync({ orgId, docId: document.id, renewalId });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentRenewalsQueryKey(orgId, document.id) });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });
      toast({ title: "Renovação removida" });
    } catch {
      toast({ title: "Erro ao remover renovação", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {renewals.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Nenhuma renovação registrada.</p>
      )}

      {renewals.map((r) => {
        const expanded = expandedId === r.id;
        return (
          <div key={r.id} className="border rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/40 gap-2"
              onClick={() => setExpandedId(expanded ? null : r.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <RenewalStatusBadge status={r.status} />
                <span className="text-[10px] text-muted-foreground truncate">
                  Reg. em {fmtDate(r.createdAt.slice(0, 10))}
                </span>
                {r.newExpirationDate && (
                  <span className="text-[10px] text-green-700 truncate">
                    nova validade: {fmtDate(r.newExpirationDate)}
                  </span>
                )}
              </div>
              {canWrite && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {expanded && (
              <div className="px-3 pb-3 pt-1 border-t bg-muted/20 flex flex-col gap-2">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 sm:gap-x-4 gap-y-1 text-xs break-words">
                  {r.scheduledStartDate && (
                    <>
                      <span className="text-muted-foreground">Início programado</span>
                      <span>{fmtDate(r.scheduledStartDate)}</span>
                    </>
                  )}
                  {r.protocolDeadline && (
                    <>
                      <span className="text-muted-foreground">Prazo de protocolo</span>
                      <span>{fmtDate(r.protocolDeadline)}</span>
                    </>
                  )}
                  {r.protocolNumber && (
                    <>
                      <span className="text-muted-foreground">Nº protocolo</span>
                      <span>{r.protocolNumber}</span>
                    </>
                  )}
                  {r.issuingBody && (
                    <>
                      <span className="text-muted-foreground">Órgão</span>
                      <span>{r.issuingBody}</span>
                    </>
                  )}
                  {r.recordedByUserName && (
                    <>
                      <span className="text-muted-foreground">Registrado por</span>
                      <span>{r.recordedByUserName}</span>
                    </>
                  )}
                  {r.notes && (
                    <>
                      <span className="text-muted-foreground">Observações</span>
                      <span>{r.notes}</span>
                    </>
                  )}
                </div>

                {/* Quick conclude when status != renovado/indeferido */}
                {canWrite && r.status !== "renovado" && r.status !== "indeferido" && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-blue-600 hover:underline">Concluir como renovado</summary>
                    <QuickConcludeForm onSubmit={(date) => handleQuickConclude(r, date)} />
                  </details>
                )}

                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Arquivos desta renovação</p>
                  <RegulatoryAttachments orgId={orgId} docId={document.id} renewalId={r.id} canWrite={canWrite} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {showForm ? (
        <form onSubmit={handleSubmit} className="border rounded-lg p-3 flex flex-col gap-3 bg-muted/10">
          <p className="text-xs font-semibold">Nova renovação</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Status *</Label>
              <SearchableSelect
                value={form.status}
                onChange={(v) => setForm((f) => ({ ...f, status: (v || "em_andamento") as CreateRegulatoryDocumentRenewalBody["status"] }))}
                options={Object.entries(RENEWAL_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                placeholder="Selecione um status"
                searchPlaceholder="Buscar status..."
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Início programado</Label>
              <Input type="date" className="h-8 text-xs" value={form.scheduledStartDate ?? ""} onChange={(e) => setForm((f) => ({ ...f, scheduledStartDate: e.target.value || undefined }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Prazo de protocolo</Label>
              <Input type="date" className="h-8 text-xs" value={form.protocolDeadline ?? ""} onChange={(e) => setForm((f) => ({ ...f, protocolDeadline: e.target.value || undefined }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Nº Protocolo</Label>
              <Input className="h-8 text-xs" placeholder="Ex.: PROT-2026-001" value={form.protocolNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, protocolNumber: e.target.value || undefined }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Nova validade {form.status === "renovado" && <span className="text-red-600">*</span>}</Label>
              <Input type="date" className="h-8 text-xs" value={form.newExpirationDate ?? ""} onChange={(e) => setForm((f) => ({ ...f, newExpirationDate: e.target.value || undefined }))} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Órgão (snapshot)</Label>
              <Input className="h-8 text-xs" placeholder={document.issuingBody} value={form.issuingBody ?? ""} onChange={(e) => setForm((f) => ({ ...f, issuingBody: e.target.value || undefined }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Observações</Label>
            <Textarea className="text-xs min-h-[60px]" value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || undefined }))} />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button type="submit" size="sm" className="w-full sm:w-auto" disabled={createMut.isPending}>Salvar</Button>
          </div>
        </form>
      ) : (
        canWrite && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Registrar renovação
          </Button>
        )
      )}
    </div>
  );
}

function QuickConcludeForm({ onSubmit }: { onSubmit: (newExpirationDate: string) => void }) {
  const [date, setDate] = useState("");
  return (
    <div className="flex items-end gap-2 mt-1">
      <div className="flex flex-col gap-1 flex-1">
        <Label className="text-[10px]">Nova validade</Label>
        <Input type="date" className="h-7 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={!date}
        onClick={(e) => {
          e.preventDefault();
          if (date) onSubmit(date);
        }}
      >
        <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir
      </Button>
    </div>
  );
}

// --- Audit log ---

// PT-BR labels for the fields we surface in the "Ver alterações" expansion.
// Keep keys in sync with the columns logged server-side (services/.../audit.ts).
const AUDIT_FIELD_LABELS: Record<string, string> = {
  // documents
  unitId: "Filial",
  identifierType: "Tipo",
  identifierOther: "Tipo (outro)",
  documentNumber: "Nº documento",
  issuingBody: "Órgão emissor",
  processNumber: "Nº processo",
  responsibleUserId: "Responsável",
  issueDate: "Data de emissão",
  expirationDate: "Validade",
  renewalRequired: "Requer renovação",
  alertDaysOverride: "Alerta (dias)",
  notes: "Observações",
  status: "Status",
  externalSourceProvider: "Fonte externa",
  externalSourceReference: "Ref. externa",
  externalSourceUrl: "URL externa",
  externalLastSyncAt: "Última sincronização",
  // renewals
  documentId: "Documento",
  scheduledStartDate: "Início previsto",
  protocolDeadline: "Prazo do protocolo",
  protocolNumber: "Nº protocolo",
  newExpirationDate: "Nova validade",
  recordedByUserId: "Registrado por",
  // attachments
  renewalId: "Renovação",
  fileName: "Arquivo",
  fileSize: "Tamanho",
  contentType: "Tipo do arquivo",
  objectPath: "Caminho",
  uploadedAt: "Enviado em",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  created: "criou",
  updated: "alterou",
  deleted: "excluiu",
};

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  document: "o documento",
  renewal: "uma renovação",
  attachment: "um anexo",
};

const AUDIT_ENTITY_NOUN: Record<string, string> = {
  document: "Documento",
  renewal: "Renovação",
  attachment: "Anexo",
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string") {
    if (ISO_DATE_RE.test(value)) return fmtDate(value);
    // ISO timestamp w/ time
    if (/\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("pt-BR");
      }
    }
    return value;
  }
  if (typeof value === "number") {
    // Translate known enums where possible.
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatAuditFieldName(field: string): string {
  return AUDIT_FIELD_LABELS[field] ?? field;
}

// Relative time formatter — PT-BR, no extra deps.
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 30) return "agora há pouco";
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 60 * 60) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 60 * 60 * 24) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 60 * 60 * 24 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 60 * 60 * 24 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}

function iconForEntry(entry: RegulatoryDocumentAuditEntry) {
  if (entry.action === "deleted") return Trash2;
  if (entry.action === "created") {
    if (entry.entityType === "attachment") return FilePlus2;
    return Plus;
  }
  // updated
  return Pencil;
}

function AuditEntryRow({ entry }: { entry: RegulatoryDocumentAuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = iconForEntry(entry);

  // Pull a diff payload out of the (loose-typed) `changes` jsonb.
  const changes = entry.changes as
    | { kind?: string; fields?: Record<string, { from: unknown; to: unknown }>; snapshot?: Record<string, unknown> }
    | undefined;

  const isDiff = changes?.kind === "diff" && changes?.fields;
  const fieldEntries = isDiff
    ? Object.entries(changes!.fields!).filter(([k]) => k in AUDIT_FIELD_LABELS || true)
    : [];

  const action = AUDIT_ACTION_LABELS[entry.action] ?? entry.action;
  const entity = AUDIT_ENTITY_LABELS[entry.entityType] ?? entry.entityType;
  const userName = entry.userName ?? "Usuário removido";

  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
      </span>
      <div className="text-xs leading-relaxed">
        <span className="font-medium">{userName}</span>{" "}
        <span className="text-muted-foreground">{action}</span>{" "}
        <span>{entity}</span>
        <span className="text-muted-foreground"> · {formatRelativeTime(entry.createdAt)}</span>
      </div>
      {isDiff && fieldEntries.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Ver alterações ({fieldEntries.length})
          </button>
          {expanded && (
            <ul className="mt-1 ml-4 space-y-0.5 border-l pl-3">
              {fieldEntries.map(([field, change]) => (
                <li key={field} className="text-[11px]">
                  <span className="text-muted-foreground">{formatAuditFieldName(field)}: </span>
                  <span className="line-through text-muted-foreground/70">
                    {formatAuditValue(field, change.from)}
                  </span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="font-medium">{formatAuditValue(field, change.to)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!isDiff && entry.entityId !== null && entry.entityId !== undefined && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {AUDIT_ENTITY_NOUN[entry.entityType] ?? entry.entityType} #{entry.entityId}
        </div>
      )}
    </li>
  );
}

function RegulatoryAuditPanel({
  orgId,
  docId,
}: {
  orgId: number;
  docId: number;
}) {
  const [open, setOpen] = useState(false);
  // Only fetch once the section is opened — keeps the detail-sheet snappy.
  const query = useListRegulatoryDocumentAudit(orgId, docId, { limit: 200 }, {
    query: {
      enabled: open,
      queryKey: getListRegulatoryDocumentAuditQueryKey(orgId, docId, { limit: 200 }),
    },
  });

  const entries = query.data ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center justify-between text-sm font-semibold mb-2"
      >
        <span className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" />
          Histórico de alterações
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <>
          {query.isLoading ? (
            <p className="text-[11px] text-muted-foreground">Carregando…</p>
          ) : entries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Sem alterações registradas até agora.
            </p>
          ) : (
            <ul className="relative ml-1 space-y-3 border-l pl-3">
              {entries.map((entry) => (
                <AuditEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// --- Detail sheet ---

function RegulatoryDetailSheet({
  orgId,
  document,
  canWrite,
  onClose,
  onEdit,
}: {
  orgId: number;
  document: RegulatoryDocument | null;
  canWrite: boolean;
  onClose: () => void;
  onEdit: (d: RegulatoryDocument) => void;
}) {
  if (!document) return null;

  const titleParts = [
    IDENTIFIER_TYPE_LABELS[document.identifierType] ?? document.identifierType,
    document.documentNumber,
  ].filter(Boolean);

  return (
    <Sheet open={!!document} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full max-w-full sm:max-w-xl overflow-y-auto overflow-x-hidden flex flex-col gap-6 p-4 sm:p-6">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <SheetTitle className="text-base break-words">{titleParts.join(" · ")}</SheetTitle>
              {document.identifierOther && (
                <p className="text-xs text-muted-foreground break-words">{document.identifierOther}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <DocumentStatusBadge status={document.status} expirationDate={document.expirationDate} />
              {canWrite && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(document)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="grid grid-cols-[auto_1fr] sm:grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-2 text-sm break-words">
          {document.unitName && (
            <>
              <span className="text-muted-foreground">Filial</span>
              <span>{document.unitName}</span>
            </>
          )}
          <span className="text-muted-foreground">Órgão emissor</span>
          <span>{document.issuingBody}</span>
          {document.processNumber && (
            <>
              <span className="text-muted-foreground">Processo</span>
              <span>{document.processNumber}</span>
            </>
          )}
          {document.responsibleUserName && (
            <>
              <span className="text-muted-foreground">Responsável</span>
              <span className="flex flex-col">
                <span>{document.responsibleUserName}</span>
                {document.responsibleUserEmail && (
                  <span className="text-[11px] text-muted-foreground">{document.responsibleUserEmail}</span>
                )}
              </span>
            </>
          )}
          {document.issueDate && (
            <>
              <span className="text-muted-foreground">Emissão</span>
              <span>{fmtDate(document.issueDate)}</span>
            </>
          )}
          <span className="text-muted-foreground">Validade</span>
          <ValidityCell expirationDate={document.expirationDate} status={document.status} />
          {document.alertDaysOverride !== null && (
            <>
              <span className="text-muted-foreground">Antecedência do alerta</span>
              <span>{document.alertDaysOverride} dias</span>
            </>
          )}
          {document.notes && (
            <>
              <span className="text-muted-foreground">Observações</span>
              <span className="text-xs">{document.notes}</span>
            </>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Histórico de renovações</h3>
          <RenewalsPanel orgId={orgId} document={document} canWrite={canWrite} />
        </div>

        {/* Anexos soltos no nível do documento (não atrelados a renovação) */}
        <div>
          <h3 className="text-sm font-semibold mb-1">Arquivos do documento</h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            Arquivos sem renovação específica (ex.: PDF original do cadastro).
          </p>
          <RegulatoryAttachments orgId={orgId} docId={document.id} renewalId={null} canWrite={canWrite} />
        </div>

        {/* Audit log — collapsed by default, lazy-loaded on expand. Required for
            ISO 9001/14001/39001: traceability of every change. */}
        <RegulatoryAuditPanel orgId={orgId} docId={document.id} />
      </SheetContent>
    </Sheet>
  );
}

// --- Create / edit dialog ---

const EMPTY_FORM: CreateRegulatoryDocumentBody = {
  unitId: 0,
  identifierType: "avcb",
  issuingBody: "",
  expirationDate: "",
  renewalRequired: true,
};

function RegulatoryDialog({
  orgId,
  open,
  initial,
  onClose,
}: {
  orgId: number;
  open: boolean;
  initial: RegulatoryDocument | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: units = [] } = useListUnits(orgId);
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), staleTime: 60_000 },
  });
  const orgUsers = orgUsersData?.users ?? [];
  const createMut = useCreateRegulatoryDocument();
  const updateMut = useUpdateRegulatoryDocument();

  const buildInitialForm = (doc: RegulatoryDocument | null): CreateRegulatoryDocumentBody =>
    doc
      ? {
          unitId: doc.unitId,
          identifierType: doc.identifierType as CreateRegulatoryDocumentBody["identifierType"],
          identifierOther: doc.identifierOther ?? undefined,
          documentNumber: doc.documentNumber ?? undefined,
          issuingBody: doc.issuingBody,
          processNumber: doc.processNumber ?? undefined,
          responsibleUserId: doc.responsibleUserId ?? undefined,
          issueDate: doc.issueDate ?? undefined,
          expirationDate: doc.expirationDate,
          renewalRequired: doc.renewalRequired,
          alertDaysOverride: doc.alertDaysOverride ?? undefined,
          notes: doc.notes ?? undefined,
        }
      : EMPTY_FORM;

  const [form, setForm] = useState<CreateRegulatoryDocumentBody>(buildInitialForm(initial));

  // Reset form when dialog opens with a different doc.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setForm(buildInitialForm(initial));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unitId) {
      toast({ title: "Selecione a filial", variant: "destructive" });
      return;
    }
    if (!form.expirationDate) {
      toast({ title: "Informe a validade", variant: "destructive" });
      return;
    }
    try {
      if (initial) {
        await updateMut.mutateAsync({ orgId, docId: initial.id, data: form });
        toast({ title: "Documento atualizado" });
      } else {
        await createMut.mutateAsync({ orgId, data: form });
        toast({ title: "Documento cadastrado" });
      }
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });
      onClose();
    } catch {
      toast({ title: "Erro ao salvar documento", variant: "destructive" });
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  if (!open) return null;

  return createPortal(
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={initial ? "Editar documento regulatório" : "Novo documento regulatório"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Filial (CNPJ) *</Label>
            <SearchableSelect
              value={String(form.unitId || "")}
              onChange={(v) => setForm((f) => ({ ...f, unitId: v ? Number(v) : 0 }))}
              options={units.map((u) => ({ value: String(u.id), label: u.name }))}
              placeholder="Selecione uma filial"
              searchPlaceholder="Buscar filial..."
              emptyMessage="Nenhuma filial cadastrada. Crie em Organização → Unidades."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Tipo *</Label>
            <SearchableSelect
              value={form.identifierType}
              onChange={(v) => setForm((f) => ({ ...f, identifierType: (v || "avcb") as CreateRegulatoryDocumentBody["identifierType"] }))}
              options={Object.entries(IDENTIFIER_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              placeholder="Selecione um tipo"
              searchPlaceholder="Buscar tipo..."
            />
          </div>
          {form.identifierType === "outro" && (
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs">Descrição do tipo</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Ex.: Termo de ajuste de conduta"
                value={form.identifierOther ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, identifierOther: e.target.value || undefined }))}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Nº documento</Label>
            <Input
              className="h-9 text-sm"
              placeholder="Ex.: AVCB-12345/2026"
              value={form.documentNumber ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value || undefined }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Órgão emissor *</Label>
            <Input
              className="h-9 text-sm"
              placeholder="Ex.: CETESB, CB-PMSP"
              value={form.issuingBody}
              onChange={(e) => setForm((f) => ({ ...f, issuingBody: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Nº processo</Label>
            <Input
              className="h-9 text-sm"
              value={form.processNumber ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, processNumber: e.target.value || undefined }))}
            />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs">Responsável (usuário com conta) *</Label>
            <SearchableSelect
              value={String(form.responsibleUserId ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, responsibleUserId: v ? Number(v) : undefined }))}
              options={orgUsers.map((u) => ({ value: String(u.id), label: u.name }))}
              placeholder="Selecione um responsável"
              searchPlaceholder="Buscar usuário..."
              emptyMessage={
                orgUsers.length === 0
                  ? "Nenhum usuário com conta. Cadastre em Configurações → Usuários."
                  : "Nenhum usuário encontrado"
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Data de emissão</Label>
            <Input
              type="date"
              className="h-9 text-sm"
              value={form.issueDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value || undefined }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Validade *</Label>
            <Input
              type="date"
              className="h-9 text-sm"
              value={form.expirationDate}
              onChange={(e) => setForm((f) => ({ ...f, expirationDate: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Alerta (dias antes do vencimento)</Label>
            <Input
              type="number"
              className="h-9 text-sm"
              placeholder="30 (padrão)"
              value={form.alertDaysOverride ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, alertDaysOverride: e.target.value ? Number(e.target.value) : undefined }))}
              min={1}
            />
          </div>
          <div className="sm:col-span-2 flex items-start gap-2">
            <input
              type="checkbox"
              id="renewal-required"
              className="mt-0.5"
              checked={form.renewalRequired ?? true}
              onChange={(e) => setForm((f) => ({ ...f, renewalRequired: e.target.checked }))}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="renewal-required" className="text-xs">
                Requer renovação
              </Label>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Ao cadastrar, o sistema cria automaticamente 1 ciclo de renovação com início programado
                60 dias antes da validade. Pra documentos pontuais (ex.: uma certidão única), desmarque.
              </p>
            </div>
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea
              className="text-sm min-h-[60px]"
              value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || undefined }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="sm" className="w-full sm:w-auto" disabled={isPending}>{initial ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </form>
    </Dialog>,
    document.body,
  );
}

// --- Counter card ---

function CounterCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "neutral" | "danger" | "warn" | "success";
  active: boolean;
  onClick?: () => void;
}) {
  const toneStyles: Record<typeof tone, string> = {
    neutral: "border-border",
    danger: "border-red-200 dark:border-red-500/30",
    warn: "border-yellow-200 dark:border-yellow-500/30",
    success: "border-green-200 dark:border-green-500/30",
  };
  const valueTones: Record<typeof tone, string> = {
    neutral: "text-foreground",
    danger: "text-red-700 dark:text-red-300",
    warn: "text-yellow-700 dark:text-yellow-300",
    success: "text-green-700 dark:text-green-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 border rounded-lg px-3 py-2 md:px-4 md:py-3 bg-card text-left transition hover:bg-muted/30 ${toneStyles[tone]} ${active ? "ring-2 ring-primary/40" : ""}`}
    >
      <span className="text-[10px] md:text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-xl md:text-2xl font-semibold ${valueTones[tone]}`}>{value}</span>
    </button>
  );
}

// --- Main page ---

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = 50;

export default function RegulatoriosPage() {
  const { organization } = useAuth();
  const orgId = organization!.id;
  const { canWriteModule } = usePermissions();
  const canWrite = canWriteModule("regulatoryDocuments");

  const queryClient = useQueryClient();
  const { data: units = [] } = useListUnits(orgId);
  const [filterUnit, setFilterUnit] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDaysWindow, setFilterDaysWindow] = useState("");
  // Sort: null = default ordering (severity-aware), otherwise user-chosen column.
  // Default prioritiza vencidos críticos (30+ d) primeiro pra triagem visual.
  const [sortBy, setSortBy] = useState<null | "identifier" | "type" | "issuingBody" | "unit" | "expiration" | "status" | "renewal" | "attachments">(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterSearch, setFilterSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSizeOption, setPageSizeOption] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RegulatoryDocument | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [detailDocId, setDetailDocId] = useState<number | null>(null);

  // View mode (Tabela | Calendário) — persisted to localStorage so o user volta
  // como deixou. Lazy init from storage; guard against SSR / disabled storage.
  const [viewMode, setViewMode] = useState<"table" | "calendar">(() => {
    if (typeof window === "undefined") return "table";
    try {
      const stored = window.localStorage.getItem("regulatorios:view-mode");
      return stored === "calendar" ? "calendar" : "table";
    } catch {
      return "table";
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("regulatorios:view-mode", viewMode);
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [viewMode]);

  const deleteMut = useDeleteRegulatoryDocument();

  usePageTitle("Documentos Regulatórios");
  usePageSubtitle("Licenças, AVCB, alvarás e demais documentos regulatórios por filial");

  function handleExport(format: "excel" | "pdf") {
    // Exporta a lista ATUAL (escopo já filtrado por filial/tipo/search +
    // status/days-window client-side). Reusa o array `documents` que a tabela
    // já renderiza — auditor recebe o que vê.
    if (documents.length === 0) {
      toast({ title: "Nada pra exportar", description: "A lista atual está vazia. Ajuste os filtros e tente de novo.", variant: "destructive" });
      return;
    }
    try {
      if (format === "excel") {
        exportRegulatoryToExcel(documents);
      } else {
        exportRegulatoryToPdf(documents, organization?.name);
      }
      toast({ title: `Exportado (${format === "excel" ? "Excel" : "PDF"})`, description: `${documents.length} documento${documents.length === 1 ? "" : "s"} exportado${documents.length === 1 ? "" : "s"}.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Falha ao exportar", variant: "destructive" });
    }
  }

  useHeaderActions(
    <div className="flex items-center gap-2">
      {/* View toggle (pill-style group). Sempre visível — calendar é útil
          mesmo no modo leitura. */}
      <div
        role="group"
        aria-label="Modo de visualização"
        className="inline-flex items-center rounded-md border bg-card p-0.5"
      >
        <button
          type="button"
          aria-pressed={viewMode === "table"}
          onClick={() => setViewMode("table")}
          className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition ${
            viewMode === "table"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <TableIcon className="h-3.5 w-3.5" />
          <span className="hidden min-[1280px]:inline">Tabela</span>
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "calendar"}
          onClick={() => setViewMode("calendar")}
          className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition ${
            viewMode === "calendar"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="hidden min-[1280px]:inline">Calendário</span>
        </button>
      </div>
      {/* Exportar sempre visível (auditoria é rotina de quem só consulta também). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <HeaderActionButton
            icon={<Download className="h-4 w-4" />}
            label="Exportar"
            variant="outline"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => handleExport("excel")}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("pdf")}>
            <FileText className="h-4 w-4 mr-2" /> PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {canWrite && (
        <>
          <HeaderActionButton
            icon={<Upload className="h-4 w-4" />}
            label="Importar"
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
          />
          <HeaderActionButton
            icon={<Plus className="h-4 w-4" />}
            label="Novo documento regulatório"
            onClick={() => { setDialogOpen(true); setEditing(null); }}
          />
        </>
      )}
    </div>,
  );

  // Scope query (`all: true`) — drives the counter cards *and* serves as the
  // fallback set for the detail-sheet lookup. Status/days-window are applied
  // client-side over this set so cards always reflect the universe (filial +
  // tipo + search), regardless of the selected status card.
  const { data: scopeData } = useListRegulatoryDocuments(orgId, {
    unitId: filterUnit ? Number(filterUnit) : undefined,
    identifierType: filterType || undefined,
    search: filterSearch || undefined,
    all: true,
  });
  const scopeDocuments = scopeData?.items ?? [];

  const total = scopeDocuments.length;
  const vencidos = scopeDocuments.filter((d) => d.status === "vencido").length;
  const aVencer = scopeDocuments.filter((d) => d.status === "a_vencer").length;
  const vigentes = scopeDocuments.filter((d) => d.status === "vigente").length;

  // Paginated table query. Status + filtros narrow vão server-side (LIMIT/OFFSET
  // exato), days-window e sort ficam client-side (sort sobre a página atual —
  // limitação aceitável pra ~50 docs/page).
  const { data: pageData, isLoading } = useListRegulatoryDocuments(orgId, {
    unitId: filterUnit ? Number(filterUnit) : undefined,
    identifierType: filterType || undefined,
    search: filterSearch || undefined,
    status: filterStatus || undefined,
    page: pageNumber,
    pageSize: pageSizeOption,
  });

  const pagedItems = pageData?.items ?? [];
  const totalForFilters = pageData?.total ?? 0;
  const totalPages = pageData?.totalPages ?? 0;

  // documents = página filtrada por days-window + ordenada client-side.
  // Default sort é severity-aware: vencidos críticos primeiro, depois médios,
  // recentes, a vencer (por validade), vigentes (por validade). Usuário pode
  // override clicando nos headers das colunas.
  const documents = useMemo(() => {
    let rows = pagedItems;
    if (filterDaysWindow) {
      const max = Number(filterDaysWindow);
      rows = rows.filter((d) => {
        const left = daysUntil(d.expirationDate);
        return left !== null && left <= max;
      });
    }
    const sorted = [...rows];
    if (sortBy === null) {
      sorted.sort((a, b) => severityRank(b) - severityRank(a) || a.expirationDate.localeCompare(b.expirationDate));
    } else {
      const cmp = (a: RegulatoryDocument, b: RegulatoryDocument): number => {
        switch (sortBy) {
          case "identifier": return (a.documentNumber ?? "").localeCompare(b.documentNumber ?? "");
          case "type": return a.identifierType.localeCompare(b.identifierType);
          case "issuingBody": return a.issuingBody.localeCompare(b.issuingBody);
          case "unit": return (a.unitName ?? "").localeCompare(b.unitName ?? "");
          case "expiration": return a.expirationDate.localeCompare(b.expirationDate);
          case "status": return a.status.localeCompare(b.status);
          case "renewal": return (a.latestRenewalStatus ?? "").localeCompare(b.latestRenewalStatus ?? "");
          case "attachments": return a.attachmentCount - b.attachmentCount;
        }
      };
      sorted.sort((a, b) => sortDir === "asc" ? cmp(a, b) : -cmp(a, b));
    }
    return sorted;
  }, [pagedItems, filterDaysWindow, sortBy, sortDir]);

  function toggleSort(col: NonNullable<typeof sortBy>) {
    if (sortBy === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortBy(null); setSortDir("asc"); }
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const hasActiveFilters = Boolean(filterUnit || filterType || filterStatus || filterDaysWindow || filterSearch);

  // The detail sheet looks the doc up first in the current page, then falls
  // back to the broader scope set (e.g. user opened a doc, navigated pages).
  const detailDoc = detailDocId != null
    ? (pagedItems.find((d) => d.id === detailDocId) ?? scopeDocuments.find((d) => d.id === detailDocId) ?? null)
    : null;

  // Reset to page 1 when any filter changes.
  const filterKey = `${filterUnit}|${filterType}|${filterStatus}|${filterDaysWindow}|${filterSearch}|${pageSizeOption}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    if (pageNumber !== 1) setPageNumber(1);
  }

  async function handleDelete(doc: RegulatoryDocument) {
    const label = `${IDENTIFIER_TYPE_LABELS[doc.identifierType]}${doc.documentNumber ? ` ${doc.documentNumber}` : ""}`;
    if (!confirm(`Excluir "${label}"?`)) return;
    try {
      await deleteMut.mutateAsync({ orgId, docId: doc.id });
      queryClient.invalidateQueries({ queryKey: getListRegulatoryDocumentsQueryKey(orgId) });
      toast({ title: "Documento excluído" });
    } catch {
      toast({ title: "Erro ao excluir documento", variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Counter cards (the "dash" she asked for) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CounterCard
          label="Total"
          value={total}
          tone="neutral"
          active={!filterStatus}
          onClick={() => setFilterStatus("")}
        />
        <CounterCard
          label="Vencidos"
          value={vencidos}
          tone="danger"
          active={filterStatus === "vencido"}
          onClick={() => setFilterStatus(filterStatus === "vencido" ? "" : "vencido")}
        />
        <CounterCard
          label="A vencer"
          value={aVencer}
          tone="warn"
          active={filterStatus === "a_vencer"}
          onClick={() => setFilterStatus(filterStatus === "a_vencer" ? "" : "a_vencer")}
        />
        <CounterCard
          label="Vigentes"
          value={vigentes}
          tone="success"
          active={filterStatus === "vigente"}
          onClick={() => setFilterStatus(filterStatus === "vigente" ? "" : "vigente")}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:flex-wrap gap-2 md:items-center">
        <Input
          className="h-8 text-sm w-full md:w-64"
          placeholder="Buscar por número, órgão, processo..."
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <div className="w-full md:w-52">
          <SearchableSelect
            value={filterUnit}
            onChange={setFilterUnit}
            options={units.map((u) => ({ value: String(u.id), label: u.name }))}
            placeholder="Todas as filiais"
            searchPlaceholder="Buscar filial..."
            emptyMessage="Nenhuma filial encontrada"
          />
        </div>
        <div className="w-full md:w-52">
          <SearchableSelect
            value={filterType}
            onChange={setFilterType}
            options={Object.entries(IDENTIFIER_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            placeholder="Todos os tipos"
            searchPlaceholder="Buscar tipo..."
            emptyMessage="Nenhum tipo encontrado"
          />
        </div>
        <div className="w-full md:w-44">
          <SearchableSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={Object.entries(DOCUMENT_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            placeholder="Todos os status"
            searchPlaceholder="Buscar status..."
            emptyMessage="Nenhum status encontrado"
          />
        </div>
        <div className="w-full md:w-48">
          <SearchableSelect
            value={filterDaysWindow}
            onChange={setFilterDaysWindow}
            options={Object.entries(DAYS_WINDOW_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            placeholder="Qualquer prazo"
            searchPlaceholder="Buscar prazo..."
            emptyMessage="Nenhum prazo"
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setFilterUnit("");
              setFilterType("");
              setFilterStatus("");
              setFilterDaysWindow("");
              setFilterSearch("");
            }}
            className="text-xs text-blue-600 hover:underline self-start md:self-auto"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Calendar mode shortcut — calendar é responsivo o suficiente; só uma view dele */}
      {viewMode === "calendar" ? (
        isLoading ? (
          <div className="rounded-lg border bg-card py-12 text-center text-xs text-muted-foreground">
            Carregando...
          </div>
        ) : (
          <RegulatoryCalendarView
            documents={documents}
            onDocClick={(doc) => setDetailDocId(doc.id)}
          />
        )
      ) : (
        <>
          {/* Empty/loading state — compartilhado entre desktop table e mobile cards. */}
          {isLoading && (
            <div className="rounded-lg border py-8 text-center text-xs text-muted-foreground">
              Carregando...
            </div>
          )}
          {!isLoading && documents.length === 0 && (
            <div className="rounded-lg border py-12 text-center text-xs text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <FileBadge2 className="h-8 w-8 text-muted-foreground/50" />
                {hasActiveFilters && scopeDocuments.length === 0 ? (
                  <>
                    <p>Nenhum documento encontrado com os filtros atuais.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterUnit("");
                        setFilterType("");
                        setFilterStatus("");
                        setFilterDaysWindow("");
                        setFilterSearch("");
                      }}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      Limpar filtros
                    </button>
                  </>
                ) : hasActiveFilters ? (
                  <>
                    <p>Nenhum documento bate com os filtros atuais.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStatus("");
                        setFilterDaysWindow("");
                      }}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      Limpar filtros de status/prazo
                    </button>
                  </>
                ) : (
                  <>
                    <p>Nenhum documento regulatório cadastrado.</p>
                    {canWrite && (
                      <p className="text-[11px] text-muted-foreground/70">
                        Use <span className="font-medium">+ Novo documento regulatório</span> no topo para começar.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Desktop table — com sortable headers */}
          {!isLoading && documents.length > 0 && (
            <div className="hidden md:block rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Identificação / Nº" col="identifier" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Tipo" col="type" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Órgão" col="issuingBody" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Filial" col="unit" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Validade" col="expiration" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Status" col="status" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Renovação" col="renewal" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Anexos" col="attachments" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    {canWrite && <TableHead className="text-xs w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((d) => (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setDetailDocId(d.id)}
                    >
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{IDENTIFIER_TYPE_LABELS[d.identifierType] ?? d.identifierType}{d.identifierOther ? ` · ${d.identifierOther}` : ""}</span>
                          {d.documentNumber && <span className="text-muted-foreground">{d.documentNumber}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className={`text-[10px] ${IDENTIFIER_TYPE_COLORS[d.identifierType] ?? ""}`}>
                          {IDENTIFIER_TYPE_LABELS[d.identifierType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.issuingBody}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.unitName ?? "—"}</TableCell>
                      <TableCell><ValidityCell expirationDate={d.expirationDate} status={d.status} /></TableCell>
                      <TableCell><DocumentStatusBadge status={d.status} expirationDate={d.expirationDate} /></TableCell>
                      <TableCell><RenewalStatusBadge status={d.latestRenewalStatus ?? null} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.attachmentCount}</TableCell>
                  {canWrite && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); setEditing(d); setDialogOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(d); }}
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
      )}

          {/* Mobile card list — tabela tem 9 colunas, quebra horrível em <768px.
              Cada card mostra os campos essenciais e abre o detail sheet ao tocar. */}
          {!isLoading && documents.length > 0 && (
            <div className="flex flex-col gap-2 md:hidden">
              {documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDetailDocId(d.id)}
                  className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3 text-left transition active:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <Badge variant="outline" className={`text-[10px] self-start ${IDENTIFIER_TYPE_COLORS[d.identifierType] ?? ""}`}>
                        {IDENTIFIER_TYPE_LABELS[d.identifierType]}
                      </Badge>
                      {d.documentNumber && (
                        <span className="text-sm font-medium truncate">{d.documentNumber}</span>
                      )}
                      {!d.documentNumber && d.identifierOther && (
                        <span className="text-sm font-medium truncate">{d.identifierOther}</span>
                      )}
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); setEditing(d); setDialogOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(d); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ValidityCell expirationDate={d.expirationDate} status={d.status} />
                    <DocumentStatusBadge status={d.status} expirationDate={d.expirationDate} />
                    <RenewalStatusBadge status={d.latestRenewalStatus ?? null} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {d.unitName && <span className="truncate">{d.unitName}</span>}
                    {d.unitName && <span aria-hidden>·</span>}
                    <span className="truncate">{d.issuingBody}</span>
                    <span aria-hidden>·</span>
                    <span>{d.attachmentCount} anexo{d.attachmentCount === 1 ? "" : "s"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pagination footer — hidden when the result fits in a single page
          and there's no benefit to showing controls. */}
      {totalForFilters > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Itens por página:</span>
            <select
              className="h-7 rounded border border-input bg-background px-2 text-xs"
              value={pageSizeOption}
              onChange={(e) => setPageSizeOption(Number(e.target.value) as PageSizeOption)}
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <span className="ml-2">
              {totalForFilters.toLocaleString("pt-BR")} {totalForFilters === 1 ? "documento" : "documentos"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
            >
              ← Anterior
            </Button>
            <span className="tabular-nums">
              Página {pageNumber} de {Math.max(1, totalPages)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={pageNumber >= totalPages}
              onClick={() => setPageNumber((n) => n + 1)}
            >
              Próxima →
            </Button>
          </div>
        </div>
      )}

      <RegulatoryDialog
        orgId={orgId}
        open={dialogOpen}
        initial={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />

      <RegulatoryDetailSheet
        orgId={orgId}
        document={detailDoc}
        canWrite={canWrite}
        onClose={() => setDetailDocId(null)}
        onEdit={(d) => { setDetailDocId(null); setEditing(d); setDialogOpen(true); }}
      />

      <RegulatoryImportDialog
        orgId={orgId}
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      />
    </div>
  );
}
