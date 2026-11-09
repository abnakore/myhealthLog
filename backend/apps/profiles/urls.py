from django.urls import path

from .views import (
    EmergencyContactDetailView,
    EmergencyContactListView,
    PhotoUploadView,
    ProfileView,
)

urlpatterns = [
    path("", ProfileView.as_view(), name="profile"),
    path("photo/", PhotoUploadView.as_view(), name="profile-photo"),
    path("contacts/", EmergencyContactListView.as_view(), name="profile-contacts"),
    path("contacts/<uuid:pk>/", EmergencyContactDetailView.as_view(), name="profile-contact-detail"),
]
