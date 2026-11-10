/**
 * Pregnancy: the person's own pregnancy, to read and to manage.
 *
 * Everything the pregnancy form holds (where it stands, the dates, the
 * obstetric history, complications, how it ended, notes) is shown here and
 * edited here. Around it sit the records an antenatal visit leans on, read
 * from the same record rather than copied: the next visits, the readings a
 * midwife checks, and the scans and documents on file.
 *
 * This is the pregnancy mode's page in the rail, deliberately separate from
 * the condition-aware profiles list.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useContexts } from "@/store/ContextsContext";
import { useRecords } from "@/store/RecordsContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useAppMode } from "@/store/AppModeContext";
import { useCareFocus } from "@/store/careFocusStore";
import { pregnancyView } from "@/lib/healthContexts";
import { groupVitals, type VitalGroup } from "@/lib/conditionGuide";
import { primaryMode } from "@/lib/careFocus";
import { formatDate, formatTime } from "@/lib/format";
import { emptyPregnancyContext, PREGNANCY_STATUS_LABELS } from "@/types/context";
import { formatVitalValue, vitalName } from "@/types/health";
import { apiErrorMessage } from "@/services/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Tag } from "@/components/ui/Tag";
import { PregnancyModal } from "@/components/context/PregnancyModal";
import { PregnancyTimeline } from "@/components/modes/PregnancyHero";
import {
  CalendarIcon,
  ChevronRightIcon,
  DocumentIcon,
  EditIcon,
  PlusIcon,
  PregnantIcon,
  VitalsIcon,
} from "@/components/icons";

/** A stable empty shell, so the form only re-seeds when it opens. */
const EMPTY_PREGNANCY = emptyPregnancyContext();

/** The readings an antenatal visit checks every time. */
function isAntenatalReading(g: VitalGroup): boolean {
  const t = g.latest.vitalType;
  if (t === "BLOOD_PRESSURE" || t === "WEIGHT" || t === "BLOOD_GLUCOSE") return true;
  return t === "CUSTOM" && /h(a)?emoglobin|\bhb\b|haematocrit|hematocrit/i.test(g.latest.label ?? "");
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-mhl-fine text-mhl-muted">{label}</dt>
      <dd className="mt-0.5 text-mhl-body font-semibold text-mhl-ink [font-variant-numeric:tabular-nums]">{value}</dd>
      {hint && <dd className="text-[0.78rem] text-mhl-faint">{hint}</dd>}
    </div>
  );
}

