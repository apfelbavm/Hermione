export interface AiProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  /** The model's context window in tokens, when known — lets the chat UI warn as a conversation
   * approaches the point where Ollama/the provider will start truncating it. Undefined for hosted
   * providers whose exact limit for the configured model isn't tracked here. */
  contextWindow?: number;
}

/** Picks which AI backend the chat route talks to: a locally hosted Ollama instance while
 * running `next dev`, or the configured OpenAI-compatible provider once deployed (`next build`
 * sets NODE_ENV=production, matching Vercel/production runtimes). Both are OpenAI-compatible
 * chat-completions endpoints, so the caller (app/api/ai/chat/route.ts) doesn't need to branch. */
export class AiManager {
  private static isLocalDev(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  /** Returns null when running deployed without HERMIONE_AI_API_KEY configured — the local dev
   * path never returns null since Ollama needs no key. */
  static getConfig(): AiProviderConfig | null {
    // Small local models are far more prone to hallucinating tool calls (e.g. inventing a Google
    // Docs/Jira tool that was never in the schema) at higher sampling temperatures — keep this low
    // by default for tool-call reliability rather than answer variety.
    const temperature = Number(process.env.HERMIONE_AI_TEMPERATURE ?? 0.2);
    if (this.isLocalDev()) {
      return {
        baseUrl: process.env.HERMIONE_AI_LOCAL_BASE_URL || "http://localhost:11434/v1",
        // deepseek-r1 is a reasoning-only distill and largely ignores the `tools` schema (answers
        // in prose instead of emitting tool_calls); qwen2.5 has solid native tool-calling support.
        // 14b (9GB) is meaningfully more reliable at staying on-task through multi-step tool
        // sequences than 7b, at the cost of slower responses — worth it given tool_choice="required"
        // already fixed the earlier prose-only-reply failure mode independent of model size.
        // "qwen2.5-14b-16k" is a local Modelfile-derived alias (`FROM qwen2.5:14b` + `PARAMETER
        // num_ctx 16384`) — Ollama's OpenAI-compatible /v1/chat/completions endpoint does NOT
        // honor a request-level `options.num_ctx` override, so the only reliable way to raise the
        // context window is baking it into the model itself via `ollama create`. Without this, the
        // system prompt + full tool schema alone (~4000-4090 tokens) leaves almost no room in the
        // default 4096-token window for the model's actual response, causing it to get cut off
        // after only a handful of tokens and fall back to generic prose instead of a tool call.
        model: process.env.HERMIONE_AI_LOCAL_MODEL || "qwen2.5-14b-16k",
        apiKey: process.env.HERMIONE_AI_LOCAL_API_KEY || "ollama", // Ollama ignores the key but a Bearer value must still be sent
        temperature,
        contextWindow: Number(process.env.HERMIONE_AI_LOCAL_CONTEXT_WINDOW ?? 16384),
      };
    }

    const apiKey = process.env.HERMIONE_AI_API_KEY;
    if (!apiKey) return null;
    return {
      baseUrl: process.env.HERMIONE_AI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.HERMIONE_AI_MODEL || "gpt-4o-mini",
      temperature,
      apiKey,
    };
  }
}
