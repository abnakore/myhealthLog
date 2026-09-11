import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/* Shared control surface: recessed well, 1px rule, coral focus ring comes from the
   global :focus-visible rule. Error swaps the border to danger. */
const CONTROL =
  "w-full min-h-11 rounded-mhl-sm border bg-mhl-sunk px-3.5 py-2.5 text-mhl-body text-mhl-ink placeholder:text-mhl-faint";

function borderClass(error?: string) {
  return error ? "border-mhl-danger" : "border-mhl-rule";
}

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}

/** Label above, control, then help or error. One layout for every field type. */
function FieldShell({ id, label, error, hint, optional, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-mhl-fine font-semibold text-mhl-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-mhl-faint">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-mhl-fine text-mhl-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-mhl-fine text-mhl-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type FieldExtras = { label: string; error?: string; hint?: string; optional?: boolean };

/* ---- text input ---- */

export function TextField({
  label,
  error,
  hint,
  optional,
  id: idProp,
  className,
  ...rest
}: FieldExtras & InputHTMLAttributes<HTMLInputElement>) {
  const rid = useId();
  const id = idProp ?? rid;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn(CONTROL, borderClass(error), className)}
        {...rest}
      />
    </FieldShell>
  );
}

/* ---- textarea ---- */

export function TextArea({
  label,
  error,
  hint,
  optional,
  id: idProp,
  className,
  rows = 3,
  ...rest
}: FieldExtras & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const rid = useId();
  const id = idProp ?? rid;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn(CONTROL, "min-h-[5rem] resize-y leading-relaxed", borderClass(error), className)}
        {...rest}
      />
    </FieldShell>
  );
}

/* ---- select ---- */

export function SelectField({
  label,
  error,
  hint,
  optional,
  id: idProp,
  className,
  placeholder,
  children,
  ...rest
}: FieldExtras & SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }) {
  const rid = useId();
  const id = idProp ?? rid;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(CONTROL, "appearance-none pr-10", borderClass(error), className)}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {children}
        </select>
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-mhl-muted"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </FieldShell>
  );
}
