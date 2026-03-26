import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateDocument,
  useListUnits,
  getListUnitsQueryKey,
  getListDocumentsQueryKey,
  useListOrganizationContactGroups,
  getListOrganizationContactGroupsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Upload, X, FileText } from "lucide-react";
import { usePageTitle } from "@/contexts/LayoutContext";
import { resolveApiUrl } from "@/lib/api";
import { useEmployeeMultiPicker } from "@/hooks/use-employee-multi-picker";
import { useUserMultiPicker } from "@/hooks/use-user-multi-picker";
import { useDocumentMultiPicker } from "@/hooks/use-document-multi-picker";
import { DocumentNormativeRequirementsField } from "@/components/documents/document-normative-requirements-field";
import { getDocumentRecipientResolution } from "@/lib/organization-contacts";

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
  elaboratorIds: z.array(z.number()).min(1, "Selecione ao menos um elaborador"),
  criticalReviewerIds: z
    .array(z.number())
    .min(1, "Selecione ao menos um responsável pela análise crítica"),
  unitIds: z.array(z.number()),
  approverIds: z.array(z.number()).min(1, "Selecione ao menos um aprovador"),
  recipientIds: z.array(z.number()),
  recipientGroupIds: z.array(z.number()),
  referenceIds: z.array(z.number()),
  normativeRequirements: z.array(z.string()),
});

