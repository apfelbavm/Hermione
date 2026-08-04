"use client";

import { useEffect, useRef, useState } from "react";
import { AiGraphApi, AI_TOOL_DEFINITIONS, categoryForTool, DEFAULT_APPROVAL_POLICY, dispatchTool } from "../../graph/ai";
import type { Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { ChatHistoryStore, newSessionId, sessionTitleFromMessages, type ChatMessage, type ChatSession } from "./chatHistory";

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface UpstreamMessage {
  role: "assistant";
  content?: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

/** Minimal AI chat UI (section 27, deliverable 15) — the orchestration loop lives here rather than
 * on the server, since the graph itself only exists in this editor's own in-memory Store; only the
 * LLM call goes through the server (see app/api/ai/chat/route.ts), keeping the provider API key
 * out of the browser. Every graph.* tool call the model makes is executed locally through
 * AiGraphApi, never against React state/the DOM/canvas directly (see AiGraphApi/tools.ts). */
export function AiChatPanel({ store, flowId }: { store: Store; flowId: string }) {
  useStoreRevision(store);
  const apiRef = useRef<AiGraphApi>(new AiGraphApi(store.state.rootGraph));
  const historyRef = useRef<ChatHistoryStore>(ChatHistoryStore.forFlow(flowId));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const [sessions, setSessions] = useState<ChatSession[]>(() => historyRef.current.list());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ call: ToolCall; upstream: unknown[] } | null>(null);

  // Persist every turn as it happens (not just on unmount) so a page reload or crash mid-chat
  // never silently drops the conversation from the history list.
  useEffect(() => {
    if (messages.length === 0) return;
    const now = Date.now();
    const existing = sessions.find((s) => s.id === sessionId);
    const session: ChatSession = { id: sessionId, title: sessionTitleFromMessages(messages), createdAt: existing?.createdAt ?? now, updatedAt: now, messages };
    historyRef.current.save(session);
    setSessions(historyRef.current.list());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sessionId]);

  function startNewChat(): void {
    if (busy || pendingApproval) return;
    setSessionId(newSessionId());
    setMessages([]);
    setInput("");
    setHistoryOpen(false);
  }

  function restoreSession(session: ChatSession): void {
    if (busy || pendingApproval) return;
    setSessionId(session.id);
    setMessages(session.messages);
    setHistoryOpen(false);
  }

  function syncGraphIntoStore(): void {
    if (store.state.rootGraph !== apiRef.current.rootGraph) {
      store.state.rootGraph = apiRef.current.rootGraph;
    }
    store.notify();
  }

  async function runToolCall(call: ToolCall): Promise<unknown> {
    // The editor can replace store.state.rootGraph wholesale (flow load, undo/redo, version
    // restore) without going through this API — adopt it first so we mutate the graph that's
    // actually on screen instead of silently reverting it to whatever this instance last saw.
    if (store.state.rootGraph !== apiRef.current.rootGraph) {
      apiRef.current.adoptRootGraph(store.state.rootGraph);
    }
    console.log(`[AiChat] tool call -> ${call.name}`, call.arguments);
    try {
      const result = await dispatchTool(apiRef.current, call.name, call.arguments);
      console.log(`[AiChat] tool result <- ${call.name}`, result);
      syncGraphIntoStore();
      return result;
    } catch (err) {
      // Report the failure back to the model as a tool result instead of letting it crash the
      // whole conversation loop as an unhandled rejection with no feedback to the user.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AiChat] tool call -> ${call.name} threw`, err);
      return { error: message };
    }
  }

  async function sendConversation(history: Array<{ role: string; content?: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }>): Promise<void> {
    setBusy(true);
    try {
      let conversation = history;
      // Bounded loop: the model may chain several tool calls before giving a final answer. The
      // INSPECT->PLAN->VALIDATE->APPLY->VALIDATE->RUN->REPORT workflow easily takes a dozen+
      // round trips, so this needs real headroom rather than cutting the model off mid-task.
      const maxRounds = 20;
      for (let round = 0; round < maxRounds; round++) {
        const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: conversation }) });
        const data = (await res.json()) as { message?: UpstreamMessage; error?: string };
        if (!res.ok || data.error) {
          setMessages((m) => [...m, { role: "assistant", content: `Error: ${data.error ?? res.statusText}` }]);
          return;
        }

        const message = data.message!;
        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
          setMessages((m) => [...m, { role: "assistant", content: message.content ?? "" }]);
          return;
        }

        const firstDestructive = toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown> })).find((c) => DEFAULT_APPROVAL_POLICY.requiresApproval(categoryForTool(c.name)));

        if (firstDestructive) {
          setPendingApproval({ call: firstDestructive, upstream: [...conversation, message] });
          return;
        }

        conversation = [...conversation, message];
        for (const tc of toolCalls) {
          const call: ToolCall = { id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments || "{}") };
          const result = await runToolCall(call);
          conversation = [...conversation, { role: "tool", tool_call_id: tc.id, name: call.name, content: JSON.stringify(result) } as never];
        }
      }
      setMessages((m) => [...m, { role: "assistant", content: `Stopped after ${maxRounds} tool-call rounds without a final answer — the AI may still be mid-task. Try asking it to continue or summarize what it's done so far.` }]);
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(): Promise<void> {
    if (!input.trim() || busy || !store.state.flowLoaded) return;
    const userMessage: ChatMessage = { role: "user", content: input };
    setMessages((m) => [...m, userMessage]);
    setInput("");
    await sendConversation([...messages, userMessage].map((m) => ({ role: m.role, content: m.content })));
  }

  async function approvePending(approved: boolean): Promise<void> {
    if (!pendingApproval) return;
    const { call, upstream } = pendingApproval;
    setPendingApproval(null);
    let conversation = upstream;
    if (approved) {
      const result = await runToolCall(call);
      conversation = [...conversation, { role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify(result) } as never];
    } else {
      conversation = [...conversation, { role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify({ rejected: true, message: "The user rejected this operation." }) } as never];
    }
    await sendConversation(conversation as never);
  }

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-toolbar">
        <button type="button" className="btn btn-ghost" onClick={startNewChat} disabled={busy || !!pendingApproval} title="Start a new empty chat">
          New chat
        </button>
        <div className="ai-chat-history-dropdown">
          <button type="button" className="btn btn-ghost" onClick={() => setHistoryOpen((v) => !v)} disabled={sessions.length === 0} title="Restore a past chat">
            History{sessions.length > 0 ? ` (${sessions.length})` : ""}
          </button>
          {historyOpen && (
            <div className="ai-chat-history-list">
              {sessions.length === 0 && <div className="ai-chat-history-empty">No past chats yet.</div>}
              {sessions.map((s) => (
                <button key={s.id} type="button" className={`ai-chat-history-item${s.id === sessionId ? " ai-chat-history-item-active" : ""}`} onClick={() => restoreSession(s)}>
                  <span className="ai-chat-history-title">{s.title}</span>
                  <span className="ai-chat-history-date">{new Date(s.updatedAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ai-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`ai-chat-message ai-chat-message-${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="ai-chat-message ai-chat-message-assistant ai-chat-message-busy" aria-live="polite">
            <span className="ai-chat-typing-dot" />
            <span className="ai-chat-typing-dot" />
            <span className="ai-chat-typing-dot" />
            <span className="ai-chat-typing-label">AI is working on this...</span>
          </div>
        )}
        {pendingApproval && (
          <div className="ai-chat-approval">
            <p>
              AI wants to run <strong>{pendingApproval.call.name}</strong>:
            </p>
            <pre>{JSON.stringify(pendingApproval.call.arguments, null, 2)}</pre>
            <button type="button" onClick={() => approvePending(true)}>
              Apply
            </button>
            <button type="button" onClick={() => approvePending(false)}>
              Reject
            </button>
          </div>
        )}
      </div>
      <div className="ai-chat-input">
        <input
          value={input}
          disabled={busy || !!pendingApproval || !store.state.flowLoaded}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSend();
          }}
          placeholder={store.state.flowLoaded ? "Ask the AI to inspect, modify, run, or debug this graph..." : "Loading flow..."}
        />
        <button type="button" className="btn btn-green" onClick={() => void handleSend()} disabled={busy || !!pendingApproval || !store.state.flowLoaded}>
          Send
        </button>
      </div>
    </div>
  );
}

export { AI_TOOL_DEFINITIONS };
