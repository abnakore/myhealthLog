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
  RecordBundle,
  VitalReading,
} from "@/types/health";
import type { CareProvider, Connection, EmergencySettings } from "@/types/sharing";
import type { CareProxyGrant } from "@/types/proxy";

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

/* --------------------------------------------------- the rest of the family -- */
/* Phase 2 is meaningless without a second record to open, so two more people are on
   file: Amina's mother (she already has full access) and her father (he has invited
   her, view only — accept it on the Care proxy page and his record opens read-only).
   Same clinical register as the demo record, so every Phase 1 page has real content
   to show in someone else's name. */

export const demoMotherProfile: HealthProfile = {
  id: "p_zainab",
  fullName: "Zainab Yusuf",
  dateOfBirth: "1963-06-05", // 63
  sex: "FEMALE",
  bloodType: "O+",
  genotype: "AA",
  heightCm: 160,
  weightKg: 74,
  phone: "0803 555 4455",
  city: "Kano",
  state: "Kano State",
  emergencyContacts: [
    {
      id: "ec_z1",
      name: "Musa Yusuf",
      relationship: "Husband",
      phone: "0803 555 1122",
      priority: 1,
    },
    {
      id: "ec_z2",
      name: "Amina Yusuf",
      relationship: "Daughter",
      phone: "0803 000 1122",
      priority: 2,
    },
  ],
};

export const demoMotherAllergies: Allergy[] = [
  {
    id: "al_z1",
    substance: "Pollen",
    allergyType: "ENVIRONMENTAL",
    severity: "MILD",
    reactions: ["Sneezing", "Itchy eyes"],
    firstReactionDate: "2014-03-01",
    isVerified: false,
    notes: "Worse in the harmattan. Antihistamine when it flares.",
    source: "SELF_REPORTED",
  },
];

export const demoMotherMedications: Medication[] = [
  {
    id: "md_z1",
    name: "Metformin",
    dosage: "1 g",
    form: "Tablet",
    route: "Oral",
    frequency: "Twice daily, with meals",
    startDate: "2018-09-03",
    prescriber: "Dr. F. Abdullahi",
    reason: "Type 2 diabetes",
    active: true,
    source: "CLINICIAN",
  },
  {
    id: "md_z2",
    name: "Simvastatin",
    dosage: "20 mg",
    form: "Tablet",
    route: "Oral",
    frequency: "Once daily, at night",
    startDate: "2020-02-11",
    prescriber: "Dr. F. Abdullahi",
    reason: "High cholesterol",
    active: true,
    source: "CLINICIAN",
  },
  {
    id: "md_z3",
    name: "Vitamin D3",
    dosage: "1000 IU",
    form: "Capsule",
    route: "Oral",
    frequency: "Once daily",
    startDate: "2022-01-05",
    active: true,
    source: "SELF_REPORTED",
  },
];

export const demoMotherConditions: Condition[] = [
  {
    id: "cn_z1",
    name: "Type 2 diabetes",
    status: "ACTIVE",
    severity: "MODERATE",
    onsetDate: "2018-08-01",
    notes: "Controlled on metformin; HbA1c checked twice a year.",
    source: "CLINICIAN",
  },
  {
    id: "cn_z2",
    name: "High cholesterol",
    status: "ACTIVE",
    severity: "MILD",
    onsetDate: "2020-01-01",
    source: "CLINICIAN",
  },
];

export const demoMotherAppointments: Appointment[] = [
  {
    id: "ap_z1",
    title: "Diabetic eye screening",
    clinician: "Dr. N. Adamu",
    facility: "Aminu Kano Teaching Hospital",
    scheduledFor: "2026-10-08T09:30:00",
    status: "SCHEDULED",
    reason: "Annual retinal check",
  },
  {
    id: "ap_z2",
    title: "Diabetes review",
    clinician: "Dr. F. Abdullahi",
    facility: "Murtala Muhammad Specialist Hospital",
    scheduledFor: "2026-07-02T11:00:00",
    status: "ATTENDED",
    notes: "HbA1c 7.2%. Continue metformin, keep walking daily.",
  },
];

export const demoMotherDocuments: HealthDocument[] = [
  {
    id: "doc_z1",
    title: "HbA1c result",
    docType: "LAB_RESULT",
    fileName: "hba1c-jul-2026.pdf",
    fileSize: 142_336,
    mimeType: "application/pdf",
    documentDate: "2026-07-02",
    uploadedAt: "2026-07-02T12:30:00",
  },
];

export const demoMotherImmunizations: Immunization[] = [
  { id: "im_z1", vaccine: "Influenza (seasonal)", administeredOn: "2025-10-20" },
];

