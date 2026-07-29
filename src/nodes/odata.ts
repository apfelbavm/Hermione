import { registerNode } from "../engine/registry";
import { compileResultVar } from "../engine/compileUtils";

/** The three paging modes SAP's Integration Suite exposes for its own OData V2 adapter, matched
 * here verbatim so this node's dropdown reads the same way — used both as the option values AND
 * the string compared against at runtime, same convention as http.ts's HTTP_METHODS. Mechanically,
 * from an HTTP client's point of view, "cursor-based" and "snapshot-based" server-driven paging are
 * indistinguishable: both are just "keep following whatever next-link the server hands back."
 * Cursor vs. snapshot is a SERVER-side consistency guarantee (whether the underlying data can shift
 * under you mid-traversal, vs. a frozen point-in-time result set) — it changes what the server
 * does when it builds each next-link, not what the client sends to get there. So both server modes
 * share the exact same request-side code path below; they're kept as separate dropdown entries
 * purely so a graph reads as "which server behavior was this built against" at a glance, matching
 * the adapter's own configuration. If SuccessFactors (or another backend) turns out to need an
 * extra header/query param to actually select cursor vs. snapshot mode server-side, that's the one
 * piece this doesn't yet do — add it once we know what it is. */
const PAGINATION_TYPES = ["Client", "Server (cursor-based)", "Server (snapshot-based)"];

// Fetches EVERY page of an OData v2 GET request and returns the combined rows — unlike
// http.request (one call, one response), pagination inherently needs a loop across several
// physical requests, so this is its own node rather than something bolted onto http.request (see
// the conversation that led here). Paging conventions are chosen via the "Pagination Type" pin
// (see PAGINATION_TYPES above):
//  - Client: we drive the loop ourselves, appending "$top"/"$skip" to the given URL and stopping
//    once a page comes back with fewer than Page Size rows.
//  - Server (cursor-based) / Server (snapshot-based): the server drives it — each OData v2 JSON
//    response carries its own "d.__next" (or "__next") URL for the next page; we just keep
//    following it verbatim (it already encodes its own $skiptoken/paging state) until it's absent.
// Written ONCE as a plain-JS source string (see http.ts's HTTP_REQUEST_EXECUTE_SOURCE for the same
// reasoning) — derived via `new Function` for the interpreter's own use and embedded verbatim as
// this node's compileHelpers entry for the compiled path. Deliberately self-contained (its own
// per-page fetch/timeout/header-merge logic) rather than calling into http.ts's httpRequestExecute:
// a `new Function`-derived helper only has the global scope available to it, not this module's
// other declarations, so cross-calling would require re-deriving httpRequestExecute into the same
// global scope anyway — simpler to keep this one node fully self-contained, at the cost of a little
// duplicated fetch/timeout/header-merge logic with http.ts.
const ODATA_V2_REQUEST_EXECUTE_SOURCE = `
async function odataV2RequestExecute(baseUrl, rawPageSize, paginationType, rawMaxPages, headersJson, auth, rawTimeoutMs) {
  const HARD_MAX_PAGES = 1000; // absolute ceiling regardless of Max Pages, guards a misbehaving server
  // Falls back to 1000 — a generous default that matches the common OData v2 server-side default/
  // cap (e.g. SuccessFactors) — only when Page Size itself is unset/invalid; unrelated to
  // HARD_MAX_PAGES just above despite sharing the same number.
  const top = Math.max(1, Math.round(Number(rawPageSize)) || 1000);
  const userCap = Math.max(1, Math.round(Number(rawMaxPages)) || 50);
  const cap = Math.min(userCap, HARD_MAX_PAGES);
  const serverDriven = paginationType !== ${JSON.stringify(PAGINATION_TYPES[0])};
  const timeoutMs = Math.round(Number(rawTimeoutMs) || 0);

  const rawHeaders = String(headersJson ?? "").trim();
  let mergedHeaders;
  try {
    const parsedHeaders = rawHeaders ? JSON.parse(rawHeaders) : undefined;
    mergedHeaders =
      auth && typeof auth.header === "string" && typeof auth.value === "string"
        ? Object.assign({}, parsedHeaders, { [auth.header]: auth.value })
        : parsedHeaders;
  } catch (err) {
    return { success: false, status: 0, rows: [], pageCount: 0, error: "Headers (JSON) is not valid JSON: " + (err instanceof Error ? err.message : String(err)) };
  }

  function withParam(url, key, value) {
    const u = new URL(url);
    u.searchParams.set(key, String(value));
    // URLSearchParams percent-encodes "$" to "%24" — technically equivalent, but OData servers
    // conventionally expect "$top"/"$skip" sent unescaped, and not every server bothers to decode
    // its own query string before pattern-matching on it. Safe to undo globally: "%24" has no other
    // realistic source here (it's specific to the "$" this function itself just introduced).
    return u.toString().replace(/%24/g, "$");
  }

  function extractRows(parsed) {
    const d = parsed && parsed.d;
    if (d && Array.isArray(d.results)) return d.results;
    if (Array.isArray(d)) return d;
    if (parsed && Array.isArray(parsed.value)) return parsed.value; // tolerate a v4-ish shape too
    return [];
  }

  function extractNextLink(parsed) {
    const d = parsed && parsed.d;
    if (d && typeof d.__next === "string" && d.__next) return d.__next;
    if (parsed && typeof parsed.__next === "string" && parsed.__next) return parsed.__next;
    return null;
  }

  async function fetchOnePage(url) {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await fetch(url, { method: "GET", headers: mergedHeaders, signal: controller.signal });
      return { status: res.status, ok: res.ok, bodyText: await res.text() };
    } catch (err) {
      return { status: 0, ok: false, bodyText: "", error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let rows = [];
  let page = 0;
  let status = 0;
  let nextUrl = serverDriven ? withParam(baseUrl, "$top", top) : withParam(withParam(baseUrl, "$top", top), "$skip", 0);

  while (nextUrl && page < cap) {
    const res = await fetchOnePage(nextUrl);
    status = res.status;
    if (!res.ok) {
      return { success: false, status, rows, pageCount: page, error: res.error || ("HTTP " + res.status) };
    }

    let parsed;
    try {
      parsed = JSON.parse(res.bodyText);
    } catch {
      return { success: false, status, rows, pageCount: page, error: "OData response was not valid JSON" };
    }

    const pageRows = extractRows(parsed);
    rows = rows.concat(pageRows);
    page += 1;

    if (serverDriven) {
      nextUrl = extractNextLink(parsed);
    } else {
      nextUrl = pageRows.length < top ? null : withParam(withParam(baseUrl, "$top", top), "$skip", page * top);
    }
  }

  return { success: true, status, rows, pageCount: page, error: "" };
}
`;

