import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { CloseIcon } from "@/components/icons";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

/** Accessible dialog: portalled to <body> to escape overflow/stacking, Escape and
    backdrop-click to close, scroll lock, focus moved in and trapped while open.
    A bottom sheet on mobile, a centered panel from `sm` up. */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const titleId = useId();
  // Keep the latest close handler in a ref: forms inside the modal re-render the
  // parent on every keystroke (draft state), which would hand the effect a fresh
  // `onClose` closure and re-run it — stealing focus back to the panel after each
  // letter. Depending only on `open` keeps typing uninterrupted.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setShown(false);
    const raf = requestAnimationFrame(() => setShown(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);

    function trapTab(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        trapTab(e);
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 cursor-default bg-mhl-ink/45 transition-opacity duration-200 ease-mhl",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "mhl-no-ring relative w-full overflow-y-auto rounded-t-[1.25rem] border border-mhl-rule bg-mhl-surface shadow-lg outline-none sm:m-4 sm:rounded-mhl",
          "max-h-[92vh] transition-all duration-200 ease-mhl",
          size === "lg" ? "sm:max-w-lg" : "sm:max-w-md",
          shown
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95",
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-mhl-title">
              {title}
            </h2>
            {description && <p className="mt-1 text-mhl-fine text-mhl-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 flex-none place-items-center rounded-full text-mhl-muted hover:bg-mhl-sunk hover:text-mhl-ink"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-mhl-rule bg-mhl-surface p-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

/** A yes/no dialog for destructive or one-way actions (delete a record, discard). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-mhl-body text-mhl-muted">{message}</p>
    </Modal>
  );
}
