import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  ProfileItemFormFields,
  type AttachmentFieldItem,
  type ProfileItemFormValue,
} from "@/components/employees/profile-item-form-fields";

type EmployeeProfileItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  isSubmitting?: boolean;
  form: ProfileItemFormValue;
  onFormChange: (next: ProfileItemFormValue) => void;
  attachments: AttachmentFieldItem[];
  onUpload?: (files: FileList | null) => void;
  uploading?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
};

export function EmployeeProfileItemDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  isSubmitting = false,
  form,
  onFormChange,
  attachments,
  onUpload,
  uploading = false,
  onSubmit,
  onCancel,
}: EmployeeProfileItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <ProfileItemFormFields
        form={form}
        onChange={onFormChange}
        attachments={attachments}
        onUpload={onUpload}
        uploading={uploading}
        disabled={isSubmitting}
      />
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : submitLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