interface ODataV2RequestResult {
  success: boolean;
  status: number;
  rows: unknown[];
  pageCount: number;
  error: string;
  [key: string]: unknown;
}

const odataV2RequestExecute: (
  baseUrl: string,
  pageSize: number,
  paginationType: string,
  maxPages: number,
  headersJson: string,
  auth: { header?: unknown; value?: unknown } | null | undefined,
  timeoutMs: number,
) => Promise<ODataV2RequestResult> = new Function(
  `${ODATA_V2_REQUEST_EXECUTE_SOURCE}\nreturn odataV2RequestExecute;`,
)();

registerNode({
  type: "odata.v2Request",
  label: "OData V2 Request",
  description:
    "Fetches every page of an OData v2 GET request — client-driven $top/$skip (1000 rows per page by default) or server-driven cursor/snapshot next-link paging — and returns the combined rows.",
  group: "Actions",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "url", label: "URL", type: "string", direction: "input", defaultValue: "" },
    // 1000 rows/page by default — a common OData v2 server-side default/cap (e.g. SuccessFactors),
    // so a freshly-dropped node's out-of-the-box behavior already matches what most servers allow.
    { id: "pageSize", label: "Page Size", type: "number", direction: "input", defaultValue: 1000, integer: true },
    {
      id: "paginationType",
      label: "Pagination Type",
      type: "string",
      direction: "input",
      defaultValue: PAGINATION_TYPES[0],
      options: PAGINATION_TYPES,
    },
    { id: "maxPages", label: "Max Pages", type: "number", direction: "input", defaultValue: 50, integer: true },
    { id: "headers", label: "Headers (JSON)", type: "string", direction: "input", defaultValue: "{}" },
    // Same { header, value } convention as http.request's own Auth pin — see auth.ts.
    { id: "auth", label: "Auth", type: "object", direction: "input", defaultValue: null },
    { id: "timeoutMs", label: "Timeout (ms)", type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: "Completed", type: "exec", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "status", label: "Status", type: "number", direction: "output" },
    { id: "rows", label: "Rows", type: "object", container: "array", direction: "output" },
    { id: "pageCount", label: "Page Count", type: "number", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  latent: true,
  // Fires exec-out exactly once, whether every page fetched cleanly or a later page failed midway
  // (in which case "rows" still holds whatever was gathered before the failure) — same single-
  // exec-out convention as http.request rather than inventing separate success/failure exec paths.
  execute: async ({ inputs }) => {
    const result = await odataV2RequestExecute(
      String(inputs.url ?? ""),
      Number(inputs.pageSize ?? 1000),
      String(inputs.paginationType ?? PAGINATION_TYPES[0]),
      Number(inputs.maxPages ?? 50),
      String(inputs.headers ?? ""),
      inputs.auth as { header?: unknown; value?: unknown } | null | undefined,
      Number(inputs.timeoutMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await odataV2RequestExecute(${inputs.url}, ${inputs.pageSize}, ${inputs.paginationType}, ${inputs.maxPages}, ${inputs.headers}, ${inputs.auth}, ${inputs.timeoutMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      status: `${v}.status`,
      rows: `${v}.rows`,
      pageCount: `${v}.pageCount`,
      error: `${v}.error`,
    };
  },
  compileHelpers: { odataV2RequestExecute: ODATA_V2_REQUEST_EXECUTE_SOURCE },
});
