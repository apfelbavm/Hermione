export interface AiProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
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
    if (this.isLocalDev()) {
      return {
        baseUrl: process.env.HERMIONE_AI_LOCAL_BASE_URL || "http://localhost:11434/v1",
        // deepseek-r1 is a reasoning-only distill and largely ignores the `tools` schema (answers
        // in prose instead of emitting tool_calls); qwen2.5 has solid native tool-calling support.
        model: process.env.HERMIONE_AI_LOCAL_MODEL || "qwen2.5:7b",
        apiKey: process.env.HERMIONE_AI_LOCAL_API_KEY || "ollama", // Ollama ignores the key but a Bearer value must still be sent
      };
    }

    const apiKey = process.env.HERMIONE_AI_API_KEY;
    if (!apiKey) return null;
    return {
      baseUrl: process.env.HERMIONE_AI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.HERMIONE_AI_MODEL || "gpt-4o-mini",
      apiKey,
    };
  }
}
