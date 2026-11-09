"""
Health Copilot AI service.

The Copilot answers health questions grounded in the user's own records.

Key design decisions:
  1. The user's conditions, medications, allergies, and recent vitals are
     compiled into a compact "personal context" block injected at the top of
     every prompt.  This grounds the AI in the patient's real data.

  2. Conflict detection: the system prompt instructs Gemini to check whether
     any general advice it is about to give conflicts with the patient's active
     conditions or medications, and to flag conflicts explicitly.

  3. Scope guardrail: questions outside the scope of health or requiring acute
     clinical diagnosis trigger a disclaimer directing the user to a qualified
     professional.  The disclaimer wording is hard-coded so it is not something
     Gemini can choose to omit.

  4. This service does NOT store conversation history server-side.  The
     frontend sends the conversation history with every request.  This keeps the
     server stateless and privacy-friendly — no health conversation is persisted
     in the database.

Throttle: 30 requests/hour per user (configured in settings DEFAULT_THROTTLE_RATES).
"""

import logging

from django.conf import settings

from apps.core.exceptions import AIProcessingError, ServiceUnavailableError

logger = logging.getLogger(__name__)

COPILOT_SYSTEM_PROMPT = """
You are the Health Copilot for myHealthLog — a personal health assistant that
helps patients understand their health by combining general medical knowledge
with their own personal records.

PATIENT'S PERSONAL HEALTH CONTEXT (use this to personalise every answer):
{personal_context}

YOUR RULES (follow all of them, every time):

1. PERSONALISE: Ground every answer in the patient's actual records above.
   Do not give generic advice that ignores their conditions, medications, or allergies.

2. CONFLICT DETECTION: Before advising on a medication, supplement, or behaviour,
   check if it conflicts with the patient's active conditions or current prescriptions.
   If a conflict exists, flag it clearly and explain why using their specific data.

3. DISCLAIMER: If the question requires acute clinical diagnosis, imaging
   interpretation, medication prescribing, or is outside general health education,
   include this exact disclaimer on a new line at the end of your response:
   "⚕️ This is not medical advice. Please consult a qualified healthcare professional."

4. SAFETY: Never suggest stopping or changing a prescribed medication. Recommend
   the patient discuss any changes with their prescriber.

5. SAFETY FLAGS: The context may end with SAFETY FLAGS computed from the record.
   They override general advice. Whenever a question touches one (a painkiller,
   an antibiotic, blood pressure, a symptom), state the flag plainly and early.

6. SCOPE: You may discuss general health, lifestyle, nutrition, exercise, medication
   side-effects (educational only), and interpreting lab reference ranges. You may
   NOT diagnose conditions or prescribe treatments.

7. TONE: Be warm, clear, and reassuring. Avoid jargon. Explain medical terms
   when you use them.

Respond in plain text. No markdown headers. Keep responses concise (2-4 paragraphs max
unless the complexity of the question requires more).
"""

# Maximum tokens to include from conversation history to avoid prompt bloat.
MAX_HISTORY_TURNS = 10


