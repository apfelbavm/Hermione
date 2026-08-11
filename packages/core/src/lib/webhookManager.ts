export interface SendWebhookInputs {
  url: string;
  payloadJson: string;
  headersJson: string;
  secret: string;
  signatureHeader: string;
  retryCount: number;
  retryDelayMsBase: number;
  timeoutMs: number;
}

export interface SendWebhookOutputs {
  success: boolean;
  status: number;
  responseBody: string;
  attempts: number;
  error: string;
  [key: string]: unknown;
}

import { delay } from "./retry.ts";

/** Uses the standard Web Crypto API (globalThis.crypto.subtle) rather than node:crypto's HMAC —
 * available in both Node (18+) and the browser, so this stays safe for the interpreter's own
 * client-side use of this file (see webhook.ts's execute), same reasoning as this file avoiding any
 * Node-only import elsewhere. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Called directly both by the interpreter (see graph/nodes/webhook.ts's execute) and, via a real ESM
 * import, by a deployed/compiled flow script (see WEBHOOK_MANAGER_IMPORT). Runs under plain Node with
 * no build/transpile step, given NODE_OPTIONS=--experimental-strip-types. */
export class WebhookManager {
  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /** POSTs a JSON payload to an external URL with two things a plain http.request doesn't offer:
   * optional HMAC-SHA256 request signing (so the receiver can verify the call really came from this
   * Flow) and a bounded retry loop with linear backoff (attempt N waits retryDelayMsBase * N ms)
   * for transient failures. `attempts` in the output is always the number of requests actually sent
   * (1 when it succeeds on the first try), so a graph can tell a flaky success from a first-try one. */
  static async send(inputs: SendWebhookInputs): Promise<SendWebhookOutputs> {
    const body = String(inputs.payloadJson ?? "");
    const timeoutMs = Math.round(Number(inputs.timeoutMs ?? 0));
    const retryCount = Math.max(0, Math.round(Number(inputs.retryCount ?? 0)));
    const retryDelayMsBase = Math.max(0, Math.round(Number(inputs.retryDelayMsBase ?? 0)));

    const rawHeaders = String(inputs.headersJson ?? "").trim();
    const headers: Record<string, string> = rawHeaders ? JSON.parse(rawHeaders) : {};
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";

    const secret = String(inputs.secret ?? "");
    if (secret) {
      headers[String(inputs.signatureHeader || "X-Hermione-Signature")] = await hmacSha256Hex(secret, body);
    }

    let lastError = "";
    const maxAttempts = retryCount + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
      try {
        const res = await fetch(inputs.url, { method: "POST", headers, body, signal: controller.signal });
        const responseBody = await res.text();
        if (res.ok) return { success: true, status: res.status, responseBody, attempts: attempt, error: "" };
        lastError = `HTTP ${res.status}`;
        if (attempt === maxAttempts) return { success: false, status: res.status, responseBody, attempts: attempt, error: lastError };
      } catch (err) {
        lastError = WebhookManager.errorMessage(err);
        if (attempt === maxAttempts) return { success: false, status: 0, responseBody: "", attempts: attempt, error: lastError };
      } finally {
        if (timer) clearTimeout(timer);
      }
      await delay(retryDelayMsBase * attempt);
    }
    return { success: false, status: 0, responseBody: "", attempts: maxAttempts, error: lastError };
  }
}
