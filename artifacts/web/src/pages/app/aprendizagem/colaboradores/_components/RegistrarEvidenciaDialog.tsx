import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  useCreateCompetencyRequirementEvidence,
  useDeleteCompetency,
} from "@workspace/api-client-react";
import type {
  EmployeeCompetency,
  EmployeeRecordAttachment,
} from "@workspace/api-client-react";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProfileItemAttachmentsField } from "@/components/employees/profile-item-form-fields";
import {
  EMPLOYEE_RECORD_ATTACHMENT_ACCEPT,
  type UploadedFileRef,
} from "@/lib/uploads";
import { toast } from "@/hooks/use-toast";
import {
  uploadEmployeeRecordFiles,
  mapRecordAttachmentItems,
} from "../_lib/employee-record-attachments";
import type { RequirementRow } from "./FormacaoQualificacoes";

const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  conhecimento: "Conhecimento",
  habilidade: "Habilidade",
  atitude: "Atitude",
};

// Diálogo de evidência por requisito do cargo ("Competências do cargo" em
// Formação e qualificações). Nome e tipo da competência SEMPRE vêm do
// requisito (nunca de `existingCompetency`) — é o que garante que o
// resolvedor case a evidência de volta com o mesmo requisito por
// `nome::tipo` (ver PR #186: tipo divergente virava lacuna falsa).
export function RegistrarEvidenciaDialog({
  open,
  onOpenChange,
  requirement,
  orgId,
  empId,
  existingCompetency,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirement: RequirementRow;
  orgId: number;
  empId: number;
  existingCompetency?: EmployeeCompetency;
  onSuccess: () => void;
}) {
  const isEdit = !!existingCompetency;
  const [acquiredLevel, setAcquiredLevel] = useState(
    existingCompetency?.acquiredLevel ?? requirement.requiredLevel,
  );
  const [evidence, setEvidence] = useState(existingCompetency?.evidence ?? "");
  const [attachments, setAttachments] = useState<
    Array<EmployeeRecordAttachment | UploadedFileRef>
  >(existingCompetency?.attachments ?? []);
  const [isUploading, setIsUploading] = useState(false);

  const createMutation = useCreateCompetencyRequirementEvidence();
  const deleteMutation = useDeleteCompetency();
  const isPending = createMutation.isPending || deleteMutation.isPending;

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        orgId,
        empId,
        data: {
          competencyName: requirement.competencyName,
          competencyType: requirement.competencyType,
          requiredLevel: requirement.requiredLevel,
          acquiredLevel,
          evidence: evidence || undefined,
          attachments,
        },
      });
      onSuccess();
    } catch {
      toast({
        title: "Não foi possível salvar a evidência",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleRemove = async () => {
    if (!existingCompetency) return;
    if (!confirm("Remover esta evidência? Esta ação não pode ser desfeita.")) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({
        orgId,
        empId,
        compId: existingCompetency.id,
      });
      onSuccess();
    } catch {
      toast({
        title: "Não foi possível remover a evidência",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar evidência" : "Registrar evidência"}
      description="Nível adquirido, evidência e anexos para este requisito do cargo."
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">
            {requirement.competencyName}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {COMPETENCY_TYPE_LABELS[requirement.competencyType] ??
              requirement.competencyType}
          </span>
        </div>

        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Nível adquirido
          </Label>
          <p className="text-[11px] text-muted-foreground mb-1">
            Requerido pelo cargo: nível {requirement.requiredLevel}
          </p>
          <Input
            type="number"
            min={0}
            max={5}
            value={acquiredLevel}
            onChange={(e) => setAcquiredLevel(Number(e.target.value))}
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-muted-foreground">
            Evidência
          </Label>
          <Input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            className="mt-1"
            placeholder="Ex: Certificado XYZ"
          />
        </div>

        <ProfileItemAttachmentsField
          attachments={mapRecordAttachmentItems(attachments, (objectPath) =>
            setAttachments((current) =>
              current.filter(
                (attachment) => attachment.objectPath !== objectPath,
              ),
            ),
          )}
          onUpload={(files) => {
            setIsUploading(true);
            void uploadEmployeeRecordFiles(
              files,
              attachments.length,
              (uploads) =>
                setAttachments((current) => [...current, ...uploads]),
              () => setIsUploading(false),
            );
          }}
          uploading={isUploading}
          emptyText="Adicione PDF ou imagem para validar a competência."
          accept={EMPLOYEE_RECORD_ATTACHMENT_ACCEPT}
        />

        {isEdit && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remover evidência
          </button>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          isLoading={createMutation.isPending}
          disabled={isPending}
        >
          Salvar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
