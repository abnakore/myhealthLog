import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";
import { formatFileSize } from "@/lib/format";
import { UploadIcon, DocumentIcon, CloseIcon } from "@/components/icons";

interface FileDropProps {
  label: string;
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  hint?: string;
  optional?: boolean;
  id?: string;
}

/** Click or drag-and-drop a single attachment. Shows the chosen file with its size
    and a way to clear it. Upload itself happens on form submit (multipart). */
export function FileDrop({
  label,
  value,
  onChange,
  accept,
  hint,
  optional,
  id: idProp,
}: FileDropProps) {
  const rid = useId();
  const id = idProp ?? rid;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onChange(file);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-mhl-fine font-semibold text-mhl-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-mhl-faint">(optional)</span>}
      </span>

      {value ? (
        <div className="flex items-center gap-3 rounded-mhl-sm border border-mhl-rule bg-mhl-sunk px-3.5 py-3">
          <span className="text-mhl-muted">
            <DocumentIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-mhl-body font-medium text-mhl-ink">
              {value.name}
            </span>
            <span className="text-mhl-fine text-mhl-muted">{formatFileSize(value.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove file"
            className="grid h-8 w-8 place-items-center rounded-full text-mhl-muted hover:bg-mhl-surface hover:text-mhl-ink"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center rounded-mhl-sm border border-dashed px-5 py-7 text-center transition-colors",
            dragging ? "border-mhl-accent bg-mhl-accent-lo" : "border-mhl-rule bg-mhl-sunk",
          )}
        >
          <span className="mb-2 text-mhl-faint">
            <UploadIcon size={24} />
          </span>
          <span className="text-mhl-body font-medium text-mhl-ink">
            Tap to choose a file, or drop it here
          </span>
          {hint && <span className="mt-0.5 text-mhl-fine text-mhl-muted">{hint}</span>}
        </div>
      )}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
