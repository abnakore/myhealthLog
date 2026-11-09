"""
Base serialiser for myHealthLog.

Provides a consistent to_internal_value override that converts empty strings
to None for nullable fields.  HTML forms post empty strings for optional
inputs; the ORM expects None for nullable columns.
"""

from rest_framework import serializers


class BaseModelSerializer(serializers.ModelSerializer):
    """
    Extends ModelSerializer with:
      - Empty-string → None coercion for nullable fields.
      - read_only_fields auto-populated with id, created_at, updated_at.
    """

    def to_internal_value(self, data):
        """Convert empty strings to None for fields that allow null."""
        mutable = data.copy() if hasattr(data, "copy") else dict(data)
        for field_name, field in self.fields.items():
            if (
                field.allow_null
                and not field.required
                and mutable.get(field_name) == ""
            ):
                mutable[field_name] = None
        return super().to_internal_value(mutable)
