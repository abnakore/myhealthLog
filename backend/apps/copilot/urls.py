from django.urls import path

from .views import CopilotChatView, CopilotContextView

urlpatterns = [
    path("chat/", CopilotChatView.as_view(), name="copilot-chat"),
    path("context/", CopilotContextView.as_view(), name="copilot-context"),
]
