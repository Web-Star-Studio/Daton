// Padrão único de upload/mapeamento de anexos de registro do colaborador
// (competências, treinamentos, conscientização...). Extraído de [id].tsx para
// ser reaproveitado também pelo RegistrarEvidenciaDialog (Task 5) sem duplicar
// a lógica de upload — evita a divergência silenciosa que já mordeu outras
// partes deste módulo quando um mesmo padrão foi reimplementado em vez de
// reutilizado (ver docs/diario — "fonte única").
import { toast } from "@/hooks/use-toast";
import {
  uploadFilesToStorage,
  validateProfileItemUploadSelection,
  type UploadedFileRef,
} from "@/lib/uploads";
import type { EmployeeRecordAttachment } from "@workspace/api-client-react";

export async function uploadEmployeeRecordFiles(
  files: FileList | null,
  existingCount: number,
  onSuccess: (uploads: UploadedFileRef[]) => void,
  onSettled: () => void,
) {
  if (!files?.length) {
    onSettled();
    return;
  }

  const selectedFiles = Array.from(files);
  const validationError = validateProfileItemUploadSelection(
    selectedFiles,
    existingCount,
  );
  if (validationError) {
    toast({
      title: "Limite de anexos excedido",
      description: validationError,
      variant: "destructive",
    });
    onSettled();
    return;
  }

  try {
    const uploadedFiles = await uploadFilesToStorage(selectedFiles);
    onSuccess(uploadedFiles);
  } catch (error) {
    toast({
      title: "Falha ao enviar anexo",
      description:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o arquivo.",
      variant: "destructive",
    });
  } finally {
    onSettled();
  }
}

export function mapRecordAttachmentItems(
  attachments: Array<EmployeeRecordAttachment | UploadedFileRef> | undefined,
  onRemove?: (objectPath: string) => void,
) {
  return (attachments || []).map((attachment) => ({
    id: attachment.objectPath,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    objectPath: attachment.objectPath,
    onRemove: onRemove ? () => onRemove(attachment.objectPath) : undefined,
  }));
}
