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

export const demoVitals: VitalReading[] = [
  {
    id: "vt_bp",
    vitalType: "BLOOD_PRESSURE",
    value: 128,
    value2: 84,
    unit: "mmHg",
    measuredAt: "2026-09-10T07:40:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_glu",
    vitalType: "BLOOD_GLUCOSE",
    value: 6.2,
    unit: "mmol/L",
    measuredAt: "2026-09-10T06:55:00",
    context: "Fasting",
  },
  {
    id: "vt_wt",
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
