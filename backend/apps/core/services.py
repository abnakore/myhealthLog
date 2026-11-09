"""
Base service class for myHealthLog.

The service layer is where multi-model orchestration, external API calls, and
complex business rules live.  Views delegate to services; serializers validate
input and format output.  Tasks call services — never views or serializers.

Usage:
    class PlaceOrderService(BaseService):
        @classmethod
        def execute(cls, *, user, data):
            ...

    PlaceOrderService.run(user=request.user, data=serializer.validated_data)
"""

import logging
from typing import Any

from django.db import transaction

logger = logging.getLogger(__name__)


class BaseService:
    """
    Base for all service classes.

    Subclasses override execute().  run() wraps execute() in an atomic
    transaction and provides a single stable call site for views and tasks.
    """

    @classmethod
    def execute(cls, *args: Any, **kwargs: Any) -> Any:
        raise NotImplementedError(
            f"{cls.__name__} must implement execute()."
        )

    @classmethod
    def run(cls, *args: Any, **kwargs: Any) -> Any:
        """
        Public entry point.  Wraps execute() in a database transaction so any
        exception inside execute() rolls back every write atomically.
        """
        with transaction.atomic():
            return cls.execute(*args, **kwargs)
