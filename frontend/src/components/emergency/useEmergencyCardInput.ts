import { useMemo } from "react";
import { useRecords } from "@/store/RecordsContext";
import { useAppMode } from "@/store/AppModeContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useSharing } from "@/store/SharingContext";
import { useContexts } from "@/store/ContextsContext";
import { useFocusFacets } from "@/store/careFocusStore";
import { pregnancyView } from "@/lib/healthContexts";
import { emergencyUrl, tokenSuffix } from "@/lib/emergency";
import { formatDate } from "@/lib/format";
import { isCriticalAllergy, SEX_LABELS } from "@/types/health";
import type { EmergencyCardInput } from "@/lib/emergencyCard";

/**
 * The emergency card as data. The dashboard card, the preview on the Emergency
 * access page and the saved/printed file are all drawn from this one object, so
 * what the person sees on screen is exactly what they export.
 */
export function useEmergencyCardInput(): EmergencyCardInput {
  const { profile, allergies, medications, conditions } = useRecords();
  const { activeOwnerName } = useCareProxy();
  const { emergency } = useSharing();
  const { mode } = useAppMode();
  const { pregnancy } = useContexts();
  const facets = useFocusFacets();
  const focusOrder = facets.conditionIds;

  return useMemo(() => {
    // The care focus decides the order a responder reads the conditions in:
    // the focused ones first, in rank order, then the rest as recorded.
    const active = conditions.filter((c) => c.status === "ACTIVE");
    const rank = (id: string) => {
      const i = focusOrder.indexOf(id);
      return i === -1 ? focusOrder.length : i;
    };
    const ordered = [...active].sort((a, b) => rank(a.id) - rank(b.id));
    const view = pregnancy ? pregnancyView(pregnancy) : null;
    const pregnancyLineText =
      view && (pregnancy?.pregnancy?.status ?? "ONGOING") === "ONGOING"
        ? ["Pregnant", view.age ? `${view.age.weeks} weeks` : null, view.dueDateLabel ? `due ${view.dueDateLabel}` : null]
            .filter(Boolean)
            .join(", ")
        : undefined;
    const primaryContact = [...profile.emergencyContacts].sort((a, b) => a.priority - b.priority)[0];
    return {
      name: activeOwnerName || profile.fullName,
      // A responder needs the date of birth, not an age that is wrong the day
      // after it was printed.
      meta: [
        profile.sex ? SEX_LABELS[profile.sex] : null,
        profile.dateOfBirth ? `born ${formatDate(profile.dateOfBirth)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      bloodType: profile.bloodType,
      genotype: profile.genotype,
      allergies: allergies.filter((a) => isCriticalAllergy(a.severity)).map((a) => a.substance),
      medications: medications.filter((m) => m.active).map((m) => m.name),
      conditions: ordered.map((c) => c.name),
      pregnancy: pregnancyLineText,
      contact: primaryContact
        ? [primaryContact.name, primaryContact.phone].filter(Boolean).join(" · ")
        : undefined,
      note: emergency.note.trim(),
      url: emergencyUrl(emergency.token),
      pin: emergency.pinEnabled ? emergency.pin : undefined,
      tokenLabel: tokenSuffix(emergency.token),
      mode,
      show: {
        bloodType: emergency.showBloodType,
        allergies: emergency.showAllergies,
        medications: emergency.showMedications,
        conditions: emergency.showConditions,
        contacts: emergency.showContacts,
        note: emergency.showNote,
      },
    };
  }, [profile, allergies, medications, conditions, activeOwnerName, emergency, mode, pregnancy, focusOrder]);
}
