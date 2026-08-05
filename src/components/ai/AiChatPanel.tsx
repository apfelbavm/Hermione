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

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const [sessions, setSessions] = useState<ChatSession[]>(() => historyRef.current.list());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ call: ToolCall; upstream: unknown[]; deferredToolCalls: ToolCall[] } | null>(null);
  // Tokens spent on the current chat session (resets on "New chat") — helps gauge how close a
  // long conversation is getting to the model's context window, see aiManager.ts/route.ts.
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  // Actual usage reported by the provider for the most recent request (not cumulative, unlike
  // tokenUsage) — promptTokens is the real size of everything sent as context (system prompt +
  // tool schema + conversation so far), shown against the model's configured limit so the user can
  // see how close a conversation is to overflowing (see contextWindow in aiManager.ts).
  const [lastRequestUsage, setLastRequestUsage] = useState<TokenUsage | null>(null);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  // Whether the "what are my tokens used for" breakdown popover is open (see the context-usage
  // span in the status bar below).
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Fetch the model's configured context window up front (no API key exposed, see route.ts's GET
  // handler) so it can be shown alongside the estimate even before the first message is sent.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/chat")
      .then((res) => (res.ok ? (res.json() as Promise<{ contextWindow: number | null }>) : null))
      .then((data) => {
        if (!cancelled && data?.contextWindow != null) setContextWindow((prev) => prev ?? data.contextWindow);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-grows the input textarea to fit its content (up to the CSS max-height, then scrolls).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

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
    setTokenUsage(null);
    setLastRequestUsage(null);
  }

  function restoreSession(session: ChatSession): void {
    if (busy || pendingApproval) return;
    setSessionId(session.id);
    setMessages(session.messages);
    setHistoryOpen(false);
    setTokenUsage(null);
    setLastRequestUsage(null);
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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      let conversation = history;
      // Bounded loop: the model may chain several tool calls before giving a final answer. The
      // INSPECT->PLAN->VALIDATE->APPLY->VALIDATE->RUN->REPORT workflow easily takes a dozen+
      // round trips, so this needs real headroom rather than cutting the model off mid-task.
      const maxRounds = 20;
      for (let round = 0; round < maxRounds; round++) {
        let res: Response;
        let data: { message?: UpstreamMessage; usage?: TokenUsage; contextWindow?: number; error?: string };
        try {
          res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: conversation }), signal: controller.signal });
          data = (await res.json()) as { message?: UpstreamMessage; usage?: TokenUsage; contextWindow?: number; error?: string };
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            setMessages((m) => [...m, { role: "assistant", content: "Stopped by user." }]);
            return;
          }
          throw err;
        }
        if (!res.ok || data.error) {
          setMessages((m) => [...m, { role: "assistant", content: `Error: ${data.error ?? res.statusText}` }]);
          return;
        }
        if (data.usage) {
          const u = data.usage;
          setTokenUsage((prev) => (prev ? { promptTokens: prev.promptTokens + u.promptTokens, completionTokens: prev.completionTokens + u.completionTokens, totalTokens: prev.totalTokens + u.totalTokens } : u));
          setLastRequestUsage(u);
        }
        if (data.contextWindow !== undefined) setContextWindow(data.contextWindow);

        const message = data.message!;
        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
          setMessages((m) => [...m, { role: "assistant", content: message.content ?? "" }]);
          return;
        }

        // The model can (and does) return several tool_calls in one turn, some of which may need
        // approval (e.g. graph.run after a couple of graph.apply_changes calls). Run each call in
        // order and only pause at the FIRST one requiring approval — never discard the safe calls
        // that came before it, or nothing in the batch ever actually executes.
        conversation = [...conversation, message];
        let pauseIndex = -1;
        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i];
          const call: ToolCall = { id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments || "{}") };
          if (DEFAULT_APPROVAL_POLICY.requiresApproval(categoryForTool(call.name))) {
            pauseIndex = i;
            break;
          }
          const result = await runToolCall(call);
          conversation = [...conversation, { role: "tool", tool_call_id: tc.id, name: call.name, content: JSON.stringify(result) } as never];
        }

        if (pauseIndex >= 0) {
          const gatedCall: ToolCall = { id: toolCalls[pauseIndex].id, name: toolCalls[pauseIndex].function.name, arguments: JSON.parse(toolCalls[pauseIndex].function.arguments || "{}") };
          const deferredToolCalls: ToolCall[] = toolCalls.slice(pauseIndex + 1).map((tc) => ({ id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments || "{}") }));
          setPendingApproval({ call: gatedCall, upstream: conversation, deferredToolCalls });
          return;
        }
      }
      setMessages((m) => [...m, { role: "assistant", content: `Stopped after ${maxRounds} tool-call rounds without a final answer — the AI may still be mid-task. Try asking it to continue or summarize what it's done so far.` }]);
    } finally {
      abortControllerRef.current = null;
      setBusy(false);
    }
  }

  function stopGeneration(): void {
    abortControllerRef.current?.abort();
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
    const { call, upstream, deferredToolCalls } = pendingApproval;
    setPendingApproval(null);
    let conversation = upstream;
    if (approved) {
      const result = await runToolCall(call);
      conversation = [...conversation, { role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify(result) } as never];
    } else {
      conversation = [...conversation, { role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify({ rejected: true, message: "The user rejected this operation." }) } as never];
    }
    // Any tool_calls the model batched after this gated one were never run (they may well have
    // depended on its result) — every tool_call_id still needs a matching tool message before the
    // next assistant turn, so report them as skipped rather than silently dropping them.
    for (const tc of deferredToolCalls) {
      conversation = [...conversation, { role: "tool", tool_call_id: tc.id, name: tc.name, content: JSON.stringify({ skipped: true, message: "Not run — it was batched after a call that needed user approval. Re-check the graph state and re-plan this step if it's still needed." }) } as never];
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
      <div className="ai-chat-status-bar">
        <div className="ai-chat-status-info">
          {tokenUsage && (
            <span className="ai-chat-token-usage" title={`${tokenUsage.promptTokens} prompt + ${tokenUsage.completionTokens} completion tokens, this chat`}>
              {tokenUsage.totalTokens.toLocaleString()} tokens used
            </span>
          )}
          <div className="ai-chat-context-breakdown-wrapper">
            <button
              type="button"
              className="ai-chat-context-usage ai-chat-context-usage-btn"
              onClick={() => setBreakdownOpen((v) => !v)}
              title={lastRequestUsage !== null ? "Actual context size of the last request vs. the model's context window limit — click for a breakdown" : "No request sent yet — click for details"}
            >
              context: {(lastRequestUsage?.promptTokens ?? 0).toLocaleString()}
              {contextWindow !== null ? ` / ${contextWindow.toLocaleString()}` : ""}
            </button>
            {breakdownOpen && (
              <div className="ai-chat-context-breakdown">
                {lastRequestUsage !== null ? (
                  <>
                    <div className="ai-chat-context-breakdown-row">
                      <span>Last request — prompt (system prompt + tool schema + conversation)</span>
                      <span>{lastRequestUsage.promptTokens.toLocaleString()}</span>
                    </div>
                    <div className="ai-chat-context-breakdown-row">
                      <span>Last request — completion</span>
                      <span>{lastRequestUsage.completionTokens.toLocaleString()}</span>
                    </div>
                    <div className="ai-chat-context-breakdown-row">
                      <span>Last request — total</span>
                      <span>{lastRequestUsage.totalTokens.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="ai-chat-context-breakdown-row">
                    <span>No request sent yet this session</span>
                  </div>
                )}
                {tokenUsage && (
                  <div className="ai-chat-context-breakdown-row ai-chat-context-breakdown-actual">
                    <span>
                      Session total ({messages.length} message{messages.length === 1 ? "" : "s"})
                    </span>
                    <span>{tokenUsage.totalTokens.toLocaleString()}</span>
                  </div>
                )}
                <p className="ai-chat-context-breakdown-note">Figures come directly from the AI provider's reported token usage, not an estimate.</p>
              </div>
            )}
          </div>
        </div>
        {busy && (
          <button type="button" className="btn btn-ghost ai-chat-stop-btn" onClick={stopGeneration} title="Abort the current AI request">
            Stop
          </button>
        )}
      </div>
      <div className="ai-chat-input">
        <textarea
          ref={inputRef}
          value={input}
          disabled={busy || !!pendingApproval || !store.state.flowLoaded}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          placeholder={store.state.flowLoaded ? "Ask the AI to inspect, modify, run, or debug this graph... (Shift+Enter for a new line)" : "Loading flow..."}
        />
        <button type="button" className="btn btn-green" onClick={() => void handleSend()} disabled={busy || !!pendingApproval || !store.state.flowLoaded}>
          Send
        </button>
      </div>
    </div>
  );
}

export { AI_TOOL_DEFINITIONS };
