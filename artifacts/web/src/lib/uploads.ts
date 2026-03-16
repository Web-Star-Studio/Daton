import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export const MAX_DIRECT_UPLOAD_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_PROFILE_ITEM_ATTACHMENTS = 10;
export const PROFILE_ITEM_ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv";

export type UploadedFileRef = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export function validateProfileItemUploadSelection(
  files: File[],
  existingCount: number,
): string | null {
  if (existingCount + files.length > MAX_PROFILE_ITEM_ATTACHMENTS) {
    return `Cada item permite no máximo ${MAX_PROFILE_ITEM_ATTACHMENTS} anexos.`;
  }

  const oversizedFile = files.find((file) => file.size > MAX_DIRECT_UPLOAD_FILE_SIZE_BYTES);
  if (oversizedFile) {
    return `O arquivo "${oversizedFile.name}" excede o limite de 20MB.`;
  }

  return null;
}

export async function uploadFileToStorage(file: File): Promise<UploadedFileRef> {
  if (file.size > MAX_DIRECT_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error(`O arquivo "${file.name}" excede o limite de 20MB.`);
  }

  const contentType = file.type || "application/octet-stream";
  const arrayBuffer = await file.arrayBuffer();

  const response = await fetch(resolveApiUrl("/api/storage/uploads/direct"), {
    method: "POST",
    headers: {
      "X-File-Content-Type": contentType,
      "X-File-Name": encodeURIComponent(file.name),
      "Content-Type": "application/octet-stream",
      ...getAuthHeaders(),
    },
    body: arrayBuffer,
  });

  if (!response.ok) {
    throw new Error("Falha ao enviar arquivo");
  }

  const { objectPath } = await response.json();

  return {
    fileName: file.name,
    fileSize: file.size,
    contentType,
    objectPath,
  };
}

export async function uploadFilesToStorage(files: File[]): Promise<UploadedFileRef[]> {
  return Promise.all(files.map((file) => uploadFileToStorage(file)));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
