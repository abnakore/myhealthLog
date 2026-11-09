/**
 * A condition-aware profile — the record, read through one context.
 *
 * What is on screen is the same record the rest of the app shows: every row here is a
 * reference to a record that is still on the record, with a tag saying *why* it is
 * here (linked to the condition, named in its notes, or recent in a category the
 * context follows). Nothing is copied into the profile, nothing is hidden from the
 * record, and the count at the foot says plainly how many records are not being shown
 * and links straight to all of them.
 *
 * Empty is a normal state, not a failure: a condition with nothing linked yet shows
 * its sections with honest empty lines, and the profile offers to link the records it
 * can see that look related rather than claiming them on the user's behalf.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useContexts } from "@/store/ContextsContext";
import {
  BASIS_LABELS,
  buildContextProfile,
  contextConditionIds,
  isPregnancy,
  type ContextProfile,
  type RecordCategory,
} from "@/lib/healthContexts";
import {
  CONDITION_STATUS_LABELS,
  SEVERITY_LABELS,
} from "@/types/health";
import { formatDate, yearOf } from "@/lib/format";
import type { ReactNode } from "react";
import { emptyPregnancyContext } from "@/types/context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Tag, allergyTone, conditionTone } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CATEGORY_COPY,
  ContextRowList,
  buildContextRows,
  orderedRows,
  type ContextRow,
} from "@/components/context/ContextRows";
import { PregnancyModal } from "@/components/context/PregnancyModal";
import { AllRecordsLink } from "@/components/context/ContextBanner";
import { CATEGORY_ORDER } from "@/lib/healthContexts";
import {
  ChevronRightIcon,
  CompassIcon,
  ConditionIcon,
  PhoneIcon,
  SproutIcon,
} from "@/components/icons";

/** A stable empty shell, so the details form only re-seeds when it opens. */
const EMPTY_PREGNANCY = emptyPregnancyContext();

