/**
 * Health Copilot API calls.
 * Maps to /api/v1/copilot/* endpoints.
 */
import { api } from "./api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatResponse {
  answer: string;
  question: string;
}

export async function sendCopilotMessage(
  question: string,
  history: ChatMessage[],
): Promise<CopilotChatResponse> {
  const res = await api.post<CopilotChatResponse>("/v1/copilot/chat/", {
    question,
    history,
  });
  return res.data;
}

export async function fetchCopilotContext(): Promise<{ context: string }> {
  const res = await api.get<{ context: string }>("/v1/copilot/context/");
  return res.data;
}
