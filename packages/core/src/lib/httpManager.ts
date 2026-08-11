export interface HttpRequestInputs {
  url: string;
  method: string;
  headersJson: string;
  auth: { header?: unknown; value?: unknown } | null | undefined;
  body: string;
  timeoutMs: number;
}

export interface HttpRequestOutputs {
  status: number;
  success: boolean;
  responseBody: string;
  responseHeaders: string;
  error: string;
  [key: string]: unknown;
}

/** Called directly both by the interpreter (see graph/nodes/http.ts's execute) and, via a real ESM
 * import, by a deployed/compiled flow script (see HTTP_MANAGER_IMPORT). Runs under plain Node with no
 * build/transpile step, given NODE_OPTIONS=--experimental-strip-types. */
export class HttpManager {
  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  static async request(inputs: HttpRequestInputs): Promise<HttpRequestOutputs> {
    const method = String(inputs.method ?? "GET").toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const timeoutMs = Math.round(Number(inputs.timeoutMs ?? 0));

    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
      const rawHeaders = String(inputs.headersJson ?? "").trim();
      const headers = rawHeaders ? JSON.parse(rawHeaders) : undefined;

      // See graph/nodes/auth.ts — any wired auth node's { header, value } output wins over a
      // same-named entry typed directly into Headers (JSON), since it's the more explicit/intentional
      // of the two.
      const auth = inputs.auth;
      const mergedHeaders = auth && typeof auth.header === "string" && typeof auth.value === "string" ? { ...(headers ?? {}), [auth.header]: auth.value } : headers;

      const res = await fetch(inputs.url, {
        method,
        headers: mergedHeaders,
        body: hasBody ? String(inputs.body ?? "") : undefined,
        signal: controller.signal,
      });
      const responseBody = await res.text();
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: res.status,
        success: res.ok,
        responseBody,
        responseHeaders: JSON.stringify(responseHeaders),
        error: "",
      };
    } catch (err) {
      return {
        status: 0,
        success: false,
        responseBody: "",
        responseHeaders: "{}",
        error: HttpManager.errorMessage(err),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
