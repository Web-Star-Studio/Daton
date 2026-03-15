import { useState } from "react";
import { useLocation } from "wouter";
import { useHeaderActions } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListDocuments,
  getListDocumentsQueryKey,
  useListUnits,
  getListUnitsQueryKey,
  useCreateDocument,
  useListOrgUsers,
} from "@workspace/api-client-react";
import type { OrgUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Plus, FileText, Upload, X } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em Revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  distributed: "Distribuído",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  distributed: "bg-blue-50 text-blue-700",
};

const TYPE_LABELS: Record<string, string> = {
  manual: "Manual",
  procedimento: "Procedimento",
  instrucao: "Instrução",
  formulario: "Formulário",
  registro: "Registro",
  politica: "Política",
  outro: "Outro",
};

const TYPE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "procedimento", label: "Procedimento" },
  { value: "instrucao", label: "Instrução de Trabalho" },
  { value: "formulario", label: "Formulário" },
  { value: "registro", label: "Registro" },
  { value: "politica", label: "Política" },
  { value: "outro", label: "Outro" },
];

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

const createDocumentSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  type: z.enum(["manual", "procedimento", "instrucao", "formulario", "registro", "politica", "outro"]),
  validityDate: z.string().min(1, "Data de validade é obrigatória"),
  unitIds: z.array(z.number()),
  elaboratorIds: z.array(z.number()).min(1, "Selecione ao menos um elaborador"),
  approverIds: z.array(z.number()).min(1, "Selecione ao menos um aprovador"),
  recipientIds: z.array(z.number()).min(1, "Selecione ao menos um destinatário"),
  referenceIds: z.array(z.number()),
});

type CreateDocumentFormData = z.infer<typeof createDocumentSchema>;

