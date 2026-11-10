/**
 * Medical summary: the signed-in record as a clinician reads it first.
 *
 * The layout and the rule engine live in HealthSummary, so the public emergency
 * link renders the same page, section for section and flag for flag.
 */
import { useEffect, useState } from "react";
import { HealthSummary, type SummaryReading } from "@/components/summary/HealthSummary";
import { groupVitals } from "@/lib/conditionGuide";
import { abnormalLabFindings } from "@/lib/labFindings";
import { useRecords } from "@/store/RecordsContext";
import { useFocusFacets } from "@/store/careFocusStore";
import { fetchMedicineFlags } from "@/services/records";
import type { MedicineFlag } from "@/services/emergency";

export default function MedicalSummary() {
  const { profile, allergies, medications, conditions, appointments, vitals, documents, contexts } =
    useRecords();
  // The care focus leads the conditions here too, exactly as on the emergency link.
  const facets = useFocusFacets();
  const focusOrder = facets.conditionIds
    .map((id) => conditions.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  // Medicine findings come from the backend check (official drug sources). Refetch
  // when the medicine list changes, since each change is re-checked.
  const [medicineFlags, setMedicineFlags] = useState<MedicineFlag[]>([]);
  const medKey = medications.map((m) => `${m.id}:${m.active}`).join(",");
  useEffect(() => {
    let alive = true;
    fetchMedicineFlags()
      .then((f) => {
        if (alive) setMedicineFlags(f);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [medKey]);

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
        focusOrder,
        medicineFlags,
      }}
    />
  );
}