// Deliberately nothing on file — so the empty states are reachable in a proxy's view.
export const demoMotherProcedures: Procedure[] = [];

export const demoMotherVitals: VitalReading[] = [
  {
    id: "vt_z1",
    vitalType: "BLOOD_GLUCOSE",
    value: 8.1,
    unit: "mmol/L",
    measuredAt: "2026-08-14T06:35:00",
    context: "Fasting",
  },
  {
    id: "vt_z2",
    vitalType: "BLOOD_GLUCOSE",
    value: 7.4,
    unit: "mmol/L",
    measuredAt: "2026-09-04T06:45:00",
    context: "Fasting",
  },
  {
    id: "vt_z3",
    vitalType: "WEIGHT",
    value: 75.2,
    unit: "kg",
    measuredAt: "2026-08-14T07:10:00",
  },
  {
    id: "vt_z4",
    vitalType: "WEIGHT",
    value: 74,
    unit: "kg",
    measuredAt: "2026-09-04T07:05:00",
  },
  {
    id: "vt_z5",
    vitalType: "BLOOD_PRESSURE",
    value: 136,
    value2: 84,
    unit: "mmHg",
    measuredAt: "2026-09-04T07:15:00",
    context: "Sitting, left arm",
  },
];

export const demoFatherProfile: HealthProfile = {
  id: "p_musa",
  fullName: "Musa Yusuf",
  dateOfBirth: "1958-01-12", // 68
  sex: "MALE",
  bloodType: "B+",
  genotype: "AA",
  heightCm: 172,
  weightKg: 81,
  phone: "0803 555 1122",
  city: "Kano",
  state: "Kano State",
  emergencyContacts: [
    {
      id: "ec_m1",
      name: "Zainab Yusuf",
      relationship: "Wife",
      phone: "0803 555 4455",
      priority: 1,
    },
    {
      id: "ec_m2",
      name: "Amina Yusuf",
      relationship: "Daughter",
      phone: "0803 000 1122",
      priority: 2,
    },
  ],
};

export const demoFatherAllergies: Allergy[] = [
  {
    id: "al_m1",
    substance: "Aspirin",
    allergyType: "DRUG",
    severity: "MODERATE",
    reactions: ["Stomach bleeding", "Rash"],
    firstReactionDate: "2021-07-15",
    isVerified: true,
    notes: "Admitted overnight in 2021. Paracetamol instead.",
    source: "CLINICIAN",
  },
  {
    id: "al_m2",
    substance: "Dust",
    allergyType: "ENVIRONMENTAL",
    severity: "MILD",
    reactions: ["Cough"],
    source: "SELF_REPORTED",
  },
];

export const demoFatherMedications: Medication[] = [
  {
    id: "md_m1",
    name: "Amlodipine",
    dosage: "10 mg",
    form: "Tablet",
    route: "Oral",
    frequency: "Once daily, morning",
    startDate: "2012-04-18",
    prescriber: "Dr. A. Bello",
    reason: "High blood pressure",
    active: true,
    source: "CLINICIAN",
  },
  {
    id: "md_m2",
    name: "Metformin",
    dosage: "1 g",
    form: "Tablet",
    route: "Oral",
    frequency: "Twice daily, with meals",
    startDate: "2016-06-02",
    prescriber: "Dr. F. Abdullahi",
    reason: "Type 2 diabetes",
    active: true,
    source: "CLINICIAN",
  },
  {
    id: "md_m3",
    name: "Atorvastatin",
    dosage: "20 mg",
    form: "Tablet",
    route: "Oral",
    frequency: "Once daily, at night",
    startDate: "2019-11-25",
    prescriber: "Dr. A. Bello",
    reason: "High cholesterol",
    active: true,
    source: "CLINICIAN",
  },
  {
    id: "md_m4",
    name: "Ibuprofen",
    dosage: "400 mg",
    form: "Tablet",
    route: "Oral",
    frequency: "As needed",
    startDate: "2021-01-10",
    endDate: "2021-07-15",
    reason: "Knee pain",
    active: false,
    notes: "Stopped after the stomach bleed. Do not restart.",
    source: "CLINICIAN",
  },
];

export const demoFatherConditions: Condition[] = [
  {
    id: "cn_m1",
    name: "High blood pressure",
    status: "ACTIVE",
    severity: "MODERATE",
    onsetDate: "2012-03-01",
    source: "CLINICIAN",
  },
  {
    id: "cn_m2",
    name: "Type 2 diabetes",
    status: "ACTIVE",
    severity: "MODERATE",
    onsetDate: "2016-05-01",
    source: "CLINICIAN",
  },
  {
    id: "cn_m3",
    name: "Osteoarthritis of the knee",
    status: "ACTIVE",
    severity: "MILD",
    onsetDate: "2019-09-01",
    notes: "Worse on stairs. The physiotherapy exercises help.",
    source: "CLINICIAN",
  },
];

