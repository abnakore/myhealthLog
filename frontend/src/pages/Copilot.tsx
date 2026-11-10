/**
 * Health Copilot — AI chat grounded in the user's own health records.
 *
 * Features:
 *  - Chat interface backed by POST /api/v1/copilot/chat/
 *  - Conversation history maintained client-side (stateless backend)
 *  - Conflict detection + medical disclaimer handled server-side
 *  - "Copilot knows about:" panel via GET /api/v1/copilot/context/
 *  - Rate limit awareness (30 req/hr — shows 429 error clearly)
 *  - Auto-scroll to latest message
 *  - Keyboard: Enter sends, Shift+Enter adds newline
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { sendCopilotMessage, fetchCopilotContext, type ChatMessage } from "@/services/copilot";
import { apiErrorMessage } from "@/services/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { CopilotIcon, InfoIcon, ShieldIcon, UserIcon } from "@/components/icons";

const DISCLAIMER =
  "Health Copilot uses your medical records to personalise answers. " +
  "This is not medical advice. Always consult your physician.";

const WELCOME =
  "Hello! I'm your Health Copilot. I can answer questions about your health, " +
  "medications, and lifestyle using your personal records. What would you like to know?";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={cn(
        "flex items-end gap-2.5",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <span
        className={cn(
          "flex-none grid h-8 w-8 place-items-center rounded-full text-white text-[0.72rem] font-bold",
          isUser ? "bg-mhl-accent" : "bg-mhl-ink",
        )}
      >
        {isUser ? <UserIcon size={16} /> : <CopilotIcon size={16} />}
      </span>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-[1rem] px-4 py-3 text-mhl-body leading-relaxed whitespace-pre-wrap",
          isUser
            ? "rounded-br-[0.25rem] bg-mhl-accent text-white"
            : msg.error
              ? "rounded-bl-[0.25rem] border border-mhl-danger/30 bg-mhl-danger-lo text-mhl-danger"
              : "rounded-bl-[0.25rem] border border-mhl-rule bg-mhl-surface text-mhl-ink shadow-sm",
        )}
      >
        {msg.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5">
      <span className="flex-none grid h-8 w-8 place-items-center rounded-full bg-mhl-ink text-white">
        <CopilotIcon size={16} />
      </span>
      <div className="flex items-center gap-1.5 rounded-[1rem] rounded-bl-[0.25rem] border border-mhl-rule bg-mhl-surface px-4 py-3.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-mhl-muted"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function Copilot() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [contextText, setContextText] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Resize textarea to fit content (up to ~6 lines)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 152)}px`;
  }, [input]);

  function buildHistory(): ChatMessage[] {
    return messages
      .filter((m) => !m.error)
      .slice(-20)           // keep last 20 turns (10 exchanges)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const history = buildHistory();
      const res = await sendCopilotMessage(text, history);
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: res.answer },
      ]);
    } catch (err) {
      const msg = apiErrorMessage(err);
      // Distinguish rate-limit from other errors
      const friendly =
        msg.toLowerCase().includes("throttle") || msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("30/hour")
          ? "You've reached the 30-questions-per-hour limit. Please try again in a while."
          : msg;
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: friendly, error: true },
      ]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  async function loadContext() {
    if (contextText !== null) { setContextOpen(true); return; }
    setContextLoading(true);
    try {
      const { context } = await fetchCopilotContext();
      setContextText(context);
      setContextOpen(true);
    } catch {
      setContextText("Could not load context preview.");
      setContextOpen(true);
    } finally {
      setContextLoading(false);
    }
  }

  function clearConversation() {
    setMessages([{ id: "welcome", role: "assistant", content: WELCOME }]);
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col lg:h-[calc(100dvh-5rem)]">
      <PageHeader
        title="Health Copilot"
        subtitle="AI answers grounded in your own health records."
        action={
          <Button variant="ghost" size="md" onClick={clearConversation}>
            New chat
          </Button>
        }
      />

      {/* Disclaimer banner */}
      <div className="mt-3 flex items-start gap-2.5 rounded-mhl-sm border border-mhl-accent/25 bg-mhl-accent-lo px-4 py-3">
        <ShieldIcon size={18} className="mt-0.5 flex-none text-mhl-accent" />
        <p className="min-w-0 text-mhl-fine text-mhl-ink">{DISCLAIMER}</p>
        <button
          type="button"
          onClick={loadContext}
          className="flex-none text-mhl-fine font-semibold text-mhl-accent hover:text-mhl-accent-strong whitespace-nowrap"
        >
          {contextLoading ? <Spinner size={14} /> : "What it knows"}
        </button>
      </div>

      {/* Context panel */}
      {contextOpen && contextText && (
        <div className="mt-3 rounded-mhl-sm border border-mhl-rule bg-mhl-sunk px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-mhl-fine font-semibold text-mhl-ink flex items-center gap-1.5">
              <InfoIcon size={15} />
              Copilot knows about
            </p>
            <button
              type="button"
              onClick={() => setContextOpen(false)}
              className="text-mhl-fine text-mhl-muted hover:text-mhl-ink"
            >
              Close
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-mhl-fine text-mhl-muted font-sans leading-relaxed">
            {contextText}
          </pre>
        </div>
      )}

      {/* Messages */}
      <div className="mt-4 flex-1 overflow-y-auto rounded-mhl border border-mhl-rule bg-mhl-surface p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="mt-3 flex items-end gap-2 rounded-mhl border border-mhl-rule bg-mhl-surface px-3 py-2 shadow-sm focus-within:border-mhl-accent/60 focus-within:ring-1 focus-within:ring-mhl-accent/20 transition-colors"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your health, medications, or lifestyle..."
          rows={1}
          maxLength={2000}
          disabled={sending}
          aria-label="Type your health question"
          className="flex-1 resize-none bg-transparent text-mhl-body text-mhl-ink outline-none placeholder:text-mhl-faint disabled:opacity-50 py-1.5 leading-relaxed"
          style={{ minHeight: "2.25rem", maxHeight: "9.5rem", overflowY: "auto" }}
        />
        <Button
          type="submit"
          disabled={!input.trim() || sending}
          loading={sending}
          className="flex-none mb-0.5"
          aria-label="Send message"
        >
          Send
        </Button>
      </form>

      <p className="mt-2 text-center text-[0.72rem] text-mhl-faint">
        30 questions per hour · Shift+Enter for a new line
      </p>

      {/* Bounce animation for typing dots */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