type CreateDocumentFormData = z.infer<typeof createDocumentSchema>;

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

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<CreateDocumentFormData>({
    resolver: zodResolver(createDocumentSchema),
    defaultValues: {
      title: "",
      type: "manual",
      validityDate: new Date().toISOString().split("T")[0],
      elaboratorIds: [],
      criticalReviewerIds: [],
      unitIds: [],
      approverIds: [],
      recipientIds: [],
      recipientGroupIds: [],
      referenceIds: [],
      normativeRequirements: [],
    },
  });

  const unitIds = watch("unitIds");
  const elaboratorIds = watch("elaboratorIds");
  const criticalReviewerIds = watch("criticalReviewerIds");
  const approverIds = watch("approverIds");
  const recipientIds = watch("recipientIds");
  const recipientGroupIds = watch("recipientGroupIds");
  const referenceIds = watch("referenceIds");
  const normativeRequirements = watch("normativeRequirements");
  const title = watch("title");
  const type = watch("type");

  const { data: units } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId },
  });

  const elaboratorPicker = useEmployeeMultiPicker({
    orgId,
    selectedIds: elaboratorIds,
    enabled: !!orgId,
  });
  const approverPicker = useUserMultiPicker({
    orgId,
    selectedIds: approverIds,
    enabled: !!orgId,
  });
  const criticalReviewerPicker = useUserMultiPicker({
    orgId,
    selectedIds: criticalReviewerIds,
    enabled: !!orgId,
  });
  const recipientPicker = useUserMultiPicker({
    orgId,
    selectedIds: recipientIds,
    enabled: !!orgId,
  });
  const { data: recipientGroups = [] } = useListOrganizationContactGroups(orgId!, {
    query: {
      queryKey: getListOrganizationContactGroupsQueryKey(orgId!),
      enabled: !!orgId,
    },
  });
  const referencePicker = useDocumentMultiPicker({
    orgId,
    selectedIds: referenceIds,
    enabled: !!orgId,
  });

  const recipientResolution = getDocumentRecipientResolution(
    recipientIds,
    recipientGroups,
    recipientGroupIds,
  );

  const createMut = useCreateDocument();

  useEffect(() => {
    if (recipientResolution.totalContactCount > 0) {
      clearErrors("recipientIds");
    }
  }, [clearErrors, recipientResolution.totalContactCount]);

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

    if (recipientResolution.totalContactCount === 0) {
      setError("recipientIds", {
        type: "manual",
        message: "Selecione ao menos um destinatário ou grupo",
      });
      return;
    }

    try {
      const doc = await createMut.mutateAsync({
        orgId,
        data: {
          title: data.title.trim(),
          type: data.type,
          validityDate: data.validityDate || undefined,
          elaboratorIds: data.elaboratorIds,
          criticalReviewerIds: data.criticalReviewerIds,
          unitIds: data.unitIds.length > 0 ? data.unitIds : undefined,
          approverIds: data.approverIds,
          recipientIds:
            data.recipientIds.length > 0 ? data.recipientIds : undefined,
          recipientGroupIds:
            data.recipientGroupIds.length > 0
              ? data.recipientGroupIds
              : undefined,
          referenceIds:
            data.referenceIds.length > 0 ? data.referenceIds : undefined,
          normativeRequirements:
            data.normativeRequirements.length > 0
              ? data.normativeRequirements
              : undefined,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        } as never,
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
            <SearchableMultiSelect
              placeholder="Selecione"
              searchPlaceholder="Buscar filial..."
              emptyMessage="Nenhuma filial encontrada."
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
            <Label>Elaboradores *</Label>
            <SearchableMultiSelect
              placeholder="Selecione"
              searchPlaceholder="Buscar colaborador..."
              emptyMessage="Nenhum colaborador encontrado."
              options={elaboratorPicker.options.map((e) => ({
                value: e.id,
                label: e.name,
                keywords: [e.email ?? ""],
              }))}
              selected={elaboratorIds}
              onToggle={(id) =>
                toggleMultiSelect("elaboratorIds", elaboratorIds, id)
              }
              onSearchValueChange={elaboratorPicker.setSearchValue}
            />
            {errors.elaboratorIds && (
              <p className="text-xs text-red-500 mt-1">
                {errors.elaboratorIds.message}
              </p>
            )}
          </div>
          <div>
            <Label>Responsáveis pela análise crítica *</Label>
            <SearchableMultiSelect
              placeholder="Selecione"
              searchPlaceholder="Buscar responsável..."
              emptyMessage="Nenhum responsável encontrado."
              options={criticalReviewerPicker.options.map((u) => ({
                value: u.id,
                label: u.name,
                keywords: [u.email],
              }))}
              selected={criticalReviewerIds}
              onToggle={(id) =>
                toggleMultiSelect(
                  "criticalReviewerIds",
                  criticalReviewerIds,
                  id,
                )
              }
              onSearchValueChange={criticalReviewerPicker.setSearchValue}
            />
            {errors.criticalReviewerIds && (
              <p className="text-xs text-red-500 mt-1">
                {errors.criticalReviewerIds.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Aprovadores *</Label>
            <SearchableMultiSelect
              placeholder="Selecione"
              searchPlaceholder="Buscar aprovador..."
              emptyMessage="Nenhum aprovador encontrado."
              options={approverPicker.options.map((u) => ({
                value: u.id,
                label: u.name,
                keywords: [u.email],
              }))}
              selected={approverIds}
              onToggle={(id) =>
                toggleMultiSelect("approverIds", approverIds, id)
              }
              onSearchValueChange={approverPicker.setSearchValue}
            />
            {errors.approverIds && (
              <p className="text-xs text-red-500 mt-1">
                {errors.approverIds.message}
              </p>
            )}
          </div>
          <div>
            <Label>Grupos de destinatários</Label>
            <SearchableMultiSelect
              placeholder="Selecionar grupos"
              searchPlaceholder="Buscar grupo..."
              emptyMessage="Nenhum grupo cadastrado."
              options={recipientGroups.map((group) => ({
                value: group.id,
                label: group.name,
                keywords: group.members.map((member) => member.name),
              }))}
              selected={recipientGroupIds}
              onToggle={(id) =>
                toggleMultiSelect("recipientGroupIds", recipientGroupIds, id)
              }
            />
          </div>
        </div>

        <div>
          <Label>Destinatários (protocolo de recebimento) *</Label>
          <SearchableMultiSelect
            placeholder="Selecionar destinatários"
            searchPlaceholder="Buscar destinatário..."
            emptyMessage="Nenhum destinatário encontrado."
            options={recipientPicker.options.map((u) => ({
              value: u.id,
              label: u.name,
              keywords: [u.email],
            }))}
            selected={recipientIds}
            onToggle={(id) =>
              toggleMultiSelect("recipientIds", recipientIds, id)
            }
            onSearchValueChange={recipientPicker.setSearchValue}
          />
          {errors.recipientIds && (
            <p className="text-xs text-red-500 mt-1">
              {errors.recipientIds.message}
            </p>
          )}
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
          <Label>Referências a outros documentos</Label>
          <SearchableMultiSelect
            placeholder="Selecionar documentos referenciados"
            searchPlaceholder="Buscar documento de referência..."
            emptyMessage="Nenhum documento encontrado."
            options={referencePicker.options.map((d) => ({
              value: d.id,
              label: d.title,
            }))}
            selected={referenceIds}
            onToggle={(id) =>
              toggleMultiSelect("referenceIds", referenceIds, id)
            }
            onSearchValueChange={referencePicker.setSearchValue}
          />
        </div>

        <DocumentNormativeRequirementsField
          orgId={orgId}
          title={title}
          type={type}
          referenceIds={referenceIds}
          value={normativeRequirements}
          onChange={(nextValue) =>
            setValue("normativeRequirements", nextValue, {
              shouldValidate: true,
            })
          }
        />

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
