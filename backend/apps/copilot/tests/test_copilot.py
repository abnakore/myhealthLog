"""
Tests for the Health Copilot endpoints.

The copilot calls Google Gemini, so we mock the Gemini client to avoid
making real API calls during tests.

Covers:
  - POST /api/v1/copilot/chat/ (happy path, auth failure, validation)
  - GET  /api/v1/copilot/context/
  - Service-unavailable when GEMINI_API_KEY is empty
"""

import sys
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="copilot@example.com", password="StrongPass123!", name="Copilot User"
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _mock_gemini_response(text: str):
    """Build a fake Gemini response object with a .text attribute."""
    mock_resp = MagicMock()
    mock_resp.text = text
    return mock_resp


@pytest.mark.django_db
class TestCopilotChat:
    def test_chat_unauthenticated_returns_401(self, api_client):
        response = api_client.post(
            "/api/v1/copilot/chat/",
            {"question": "What is my blood type?"},
            format="json",
        )
        assert response.status_code == 401

    def test_chat_returns_answer(self, auth_client):
        with patch(
            "apps.core.ai.generate",
            return_value="Based on your records, your blood type is O+.",
        ):
            response = auth_client.post(
                "/api/v1/copilot/chat/",
                {"question": "What is my blood type?"},
                format="json",
            )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert "blood type" in data["answer"]
        assert data["question"] == "What is my blood type?"

    def test_chat_missing_question_returns_400(self, auth_client):
        response = auth_client.post(
            "/api/v1/copilot/chat/",
            {},
            format="json",
        )
        assert response.status_code == 400

    def test_chat_with_history(self, auth_client):
        with patch(
            "apps.core.ai.generate", return_value="Continuing our conversation..."
        ) as mock_generate:
            response = auth_client.post(
                "/api/v1/copilot/chat/",
                {
                    "question": "Tell me more",
                    "history": [
                        {"role": "user", "content": "What is diabetes?"},
                        {"role": "assistant", "content": "Diabetes is..."},
                    ],
                },
                format="json",
            )
        assert response.status_code == 200
        # The two earlier turns plus the new question reach the model.
        contents = mock_generate.call_args.args[0]
        assert [c["role"] for c in contents] == ["user", "model", "user"]
        assert contents[-1]["parts"][0]["text"] == "Tell me more"

    def test_chat_empty_question_returns_400(self, auth_client):
        response = auth_client.post(
            "/api/v1/copilot/chat/",
            {"question": ""},
            format="json",
        )
        assert response.status_code == 400

    def test_chat_without_api_key_returns_503(self, auth_client, settings):
        settings.GEMINI_API_KEY = ""
        response = auth_client.post(
            "/api/v1/copilot/chat/",
            {"question": "Hello"},
            format="json",
        )
        assert response.status_code == 503


@pytest.mark.django_db
class TestCopilotContext:
    def test_context_returns_200(self, auth_client):
        response = auth_client.get("/api/v1/copilot/context/")
        assert response.status_code == 200
        assert "context" in response.json()

    def test_context_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/copilot/context/")
        assert response.status_code == 401

    def test_context_includes_records(self, auth_client, user):
        from apps.records.models import Allergy

        Allergy.objects.create(
            user=user, substance="Penicillin", allergy_type="DRUG", severity="SEVERE"
        )
        response = auth_client.get("/api/v1/copilot/context/")
        assert response.status_code == 200
        context_text = response.json()["context"]
        assert "Penicillin" in context_text
