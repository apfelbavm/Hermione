export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const MAX_SESSIONS = 30;

/** Persists per-Flow AI chat sessions to localStorage (see AiChatPanel.tsx) so switching flows or
 * reloading the page doesn't lose past conversations — keyed by flowId since each Flow's chat is
 * its own independent context, never shared across Flows. */
export class ChatHistoryStore {
  private constructor(private readonly flowId: string) {}

  static forFlow(flowId: string): ChatHistoryStore {
    return new ChatHistoryStore(flowId);
  }

  private get storageKey(): string {
    return `hermione-ai-chat-history-${this.flowId}`;
  }

  /** Newest-first. */
  list(): ChatSession[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ChatSession[];
      return Array.isArray(parsed) ? [...parsed].sort((a, b) => b.updatedAt - a.updatedAt) : [];
    } catch {
      return [];
    }
  }

  save(session: ChatSession): void {
    if (typeof window === "undefined") return;
    const sessions = this.list().filter((s) => s.id !== session.id);
    sessions.unshift(session);
    window.localStorage.setItem(this.storageKey, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  }

  delete(sessionId: string): void {
    if (typeof window === "undefined") return;
    const sessions = this.list().filter((s) => s.id !== sessionId);
    window.localStorage.setItem(this.storageKey, JSON.stringify(sessions));
  }
}

export function newSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Derives a human-readable label for the history list from the first user message. */
export function sessionTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.content.trim().replace(/\s+/g, " ") ?? "";
  if (!text) return "New chat";
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
