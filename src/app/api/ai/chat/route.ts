import { AI_GRAPH_SYSTEM_PROMPT, AI_TOOL_DEFINITIONS } from "../../../../graph/ai";
import { AiManager } from "../../../../server/aiManager";

export const runtime = "nodejs";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
}

/** Groq's Llama tool-calling models occasionally emit a malformed inline call (e.g.
 * `<function=graph.search_node_types={"query":"event"}</function>`) instead of a real tool_calls
 * entry; Groq's server then rejects the whole request with a 400 `tool_use_failed` instead of
 * just returning that text. Recover the call the model was clearly trying to make from the
 * `failed_generation` field so the conversation can continue instead of hard-failing. */
function recoverToolCallFromFailedGeneration(errorText: string): ChatMessage | null {
  let parsed: { error?: { code?: string; failed_generation?: string } };
  try {
    parsed = JSON.parse(errorText);
  } catch {
    return null;
  }
  const generation = parsed.error?.code === "tool_use_failed" ? parsed.error.failed_generation : undefined;
  if (!generation) return null;

  const toolCalls: NonNullable<ChatMessage["tool_calls"]> = [];
  const pattern = /<function=([\w.]+)=(\{[\s\S]*?\})>?<\/function>/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(generation))) {
    toolCalls.push({ id: `recovered-${Date.now()}-${index++}`, type: "function", function: { name: match[1], arguments: match[2] } });
  }
  if (toolCalls.length === 0) return null;
  return { role: "assistant", content: null, tool_calls: toolCalls };
}

/** Thin proxy to an OpenAI-compatible chat-completions endpoint (see docs/auth.md's pattern of
 * keeping every provider secret server-side) — this route never exposes an AI provider's key to
 * the browser. Which provider it proxies to (local Ollama in dev, the configured hosted provider
 * once deployed) is decided by `AiManager`. It only relays messages/tool schemas and returns the
 * assistant's reply; it never touches the graph itself — the client executes any requested
 * graph.* tool calls locally via AiGraphApi (see components/ai/AiChatPanel.tsx), since the graph
 * only exists in the editor's own in-memory state. */
export async function POST(request: Request): Promise<Response> {
  const config = AiManager.getConfig();
  if (!config) {
    return Response.json({ error: "AI assistant is not configured — set HERMIONE_AI_API_KEY on the server." }, { status: 501 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "`messages` must be an array" }, { status: 400 });
  }

  const hasSystemMessage = body.messages.some((m) => m.role === "system");
  const messages = hasSystemMessage ? body.messages : [{ role: "system" as const, content: AI_GRAPH_SYSTEM_PROMPT }, ...body.messages];

  const requestPayload = {
    model: config.model,
    messages,
    tools: AI_TOOL_DEFINITIONS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    parallel_tool_calls: false, // reduces how often Groq's Llama models emit the malformed inline calls below
  };
  console.log(`[AiChat] -> ${config.baseUrl}/chat/completions`, JSON.stringify(requestPayload, null, 2));

  const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(requestPayload),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    const recovered = recoverToolCallFromFailedGeneration(text);
    if (recovered) {
      return Response.json({ message: recovered });
    }
    return Response.json({ error: `AI provider request failed (${upstream.status}): ${text}` }, { status: 502 });
  }

  const data = (await upstream.json()) as { choices: Array<{ message: ChatMessage }>; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
  const message = data.choices[0]?.message;
  if (!message) {
    return Response.json({ error: "AI provider returned no response" }, { status: 502 });
  }
  console.log(`[AiChat] <- response`, JSON.stringify(message, null, 2));
  if (data.usage) {
    console.log(`[AiChat] tokens: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total`);
  }

  return Response.json({ message });
}
