import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { CloseIcon } from "@/components/icons";

interface TagInputProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  optional?: boolean;
  id?: string;
}

/** Chip input for short lists (reactions, triggers). Enter or comma commits a chip;
    Backspace on an empty field removes the last one. */
export function TagInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  optional,
  id: idProp,
}: TagInputProps) {
  const rid = useId();
  const id = idProp ?? rid;
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const item = raw.trim().replace(/,$/, "").trim();
    if (item && !value.includes(item)) onChange([...value, item]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-mhl-fine font-semibold text-mhl-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-mhl-faint">(optional)</span>}
      </label>
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-mhl-sm border border-mhl-rule bg-mhl-sunk px-2 py-1.5",
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-mhl-surface px-2.5 py-1 text-mhl-fine font-medium text-mhl-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Remove ${tag}`}
              className="grid place-items-center rounded-full text-mhl-muted hover:text-mhl-ink"
            >
              <CloseIcon size={14} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={value.length === 0 ? placeholder : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-mhl-body text-mhl-ink placeholder:text-mhl-faint focus-visible:outline-none"
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-mhl-fine text-mhl-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
