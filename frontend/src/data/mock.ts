/**
 * Demo data — a single coherent record so every screen renders with real-feeling
 * content while the Django/DRF backend doesn't exist yet. Persona and locale match
 * the design canon (Amina Yusuf, Kano) and the data-model's Nigerian grounding
 * (genotype, teaching-hospital appointments). "Today" is 2026-09-10.
 *
 * When the API lands, these become the shapes the endpoints return; swap the
 * imports in the pages for real fetches and delete this file.
 */

import type {
  Allergy,
  Appointment,
  Condition,
  HealthDocument,
  HealthProfile,
  Immunization,
  Medication,
  Procedure,
  VitalReading,
} from "@/types/health";
import type { CareProvider, CareProxy, Connection, EmergencySettings } from "@/types/sharing";

export const demoProfile: HealthProfile = {
  id: "p_amina",
  fullName: "Amina Yusuf",
  dateOfBirth: "1992-03-18", // 34
  sex: "FEMALE",
  bloodType: "O+",
  genotype: "AS",
  heightCm: 165,
  weightKg: 72,
  phone: "0803 000 1122",
  city: "Kano",
  emergencyContacts: [
    {
      id: "ec_1",
      name: "Ibrahim Yusuf",
      relationship: "Husband",
      phone: "0803 555 7788",
      priority: 1,
    },
    {
      id: "ec_2",
      name: "Hauwa Bello",
      relationship: "Sister",
      phone: "0806 221 3390",
      priority: 2,
    },
  ],
};

export const demoAllergies: Allergy[] = [
  {
    id: "al_1",
    substance: "Penicillin",
    allergyType: "DRUG",
    severity: "ANAPHYLAXIS",
    reactions: ["Anaphylaxis", "Throat swelling"],
    triggers: ["Amoxicillin", "Ampicillin"],
    firstReactionDate: "2019-06-01",
    isVerified: true,
    notes: "Confirmed after hospital admission in 2019. Carries no adrenaline pen currently.",
    source: "CLINICIAN",
  },
  {
    id: "al_2",
    substance: "Sulfa drugs",
    allergyType: "DRUG",
    severity: "MODERATE",
    reactions: ["Skin rash"],
    firstReactionDate: "2021-02-01",
    isVerified: false,
    notes: "Moderate rash, no breathing difficulty.",
    source: "SELF_REPORTED",
  },
];

export const demoMedications: Medication[] = [
  {
    id: "md_1",
    name: "Metformin",
    dosage: "500 mg",
    form: "Tablet",
    route: "Oral",
    frequency: "Twice daily",
    startDate: "2024-05-10",
    prescriber: "Dr. F. Abdullahi",
    reason: "Type 2 diabetes",
    active: true,
    source: "CLINICIAN",
  },
  {
    id: "md_2",
    name: "Amlodipine",
    dosage: "5 mg",
    form: "Tablet",
    route: "Oral",
    frequency: "Once daily, morning",
    startDate: "2025-01-20",
    prescriber: "Dr. F. Abdullahi",
    reason: "High blood pressure",
    active: true,
    source: "CLINICIAN",
  },
  {
    id: "md_3",
    name: "Salbutamol inhaler",
    dosage: "100 mcg",
    form: "Inhaler",
    route: "Inhaled",
    frequency: "As needed",
    startDate: "2016-08-01",
    endDate: "2018-03-01",
    reason: "Asthma",
    active: false,
    notes: "No longer in use — asthma settled.",
    source: "SELF_REPORTED",
  },
];

export const demoConditions: Condition[] = [
  {
    id: "cn_1",
    name: "Type 2 diabetes",
    status: "ACTIVE",
    severity: "MODERATE",
    onsetDate: "2024-04-01",
    source: "CLINICIAN",
  },
  {
    id: "cn_2",
    name: "High blood pressure",
    status: "ACTIVE",
    severity: "MILD",
    onsetDate: "2025-01-01",
    source: "CLINICIAN",
  },
  {
    id: "cn_3",
    name: "Asthma",
    status: "IN_REMISSION",
    onsetDate: "2003-01-01",
    notes: "No attack since 2016.",
    source: "SELF_REPORTED",
  },
];