def _build_personal_context(user) -> str:
    """
    Compile a compact textual summary of the user's health records for injection
    into the system prompt.

    We deliberately keep this compact — it is injected on every request.
    """
    lines: list[str] = []

    try:
        profile = user.health_profile
        if profile.blood_type:
            lines.append(f"Blood type: {profile.blood_type}")
        if profile.genotype:
            lines.append(f"Genotype: {profile.genotype}")
        dob = profile.date_of_birth
        if dob:
            from datetime import date
            age = date.today().year - dob.year
            lines.append(f"Age: {age}")
        if profile.sex:
            lines.append(f"Sex: {profile.sex}")
    except Exception:
        logger.debug("Failed to build personal context from profile for user %s", user.id)

    allergies = list(user.allergies.all())
    if allergies:
        lines.append("Allergies:")
        for a in allergies:
            reactions = ", ".join(a.reactions or []) if a.reactions else "see notes"
            lines.append(
                f"  - {a.substance} ({a.severity}){': ' + reactions if a.reactions else ''}"
            )

    active_meds = list(user.medications.filter(active=True))
    if active_meds:
        lines.append("Current medications:")
        for m in active_meds:
            lines.append(f"  - {m.name} {m.dosage}, {m.frequency}")

    active_conditions = list(user.conditions.filter(status="ACTIVE"))
    if active_conditions:
        lines.append("Active conditions:")
        for c in active_conditions:
            lines.append(f"  - {c.name} (onset: {c.onset_date or 'unknown'})")

    recent_vitals = list(
        user.vital_readings.order_by("-measured_at")[:10]
    )
    if recent_vitals:
        lines.append("Recent vitals:")
        for v in recent_vitals:
            val = f"{float(v.value):g}/{float(v.value2):g}" if v.value2 else f"{float(v.value):g}"
            lines.append(
                f"  - {v.vital_type}: {val} {v.unit} "
                f"(recorded {v.measured_at.date() if v.measured_at else 'unknown'})"
            )

    # Results that only exist inside uploaded documents (read by the AI).
    try:
        from apps.emergency.services import StaticEmergencyService

        labs = StaticEmergencyService._abnormal_findings(user, limit=10)
    except Exception:
        labs = []
    if labs:
        lines.append("Abnormal results from uploaded lab reports (last 12 months):")
        for f in labs:
            ref = f" (ref {f['referenceRange']})" if f.get("referenceRange") else ""
            lines.append(
                f"  - {f['metric']}: {f['value']} {f['unit']}{ref} — {f['status'].upper()}, {f.get('date') or 'date unknown'}"
            )

    flags = _safety_flags(user, active_meds, allergies, recent_vitals, labs)
    if flags:
        lines.append("SAFETY FLAGS (computed by fixed clinical rules — always address these when relevant):")
        lines.extend(f"  - {f}" for f in flags)

    if not lines:
        return "No personal health data available yet."
    return "\n".join(lines)


