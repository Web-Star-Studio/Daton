import { getAuthHeaders, resolveApiUrl } from "@/lib/api";

export type UploadedFileRef = {
  fileName: string;
  fileSize: number;
  contentType: string;
  objectPath: string;
};

export async function uploadFileToStorage(file: File): Promise<UploadedFileRef> {
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
