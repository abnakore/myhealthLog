from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CareFocusView, HealthContextViewSet

router = DefaultRouter()
router.register(r"", HealthContextViewSet, basename="contexts")

# focus/ must come before the router, which is mounted at the root and would
# otherwise read "focus" as a context id.
urlpatterns = [
    path("focus/", CareFocusView.as_view(), name="care-focus"),
    path("", include(router.urls)),
]
