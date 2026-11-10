import { useMemo } from "react";
import { useRecords } from "@/store/RecordsContext";
import { useAppMode } from "@/store/AppModeContext";
import { useCareProxy } from "@/store/CareProxyContext";
import { useSharing } from "@/store/SharingContext";
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

  return useMemo(() => {
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
      conditions: conditions.filter((c) => c.status === "ACTIVE").map((c) => c.name),
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
  }, [profile, allergies, medications, conditions, activeOwnerName, emergency, mode]);
}
