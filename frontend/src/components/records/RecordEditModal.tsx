import type { ComponentType } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { FieldErrors } from "./model";

interface RecordEditModalProps<D> {
  open: boolean;
  title: string;
  description?: string;
  draft: D | null;
  errors: FieldErrors;
  onChange: (patch: Partial<D>) => void;
  onSave: () => void;
  onClose: () => void;
  Fields: ComponentType<{ draft: D; onChange: (patch: Partial<D>) => void; errors: FieldErrors }>;
  size?: "md" | "lg";
  /** Label for the confirm button — "Save changes" when editing, "Add" when creating. */
  saveLabel?: string;
  /** Message shown above the fields when the save itself failed. */
  error?: string | null;
}

/** The shared "edit an existing record" dialog. Each list page passes the record's
    own field group and draft; the modal supplies the frame, Cancel and Save. Kept
    generic so add and edit render the exact same fields. */
export function RecordEditModal<D>({
  open,
  title,
  description,
  draft,
  errors,
  onChange,
  onSave,
  onClose,
  Fields,
  size = "lg",
  saveLabel = "Save changes",
  error = null,
}: RecordEditModalProps<D>) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>{saveLabel}</Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-mhl-sm bg-mhl-danger-lo px-3.5 py-3 text-mhl-fine font-medium text-mhl-danger">
          {error}
        </p>
      )}
      {draft && <Fields draft={draft} onChange={onChange} errors={errors} />}
      {errors.form && (
        <p role="alert" className="mt-3 rounded-mhl-sm bg-mhl-danger-lo px-3 py-2 text-mhl-fine text-mhl-danger">
          {errors.form}
        </p>
      )}
    </Modal>
  );
}
