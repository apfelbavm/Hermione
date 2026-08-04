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

interface UpstreamChatRequest {
  model: string;
  messages: ChatMessage[];
  tools: Array<{ type: "function"; function: { name: string; description: string; parameters: unknown } }>;
  tool_choice: "required" | "auto";
  parallel_tool_calls: boolean;
  temperature: number;
}

/** Groq's Llama tool-calling models occasionally emit a malformed inline call (e.g.
 * `<function=graph.search_node_types={"query":"event"}</function>`) instead of a real tool_calls
 * entry; Groq's server then rejects the whole request with a 400 `tool_use_failed` instead of
 * just returning that text. Local Qwen models (via Ollama) have the opposite problem: they emit a
 * perfectly well-formed `<tool_call>{...}</tool_call>` block but Ollama's OpenAI-compat layer
 * sometimes leaves it sitting in `content` as plain text instead of populating `tool_calls` — the
 * request itself still succeeds, so it never hits the error path above. Occasionally the OPENING
 * tag itself comes back corrupted/mojibake (e.g. a single stray CJK character where `<tool_call>`
 * should be) while the closing `</tool_call>` tag and the JSON payload are still intact — handle
 * that too by falling back to just the JSON blob immediately preceding a closing tag. Recognize
 * all these shapes wherever assistant text shows up (a successful response's `content`, or a
 * failed request's `failed_generation`) so a real tool call never gets silently treated as a chat
 * message. */
const TOOL_CALL_TAG_PATTERN = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
const INLINE_FUNCTION_PATTERN = /<function=([\w.]+)=(\{[\s\S]*?\})>?<\/function>/g;
const CLOSING_TAG_ONLY_PATTERN = /(\{[\s\S]*?"name"\s*:\s*"[\w.]+"[\s\S]*?\})\s*<\/tool_call>/g;

