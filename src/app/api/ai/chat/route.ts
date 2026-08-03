import { AI_GRAPH_SYSTEM_PROMPT, AI_TOOL_DEFINITIONS } from "../../../../graph/ai";

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

/** Thin proxy to an OpenAI-compatible chat-completions endpoint (see docs/auth.md's pattern of
 * keeping every provider secret server-side) — this route holds the AI provider's own API key
 * (HERMIONE_AI_API_KEY), never the browser. It only relays messages/tool schemas and returns the
 * assistant's reply; it never touches the graph itself — the client executes any requested
 * graph.* tool calls locally via AiGraphApi (see components/ai/AiChatPanel.tsx), since the graph
 * only exists in the editor's own in-memory state. */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.HERMIONE_AI_API_KEY;
  if (!apiKey) {
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

  const baseUrl = process.env.HERMIONE_AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.HERMIONE_AI_MODEL || "gpt-4o-mini";

  const hasSystemMessage = body.messages.some((m) => m.role === "system");
  const messages = hasSystemMessage ? body.messages : [{ role: "system" as const, content: AI_GRAPH_SYSTEM_PROMPT }, ...body.messages];

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      tools: AI_TOOL_DEFINITIONS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return Response.json({ error: `AI provider request failed (${upstream.status}): ${text}` }, { status: 502 });
  }

  const data = (await upstream.json()) as { choices: Array<{ message: ChatMessage }> };
  const message = data.choices[0]?.message;
  if (!message) {
    return Response.json({ error: "AI provider returned no response" }, { status: 502 });
  }

  return Response.json({ message });
}
