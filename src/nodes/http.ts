import { registerNode } from "../engine/registry";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

registerNode({
  type: "http.request",
  label: "HTTP Request",
  group: "Actions",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "method",
      label: "Method",
      type: "string",
      direction: "input",
      defaultValue: "GET",
      options: HTTP_METHODS,
    },
    { id: "url", label: "URL", type: "string", direction: "input", defaultValue: "" },
    { id: "headers", label: "Headers (JSON)", type: "string", direction: "input", defaultValue: "{}" },
    // A plain { header, value } object — see auth.ts for why this is a separate node's output
    // rather than baked-in credential pins here, and how it composes with an object Variable.
    { id: "auth", label: "Auth", type: "object", direction: "input", defaultValue: null },
    { id: "body", label: "Body", type: "string", direction: "input", defaultValue: "" },
    { id: "timeoutMs", label: "Timeout (ms)", type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: "Completed", type: "exec", direction: "output" },
    { id: "status", label: "Status", type: "number", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "responseBody", label: "Response Body", type: "string", direction: "output" },
    { id: "responseHeaders", label: "Response Headers", type: "string", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  latent: true,
  // Fires exec-out exactly once, on both success AND failure (network error, timeout, bad JSON
  // headers) — callers branch off the "success"/"error" outputs themselves via an existing Branch
  // node, same single-exec-out convention as Delay/Send Email rather than inventing separate
  // success/failure exec paths.
  execute: async ({ inputs }) => {
    const url = String(inputs.url ?? "");
    const method = String(inputs.method ?? "GET").toUpperCase();
    const timeoutMs = Math.round(Number(inputs.timeoutMs ?? 0));
    const hasBody = method !== "GET" && method !== "HEAD";

    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
      const rawHeaders = String(inputs.headers ?? "").trim();
      const headers: Record<string, string> | undefined = rawHeaders ? JSON.parse(rawHeaders) : undefined;

      // See auth.ts — any wired auth node's { header, value } output wins over a same-named entry
      // typed directly into Headers (JSON), since it's the more explicit/intentional of the two.
      const auth = inputs.auth as { header?: unknown; value?: unknown } | null | undefined;
      const mergedHeaders =
        auth && typeof auth.header === "string" && typeof auth.value === "string"
          ? { ...(headers ?? {}), [auth.header]: auth.value }
          : headers;

      const res = await fetch(url, {
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
        nextExec: "exec-out",
        outputs: {
          status: res.status,
          success: res.ok,
          responseBody,
          responseHeaders: JSON.stringify(responseHeaders),
          error: "",
        },
      };
    } catch (err) {
      return {
        nextExec: "exec-out",
        outputs: {
          status: 0,
          success: false,
          responseBody: "",
          responseHeaders: "{}",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
  // Compiler support (compileExecute/compileEvaluate) is intentionally out of scope for now, same
  // call as For Loop's "index" output and function.call's outputs — no exec node with data outputs
  // has compileEvaluate support yet. Compiling a graph containing one throws the existing
  // "no compileExecute" error, an honest failure mode until that lands.
});
