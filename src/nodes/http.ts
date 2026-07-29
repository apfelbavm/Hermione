import { registerNode } from "../engine/registry";
import { compileResultVar } from "../engine/compileUtils";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

// Written ONCE as a plain-JS source string, derived via `new Function` for the interpreter's own use
// and embedded verbatim as this node's compileHelpers entry for the compiled path — same reasoning
// as debug.ts's formatForLog and auth.oauth2Saml's oauth2SamlExchange, so there's exactly one
// implementation, not two hand-kept copies that could drift. No compileImports needed:
// fetch/AbortController/URLSearchParams/JSON are all globals in both the browser and plain Node.
const HTTP_REQUEST_EXECUTE_SOURCE = `
async function httpRequestExecute(url, rawMethod, headersJson, auth, body, rawTimeoutMs) {
  const method = String(rawMethod ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const timeoutMs = Math.round(Number(rawTimeoutMs ?? 0));

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const rawHeaders = String(headersJson ?? "").trim();
    const headers = rawHeaders ? JSON.parse(rawHeaders) : undefined;

    // See auth.ts — any wired auth node's { header, value } output wins over a same-named entry
    // typed directly into Headers (JSON), since it's the more explicit/intentional of the two.
    const mergedHeaders =
      auth && typeof auth.header === "string" && typeof auth.value === "string"
        ? { ...(headers ?? {}), [auth.header]: auth.value }
        : headers;

    const res = await fetch(url, {
      method: method,
      headers: mergedHeaders,
      body: hasBody ? String(body ?? "") : undefined,
      signal: controller.signal,
    });
    const responseBody = await res.text();
    const responseHeaders = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: res.status,
      success: res.ok,
      responseBody: responseBody,
      responseHeaders: JSON.stringify(responseHeaders),
      error: "",
    };
  } catch (err) {
    return {
      status: 0,
      success: false,
      responseBody: "",
      responseHeaders: "{}",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
`;

interface HttpRequestResult {
  status: number;
  success: boolean;
  responseBody: string;
  responseHeaders: string;
  error: string;
  [key: string]: unknown;
}

const httpRequestExecute: (
  url: string,
  method: string,
  headersJson: string,
  auth: { header?: unknown; value?: unknown } | null | undefined,
  body: string,
  timeoutMs: number,
) => Promise<HttpRequestResult> = new Function(`${HTTP_REQUEST_EXECUTE_SOURCE}\nreturn httpRequestExecute;`)();

registerNode({
  type: "http.request",
  label: "HTTP Request",
  description: "Sends an HTTP request with a chosen method, headers, optional auth, and body, returning the response status, body, and headers.",
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
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "status", label: "Status", type: "number", direction: "output" },
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
    const result = await httpRequestExecute(
      String(inputs.url ?? ""),
      String(inputs.method ?? "GET"),
      String(inputs.headers ?? ""),
      inputs.auth as { header?: unknown; value?: unknown } | null | undefined,
      String(inputs.body ?? ""),
      Number(inputs.timeoutMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await httpRequestExecute(${inputs.url}, ${inputs.method}, ${inputs.headers}, ${inputs.auth}, ${inputs.body}, ${inputs.timeoutMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      status: `${v}.status`,
      responseBody: `${v}.responseBody`,
      responseHeaders: `${v}.responseHeaders`,
      error: `${v}.error`,
    };
  },
  compileHelpers: { httpRequestExecute: HTTP_REQUEST_EXECUTE_SOURCE },
});
