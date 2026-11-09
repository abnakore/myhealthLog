"""
One small Gemini client for the whole backend.

Why not the `google.generativeai` SDK:
  - It is end-of-life (Google stopped shipping fixes) and prints a deprecation
    warning on every import.
  - It talks gRPC and has no request timeout. Inside a Celery prefork worker a
    slow model left the task hanging forever, which is why documents sat in
    PROCESSING and never finished.

This client calls the public REST endpoint with `requests`, which is fork-safe,
and gives every call a hard timeout. Models are tried in order: the configured
GEMINI_MODEL_NAME first, then GEMINI_FALLBACK_MODELS. A model that times out or
is unavailable is skipped for a few minutes so the next request does not wait
on it again.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache

from apps.core.exceptions import AIProcessingError, ServiceUnavailableError

logger = logging.getLogger(__name__)

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_SLOW_KEY = "gemini_model_unavailable:{model}"
# How long a model that failed (timeout, 404, 5xx) is skipped.
_SKIP_SECONDS = 300


def is_configured() -> bool:
    return bool(getattr(settings, "GEMINI_API_KEY", ""))


def _models() -> list[str]:
    primary = getattr(settings, "GEMINI_MODEL_NAME", "") or ""
    fallbacks = getattr(settings, "GEMINI_FALLBACK_MODELS", []) or []
    ordered: list[str] = []
    for name in [primary, *fallbacks]:
        name = name.strip()
        if name and name not in ordered:
            ordered.append(name)
    return ordered


def _mark_unavailable(model: str) -> None:
    try:
        cache.set(_SLOW_KEY.format(model=model), True, _SKIP_SECONDS)
    except Exception:  # cache down must never break the call path
        pass


def _is_unavailable(model: str) -> bool:
    try:
        return bool(cache.get(_SLOW_KEY.format(model=model)))
    except Exception:
        return False


def file_part(data: bytes, mime_type: str) -> dict[str, Any]:
    """An inline file part (PDF, image) for a prompt."""
    return {
        "inline_data": {
            "mime_type": mime_type or "application/octet-stream",
            "data": base64.b64encode(data).decode("ascii"),
        }
    }


def _text_of(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        reason = (payload.get("promptFeedback") or {}).get("blockReason")
        raise AIProcessingError(
            f"The AI declined to answer ({reason})." if reason else "The AI returned no answer."
        )
    parts = (candidates[0].get("content") or {}).get("parts") or []
    # Thinking models return their reasoning as parts flagged `thought`; only
    # the answer parts are wanted.
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    return text.strip()


def generate(
    contents: list[dict[str, Any]],
    *,
    system: str | None = None,
    json_mode: bool = False,
    timeout: float | None = None,
    temperature: float | None = None,
) -> str:
    """
    Send `contents` (Gemini `contents` array) and return the answer text.

    Raises ServiceUnavailableError when no model could answer.
    """
    if not is_configured():
        raise ServiceUnavailableError("AI is not configured on this server.")

    timeout = timeout or getattr(settings, "GEMINI_TIMEOUT_SECONDS", 60)
    body: dict[str, Any] = {"contents": contents}
    config: dict[str, Any] = {}
    if json_mode:
        config["responseMimeType"] = "application/json"
    if temperature is not None:
        config["temperature"] = temperature
    if config:
        body["generationConfig"] = config
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    models = _models()
    # Try the models that are not on cooldown first; if every one is, try them
    # all anyway rather than refusing outright.
    ready = [m for m in models if not _is_unavailable(m)] or models
    last_error: Exception | None = None

    for model in ready:
        try:
            response = requests.post(
                _ENDPOINT.format(model=model),
                headers={"x-goog-api-key": settings.GEMINI_API_KEY},
                json=body,
                timeout=timeout,
            )
        except requests.RequestException as exc:
            logger.warning("Gemini model %s did not answer: %s", model, exc)
            _mark_unavailable(model)
            last_error = exc
            continue

        if response.status_code == 200:
            try:
                text = _text_of(response.json())
            except ValueError as exc:
                last_error = exc
                continue
            if text:
                logger.info("Gemini answered with model %s", model)
                return text
            last_error = AIProcessingError("Empty answer.")
            continue

        # 4xx other than 404/429 is our request's fault: another model will not fix it.
        logger.warning(
            "Gemini model %s returned HTTP %s: %.300s", model, response.status_code, response.text
        )
        last_error = ServiceUnavailableError(f"Gemini HTTP {response.status_code}")
        if response.status_code in (404, 429) or response.status_code >= 500:
            _mark_unavailable(model)
            continue
        break

    raise ServiceUnavailableError("The AI service is temporarily unavailable.") from last_error


def parse_json(raw: str) -> Any:
    """Parse a model's JSON answer, tolerating stray markdown fences or prose."""
    text = raw.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the outermost JSON object in the text.
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def generate_json(
    contents: list[dict[str, Any]], *, system: str | None = None, timeout: float | None = None
) -> Any:
    """generate() in JSON mode, parsed. Raises AIProcessingError on unusable output."""
    raw = generate(contents, system=system, json_mode=True, timeout=timeout, temperature=0.1)
    try:
        return parse_json(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Gemini returned invalid JSON: %.200s", raw)
        raise AIProcessingError("The AI returned an unreadable answer.") from exc
