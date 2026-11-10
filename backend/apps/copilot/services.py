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
     professional.  The exact disclaimer wording is given in the system prompt;
     it is an instruction to the model, not text appended by this code.

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

    try:
        from apps.contexts.focus import focus_summary_lines, ranked_focus

        focus = ranked_focus(user)
    except Exception:
        focus = []
    if focus:
        lines.append("CARE FOCUS (ranked by fixed rules, highest priority first; weigh answers in this order):")
        lines.extend(f"  {line}" for line in focus_summary_lines(focus))

    flags = _safety_flags(user, active_meds, allergies, recent_vitals, labs)
    if flags:
        lines.append("SAFETY FLAGS (from official drug sources and guideline thresholds; always address these when relevant):")
        lines.extend(f"  - {f}" for f in flags)

    if not lines:
        return "No personal health data available yet."
    return "\n".join(lines)


def _safety_flags(user, meds, allergies, vitals, labs) -> list[str]:
    """
    What the deterministic checks found, for the AI to respect.

    Medicines: the stored record review of each current medicine, whose checks
    come from official sources (RxNorm, MED-RT, FDA labels; see
    apps.records.review). Readings: the latest of each kind against published
    guideline thresholds (apps.core.clinical_rules.reading_band).
    """
    from apps.core import clinical_rules as rules
    from apps.records.models import RecordReview

    flags: list[str] = []
    reviews = RecordReview.objects.filter(user=user, record_type="medication", record_id__in=[m.pk for m in meds])
    for review in reviews:
        for f in review.findings or []:
            if f.get("level") in ("critical", "warning"):
                flags.append(f"{f['title']}: {f['detail']} (source: {f.get('source') or f.get('rule')})")

    try:
        from apps.contexts.focus import current_pregnancy, pregnancy_weeks

        preg = current_pregnancy(user)
    except Exception:
        preg = None
    diabetic = user.conditions.exclude(status="RESOLVED").filter(name__icontains="diabet").exists()
    seen: set[str] = set()
    for v in vitals:
        if v.vital_type in seen:
            continue
        seen.add(v.vital_type)
        band = rules.reading_band(v.vital_type, float(v.value), float(v.value2) if v.value2 is not None else None,
                                  v.unit, pregnant=preg is not None, diabetic=diabetic)
        if band and band.level in ("critical", "warning"):
            flags.append(f"Latest reading: {band.title}. {band.detail} (source: {band.source})")
    if preg is not None:
        weeks = pregnancy_weeks(preg.pregnancy_data)
        flags.append(
            "The patient is pregnant" + (f" (about {weeks} weeks)" if weeks is not None else "")
            + ": consider pregnancy for every medicine, supplement and reading, and suggest asking the doctor or "
            "midwife."
        )
    return list(dict.fromkeys(flags))


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
