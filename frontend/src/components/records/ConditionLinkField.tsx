/**
 * "Related conditions" — the optional link from a record to one or more conditions.
 *
 * Optional is the operative word, and the empty case is the normal one: a routine
 * check-up, a weight reading and a tetanus jab all belong to nobody in particular.
 * Picking two conditions is just as valid — Lisinopril is for hypertension *and* heart
 * failure — so this is a multi-select, never a dropdown with one answer.
 *
 * It reads the conditions already on file. With none on file there is nothing to link
 * to, so the field stays out of the form rather than offering an empty box.
 */
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/cn";
import { useRecords } from "@/store/RecordsContext";
import { ConditionIcon } from "@/components/icons";

interface ConditionLinkFieldProps {
  /** Condition ids currently linked — empty means "relates to no particular condition". */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Wording for the record's own noun, e.g. "this medication". */
  label?: string;
}

export function ConditionLinkField({
  value,
  onChange,
  label = "Related conditions",
}: ConditionLinkFieldProps) {
  const { conditions } = useRecords();
  if (conditions.length === 0) return null;

  const sorted = [...conditions].sort((a, b) => a.name.localeCompare(b.name));

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <fieldset>
      <legend className="text-mhl-fine font-semibold text-mhl-ink">
        {label}
        <span className="ml-1 font-normal text-mhl-muted">(optional)</span>
      </legend>
      <p className="mt-0.5 text-mhl-fine text-mhl-muted">
        Leave empty if it isn't about one condition in particular. Pick more than one if
        it's for several — profiles read these links, they never copy the record.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sorted.map((c) => {
          const linked = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={linked}
              onClick={() => toggle(c.id)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-mhl-fine font-semibold transition-colors",
                linked
                  ? "border-mhl-accent bg-mhl-accent-lo text-mhl-accent"
                  : "border-mhl-rule bg-mhl-surface text-mhl-muted hover:border-mhl-accent/40 hover:text-mhl-ink",
              )}
            >
              <ConditionIcon size={15} />
              {c.name}
            </button>
          );
        })}
      </div>
      {value.length > 1 && (
        <p className="mt-2 flex items-center gap-1.5 text-mhl-fine text-mhl-muted">
          <Tag tone="neutral">{value.length} linked</Tag>
          This record will show in each of those profiles.
        </p>
      )}
    </fieldset>
  );
}
