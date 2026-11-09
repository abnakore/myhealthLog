"""
Request-level middleware for myHealthLog.

RequestIDMiddleware assigns a unique trace ID to every request and echoes
it in the response header.  The ID is stamped on log records via a thread-
local so every log line for the same request is traceable end-to-end.
"""

import threading
import uuid

_local = threading.local()


def get_request_id() -> str:
    """Return the request ID for the current thread, or a placeholder."""
    return getattr(_local, "request_id", "-")


def set_request_id(request_id: str) -> None:
    _local.request_id = request_id


def clear_request_id() -> None:
    _local.request_id = "-"


class RequestIDMiddleware:
    """
    Attach a unique ID to every inbound request.

    Reads X-Request-ID from the client (useful when an upstream load balancer
    already stamps requests) or generates a fresh UUID.  The ID is:
      - Stored on request.request_id for views and serializers.
      - Stored in thread-local so the logging formatter can pick it up.
      - Echoed in the X-Request-ID response header.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = (
            request.headers.get("X-Request-ID") or str(uuid.uuid4())
        )
        request.request_id = request_id
        set_request_id(request_id)

        response = self.get_response(request)
        response["X-Request-ID"] = request_id

        clear_request_id()
        return response