export const demoFatherAppointments: Appointment[] = [
  {
    id: "ap_m1",
    title: "Cardiology follow-up",
    clinician: "Dr. A. Bello",
    facility: "Aminu Kano Teaching Hospital",
    scheduledFor: "2026-09-29T10:00:00",
    status: "SCHEDULED",
    reason: "Review blood pressure control",
  },
  {
    id: "ap_m2",
    title: "Eye screening",
    facility: "Aminu Kano Teaching Hospital",
    scheduledFor: "2026-11-12T09:15:00",
    status: "SCHEDULED",
  },
  {
    id: "ap_m3",
    title: "Diabetes review",
    clinician: "Dr. F. Abdullahi",
    facility: "Murtala Muhammad Specialist Hospital",
    scheduledFor: "2026-08-14T09:45:00",
    status: "ATTENDED",
    notes: "Fasting sugars 7–8. Continue metformin; review in three months.",
  },
];

export const demoFatherDocuments: HealthDocument[] = [
  {
    id: "doc_m1",
    title: "Kidney function panel",
    docType: "LAB_RESULT",
    fileName: "renal-panel-aug-2026.pdf",
    fileSize: 198_656,
    mimeType: "application/pdf",
    documentDate: "2026-08-20",
    uploadedAt: "2026-08-20T15:05:00",
  },
  {
    id: "doc_m2",
    title: "ECG report",
    docType: "SCAN",
    fileName: "ecg-jun-2026.pdf",
    fileSize: 96_256,
    mimeType: "application/pdf",
    documentDate: "2026-06-30",
    uploadedAt: "2026-06-30T11:20:00",
  },
];

export const demoFatherImmunizations: Immunization[] = [
  { id: "im_m1", vaccine: "Influenza (seasonal)", administeredOn: "2025-11-02" },
  { id: "im_m2", vaccine: "Pneumococcal (PCV)", administeredOn: "2023-05-18" },
];

export const demoFatherProcedures: Procedure[] = [
  {
    id: "pr_m1",
    name: "Cataract surgery (left eye)",
    performedOn: "2022-02-10",
    facility: "Aminu Kano Teaching Hospital",
    outcome: "Vision restored; no complications.",
  },
];

export const demoFatherVitals: VitalReading[] = [
  {
    id: "vt_m_bp1",
    vitalType: "BLOOD_PRESSURE",
    value: 148,
    value2: 94,
    unit: "mmHg",
    measuredAt: "2026-08-06T07:30:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_m_bp2",
    vitalType: "BLOOD_PRESSURE",
    value: 144,
    value2: 90,
    unit: "mmHg",
    measuredAt: "2026-08-20T07:25:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_m_bp3",
    vitalType: "BLOOD_PRESSURE",
    value: 139,
    value2: 88,
    unit: "mmHg",
    measuredAt: "2026-09-03T07:40:00",
    context: "Sitting, left arm",
  },
  {
    id: "vt_m_glu1",
    vitalType: "BLOOD_GLUCOSE",
    value: 8.6,
    unit: "mmol/L",
    measuredAt: "2026-08-14T06:30:00",
    context: "Fasting",
  },
  {
    id: "vt_m_glu2",
    vitalType: "BLOOD_GLUCOSE",
    value: 7.8,
    unit: "mmol/L",
    measuredAt: "2026-09-03T06:35:00",
    context: "Fasting",
  },
  {
    id: "vt_m_wt1",
    vitalType: "WEIGHT",
    value: 82,
    unit: "kg",
    measuredAt: "2026-08-06T07:00:00",
  },
  {
    id: "vt_m_wt2",
    vitalType: "WEIGHT",
    value: 81,
    unit: "kg",
    measuredAt: "2026-09-03T07:00:00",
  },
];

export const demoConnections: Connection[] = [
  {
    sourceId: "samsung-health",
    connectedAt: "2026-06-15T18:00:00",
    lastSync: "2026-09-10T06:30:00",
  },
];

/**
 * Emergency-card settings, one per person.
 *
 * The code is tied to the *person*, not to the app: each record carries its own
 * token, its own toggles and its own note, and the public view compiles whatever it
 * finds behind the token it was given. That is also why a proxy can see the card of
 * the record they're looking at — it is that person's card, with that person's
 * choices — while only the owner can change it.
 */
