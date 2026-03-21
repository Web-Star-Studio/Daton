import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateDocument,
  useListUnits,
  useListEmployees,
  useListUserOptions,
  useListDocuments,
  getListDocumentsQueryKey,
  getListUnitsQueryKey,
  getListUserOptionsQueryKey,
} from "@workspace/api-client-react";
import type { Employee, UserOption } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Upload, X, FileText, ArrowLeft } from "lucide-react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { resolveApiUrl } from "@/lib/api";
import { DOCUMENT_ELABORATOR_PAGE_SIZE } from "@/lib/document-elaborators";

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
  type: z.enum([
    "manual",
    "procedimento",
    "instrucao",
    "formulario",
    "registro",
    "politica",
    "outro",
  ]),
  validityDate: z.string().min(1, "Data de validade é obrigatória"),
  elaboratorId: z.coerce
    .number()
    .int()
    .positive("Selecione um elaborador"),
  unitIds: z.array(z.number()),
  approverIds: z.array(z.number()).min(1, "Selecione ao menos um aprovador"),
  recipientIds: z
    .array(z.number())
    .min(1, "Selecione ao menos um destinatário"),
  referenceIds: z.array(z.number()),
});

type CreateDocumentFormData = z.infer<typeof createDocumentSchema>;

interface UploadedFile {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
}

