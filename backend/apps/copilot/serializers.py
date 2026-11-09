from rest_framework import serializers


class ChatMessageSerializer(serializers.Serializer):
    """A single message in the conversation history."""

    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField()


class CopilotRequestSerializer(serializers.Serializer):
    """
    Request body for POST /api/v1/copilot/chat/

    question  — the user's current message.
    history   — the conversation history so far (frontend-maintained).
                Limited to MAX_HISTORY_TURNS entries.
    """

    question = serializers.CharField(
        min_length=1,
        max_length=2000,
        error_messages={
            "blank": "Please enter a question.",
            "max_length": "Questions must be under 2000 characters.",
        },
    )
    history = serializers.ListField(
        child=ChatMessageSerializer(),
        required=False,
        default=list,
        max_length=20,
    )

    def validate_question(self, value: str) -> str:
        return value.strip()


class CopilotResponseSerializer(serializers.Serializer):
    """Shape of the response from POST /api/v1/copilot/chat/"""

    answer = serializers.CharField()
    # The frontend uses this to append the new turn to its history.
    question = serializers.CharField()
