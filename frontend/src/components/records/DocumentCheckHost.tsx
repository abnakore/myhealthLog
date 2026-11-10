/**
 * DocumentCheckHost: the dialog shown when a file disagrees with the form.
 *
 * Mounted once at the root. services/documentCheck.ts calls it from the save
 * path of every record that carries a file (see that file for the flow):
 *
 *   1. While the AI reads the file, a small notice says so.
 *   2. If the file and the form differ, the person sees each difference, what
 *      they typed next to what the document says, and picks which to keep.
 *   3. "Save" saves with their choices; "Go back and edit" saves nothing.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  registerDocumentCheckHost,
  type DocumentCheckDecision,
  type DocumentCheckResult,
} from "@/services/documentCheck";
import type { ReviewMismatch } from "@/services/records";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

type Choice = "document" | "form";

function key(m: ReviewMismatch) {
  return `${m.field}:${m.document}`;
}

export function DocumentCheckHost() {
  const [checking, setChecking] = useState(0);
  const [result, setResult] = useState<DocumentCheckResult | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const resolveRef = useRef<((d: DocumentCheckDecision) => void) | null>(null);

  useEffect(
    () =>
      registerDocumentCheckHost({
        begin: () => {
          setChecking((n) => n + 1);
          let ended = false;
          return () => {
            if (!ended) setChecking((n) => n - 1);
            ended = true;
          };
        },
        confirm: (r) =>
          new Promise<DocumentCheckDecision>((resolve) => {
            resolveRef.current = resolve;
            // Default to the document's value where there is one clear value to use.
            setChoices(Object.fromEntries(r.mismatches.map((m) => [key(m), m.apply ? "document" : "form"])));
            setResult(r);
          }),
      }),
    [],
  );

  const finish = (d: DocumentCheckDecision) => {
    resolveRef.current?.(d);
    resolveRef.current = null;
    setResult(null);
  };

  const save = () => {
    const apply: Record<string, unknown> = {};
    for (const m of result?.mismatches ?? []) {
      if (choices[key(m)] === "document" && m.apply) Object.assign(apply, m.apply);
    }
    finish({ action: "save", apply });
  };

  return (
    <>
      {checking > 0 && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-mhl-rule bg-mhl-surface px-4 py-2.5 text-mhl-fine text-mhl-ink shadow-lg"
        >
          <Spinner size={15} /> Reading your document to compare it with what you typed. This can take up to 45 seconds...
        </div>
      )}
      <Modal
        open={result !== null}
        onClose={() => finish({ action: "cancel" })}
        title="The document says something different"
        description="Choose what to keep for each difference. Nothing is saved until you press Save."
        footer={
          <>
            <Button variant="secondary" onClick={() => finish({ action: "cancel" })}>
              Go back and edit
            </Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        {result?.summary && (
          <p className="mb-3 rounded-mhl-sm bg-mhl-sunk/60 p-3 text-mhl-fine text-mhl-muted">
            <b className="text-mhl-ink">What the document is: </b>
            {result.summary}
          </p>
        )}
        <ul className="space-y-3">
          {(result?.mismatches ?? []).map((m) => {
            const k = key(m);
            const choice = choices[k];
            return (
              <li key={k} className="rounded-mhl-sm border border-mhl-rule p-3">
                <p className="text-mhl-fine text-mhl-ink">{m.detail}</p>
                {m.apply ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`Value for ${m.field}`}>
                    {(
                      [
                        ["form", "Keep what I typed", m.form || "Nothing typed"],
                        ["document", "Use the document", m.suggestion ?? m.document],
                      ] as const
                    ).map(([value, label, shown]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={choice === value}
                        onClick={() => setChoices((c) => ({ ...c, [k]: value }))}
                        className={cn(
                          "rounded-mhl-sm border p-2.5 text-left transition-colors",
                          choice === value
                            ? "border-mhl-accent bg-mhl-accent-lo/60 ring-1 ring-mhl-accent"
                            : "border-mhl-rule hover:border-mhl-accent/40",
                        )}
                      >
                        <span className="block text-[0.72rem] font-semibold uppercase tracking-wide text-mhl-muted">
                          {label}
                        </span>
                        <span className="block text-mhl-body font-semibold text-mhl-ink">{shown}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-mhl-fine text-mhl-muted">
                    Document: <b className="text-mhl-ink">{m.document}</b>. Go back and edit if this is wrong.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