export const demoEmergencySettingsByOwner: Record<string, EmergencySettings> = {
  p_amina: {
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
  },
  p_zainab: {
    token: "eznk-4j7p-w2mn",
    pinEnabled: false,
    showBloodType: true,
    showAllergies: true,
    showMedications: true,
    showConditions: true,
    showContacts: true,
    showNote: true,
    note: "I am diabetic. My daughter Amina can answer anything about my medicines.",
    updatedAt: "2026-09-12T09:30:00",
  },
  p_musa: {
    token: "eznk-8h3t-q6vd",
    pinEnabled: false,
    showBloodType: true,
    showAllergies: true,
    showMedications: true,
    showConditions: true,
    showContacts: true,
    showNote: true,
    note: "I take a blood thinner — please check before giving me anything for pain.",
    updatedAt: "2026-09-14T17:05:00",
  },
};

/* --------------------------------------------------------------- care proxy -- */
/* The state Phase 2 opens on: Amina's own record (her husband, full access; her
   sister, invited and not yet answered), an invitation waiting in her account from
   her father (view only — accept it and his record opens read-only), and access she
   already holds to her mother's record. Between them they cover every branch the
   access layer has: active view, active write, pending, and unopened. */

/**
 * Every record in the demo, keyed by the account it belongs to. The store keeps
 * these side by side and hands the active one to the pages, which is how a proxy
 * ends up reading someone else's record through the very same screens.
 */
export const demoRecordBundles: Record<string, RecordBundle> = {
  p_amina: {
    profile: demoProfile,
    allergies: demoAllergies,
    medications: demoMedications,
    conditions: demoConditions,
    appointments: demoAppointments,
    documents: demoDocuments,
    immunizations: demoImmunizations,
    procedures: demoProcedures,
    vitals: demoVitals,
  },
  p_zainab: {
    profile: demoMotherProfile,
    allergies: demoMotherAllergies,
    medications: demoMotherMedications,
    conditions: demoMotherConditions,
    appointments: demoMotherAppointments,
    documents: demoMotherDocuments,
    immunizations: demoMotherImmunizations,
    procedures: demoMotherProcedures,
    vitals: demoMotherVitals,
  },
  p_musa: {
    profile: demoFatherProfile,
    allergies: demoFatherAllergies,
    medications: demoFatherMedications,
    conditions: demoFatherConditions,
    appointments: demoFatherAppointments,
    documents: demoFatherDocuments,
    immunizations: demoFatherImmunizations,
    procedures: demoFatherProcedures,
    vitals: demoFatherVitals,
  },
};

export const demoProxyGrants: CareProxyGrant[] = [
  // Her own record: her husband manages it with her; her sister has been invited.
  {
    id: "proxy_ibrahim",
    ownerUserId: "p_amina",
    ownerName: "Amina Yusuf",
    proxyUserId: "p_ibrahim",
    proxyName: "Ibrahim Yusuf",
    proxyEmail: "ibrahim.yusuf@example.com",
    permission: "FULL",
    status: "ACTIVE",
    invitedAt: "2026-04-28T09:00:00",
    acceptedAt: "2026-05-02T08:00:00",
  },
  {
    id: "proxy_hauwa",
    ownerUserId: "p_amina",
    ownerName: "Amina Yusuf",
    proxyUserId: null,
    proxyName: "",
    proxyEmail: "hauwa.bello@example.com",
    permission: "VIEW",
    status: "INVITED",
    message: "For the weeks I'm travelling — so you can check my medicines and appointments.",
    invitedAt: "2026-09-08T19:40:00",
  },
  // Waiting in her account: her father's invitation, view only.
  {
    id: "proxy_musa",
    ownerUserId: "p_musa",
    ownerName: "Musa Yusuf",
    proxyUserId: "p_amina",
    proxyName: "Amina Yusuf",
    proxyEmail: "amina.yusuf@example.com",
    permission: "VIEW",
    status: "INVITED",
    message: "Keep an eye on my medicines and the cardiology appointment for me.",
    invitedAt: "2026-09-18T08:15:00",
  },
  // Already accepted: her mother's record, which she may also add to.
  {
    id: "proxy_zainab",
    ownerUserId: "p_zainab",
    ownerName: "Zainab Yusuf",
    proxyUserId: "p_amina",
    proxyName: "Amina Yusuf",
    proxyEmail: "amina.yusuf@example.com",
    permission: "FULL",
    status: "ACTIVE",
    invitedAt: "2026-03-08T10:00:00",
    acceptedAt: "2026-03-14T18:20:00",
  },
];