/** A labelled fact in the context overview. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-mhl-fine text-mhl-muted">{label}</dt>
      <dd className="mt-0.5 text-mhl-body font-medium text-mhl-ink">{value || "—"}</dd>
    </div>
  );
}

export default function HealthContextProfile() {
  const { id = "" } = useParams();
  const { canEdit, isProxyView, activeOwnerName } = useCareProxy();
  const rec = useRecords();
  const { contexts, activeId, activate, updatePregnancy } = useContexts();
  const ctx = contexts.find((c) => c.id === id);
  const [pregnancyOpen, setPregnancyOpen] = useState(false);

  // Opening this page *is* opening the profile — the band above every page follows it.
  useEffect(() => {
    if (ctx && activeId !== ctx.id) activate(ctx.id);
  }, [ctx, activeId, activate]);

  const profile = useMemo(
    () => (ctx ? buildContextProfile({ bundle: rec, ctx }) : null),
    [ctx, rec],
  );

  /** Offered on the profile's unlinked rows: point the record at this profile's conditions. */
  const linkRecord = useCallback(
    (category: RecordCategory, recordId: string) => {
      const coveredIds = ctx ? contextConditionIds(ctx) : [];
      const list = rec[category] as unknown as Array<{ id: string; conditionIds?: string[] }>;
      const existing = list.find((r) => r.id === recordId)?.conditionIds ?? [];
      rec.updateItem(category, recordId, {
        conditionIds: [...new Set([...existing, ...coveredIds])],
      });
    },
    [rec, ctx],
  );

  if (!ctx || !profile) {
    return (
      <div>
        <PageHeader title="Profile not on file" />
        <EmptyState
          icon={<CompassIcon size={26} />}
          title="This profile isn't on this record"
          description="It may have been removed, or it may belong to a different person's record."
          action={
            <Link to="/app/contexts" className="text-mhl-fine font-semibold text-mhl-accent">
              Condition-aware profiles
            </Link>
          }
        />
      </div>
    );
  }

  const rows = buildContextRows({ profile, onLink: canEdit ? linkRecord : undefined });
  const timeline = orderedRows(rows).slice(0, 8);
  const unlinkedCount = Object.values(rows)
    .flat()
    .filter((r: ContextRow) => Boolean(r.link)).length;
  const pregnancy = isPregnancy(ctx) ? profile.pregnancy : undefined;
  const anchor = profile.anchor;

  return (
    <div>
      <PageHeader
        title={profile.label}
        subtitle={
          pregnancy
            ? [
                pregnancy.statusLabel,
                pregnancy.ageLabel,
                pregnancy.dueDateLabel ? `Due ${pregnancy.dueDateLabel}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")
            : anchor
              ? [
                  CONDITION_STATUS_LABELS[anchor.status],
                  anchor.severity ? SEVERITY_LABELS[anchor.severity] : null,
                  anchor.onsetDate ? `Since ${yearOf(anchor.onsetDate)}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")
              : "Condition-aware profile"
        }
        action={
          <Link
            to="/app/contexts"
            className="inline-flex items-center gap-1 text-mhl-fine font-semibold text-mhl-muted hover:text-mhl-ink"
          >
            Switch profile
            <ChevronRightIcon size={14} />
          </Link>
        }
      />

      {/* What this lens is, in one card — before any data, so the framing lands first. */}
      <div className="rounded-mhl border border-mhl-accent/25 bg-mhl-accent-lo p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex-none text-mhl-accent">
            {isPregnancy(ctx) ? <SproutIcon size={22} /> : <ConditionIcon size={22} />}
          </span>
          <p className="min-w-0 text-mhl-fine text-mhl-ink">
            Viewing {isProxyView ? `${activeOwnerName}'s record` : "your record"} through the{" "}
            <span className="font-bold">{profile.label}</span> profile. Nothing has been moved
            copied or hidden —{" "}
            <Link to="/app/timeline" className="font-semibold text-mhl-accent hover:underline">
              all health records
            </Link>{" "}
            still hold everything.
          </p>
        </div>
      </div>

      {/* The overview: the pregnancy's own dates, or the anchor condition's details. */}
      {pregnancy ? (
        <PregnancyOverview
          pregnancy={pregnancy}
          onEdit={canEdit ? () => setPregnancyOpen(true) : undefined}
        />
      ) : (
        anchor && <ConditionOverview anchor={anchor} />
      )}

      {/* Always visible, in every profile — the facts that belong to the person. */}
      <CriticalFactsBlock critical={profile.critical} />

      {/* The prioritised record itself, one section per category. */}
      {CATEGORY_ORDER.map((category) => {
        const copy = CATEGORY_COPY[category];
        const categoryRows = rows[category];
        const hasContent = categoryRows.length > 0;
        return (
          <Section key={category} question={copy.question} lead={copy.lead}>
            {hasContent ? (
              <ContextRowList rows={categoryRows} linkLabel={`Link to ${profile.label}`} className="mt-1" />
            ) : (
              <p className="mt-3 rounded-mhl-sm bg-mhl-sunk px-3.5 py-3 text-mhl-fine text-mhl-muted">
                {copy.empty(profile.label)}
              </p>
            )}
          </Section>
        );
      })}

      {/* This context's own line through time. */}
      {timeline.length > 0 && (
        <Section
          question="How it's gone, in order"
          lead="The records above, laid out newest first. The full timeline holds everything else too."
          action={
            <Link
              to="/app/timeline"
              className="text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
            >
              Full timeline
            </Link>
          }
        >
          <ul className="mt-2 divide-y divide-mhl-rule">
            {timeline.map((row) => (
              <li key={`timeline-${row.key}`} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                  <row.icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-mhl-body font-medium text-mhl-ink">{row.title}</p>
                  {row.meta && <p className="text-mhl-fine text-mhl-muted">{row.meta}</p>}
                </div>
                <span className="flex-none text-mhl-fine text-mhl-faint">{formatDate(row.when)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* The honest count. Nothing has been deleted — this is exactly what isn't shown. */}
      <div className="rounded-mhl-sm bg-mhl-sunk p-4 text-mhl-fine text-mhl-ink">
        <p className="font-semibold">
          Showing {profile.counts.shown} of {profile.counts.total} records on this profile
        </p>
        <p className="mt-1 text-mhl-muted">
          {profile.counts.rest === 0
            ? "Every record on file is in view here."
            : `${profile.counts.rest} ${
                profile.counts.rest === 1 ? "record" : "records"
              } aren't shown in this profile — they're untouched on your record, a click away on the full timeline.`}
          {unlinkedCount > 0 && canEdit && (
            <>
              {" "}
              {unlinkedCount} {unlinkedCount === 1 ? "row" : "rows"} above{" "}
              {unlinkedCount === 1 ? "looks" : "look"} related but{" "}
              {unlinkedCount === 1 ? "isn't" : "aren't"} linked yet — link{" "}
              {unlinkedCount === 1 ? "it" : "them"} if they belong here.
            </>
          )}
        </p>
        <p className="mt-2">
          Priority order: <BasisLegend />
        </p>
        <div className="mt-3">
          <AllRecordsLink className="text-mhl-fine" />
        </div>
      </div>

      {pregnancy && pregnancyOpen && (
        <PregnancyModal
          open
          current={ctx.pregnancy ?? EMPTY_PREGNANCY}
          onSave={(patch) => {
            updatePregnancy(ctx.id, patch);
            setPregnancyOpen(false);
          }}
          onClose={() => setPregnancyOpen(false)}
        />
      )}
    </div>
  );
}


/* ------------------------------------------------------------- sub-views -- */

function ConditionOverview({ anchor }: { anchor: NonNullable<ContextProfile["anchor"]> }) {
  return (
    <Section
      question="What this profile is built around"
      lead="The condition as it stands on your record — read from it, never copied into it."
      action={
        <Link
          to="/app/conditions"
          className="text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong"
        >
          Edit condition
        </Link>
      }
    >
      <div className="mt-3 flex items-start gap-3 rounded-mhl-sm bg-mhl-sunk p-3.5">
        <span className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent-lo text-mhl-accent">
          <ConditionIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-mhl-body font-semibold text-mhl-ink">{anchor.name}</p>
            <Tag tone={conditionTone(anchor.status)}>{CONDITION_STATUS_LABELS[anchor.status]}</Tag>
          </div>
          <p className="mt-1 text-mhl-fine text-mhl-muted">
            {[
              anchor.severity ? SEVERITY_LABELS[anchor.severity] : null,
              anchor.onsetDate ? `Since ${formatDate(anchor.onsetDate)}` : null,
            ]
              .filter(Boolean)
              .join("  ·  ") || "No further details recorded."}
          </p>
          {anchor.notes && <p className="mt-1 text-mhl-fine text-mhl-faint">{anchor.notes}</p>}
        </div>
      </div>
    </Section>
  );
}

function PregnancyOverview({
  pregnancy,
  onEdit,
}: {
  pregnancy: NonNullable<ContextProfile["pregnancy"]>;
  onEdit?: () => void;
}) {
  return (
    <Section
      question="Where this pregnancy stands"
      lead="The dates of the pregnancy itself. Everything else on this profile comes from your records."
      action={
        onEdit ? (
          <Button variant="secondary" size="md" onClick={onEdit}>
            Edit details
          </Button>
        ) : undefined
      }
    >
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Fact
          label="Gestational age"
          value={
            pregnancy.ageLabel ??
            (pregnancy.statusLabel !== "Ongoing" ? (
              pregnancy.statusLabel
            ) : (
              <span className="text-mhl-muted">Add a date to work this out</span>
            ))
          }
        />
        <Fact label="Estimated due date" value={pregnancy.dueDateLabel} />
        <Fact label="Last period started" value={pregnancy.lastMenstrualPeriodLabel} />
        <Fact
          label="Pregnancy number"
          value={pregnancy.gravida != null ? `${pregnancy.gravida}` : null}
        />
        <Fact label="Previous births" value={pregnancy.para != null ? `${pregnancy.para}` : null} />
        <Fact
          label="Miscarriages · stillbirths"
          value={
            pregnancy.miscarriages != null || pregnancy.stillbirths != null
              ? `${pregnancy.miscarriages ?? 0} · ${pregnancy.stillbirths ?? 0}`
              : null
          }
        />
      </dl>
      {pregnancy.complications.length > 0 && (
        <div className="mt-4">
          <p className="text-mhl-fine font-semibold text-mhl-ink">Complications recorded</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {pregnancy.complications.map((c) => (
              <Tag key={c} tone="watch">
                {c}
              </Tag>
            ))}
          </div>
        </div>
      )}
      {pregnancy.delivery && (
        <p className="mt-4 text-mhl-fine text-mhl-muted">Delivery: {pregnancy.delivery}</p>
      )}
      {pregnancy.notes && <p className="mt-2 text-mhl-fine text-mhl-muted">{pregnancy.notes}</p>}
      {onEdit && (
        <Button variant="secondary" size="md" className="mt-4" onClick={onEdit}>
          Edit pregnancy details
        </Button>
      )}
    </Section>
  );
}

/** Blood group, critical allergies, current medicines, who to call — the same facts the
    emergency card holds, because they belong to the person whatever the focus is. */
function CriticalFactsBlock({ critical }: { critical: ContextProfile["critical"] }) {
  return (
    <Section
      question="What's true whatever the focus"
      lead="These stay in every profile, and the public emergency card keeps its own rules about them."
    >
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Fact
          label="Blood group & genotype"
          value={[critical.bloodType, critical.genotype].filter(Boolean).join(" · ") || null}
        />
        <Fact
          label="Critical allergies"
          value={
            critical.allergies.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {critical.allergies.map((a) => (
                  <Tag key={a.id} tone={allergyTone(a.severity)}>
                    {a.substance}
                  </Tag>
                ))}
              </span>
            ) : (
              <span className="text-mhl-muted">None recorded</span>
            )
          }
        />
        <Fact
          label="Medicines being taken"
          value={
            critical.currentMedications.length > 0
              ? critical.currentMedications.map((m) => m.name).join(", ")
              : null
          }
        />
      </dl>
      {critical.primaryContact && (
        <p className="mt-4 flex items-center gap-2 text-mhl-fine text-mhl-muted">
          <PhoneIcon size={15} />
          <span>
            First contact:{" "}
            <span className="font-semibold text-mhl-ink">{critical.primaryContact.name}</span> ·{" "}
            {critical.primaryContact.phone}
          </span>
        </p>
      )}
    </Section>
  );
}

/** The priority rules, stated on the page rather than implied by it. */
function BasisLegend() {
  const order = ["LINKED", "INHERENT", "MENTION", "RECENT"] as const;
  const wording: Record<(typeof order)[number], string> = {
    LINKED: "linked to the condition",
    INHERENT: "part of this stage of life",
    MENTION: "named in a record's own words",
    RECENT: "recent in a category this profile follows",
  };
  return (
    <span className="text-mhl-muted">
      {order.map((b) => `${BASIS_LABELS[b]} (${wording[b]})`).join(" → ")}. Nothing is promoted
      silently: every row shows which one it is.
    </span>
  );
}


