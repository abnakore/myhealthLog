"""
Pagination classes for myHealthLog.

Every list endpoint uses StandardResultsSetPagination (20/page, max 100).
LargeResultsSetPagination (100/page, max 500) is available for exports and
admin-style endpoints.

The paginated response shape is stable:
    {
        "count": <total items>,
        "next": <url | null>,
        "previous": <url | null>,
        "page": <current page number>,
        "page_size": <items this page>,
        "results": [...]
    }
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """20 items per page, client-overridable up to 100."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data) -> Response:
        return Response(
            {
                "count": self.page.paginator.count,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "page": self.page.number,
                "page_size": self.get_page_size(self.request),
                "results": data,
            }
        )

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "count": {"type": "integer"},
                "next": {"type": "string", "nullable": True},
                "previous": {"type": "string", "nullable": True},
                "page": {"type": "integer"},
                "page_size": {"type": "integer"},
                "results": schema,
            },
        }


class LargeResultsSetPagination(StandardResultsSetPagination):
    """100 items per page, client-overridable up to 500. For exports/admin."""

    page_size = 100
    max_page_size = 500