function extractInlineToolCalls(text: string): NonNullable<ChatMessage["tool_calls"]> | null {
  const toolCalls: NonNullable<ChatMessage["tool_calls"]> = [];
  let index = 0;
  let match: RegExpExecArray | null;

  const tagPattern = new RegExp(TOOL_CALL_TAG_PATTERN.source, "g");
  while ((match = tagPattern.exec(text))) {
    try {
      const parsed = JSON.parse(match[1]) as { name?: string; arguments?: unknown };
      if (parsed.name) toolCalls.push({ id: `recovered-${Date.now()}-${index++}`, type: "function", function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments ?? {}) } });
    } catch {
      // Malformed JSON inside this one block — skip it rather than aborting the whole extraction.
    }
  }

  if (toolCalls.length === 0) {
    const closingOnlyPattern = new RegExp(CLOSING_TAG_ONLY_PATTERN.source, "g");
    while ((match = closingOnlyPattern.exec(text))) {
      try {
        const parsed = JSON.parse(match[1]) as { name?: string; arguments?: unknown };
        if (parsed.name) toolCalls.push({ id: `recovered-${Date.now()}-${index++}`, type: "function", function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments ?? {}) } });
      } catch {
        // Malformed JSON — skip it rather than aborting the whole extraction.
      }
    }
  }

  const fnPattern = new RegExp(INLINE_FUNCTION_PATTERN.source, "g");
  while ((match = fnPattern.exec(text))) {
    toolCalls.push({ id: `recovered-${Date.now()}-${index++}`, type: "function", function: { name: match[1], arguments: match[2] } });
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

function recoverToolCallFromFailedGeneration(errorText: string): ChatMessage | null {
  let parsed: { error?: { code?: string; failed_generation?: string } };
  try {
    parsed = JSON.parse(errorText);
  } catch {
    return null;
  }
  const generation = parsed.error?.code === "tool_use_failed" ? parsed.error.failed_generation : undefined;
  if (!generation) return null;

  const toolCalls = extractInlineToolCalls(generation);
  return toolCalls ? { role: "assistant", content: null, tool_calls: toolCalls } : null;
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

  async function callUpstream(msgs: ChatMessage[]): Promise<{ message: ChatMessage } | { error: string; status: number }> {
    const requestPayload: UpstreamChatRequest = {
      model: config!.model,
      messages: msgs,
      tools: AI_TOOL_DEFINITIONS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: shouldForceToolCall(msgs) ? "required" : "auto",
      parallel_tool_calls: false, // reduces how often Groq's Llama models emit the malformed inline calls below
      temperature: config!.temperature, // low by default — see AiManager.getConfig, reduces tool-call hallucination
    };
    console.log(`[AiChat] -> ${config!.baseUrl}/chat/completions`, JSON.stringify(requestPayload, null, 2));

    // Forward the incoming request's abort signal so a client-side "Stop" click also cancels the
    // in-flight upstream request instead of letting it keep running (and burning GPU) in the background.
    const upstream = await fetch(`${config!.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config!.apiKey}` },
      body: JSON.stringify(requestPayload),
      signal: request.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      const recovered = recoverToolCallFromFailedGeneration(text);
      if (recovered) return { message: recovered };
      return { error: `AI provider request failed (${upstream.status}): ${text}`, status: 502 };
    }

    const data = (await upstream.json()) as { choices: Array<{ message: ChatMessage }>; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
    let message = data.choices[0]?.message;
    if (!message) return { error: "AI provider returned no response", status: 502 };
    if ((message.tool_calls?.length ?? 0) === 0 && message.content) {
      const recovered = extractInlineToolCalls(message.content);
      if (recovered) {
        console.log(`[AiChat] recovered ${recovered.length} inline tool call(s) from message content instead of tool_calls`);
        message = { role: "assistant", content: null, tool_calls: recovered };
      }
    }
    console.log(`[AiChat] <- response`, JSON.stringify(message, null, 2));
    if (data.usage) {
      console.log(`[AiChat] tokens: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total`);
    }
    return { message };
  }

  // Small local models occasionally ignore the tools schema entirely and answer in prose instead
  // of calling a tool — not just on the very first turn, but on ANY later turn too, e.g.
  // narrating "I'll now create the nodes..." and stopping instead of actually calling
  // graph.apply_changes. A graph mutation/run is only "done" once it's actually been committed
  // (a non-dry-run apply_changes succeeded) or run — until then a final plain-language REPORT
  // (with no further tool call) isn't an acceptable response. Cap how long this forcing lasts
  // (toolRounds) so a genuinely read-only conversation (which never commits/runs anything)
  // doesn't get stuck being forced to call tools forever.
  function shouldForceToolCall(msgs: ChatMessage[]): boolean {
    const toolRounds = msgs.filter((m) => m.role === "assistant" && (m.tool_calls?.length ?? 0) > 0).length;
    if (toolRounds >= 8) return false;
    const hasCommittedOrRun = msgs.some((m) => {
      if (m.role !== "tool") return false;
      if (m.name === "graph.run") return true;
      if (m.name !== "graph.apply_changes") return false;
      try {
        const parsed = JSON.parse(m.content ?? "{}") as { success?: boolean; dryRun?: boolean };
        return parsed.success === true && parsed.dryRun !== true;
      } catch {
        return false;
      }
    });
    return !hasCommittedOrRun;
  }

  let result = await callUpstream(messages);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });

  // Ollama does NOT reliably honor tool_choice:"required" for local models — qwen2.5:14b has been
  // observed ignoring it entirely and returning plain prose even on a brand-new conversation's
  // very first turn. Since we can't force this at the API level, compensate by retrying with an
  // increasingly explicit nudge appended as a user message whenever a tool call was actually
  // required (per shouldForceToolCall) but the model didn't produce one — bounded so a genuinely
  // stubborn model can't loop forever.
  let conversationSoFar = messages;
  let nudgeAttempts = 0;
  const MAX_NUDGE_ATTEMPTS = 3;
  while ((result.message.tool_calls?.length ?? 0) === 0 && shouldForceToolCall(conversationSoFar) && nudgeAttempts < MAX_NUDGE_ATTEMPTS) {
    nudgeAttempts++;
    console.log(`[AiChat] model returned prose with no tool call when one was required — nudge attempt ${nudgeAttempts}/${MAX_NUDGE_ATTEMPTS}`);
    conversationSoFar = [...conversationSoFar, result.message, { role: "user", content: "You must call a tool now — do not just describe or narrate what you're about to do. Call the actual tool with real arguments." }];
    const retryResult = await callUpstream(conversationSoFar);
    if ("error" in retryResult) return Response.json({ error: retryResult.error }, { status: retryResult.status });
    result = retryResult;
  }

  return Response.json({ message: result.message });
}
