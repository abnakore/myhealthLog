"""
Health Copilot views.

POST /api/v1/copilot/chat/
  Submit a health question.  The response is grounded in the user's records.

GET  /api/v1/copilot/context/
  Return the personal health context that the Copilot injects into every
  prompt.  Useful for the frontend to show "Copilot knows about:" panel.
"""

import logging

from apps.sharing.proxy import resolve_active_owner
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from .serializers import CopilotRequestSerializer, CopilotResponseSerializer
from .services import CopilotService, _build_personal_context

logger = logging.getLogger(__name__)


class CopilotThrottle(UserRateThrottle):
    """30 requests/hour per user — Gemini has a cost."""
    scope = "copilot"


class CopilotChatView(APIView):
    """
    POST /api/v1/copilot/chat/

    Body:
      {
        "question": "Can I take ibuprofen?",
        "history": [
          { "role": "user", "content": "..." },
          { "role": "assistant", "content": "..." }
        ]
      }

    Response:
      {
        "question": "Can I take ibuprofen?",
        "answer": "Given that you are currently taking Metformin for Type 2..."
      }

    Disclaimer:
    The system prompt hard-codes a disclaimer for clinical questions.
    The frontend must also display the static disclaimer banner.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [CopilotThrottle]

    def post(self, request):
        serializer = CopilotRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        question: str = serializer.validated_data["question"]
        history: list = serializer.validated_data.get("history", [])

        answer = CopilotService.chat(
            # A care proxy asks about the record they are viewing, not their own.
            user=resolve_active_owner(request),
            question=question,
            history=history,
        )

        return Response(
            CopilotResponseSerializer(
                {"answer": answer, "question": question}
            ).data
        )


class CopilotContextView(APIView):
    """
    GET /api/v1/copilot/context/

    Return the personal health context that the Copilot uses.
    Useful for the frontend "Copilot knows about:" informational panel.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        context_text = _build_personal_context(resolve_active_owner(request))
        return Response({"context": context_text})