export default function Pregnancy() {
  const { pregnancy, openPregnancy, updatePregnancy, removeContext } = useContexts();
  const { appointments, vitals, documents } = useRecords();
  const { canEdit, isProxyView, activeOwnerName } = useCareProxy();
  const { setMode, setCriticalConditionId } = useAppMode();
  const { refs, save } = useCareFocus();
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const view = pregnancy ? pregnancyView(pregnancy) : null;
  const p = pregnancy?.pregnancy;
  const ongoing = (p?.status ?? "ONGOING") === "ONGOING";
  const pct =
    view?.age && ongoing ? Math.min(100, Math.round(((view.age.weeks * 7 + view.age.rem) / 280) * 100)) : null;

  const visits = useMemo(
    () =>
      appointments
        .filter((a) => a.status === "SCHEDULED" && +new Date(a.scheduledFor) >= now)
        .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor))
        .slice(0, 4),
    [appointments, now],
  );
  const readings = useMemo(() => groupVitals(vitals).filter(isAntenatalReading), [vitals]);
  const scans = documents.filter((d) => d.docType === "SCAN").length;

  const whose = isProxyView ? `${activeOwnerName}'s` : "your";
  const num = (n?: number) => (n != null ? String(n) : "Not recorded");

  async function saveDetails(patch: Parameters<typeof updatePregnancy>[1]) {
    const id = pregnancy ? pregnancy.id : await openPregnancy();
    await updatePregnancy(id, patch);
    setEditOpen(false);
  }

  // Removing the pregnancy also takes it out of the care focus, or the
  // pregnancy layout would open a fresh, empty one straight away.
  async function remove() {
    if (!pregnancy) return;
    setRemoving(true);
    setError(null);
    try {
      const rest = refs.filter((r) => r.kind !== "pregnancy");
      const ranked = await save(rest);
      const firstCondition = ranked.find((r) => r.kind === "condition");
      if (firstCondition) setCriticalConditionId(firstCondition.id);
      setMode(primaryMode(ranked));
      await removeContext(pregnancy.id);
      setRemoveOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isProxyView ? `${activeOwnerName}'s pregnancy` : "Your pregnancy"}
        subtitle="The dates, the history and what each antenatal visit needs, in one place."
        action={
          pregnancy && canEdit ? (
            <Button icon={<EditIcon size={18} />} onClick={() => setEditOpen(true)}>
              Edit details
            </Button>
          ) : undefined
        }
      />

      {!pregnancy ? (
        <EmptyState
          icon={<PregnantIcon size={28} />}
          title="No pregnancy on file"
          description={`Add ${whose} dates and the app works out how far along, the trimester and the due date.`}
          action={
            canEdit ? (
              <Button icon={<PlusIcon size={18} strokeWidth={2.25} />} onClick={() => setEditOpen(true)}>
                Add pregnancy details
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {/* Where it stands. */}
          <section
            aria-label="Where the pregnancy stands"
            className="rounded-mhl border border-mhl-rule bg-gradient-to-br from-mhl-accent-lo/80 via-mhl-surface to-mhl-surface p-5 shadow-mhl sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={ongoing ? "watch" : "neutral"}>{PREGNANCY_STATUS_LABELS[p?.status ?? "ONGOING"]}</Tag>
              {view?.trimesterLabel && <Tag tone="info">{view.trimesterLabel}</Tag>}
            </div>
            <h2 className="mt-3 text-mhl-figure font-bold tracking-[-0.03em] text-mhl-ink">
              {ongoing ? (view?.ageLabel ?? "Dates not added yet") : view?.statusLabel}
            </h2>
            <p className="mt-1.5 text-mhl-body text-mhl-muted">
              {view?.dueDateLabel
                ? `${ongoing ? "Estimated due date" : "Was due"}: ${view.dueDateLabel}`
                : "Add the first day of the last period or a due date to see how far along."}
            </p>
            {pct != null && (
              <div className="mt-4 max-w-[34rem]">
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-mhl-sunk"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Pregnancy progress"
                >
                  <div className="h-full rounded-full bg-mhl-accent" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-mhl-fine text-mhl-muted">{pct}% of a 40-week term</p>
              </div>
            )}
          </section>

          {ongoing && view?.age && <PregnancyTimeline weeks={view.age.weeks} />}

          <Section icon={<CalendarIcon size={18} />} question="The dates">
            <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Fact label="First day of last period" value={view?.lastMenstrualPeriodLabel ?? "Not recorded"} />
              <Fact
                label="Due date"
                value={view?.dueDateLabel ?? "Not recorded"}
                hint={
                  p?.estimatedDueDate
                    ? "Given by your clinician"
                    : view?.dueDateLabel
                      ? "Worked out as 280 days from the last period"
                      : undefined
                }
              />
            </dl>
          </Section>

          <Section icon={<PregnantIcon size={18} />} question="Pregnancy history">
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Pregnancy number" value={num(p?.gravida)} />
              <Fact label="Previous births" value={num(p?.para)} />
              <Fact label="Miscarriages" value={num(p?.miscarriages)} />
              <Fact label="Stillbirths" value={num(p?.stillbirths)} />
            </dl>
            <div className="mt-4 border-t border-mhl-rule pt-3.5">
              <p className="text-mhl-fine text-mhl-muted">Complications</p>
              {view && view.complications.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {view.complications.map((c) => (
                    <li key={c}>
                      <Tag tone="watch">{c}</Tag>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 text-mhl-body font-semibold text-mhl-ink">None recorded</p>
              )}
            </div>
            {(view?.delivery || view?.notes) && (
              <div className="mt-4 space-y-2 border-t border-mhl-rule pt-3.5">
                {view?.delivery && (
                  <p className="text-mhl-body text-mhl-ink">
                    <span className="font-semibold">How it ended:</span> {view.delivery}
                  </p>
                )}
                {view?.notes && (
                  <p className="text-mhl-body text-mhl-ink">
                    <span className="font-semibold">Notes:</span> {view.notes}
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section
            icon={<CalendarIcon size={18} />}
            question="Antenatal visits"
            lead="The next visits on the record."
            action={
              <Link to="/app/appointments" className={buttonStyles("secondary", "md")}>
                {canEdit ? "Book or manage" : "All visits"}
              </Link>
            }
          >
            {visits.length > 0 ? (
              <ul className="mt-3 divide-y divide-mhl-rule">
                {visits.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={`/app/records/appointments/${a.id}`}
                      className="mhl-interactive -mx-2 flex items-center gap-3 rounded-mhl-sm px-2 py-3 hover:bg-mhl-sunk"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-mhl-body font-semibold text-mhl-ink">{a.title}</span>
                        <span className="block truncate text-mhl-fine text-mhl-muted">
                          {formatDate(a.scheduledFor)} · {formatTime(a.scheduledFor)}
                          {a.facility ? ` · ${a.facility}` : ""}
                        </span>
                      </span>
                      <ChevronRightIcon size={17} className="flex-none text-mhl-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-mhl-fine text-mhl-muted">No visits booked yet.</p>
            )}
          </Section>

          <Section
            icon={<VitalsIcon size={18} />}
            question="Readings each visit checks"
            lead="Weight, blood pressure, blood sugar and haemoglobin, latest first."
            action={
              <Link to="/app/measurements" className={buttonStyles("secondary", "md")}>
                {canEdit ? "Add a reading" : "All readings"}
              </Link>
            }
          >
            {readings.length > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {readings.map((g) => (
                  <Fact
                    key={g.latest.id}
                    label={vitalName(g.latest)}
                    value={formatVitalValue(g.latest)}
                    hint={`Last: ${formatDate(g.latest.measuredAt)}`}
                  />
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-mhl-fine text-mhl-muted">No readings yet.</p>
            )}
          </Section>

          <Section
            icon={<DocumentIcon size={18} />}
            question="Scans and documents"
            action={
              <Link to="/app/documents" className={buttonStyles("secondary", "md")}>
                Open documents
              </Link>
            }
          >
            <p className="mt-2 text-mhl-body text-mhl-ink">
              {documents.length} {documents.length === 1 ? "document" : "documents"} on file, {scans}{" "}
              {scans === 1 ? "scan" : "scans"}.
            </p>
          </Section>

          {canEdit && (
            <Section question="Manage this pregnancy">
              <div className="mt-3 flex flex-wrap gap-2.5">
                <Button variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit dates and history
                </Button>
                {ongoing && (
                  <Button variant="secondary" onClick={() => setEditOpen(true)}>
                    Record how it ended
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setRemoveOpen(true)}>
                  Remove pregnancy record
                </Button>
              </div>
              {ongoing && (
                <p className="mt-2 text-mhl-fine text-mhl-faint">
                  To record how it ended, set "Where it stands" to Delivered or Ended in the form.
                </p>
              )}
            </Section>
          )}
        </div>
      )}

      {editOpen && (
        <PregnancyModal
          open
          current={p ?? EMPTY_PREGNANCY}
          onSave={saveDetails}
          onClose={() => setEditOpen(false)}
        />
      )}

      <Modal
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title="Remove this pregnancy record?"
        description="The dates and history above are deleted, and pregnancy leaves the care focus. Appointments, readings and documents stay on the record."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveOpen(false)}>
              Keep it
            </Button>
            <Button disabled={removing} onClick={() => void remove()}>
              {removing ? "Removing..." : "Remove"}
            </Button>
          </>
        }
      >
        {error && <p className="text-mhl-fine font-semibold text-mhl-danger">{error}</p>}
      </Modal>
    </div>
  );
}