export const demoAppointments: Appointment[] = [
  {
    id: "ap_1",
    title: "Endocrinology follow-up",
    clinician: "Dr. F. Abdullahi",
    facility: "Murtala Muhammad Specialist Hospital",
    scheduledFor: "2026-10-03T11:30:00",
    status: "SCHEDULED",
    reason: "Review diabetes control",
  },
  {
    id: "ap_2",
    title: "Blood pressure check",
    facility: "Aminu Kano Teaching Hospital",
    scheduledFor: "2026-10-18T09:00:00",
    status: "SCHEDULED",
  },
  {
    id: "ap_3",
    title: "General check-up",
    clinician: "Dr. S. Okonkwo",
    facility: "Aminu Kano Teaching Hospital",
    scheduledFor: "2026-07-22T10:15:00",
    status: "ATTENDED",
    notes: "Routine. Advised to keep monitoring fasting glucose.",
  },
];

export const demoDocuments: HealthDocument[] = [
  {
    id: "doc_1",
    title: "Full blood count",
    docType: "LAB_RESULT",
    fileName: "fbc-aug-2026.pdf",
    fileSize: 219_136,
    mimeType: "application/pdf",
    documentDate: "2026-08-28",
    uploadedAt: "2026-08-28T14:10:00",
  },
  {
    id: "doc_2",
    title: "Chest X-ray",
    docType: "SCAN",
    fileName: "chest-xray.jpg",
    fileSize: 1_153_433,
    mimeType: "image/jpeg",
    documentDate: "2026-08-02",
    uploadedAt: "2026-08-02T09:40:00",
  },
  {
    id: "doc_3",
    title: "Metformin prescription",
    docType: "PRESCRIPTION",
    fileName: "metformin-rx.pdf",
    fileSize: 88_064,
    mimeType: "application/pdf",
    documentDate: "2026-05-10",
    uploadedAt: "2026-05-10T16:20:00",
  },
];

export const demoImmunizations: Immunization[] = [
  {
    id: "im_1",
    vaccine: "Tetanus (Td)",
    doseNumber: 1,
    administeredOn: "2023-11-04",
    nextDue: "2033-11-04",
  },
  {
    id: "im_2",
    vaccine: "COVID-19 (booster)",
    administeredOn: "2022-09-15",
  },
];

export const demoProcedures: Procedure[] = [
  {
    id: "pr_1",
    name: "Appendectomy",
    performedOn: "2011-06-20",
    facility: "Aminu Kano Teaching Hospital",
    outcome: "Uncomplicated recovery.",
  },
];

