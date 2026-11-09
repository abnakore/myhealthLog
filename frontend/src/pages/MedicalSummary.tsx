/**
 * Medical summary — the signed-in record as a clinician reads it first.
 *
 * The layout and the rule engine live in HealthSummary, so the public emergency
 * link renders the same page, section for section and flag for flag.
 */
import { HealthSummary, type SummaryReading } from "@/components/summary/HealthSummary";
import { groupVitals } from "@/lib/conditionGuide";
import { abnormalLabFindings } from "@/lib/labFindings";
import { useRecords } from "@/store/RecordsContext";

export default function MedicalSummary() {
  const { profile, allergies, medications, conditions, appointments, vitals, documents, contexts } =
    useRecords();

  const readings: SummaryReading[] = groupVitals(vitals).map((group) => ({
    latest: group.latest,
    values: group.values,
    full: group.latest,
  }));

  const upcoming = [...appointments]
    .filter((a) => a.status === "SCHEDULED")
    .sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor))
    .slice(0, 4);

  const pregnant = contexts.some(
    (c) => c.kind === "LIFE_STAGE" && c.key === "pregnancy" && (c.pregnancy?.status ?? "ONGOING") === "ONGOING",
  );

  return (
    <HealthSummary
      data={{
        profile,
        allergies,
        conditions,
        medications,
        readings,
        appointments: upcoming,
        labFindings: abnormalLabFindings([
          ...documents,
          ...medications,
          ...conditions,
          ...allergies,
          ...vitals,
          ...appointments,
        ]),
        pregnant,
      }}
    />
  );
}
