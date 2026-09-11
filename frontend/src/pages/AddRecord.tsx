import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { RECORD_KINDS, findKind, type KindConfig } from "@/components/records/registry";
import type { FieldErrors } from "@/components/records/model";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button, buttonStyles } from "@/components/ui/Button";
import { CheckIcon, PlusIcon } from "@/components/icons";

/**
 * The single write path for the whole app (1.3a). Pick a type from the grid, the
 * matching field-set appears, and on save it posts to that type's collection via the
 * registry — no per-type add page. Deep links carry the choice: /app/add?type=allergy
 * lands with allergy already selected, which is how the list pages' "Add" buttons work.
 */
export default function AddRecord() {
  const [params] = useSearchParams();
  const { addItem } = useRecords();

  const [selected, setSelected] = useState<KindConfig | null>(() => findKind(params.get("type")) ?? null);
  const [draft, setDraft] = useState<unknown>(() => {
    const k = findKind(params.get("type"));
    return k ? k.empty() : null;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<KindConfig | null>(null);

  function pick(kind: KindConfig) {
    if (selected?.kind === kind.kind) return;
    setSelected(kind);
    setDraft(kind.empty());
    setErrors({});
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const errs = selected.validate(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    addItem(selected.collectionKey, selected.fromDraft(draft) as never);
    setSaved(selected);
  }

  function addAnother() {
    const k = saved;
    setSaved(null);
    setSelected(k);
    setDraft(k ? k.empty() : null);
    setErrors({});
  }

  if (saved) {
    return (
      <div>
        <PageHeader title="Added to your record" />
        <Card className="flex flex-col items-center py-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-mhl-good-lo text-mhl-good">
            <CheckIcon size={30} strokeWidth={2.25} />
          </span>
          <h2 className="mt-4 text-mhl-lead font-bold text-mhl-ink">
            Your {saved.label.toLowerCase()} is saved
          </h2>
          <p className="mt-1 max-w-sm text-mhl-body text-mhl-muted">
            It's now in your {saved.listLabel.toLowerCase()} and will show wherever it's relevant.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={addAnother} className={buttonStyles("primary", "md")}>
              <PlusIcon size={18} strokeWidth={2.25} />
              Add another
            </button>
            <Link to={saved.listPath} className={buttonStyles("secondary", "md")}>
              View {saved.listLabel.toLowerCase()}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const FieldSet = selected?.Fields;

  return (
    <div>
      <PageHeader title="Add to your record" subtitle="Pick what you're adding, then fill in the details." />

      <fieldset className="min-w-0">
        <legend className="mb-2 text-mhl-fine font-semibold text-mhl-ink">What are you adding?</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {RECORD_KINDS.map((kind) => {
            const Icon = kind.icon;
            const active = selected?.kind === kind.kind;
            return (
              <button
                key={kind.kind}
                type="button"
                onClick={() => pick(kind)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col gap-2 rounded-mhl border p-3.5 text-left transition-colors",
                  active
                    ? "border-mhl-accent bg-mhl-accent-lo"
                    : "border-mhl-rule bg-mhl-surface hover:border-mhl-faint",
                )}
              >
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full",
                    active ? "bg-mhl-accent text-white" : "bg-mhl-sunk text-mhl-muted",
                  )}
                >
                  <Icon size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-mhl-body font-semibold text-mhl-ink">{kind.label}</span>
                  <span className="block text-mhl-fine text-mhl-muted">{kind.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {selected && FieldSet && (
        <Card as="form" onSubmit={handleSubmit} className="mt-5">
          <h2 className="text-mhl-lead font-bold text-mhl-ink">{selected.label} details</h2>
          <div className="mt-4">
            <FieldSet
              draft={draft}
              onChange={(patch: unknown) =>
                setDraft((prev) => ({ ...(prev as object), ...(patch as object) }))
              }
              errors={errors}
            />
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link to="/app" className={buttonStyles("secondary", "md")}>
              Cancel
            </Link>
            <Button type="submit">Save {selected.label.toLowerCase()}</Button>
          </div>
        </Card>
      )}

      {!selected && (
        <p className="mt-4 text-mhl-fine text-mhl-muted">
          Choose a type above to see its form.
        </p>
      )}
    </div>
  );
}