// A few weeks of readings that trend the right way — elevated blood pressure and
// blood sugar easing into range as weight comes down — so trends and sparklines are
// alive on first load and the High → In range cue has something to show.
export const demoVitals: VitalReading[] = [
  // Blood pressure — home readings, morning, easing from high into range.
  {
    id: "vt_bp1",
    vitalType: "BLOOD_PRESSURE",
    value: 142,
    value2: 92,
    unit: "mmHg",
    measuredAt: "2026-08-01T07:35:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_bp2",
    vitalType: "BLOOD_PRESSURE",
    value: 138,
    value2: 88,
    unit: "mmHg",
    measuredAt: "2026-08-15T07:50:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_bp3",
    vitalType: "BLOOD_PRESSURE",
    value: 134,
    value2: 86,
    unit: "mmHg",
    measuredAt: "2026-08-29T07:20:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_bp4",
    vitalType: "BLOOD_PRESSURE",
    value: 130,
    value2: 85,
    unit: "mmHg",
    measuredAt: "2026-09-05T07:45:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_bp5",
    vitalType: "BLOOD_PRESSURE",
    value: 128,
    value2: 84,
    unit: "mmHg",
    measuredAt: "2026-09-10T07:40:00",
    context: "Sitting, left arm",
  },
  // Blood sugar — fasting, coming down into range.
  {
    id: "vt_glu1",
    vitalType: "BLOOD_GLUCOSE",
    value: 8.4,
    unit: "mmol/L",
    measuredAt: "2026-08-08T06:40:00",
    context: "Fasting",
  },
  {
    id: "vt_glu2",
    vitalType: "BLOOD_GLUCOSE",
    value: 7.6,
    unit: "mmol/L",
    measuredAt: "2026-08-22T06:50:00",
    context: "Fasting",
  },
  {
    id: "vt_glu3",
    vitalType: "BLOOD_GLUCOSE",
    value: 7.1,
    unit: "mmol/L",
    measuredAt: "2026-09-03T06:45:00",
    context: "Fasting",
  },
  {
    id: "vt_glu4",
    vitalType: "BLOOD_GLUCOSE",
    value: 6.2,
    unit: "mmol/L",
    measuredAt: "2026-09-10T06:55:00",
    context: "Fasting",
  },
  // Weight — a gentle, steady decline.
  {
    id: "vt_wt1",
    vitalType: "WEIGHT",
    value: 75.5,
    unit: "kg",
    measuredAt: "2026-07-15T07:00:00",
  },
  {
    id: "vt_wt2",
    vitalType: "WEIGHT",
    value: 74.2,
    unit: "kg",
    measuredAt: "2026-08-01T07:00:00",
  },
  {
    id: "vt_wt3",
    vitalType: "WEIGHT",
    value: 73.1,
    unit: "kg",
    measuredAt: "2026-08-18T07:00:00",
  },
  {
    id: "vt_wt4",
    vitalType: "WEIGHT",
    value: 72,
    unit: "kg",
    measuredAt: "2026-09-01T07:00:00",
  },
];

/**
 * The opaque token a real backend would mint per emergency card (revocable,
 * optionally PIN-gated). Here it just seeds the QR placeholder deterministically.
 */
export const demoEmergencyToken = "eznk-7Q2M-amina-2f9c";

/* ---------------------------------------------------------- sharing & safety -- */
/* Seeds for the trust features so the sharing pages open with real-feeling state:
   a doctor Amina already shares with, a lab she's just invited, her husband in her
   circle of trust, and one connected app already feeding measurements in. */

export const demoProviders: CareProvider[] = [
  {
    id: "prov_abdullahi",
    name: "Dr. F. Abdullahi",
    role: "Endocrinologist",
    facility: "Murtala Muhammad Specialist Hospital",
    scopes: ["profile", "conditions", "medications", "measurements"],
    access: "CONTRIBUTE",
    shareCode: "MHL-7QK2-9F4P",
    status: "ACTIVE",
    createdAt: "2026-07-22T10:00:00",
    lastAccessedAt: "2026-09-08T14:30:00",
  },
  {
    id: "prov_barewa",
    name: "Barewa Diagnostics",
    role: "Laboratory",
    facility: "Barewa Diagnostics, Kano",
    scopes: ["profile", "documents", "measurements"],
    access: "CONTRIBUTE",
    shareCode: "MHL-3F8T-KP2Q",
    pin: "4821",
    status: "PENDING",
    createdAt: "2026-09-09T09:15:00",
    expiresAt: "2026-09-23T09:15:00",
  },
];

export const demoProxies: CareProxy[] = [
  {
    id: "proxy_ibrahim",
    name: "Ibrahim Yusuf",
    relationship: "Husband",
    phone: "0803 555 7788",
    scopes: ["profile", "allergies", "medications", "conditions", "measurements", "appointments", "documents"],
    canManage: true,
    emergencyAccess: true,
    createdAt: "2026-05-02T08:00:00",
  },
];

export const demoConnections: Connection[] = [
  {
    sourceId: "samsung-health",
    connectedAt: "2026-06-15T18:00:00",
    lastSync: "2026-09-10T06:30:00",
  },
];

export const demoEmergencySettings: EmergencySettings = {
  token: demoEmergencyToken,
  pinEnabled: false,
  showBloodType: true,
  showAllergies: true,
  showMedications: true,
  showConditions: false,
  showContacts: true,
  showNote: false,
  note: "Please contact my husband first. I wear a medical alert bracelet.",
  updatedAt: "2026-09-01T12:00:00",
};
