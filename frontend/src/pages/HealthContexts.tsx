/**
 * Condition-aware profiles — the page where a lens is opened, switched or closed.
 *
 * The framing here is the whole feature in one screen: the record is complete and stays
 * complete; a profile is a way of *reading* it. So every row says what the profile
 * would bring forward, the way back to the whole record is never more than a click
 * away, and closing a profile is called what it is — "Remove this profile" — with a
 * confirmation that says outright that no records are touched.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useContexts } from "@/store/ContextsContext";
import {
  contextConditionIds,
  contextLabel,
  isPregnancy,
  linkedRecordCount,
  pregnancyLine,
  pregnancyView,
} from "@/lib/healthContexts";
import { CONDITION_STATUS_LABELS, SEVERITY_LABELS, type Condition } from "@/types/health";
import type { HealthContext } from "@/types/context";
import { yearOf } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Tag, conditionTone } from "@/components/ui/Tag";
import { buttonStyles } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import {
  CompassIcon,
  ConditionIcon,
  InfoIcon,
  PlusIcon,
  SproutIcon,
  TrashIcon,
} from "@/components/icons";

export default function HealthContexts() {
  const navigate = useNavigate();
  const { canEdit } = useCareProxy();
  const {
    conditions,
    contexts,
    medications,
    allergies,
    vitals,
    documents,
    appointments,
    procedures,
    immunizations,
  } = useRecords();
  const { active, activeLabel, openCondition, openPregnancy, removeContext, deactivate } =
    useContexts();
  const [removing, setRemoving] = useState<HealthContext | null>(null);

  // Every collection a linked record could live in — used for the per-condition counts.
  const recordSource = useMemo(
    () => ({
      conditions,
      medications,
      allergies,
      vitals,
      documents,
      appointments,
      procedures,
      immunizations,
    }),
    [conditions, medications, allergies, vitals, documents, appointments, procedures, immunizations],
  );

  const openable = conditions.filter((c) => !contexts.some((ctx) => ctx.conditionId === c.id));
  const hasPregnancy = contexts.some(isPregnancy);
  const totalRecords = Object.values(recordSource).reduce((n, list) => n + list.length, 0);

  async function openConditionProfile(condition: Condition) {
    // The context is created server-side first, so wait for its real id.
    const id = await openCondition(condition);
    if (id) navigate(`/app/contexts/${id}`);
  }

  async function openPregnancyProfile() {
    const id = await openPregnancy();
    if (id) navigate(`/app/contexts/${id}`);
  }

  return (
    <div>
      <PageHeader
        title="Condition-aware profiles"
        subtitle="Read your record through one condition at a time — without changing a thing on it."
      />

      <Section
        question="How this works"
        lead="Your record is stored once. A profile never copies, moves or hides anything."
      >
        <div className="mt-3 flex items-start gap-3 rounded-mhl-sm bg-mhl-sunk p-3.5">
          <span className="mt-0.5 flex-none text-mhl-muted">
            <InfoIcon size={20} />
          </span>
          <p className="min-w-0 text-mhl-fine text-mhl-ink">
            Opening a profile brings this condition's records to the front — the medicines,
            results, visits and documents linked to it. Everything else stays exactly where it
            is, one click away on the{" "}
            <Link to="/app/timeline" className="font-semibold text-mhl-accent hover:underline">
              full record
            </Link>
            .
          </p>
        </div>
        <p className="mt-3 text-mhl-fine text-mhl-muted">
          {totalRecords} {totalRecords === 1 ? "record" : "records"} on file ·{" "}
          {contexts.length} {contexts.length === 1 ? "profile" : "profiles"} on this record
        </p>
      </Section>

      {active && (
        <Section
          question="In focus right now"
          action={
            <button
              type="button"
              onClick={deactivate}
              className="text-mhl-fine font-semibold text-mhl-muted hover:text-mhl-ink"
            >
              Close profile
            </button>
          }
        >
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-mhl-sm bg-mhl-accent-lo p-3.5">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent text-white">
              {isPregnancy(active) ? <SproutIcon size={20} /> : <ConditionIcon size={20} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-mhl-body font-semibold text-mhl-ink">{activeLabel}</p>
              <p className="text-mhl-fine text-mhl-muted">
                Every page is being read through this profile. Closing it changes nothing on
                your record.
              </p>
            </div>
            <Link to={`/app/contexts/${active.id}`} className={buttonStyles("secondary", "md")}>
              Open profile
            </Link>
          </div>
        </Section>
      )}

      <Section
        question="Which condition should lead?"
        lead="Pick a condition already on your record. The profile points at it — it never makes a second copy."
      >
        {openable.length === 0 && !hasPregnancy && contexts.length === 0 ? (
          <EmptyState
            className="mt-3"
            icon={<ConditionIcon size={26} />}
            title="No conditions to build a profile from"
            description="Add a condition to your record first, then come back and read it through that lens."
            action={
              <Link to="/app/conditions" className={buttonStyles("primary", "md")}>
                Go to conditions
              </Link>
            }
          />
        ) : (
          <ul className="mt-1 divide-y divide-mhl-rule">
            {openable.map((c) => {
              const linked = linkedRecordCount(recordSource, [c.id]);
              return (
                <li key={c.id} className="flex items-center gap-3 py-3.5">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                    <ConditionIcon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-mhl-body font-semibold text-mhl-ink">{c.name}</p>
                      <Tag tone={conditionTone(c.status)}>{CONDITION_STATUS_LABELS[c.status]}</Tag>
                    </div>
                    <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                      {[
                        c.severity ? SEVERITY_LABELS[c.severity] : null,
                        c.onsetDate ? `Since ${yearOf(c.onsetDate)}` : null,
                        linked > 0
                          ? `${linked} ${linked === 1 ? "record" : "records"} linked`
                          : "Nothing linked yet",
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openConditionProfile(c)}
                      className={buttonStyles("secondary", "md")}
                    >
                      Open profile
                    </button>
                  ) : contexts.some((ctx) => ctx.conditionId === c.id) ? (
                    <Link
                      to={`/app/contexts/${contexts.find((ctx) => ctx.conditionId === c.id)?.id}`}
                      className={buttonStyles("secondary", "md")}
                    >
                      Open profile
                    </Link>
                  ) : undefined}
                </li>
              );
            })}

            {!hasPregnancy && canEdit && (
              <li className="flex items-center gap-3 py-3.5">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted">
                  <SproutIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-mhl-body font-semibold text-mhl-ink">Pregnancy</p>
                    <Tag tone="info">Life stage</Tag>
                  </div>
                  <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                    Your dates, plus the medicines, bloods and visits that matter while you're
                    pregnant. Add the dates once you open it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openPregnancyProfile}
                  className={buttonStyles("secondary", "md")}
                >
                  <PlusIcon size={17} strokeWidth={2.25} />
                  Set up
                </button>
              </li>
            )}
          </ul>
        )}
      </Section>
      {contexts.length > 0 && (
        <Section
          question="Profiles on this record"
          lead="Open one, or remove it. Removing a profile never removes a record."
        >
          <Card className="mt-3" as="div">
            <ul className="divide-y divide-mhl-rule">
              {contexts.map((ctx) => {
                const anchor = conditions.find((c) => c.id === ctx.conditionId);
                const isActive = active?.id === ctx.id;
                const linked = linkedRecordCount(recordSource, contextConditionIds(ctx));
                return (
                  <li key={ctx.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                    <span
                      className={
                        isActive
                          ? "grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-accent text-white"
                          : "grid h-10 w-10 flex-none place-items-center rounded-full bg-mhl-sunk text-mhl-muted"
                      }
                    >
                      {isPregnancy(ctx) ? <SproutIcon size={20} /> : <ConditionIcon size={20} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-mhl-body font-semibold text-mhl-ink">
                          {contextLabel(ctx, conditions)}
                        </p>
                        {isActive && <Tag tone="due">In focus</Tag>}
                        {!isPregnancy(ctx) && anchor && (
                          <Tag tone={conditionTone(anchor.status)}>
                            {CONDITION_STATUS_LABELS[anchor.status]}
                          </Tag>
                        )}
                      </div>
                      <p className="mt-0.5 text-mhl-fine text-mhl-muted">
                        {isPregnancy(ctx)
                          ? pregnancyLine(pregnancyView(ctx)) ||
                            "Add your dates to see gestational age and your due date."
                          : `${linked} ${linked === 1 ? "record" : "records"} linked to it`}
                      </p>
                    </div>
                    <Link to={`/app/contexts/${ctx.id}`} className={buttonStyles("secondary", "md")}>
                      Open
                    </Link>
                    {canEdit && !isActive && (
                      <IconButton
                        label={`Remove the ${contextLabel(ctx, conditions)} profile`}
                        tone="danger"
                        onClick={() => setRemoving(ctx)}
                      >
                        <TrashIcon size={18} />
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      )}

      <Section question="Want the whole record instead?">
        <div className="mt-3 flex items-start gap-3 rounded-mhl-sm bg-mhl-sunk p-3.5">
          <span className="mt-0.5 flex-none text-mhl-muted">
            <CompassIcon size={20} />
          </span>
          <div className="min-w-0 flex-1 text-mhl-fine text-mhl-ink">
            <p className="font-semibold">All health records</p>
            <p className="mt-0.5 text-mhl-muted">
              Every condition, medicine, allergy, measurement, result, visit and document — the
              complete record, available whether a profile is open or not.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Link to="/app/timeline" className={buttonStyles("secondary", "md")}>
                Open the full record
              </Link>
              {active && (
                <button type="button" onClick={deactivate} className={buttonStyles("ghost", "md")}>
                  Close the {activeLabel} profile
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this profile?"
        message={
          removing
            ? `The ${contextLabel(removing, conditions)} profile will be taken off your record. No medicines, results, visits or documents are deleted — they all stay on your health record. You can open the profile again whenever you like.`
            : ""
        }
        confirmLabel="Remove profile"
        danger
        onConfirm={() => {
          if (removing) removeContext(removing.id);
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}