interface UploadedFile {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentacaoPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState<number | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: units } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });

  const { data: documents, isLoading } = useListDocuments(
    orgId!,
    {
      search: search || undefined,
      type: typeFilter || undefined,
      status: statusFilter || undefined,
      unitId: unitFilter,
    },
    {
      query: {
        queryKey: [...getListDocumentsQueryKey(orgId!), search, typeFilter, statusFilter, unitFilter],
        enabled: !!orgId,
      },
    }
  );

  useHeaderActions(
    <Button size="sm" onClick={() => setCreateOpen(true)}>
      <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo Documento
    </Button>
  );

  return (
    <>
      <div className="flex flex-wrap gap-6 items-end mb-8">
        <div className="flex-1 min-w-[200px]">
          <Label>Buscar</Label>
          <Input
            placeholder="Título do documento..."
            className="mt-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Label>Tipo</Label>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="mt-2">
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Label>Status</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-2">
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Label>Filial</Label>
          <Select
            value={unitFilter?.toString() ?? ""}
            onChange={(e) => setUnitFilter(e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="mt-2"
          >
            <option value="">Todas</option>
            {units?.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Título</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Versão</th>
                <th className="px-6 py-4">Validade</th>
                <th className="px-6 py-4">Atualizado em</th>
                <th className="px-6 py-4">Aprovado por</th>
                <th className="px-6 py-4">Criado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : documents?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">Nenhum documento encontrado.</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">Crie um novo documento para começar.</p>
                  </td>
                </tr>
              ) : (
                documents?.map((doc) => (
                  <tr
                    key={doc.id}
                    className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/app/qualidade/documentacao/${doc.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{doc.title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground text-xs">{TYPE_LABELS[doc.type] || doc.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[doc.status] || doc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      v{doc.currentVersion}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(doc.validityDate)}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(doc.updatedAt)}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {doc.approvedByName || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {doc.createdByName || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateDocumentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        onCreated={(docId) => {
          queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(orgId!) });
          setCreateOpen(false);
          navigate(`/app/qualidade/documentacao/${docId}`);
        }}
      />
    </>
  );
}

function CreateDocumentModal({
  open,
  onOpenChange,
  orgId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: number | undefined;
  onCreated: (docId: number) => void;
}) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateDocumentFormData>({
    resolver: zodResolver(createDocumentSchema),
    defaultValues: {
      title: "",
      type: "manual",
      validityDate: new Date().toISOString().split("T")[0],
      unitIds: [],
      elaboratorIds: [],
      approverIds: [],
      recipientIds: [],
      referenceIds: [],
    },
  });

  const unitIds = watch("unitIds");
  const elaboratorIds = watch("elaboratorIds");
  const approverIds = watch("approverIds");
  const recipientIds = watch("recipientIds");
  const referenceIds = watch("referenceIds");

  const { data: units } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId && open },
  });

  const { data: orgUsers } = useListOrgUsers(orgId!, {
    query: { enabled: !!orgId && open },
  });

  const { data: existingDocs } = useListDocuments(orgId!, {}, {
    query: { queryKey: getListDocumentsQueryKey(orgId!), enabled: !!orgId && open },
  });

  const createMut = useCreateDocument();

  const handleClose = (val: boolean) => {
    if (!val) {
      reset();
      setUploadedFiles([]);
    }
    onOpenChange(val);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const token = localStorage.getItem("daton_token");
    const baseUrl = import.meta.env.BASE_URL || "/";

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) continue;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(`${baseUrl}api/storage/uploads/direct`, {
          method: "POST",
          headers: {
            "X-File-Content-Type": file.type,
            "X-File-Name": encodeURIComponent(file.name),
            "Content-Type": "application/octet-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: arrayBuffer,
        });

        if (uploadRes.ok) {
          const { objectPath } = await uploadRes.json();
          setUploadedFiles((prev) => [
            ...prev,
            { fileName: file.name, fileSize: file.size, contentType: file.type, objectPath },
          ]);
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    setIsUploading(false);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleMultiSelect = (field: keyof CreateDocumentFormData, current: number[], id: number) => {
    const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
    setValue(field, next, { shouldValidate: true });
  };

  const onSubmit = async (data: CreateDocumentFormData) => {
    if (!orgId) return;

    try {
      const doc = await createMut.mutateAsync({
        orgId,
        data: {
          title: data.title.trim(),
          type: data.type,
          validityDate: data.validityDate || undefined,
          unitIds: data.unitIds.length > 0 ? data.unitIds : undefined,
          elaboratorIds: data.elaboratorIds.length > 0 ? data.elaboratorIds : undefined,
          approverIds: data.approverIds,
          recipientIds: data.recipientIds.length > 0 ? data.recipientIds : undefined,
          referenceIds: data.referenceIds.length > 0 ? data.referenceIds : undefined,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        },
      });
      reset();
      setUploadedFiles([]);
      onCreated(doc.id);
    } catch (err) {
      console.error("Create failed:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} title="Novo Documento" description="Preencha os campos para criar um novo documento." size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label>Título do Documento *</Label>
          <Input placeholder="Ex.: Manual da Qualidade" className="mt-2" {...register("title")} />
          {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Tipo</Label>
            <Select {...register("type")} className="mt-2">
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Filial</Label>
            <MultiSelectDropdown
              placeholder="Selecione"
              options={(units || []).map((u) => ({ value: u.id, label: u.name }))}
              selected={unitIds}
              onToggle={(id) => toggleMultiSelect("unitIds", unitIds, id)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Elaborado por *</Label>
            <MultiSelectDropdown
              placeholder="Selecione"
              options={(orgUsers || []).map((u: OrgUser) => ({ value: u.id!, label: u.name ?? "" }))}
              selected={elaboratorIds}
              onToggle={(id) => toggleMultiSelect("elaboratorIds", elaboratorIds, id)}
            />
            {errors.elaboratorIds && <p className="text-xs text-red-500 mt-1">{errors.elaboratorIds.message}</p>}
          </div>
          <div>
            <Label>Aprovado por *</Label>
            <MultiSelectDropdown
              placeholder="Selecione"
              options={(orgUsers || []).map((u: OrgUser) => ({ value: u.id!, label: u.name ?? "" }))}
              selected={approverIds}
              onToggle={(id) => toggleMultiSelect("approverIds", approverIds, id)}
            />
            {errors.approverIds && <p className="text-xs text-red-500 mt-1">{errors.approverIds.message}</p>}
          </div>
        </div>

        <div>
          <Label>Data de Validade *</Label>
          <Input type="date" className="mt-2 w-64" {...register("validityDate")} />
          {errors.validityDate && <p className="text-xs text-red-500 mt-1">{errors.validityDate.message}</p>}
        </div>

        <div>
          <Label>Anexo Inicial</Label>
          <div className="mt-2">
            <label className="flex items-center gap-2 px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {isUploading ? "Enviando..." : "Escolher Arquivo"}
              </span>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              {uploadedFiles.length === 0 && (
                <span className="text-sm text-muted-foreground/50 ml-2">nenhum arquivo selecionado</span>
              )}
            </label>
            {uploadedFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{f.fileName}</span>
                      <span className="text-muted-foreground text-xs">({formatFileSize(f.fileSize)})</span>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="p-1 hover:bg-muted rounded cursor-pointer">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <Label>Destinatários (protocolo de recebimento) *</Label>
          <MultiSelectDropdown
            placeholder="Selecionar destinatários"
            options={(orgUsers || []).map((u: OrgUser) => ({ value: u.id!, label: u.name ?? "" }))}
            selected={recipientIds}
            onToggle={(id) => toggleMultiSelect("recipientIds", recipientIds, id)}
          />
          {errors.recipientIds && <p className="text-xs text-red-500 mt-1">{errors.recipientIds.message}</p>}
        </div>

        <div>
          <Label>Referências a outros documentos</Label>
          <MultiSelectDropdown
            placeholder="Selecionar documentos referenciados"
            options={(existingDocs || []).map((d) => ({ value: d.id, label: d.title }))}
            selected={referenceIds}
            onToggle={(id) => toggleMultiSelect("referenceIds", referenceIds, id)}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            Salvar Documento
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  placeholder,
}: {
  options: { value: number; label: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  return (
    <div className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full h-9 border-0 border-b border-border bg-transparent px-0 py-2 text-sm text-left cursor-pointer focus:outline-none focus:border-foreground transition-colors"
      >
        <span className={selectedLabels.length > 0 ? "text-foreground truncate" : "text-muted-foreground/50"}>
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
        </span>
        <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[210]" onClick={() => setOpen(false)} />
          <div className="absolute z-[211] mt-1 w-full max-h-48 overflow-y-auto bg-white border border-border/60 rounded-xl shadow-lg py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma opção disponível</div>
            ) : (
              options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => onToggle(opt.value)}
                    className="rounded border-border text-primary"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
