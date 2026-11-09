from rest_framework import serializers

from apps.core.serializers import BaseModelSerializer

from .models import HealthContext


class HealthContextSerializer(BaseModelSerializer):
    class Meta:
        model = HealthContext
        fields = [
            "id",
            "kind",
            "condition_id",
            "condition_ids",
            "key",
            "pregnancy_data",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        kind = attrs.get("kind", "")
        if kind == "CONDITION" and not attrs.get("condition_id", "").strip():
            raise serializers.ValidationError(
                {"condition_id": "condition_id is required for CONDITION contexts."}
            )
        if kind == "LIFE_STAGE" and not attrs.get("key", "").strip():
            raise serializers.ValidationError(
                {"key": "key is required for LIFE_STAGE contexts."}
            )
        return attrs