export default function NovoDocumentoPage() {
  const { organization, user } = useAuth();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  usePageTitle("Novo Documento");

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateDocumentFormData>({
    resolver: zodResolver(createDocumentSchema),
    defaultValues: {
      title: "",
      type: "manual",
      validityDate: new Date().toISOString().split("T")[0],
      elaboratorId: 0,
      unitIds: [],
      approverIds: [],
      recipientIds: [],
      referenceIds: [],
    },
  });

  const unitIds = watch("unitIds");
  const elaboratorId = watch("elaboratorId");
  const approverIds = watch("approverIds");
  const recipientIds = watch("recipientIds");
  const referenceIds = watch("referenceIds");

  const { data: units } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });

  const { data: orgUsers } = useListUserOptions(orgId!, {
    query: {
      queryKey: getListUserOptionsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });
  const { data: employeesResult } = useListEmployees(orgId!, {
    page: 1,
    pageSize: DOCUMENT_ELABORATOR_PAGE_SIZE,
  });
  const availableUsers = orgUsers ?? [];
  const availableEmployees = useMemo(
    () => employeesResult?.data ?? [],
    [employeesResult?.data],
  );

  useEffect(() => {
    if (availableEmployees.length === 0) return;

    const preferredElaboratorId =
      availableEmployees.find(
        (employee) =>
          employee.email &&
          user?.email &&
          employee.email.toLowerCase() === user.email.toLowerCase(),
      )?.id ??
      availableEmployees[0]?.id ??
      0;

    if (!availableEmployees.some((employee) => employee.id === elaboratorId)) {
      setValue("elaboratorId", preferredElaboratorId, {
        shouldValidate: true,
      });
    }
  }, [availableEmployees, elaboratorId, setValue, user?.email]);

  const { data: existingDocs } = useListDocuments(
    orgId!,
    {},
    {
      query: { queryKey: getListDocumentsQueryKey(orgId!), enabled: !!orgId },
    },
  );

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
        const arrayBuffer = await file.arrayBuffer();
        const uploadRes = await fetch(
          resolveApiUrl("/api/storage/uploads/direct"),
          {
            method: "POST",
            headers: {
              "X-File-Content-Type": file.type,
              "X-File-Name": encodeURIComponent(file.name),
              "Content-Type": "application/octet-stream",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: arrayBuffer,
          },
        );

        if (uploadRes.ok) {
          const { objectPath } = await uploadRes.json();
          setUploadedFiles((prev) => [
            ...prev,
            {
              fileName: file.name,
              fileSize: file.size,
              contentType: file.type,
              objectPath,
            },
          ]);
        } else {
          console.error("Upload failed:", await uploadRes.text());
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

  const toggleMultiSelect = (
    field: keyof CreateDocumentFormData,
    current: number[],
    id: number,
  ) => {
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
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
          elaboratorId: data.elaboratorId,
          unitIds: data.unitIds.length > 0 ? data.unitIds : undefined,
          approverIds: data.approverIds,
          recipientIds:
            data.recipientIds.length > 0 ? data.recipientIds : undefined,
          referenceIds:
            data.referenceIds.length > 0 ? data.referenceIds : undefined,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        },
      });
      queryClient.invalidateQueries({
        queryKey: getListDocumentsQueryKey(orgId),
      });
      navigate(`/qualidade/documentacao/${doc.id}`);
    } catch (err) {
      console.error("Create failed:", err);
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
        onClick={() => navigate("/qualidade/documentacao")}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Voltar para Documentação
      </button>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <Label>Título do Documento *</Label>
          <Input
            placeholder="Ex.: Manual da Qualidade"
            className="mt-2"
            {...register("title")}
          />
          {errors.title && (
            <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Tipo</Label>
            <Select {...register("type")} className="mt-2">
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Filial</Label>
            <MultiSelectDropdown
              placeholder="Selecione"
              options={(units || []).map((u) => ({
                value: u.id,
                label: u.name,
              }))}
              selected={unitIds}
              onToggle={(id) => toggleMultiSelect("unitIds", unitIds, id)}
              onToggleAll={() =>
                setValue(
                  "unitIds",
                  unitIds.length === (units || []).length
                    ? []
                    : (units || []).map((unit) => unit.id),
                  { shouldValidate: true },
                )
              }
              selectAllLabel="Selecionar todas as filiais"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Elaborador</Label>
            <Select
              className="mt-2"
              value={elaboratorId ? String(elaboratorId) : ""}
              onChange={(e) =>
                setValue("elaboratorId", Number(e.target.value), {
                  shouldValidate: true,
                })
              }
            >
              <option value="">Selecione</option>
              {availableEmployees.map((employee: Employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
            {errors.elaboratorId && (
              <p className="text-xs text-red-500 mt-1">
                {errors.elaboratorId.message}
              </p>
            )}
          </div>
          <div>
            <Label>Aprovado por *</Label>
            <MultiSelectDropdown
              placeholder="Selecione"
              options={availableUsers.map((u: UserOption) => ({
                value: u.id,
                label: u.name,
              }))}
              selected={approverIds}
              onToggle={(id) =>
                toggleMultiSelect("approverIds", approverIds, id)
              }
            />
            {errors.approverIds && (
              <p className="text-xs text-red-500 mt-1">
                {errors.approverIds.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <Label>Data de Validade *</Label>
          <Input
            type="date"
            className="mt-2 w-64"
            {...register("validityDate")}
          />
          {errors.validityDate && (
            <p className="text-xs text-red-500 mt-1">
              {errors.validityDate.message}
            </p>
          )}
        </div>

        <div>
          <Label>Anexo Inicial</Label>
          <div className="mt-2">
            <label className="flex cursor-pointer items-center gap-2 px-4 py-3 border border-dashed border-border rounded-lg hover:bg-muted/30 transition-colors">
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
                <span className="text-sm text-muted-foreground/50 ml-2">
                  nenhum arquivo selecionado
                </span>
              )}
            </label>
            {uploadedFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{f.fileName}</span>
                      <span className="text-muted-foreground text-xs">
                        ({formatFileSize(f.fileSize)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="p-1 hover:bg-muted rounded cursor-pointer"
                    >
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
            options={availableUsers.map((u: UserOption) => ({
              value: u.id,
              label: u.name,
            }))}
            selected={recipientIds}
            onToggle={(id) =>
              toggleMultiSelect("recipientIds", recipientIds, id)
            }
          />
          {errors.recipientIds && (
            <p className="text-xs text-red-500 mt-1">
              {errors.recipientIds.message}
            </p>
          )}
        </div>

        <div>
          <Label>Referências a outros documentos</Label>
          <MultiSelectDropdown
            placeholder="Selecionar documentos referenciados"
            options={(existingDocs || []).map((d) => ({
              value: d.id,
              label: d.title,
            }))}
            selected={referenceIds}
            onToggle={(id) =>
              toggleMultiSelect("referenceIds", referenceIds, id)
            }
          />
        </div>

        <div className="flex gap-3 pt-4 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate("/qualidade/documentacao")}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            Salvar Documento
          </Button>
        </div>
      </form>
    </div>
  );
}

function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  onToggleAll,
  placeholder,
  selectAllLabel,
}: {
  options: { value: number; label: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  onToggleAll?: () => void;
  placeholder: string;
  selectAllLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = options.length > 0 && selected.length === options.length;

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
        <span
          className={
            selectedLabels.length > 0
              ? "text-foreground truncate"
              : "text-muted-foreground/50"
          }
        >
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
        </span>
        <svg
          className="h-4 w-4 text-muted-foreground shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-border/60 rounded-xl shadow-lg py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Nenhuma opção disponível
              </div>
            ) : (
              <>
                {onToggleAll && (
                  <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => onToggleAll()}
                      className="rounded border-border text-primary"
                    />
                    <span className="truncate">
                      {selectAllLabel || "Selecionar todas"}
                    </span>
                  </label>
                )}
                {options.map((opt) => (
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
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
