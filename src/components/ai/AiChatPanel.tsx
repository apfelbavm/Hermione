"use client";

import { useRef, useState } from "react";
import { AiGraphApi, AI_TOOL_DEFINITIONS, categoryForTool, DEFAULT_APPROVAL_POLICY, dispatchTool } from "../../graph/ai";
import type { Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

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
export function AiChatPanel({ store }: { store: Store }) {
  useStoreRevision(store);
  const apiRef = useRef<AiGraphApi>(new AiGraphApi(store.state.rootGraph));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ call: ToolCall; upstream: unknown[] } | null>(null);

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
    const result = await dispatchTool(apiRef.current, call.name, call.arguments);
    syncGraphIntoStore();
    return result;
  }

  async function sendConversation(history: Array<{ role: string; content?: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }>): Promise<void> {
    setBusy(true);
    try {
      let conversation = history;
      // Bounded loop: the model may chain several tool calls before giving a final answer.
      for (let round = 0; round < 8; round++) {
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
      <div className="ai-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`ai-chat-message ai-chat-message-${m.role}`}>
            {m.content}
          </div>
        ))}
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