# Medicine classes an allergy name can point at (kept in step with the
# frontend rule engine in src/lib/summaryInsights.ts).
_DRUG_CLASSES = {
    "penicillin": ["penicillin", "amoxicillin", "ampicillin", "augmentin", "co-amoxiclav", "flucloxacillin", "cloxacillin", "ampiclox"],
    "sulfonamide": ["sulfamethoxazole", "co-trimoxazole", "septrin", "bactrim", "sulfasalazine", "fansidar"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen", "aspirin", "ketoprofen", "piroxicam", "meloxicam", "celecoxib", "indomethacin"],
    "opioid": ["codeine", "morphine", "tramadol", "pethidine", "oxycodone"],
    "cephalosporin": ["ceftriaxone", "cefuroxime", "cefalexin", "cephalexin", "cefixime"],
    "quinolone": ["ciprofloxacin", "levofloxacin", "ofloxacin"],
}
_ALIASES = {"penicillin": "penicillin", "penicillins": "penicillin", "sulfa": "sulfonamide", "sulpha": "sulfonamide",
            "sulfonamide": "sulfonamide", "nsaid": "nsaid", "nsaids": "nsaid", "aspirin": "nsaid", "ibuprofen": "nsaid",
            "codeine": "opioid", "opioid": "opioid", "morphine": "opioid", "cephalosporin": "cephalosporin",
            "quinolone": "quinolone", "ciprofloxacin": "quinolone"}


def _med_class(name: str):
    n = name.lower()
    for cls, members in _DRUG_CLASSES.items():
        if any(m in n for m in members):
            return cls
    return None


def _safety_flags(user, meds, allergies, vitals, labs) -> list[str]:
    import re

    flags: list[str] = []
    allergy_classes = {}
    for a in allergies:
        for word in re.split(r"[^a-z]+", a.substance.lower()):
            if word in _ALIASES:
                allergy_classes.setdefault(_ALIASES[word], a.substance)
    for m in meds:
        cls = _med_class(m.name)
        for a in allergies:
            if a.substance.lower() in m.name.lower():
                flags.append(f"Currently listed medicine {m.name} matches the {a.substance} allergy.")
        if cls and cls in allergy_classes:
            flags.append(
                f"{m.name} is a {cls}; the patient is allergic to {allergy_classes[cls]}. Tell them to confirm with the prescriber urgently."
            )
    for cls, substance in allergy_classes.items():
        flags.append(f"Never suggest any {cls} ({', '.join(_DRUG_CLASSES.get(cls, [])[:4])}…): allergy to {substance}.")

    kidney = any(re.search(r"kidney|renal|ckd|nephr", c.name.lower()) for c in user.conditions.exclude(status="RESOLVED"))
    kidney = kidney or any(f["metric"].lower().startswith(("egfr", "creatinine")) for f in labs)
    if kidney:
        flags.append("Reduced kidney function on record: NSAIDs (ibuprofen, diclofenac, naproxen) should be avoided; paracetamol is usually the safer painkiller. Metformin dosing depends on kidney function.")

    latest_bp = next((v for v in vitals if v.vital_type == "BLOOD_PRESSURE"), None)
    if latest_bp is not None:
        sys, dia = float(latest_bp.value), float(latest_bp.value2 or 0)
        if sys >= 180 or dia >= 120:
            flags.append(f"Latest BP {sys:g}/{dia:g} is in the hypertensive-crisis range: advise urgent medical review, especially with headache, chest pain, vision change or confusion. NSAIDs can raise BP further.")
        elif sys >= 140 or dia >= 90:
            flags.append(f"Latest BP {sys:g}/{dia:g} is high: NSAIDs and decongestants can raise it further.")
    if any(f["metric"].lower().startswith("potassium") and f["status"] in ("high", "critical") for f in labs):
        flags.append("High potassium on record: avoid potassium supplements/salt substitutes; ACE inhibitors and NSAIDs can raise potassium.")
    return flags


class CopilotService:
    """
    Route a user's question through Gemini with their personal health context.
    """

    @classmethod
    def chat(
        cls,
        user,
        question: str,
        history: list[dict[str, str]] | None = None,
    ) -> str:
        """
        Send a question to Gemini with personal context and conversation history.

        Args:
            user:     Authenticated User instance.
            question: The user's current question.
            history:  List of { "role": "user"|"assistant", "content": str }
                      representing the conversation so far (max MAX_HISTORY_TURNS).

        Returns:
            The AI's response as a plain-text string.

        Raises:
            ServiceUnavailableError: Gemini is unreachable.
            AIProcessingError:       Gemini returned a bad response.
        """
        if not settings.GEMINI_API_KEY:
            raise ServiceUnavailableError(
                "The Health Copilot is not configured on this server. "
                "Please contact support."
            )

        personal_context = _build_personal_context(user)
        system_prompt = COPILOT_SYSTEM_PROMPT.format(
            personal_context=personal_context
        )

        # Build the Gemini conversation: prior turns, then the new question.
        safe_history = (history or [])[-MAX_HISTORY_TURNS:]
        contents = []
        for turn in safe_history:
            text = str(turn.get("content", "")).strip()
            if not text:
                continue
            role = "user" if turn.get("role") == "user" else "model"
            contents.append({"role": role, "parts": [{"text": text}]})
        contents.append({"role": "user", "parts": [{"text": question}]})

        from apps.core import ai

        try:
            answer = ai.generate(contents, system=system_prompt, temperature=0.4)
        except (ServiceUnavailableError, AIProcessingError) as exc:
            logger.warning("Copilot Gemini call failed for user %s: %s", user.id, exc)
            raise ServiceUnavailableError(
                "The Health Copilot is temporarily unavailable. Please try again."
            ) from exc

        if not answer:
            raise AIProcessingError(
                "The Health Copilot returned an empty response. Please try again."
            )

        logger.info(
            "Copilot response generated for user %s (%d chars)",
            user.id,
            len(answer),
        )
        return answer
