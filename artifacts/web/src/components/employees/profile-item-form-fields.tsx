import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { resolveApiUrl } from "@/lib/api";
import {
  formatFileSize,
  MAX_PROFILE_ITEM_ATTACHMENTS,
  PROFILE_ITEM_ATTACHMENT_ACCEPT,
} from "@/lib/uploads";
import { Paperclip, Upload, X } from "lucide-react";

export type AttachmentFieldItem = {
  id: string | number;
  fileName: string;
  fileSize: number;
  objectPath: string;
  onRemove?: () => void;
};

export type ProfileItemFormValue = {
  title: string;
  description: string;
};

type ProfileItemAttachmentsFieldProps = {
  attachments: AttachmentFieldItem[];
  onUpload?: (files: FileList | null) => void;
  uploading?: boolean;
  disabled?: boolean;
  emptyText?: string;
};

export function ProfileItemAttachmentsField({
  attachments,
  onUpload,
  uploading = false,
  disabled = false,
  emptyText = "Nenhum anexo adicionado.",
}: ProfileItemAttachmentsFieldProps) {
  const canUpload = Boolean(onUpload) && attachments.length < MAX_PROFILE_ITEM_ATTACHMENTS;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-semibold text-muted-foreground">Anexos</Label>
        <span className="text-[11px] text-muted-foreground">
          {attachments.length}/{MAX_PROFILE_ITEM_ATTACHMENTS}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {attachments.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2 text-[13px]">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              <a
                href={resolveApiUrl(`/api/storage${attachment.objectPath}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-primary hover:underline"
              >
                {attachment.fileName}
              </a>
              <span className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</span>
              {attachment.onRemove && (
                <button
                  type="button"
                  onClick={attachment.onRemove}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}

        {canUpload && (
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
            <Upload className="h-4 w-4" />
            <span>{uploading ? "Enviando..." : "Adicionar anexo"}</span>
            <input
              type="file"
              multiple
              className="hidden"
              accept={PROFILE_ITEM_ATTACHMENT_ACCEPT}
              onChange={(event) => {
                onUpload?.(event.target.files);
                event.target.value = "";
              }}
              disabled={disabled || uploading}
            />
          </label>
        )}
      </div>
    </div>
  );
}

type ProfileItemFormFieldsProps = {
  form: ProfileItemFormValue;
  onChange: (next: ProfileItemFormValue) => void;
  attachments: AttachmentFieldItem[];
  onUpload?: (files: FileList | null) => void;
  uploading?: boolean;
  disabled?: boolean;
};

export function ProfileItemFormFields({
  form,
  onChange,
  attachments,
  onUpload,
  uploading = false,
  disabled = false,
}: ProfileItemFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Título *</Label>
        <Input
          value={form.title}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          className="mt-1"
          disabled={disabled}
        />
      </div>
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
        <Textarea
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          className="mt-1 min-h-24"
          disabled={disabled}
        />
      </div>
      <ProfileItemAttachmentsField
        attachments={attachments}
        onUpload={onUpload}
        uploading={uploading}
        disabled={disabled}
      />
    </div>
  );
}
