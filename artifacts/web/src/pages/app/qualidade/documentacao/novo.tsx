import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreateDocument,
  useListUnits,
  useListOrgUsers,
  useListDocuments,
  getListDocumentsQueryKey,
  getListUnitsQueryKey,
  type CreateDocumentBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Upload, X, FileText, ArrowLeft } from "lucide-react";
import { usePageTitle } from "@/contexts/LayoutContext";

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

interface UploadedFile {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
}

export default function NovoDocumentoPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  usePageTitle("Novo Documento");

  const [title, setTitle] = useState("");
  const [type, setType] = useState("manual");
  const [validityDate, setValidityDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const [selectedElaborators, setSelectedElaborators] = useState<number[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<number[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<number[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<number[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: units } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });

  const { data: orgUsers } = useListOrgUsers(orgId!, {
    query: { enabled: !!orgId },
  });

  const { data: existingDocs } = useListDocuments(orgId!, {}, {
    query: { queryKey: getListDocumentsQueryKey(orgId!), enabled: !!orgId },
  });

  const createMut = useCreateDocument();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const token = localStorage.getItem("daton_token");

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        continue;
      }

      try {
        const urlRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });

        if (!urlRes.ok) continue;
        const { uploadURL, objectPath } = await urlRes.json();

        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (uploadRes.ok) {
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

  const toggleSelection = (arr: number[], setArr: (v: number[]) => void, id: number) => {
    if (arr.includes(id)) {
      setArr(arr.filter((v) => v !== id));
    } else {
      setArr([...arr, id]);
    }
  };

  const handleSubmit = async () => {
    if (!orgId || !title.trim() || selectedApprovers.length === 0) return;

    setIsSubmitting(true);
    try {
      const body: CreateDocumentBody = {
        title: title.trim(),
        type,
        validityDate: validityDate || undefined,
        unitIds: selectedUnits.length > 0 ? selectedUnits : undefined,
        elaboratorIds: selectedElaborators.length > 0 ? selectedElaborators : undefined,
        approverIds: selectedApprovers,
        recipientIds: selectedRecipients.length > 0 ? selectedRecipients : undefined,
        referenceIds: selectedReferences.length > 0 ? selectedReferences : undefined,
        attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      };

      const doc = await createMut.mutateAsync({ orgId, data: body });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(orgId) });
      navigate(`/app/qualidade/documentacao/${doc.id}`);
    } catch (err) {
      console.error("Create failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate("/app/qualidade/documentacao")}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Voltar para Documentação
      </button>

      <div className="space-y-6">
        <div>
          <Label>Título do Documento *</Label>
          <Input
            placeholder="Ex.: Manual da Qualidade"
            className="mt-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="mt-2">
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
              selected={selectedUnits}
              onToggle={(id) => toggleSelection(selectedUnits, setSelectedUnits, id)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Elaborado por *</Label>
            <MultiSelectDropdown
              placeholder="Selecione"
              options={(orgUsers || []).map((u) => ({ value: u.id, label: u.name }))}
              selected={selectedElaborators}
              onToggle={(id) => toggleSelection(selectedElaborators, setSelectedElaborators, id)}
            />
          </div>
          <div>
            <Label>Aprovado por *</Label>
            <MultiSelectDropdown
              placeholder="Selecione"
              options={(orgUsers || []).map((u) => ({ value: u.id, label: u.name }))}
              selected={selectedApprovers}
              onToggle={(id) => toggleSelection(selectedApprovers, setSelectedApprovers, id)}
            />
          </div>
        </div>

        <div>
          <Label>Data de Validade *</Label>
          <Input
            type="date"
            className="mt-2 w-64"
            value={validityDate}
            onChange={(e) => setValidityDate(e.target.value)}
          />
        </div>

        <div>
          <Label>Anexo Inicial *</Label>
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
                    <button onClick={() => removeFile(i)} className="p-1 hover:bg-muted rounded cursor-pointer">
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
            options={(orgUsers || []).map((u) => ({ value: u.id, label: u.name }))}
            selected={selectedRecipients}
            onToggle={(id) => toggleSelection(selectedRecipients, setSelectedRecipients, id)}
          />
        </div>

        <div>
          <Label>Referências a outros documentos</Label>
          <MultiSelectDropdown
            placeholder="Selecionar documentos referenciados"
            options={(existingDocs || []).map((d) => ({ value: d.id, label: d.title }))}
            selected={selectedReferences}
            onToggle={(id) => toggleSelection(selectedReferences, setSelectedReferences, id)}
          />
        </div>

        <div className="flex gap-3 pt-4 border-t border-border/40">
          <Button variant="outline" size="sm" onClick={() => navigate("/app/qualidade/documentacao")}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || selectedApprovers.length === 0 || isSubmitting}
            isLoading={isSubmitting}
          >
            Salvar Documento
          </Button>
        </div>
      </div>
    </div>
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-border/60 rounded-xl shadow-lg py-1">
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
