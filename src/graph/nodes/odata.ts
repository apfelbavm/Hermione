import { registerNode } from "../engine/registry";
import { compileResultVar } from "../engine/compileUtils";
import { enumOptionIds } from "../engine/enumRegistry";
import { ODATA_PAGINATION_TYPE_ENUM_TYPE } from "../enum/odata";
import { i18n } from "@i18n";

const PAGINATION_TYPES = enumOptionIds(ODATA_PAGINATION_TYPE_ENUM_TYPE);

// Fetches EVERY page of an OData v2 GET request and returns the combined rows — unlike
// http.request (one call, one response), pagination inherently needs a loop across several
// physical requests, so this is its own node rather than something bolted onto http.request (see
// the conversation that led here). Paging conventions are chosen via the "Pagination Type" pin
// (see PAGINATION_TYPES above):
//  - Client: we drive the loop ourselves, appending "$top"/"$skip" to the given URL and stopping
//    once a page comes back with fewer than Page Size rows.
//  - Server: the server drives it — each OData v2 JSON response carries its own "d.__next" (or
//    "__next") URL for the next page; we just keep following it verbatim (it already encodes its
//    own $skiptoken/paging state) until it's absent.
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

const odataV2RequestExecute: (baseUrl: string, pageSize: number, paginationType: string, maxPages: number, headersJson: string, auth: { header?: unknown; value?: unknown } | null | undefined, timeoutMs: number) => Promise<ODataV2RequestResult> = new Function(
  `${ODATA_V2_REQUEST_EXECUTE_SOURCE}\nreturn odataV2RequestExecute;`,
)();

registerNode({
  type: "odata.v2Request",
  label: i18n.nodes.odata.v2Request.label,
  description: i18n.nodes.odata.v2Request.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "url", label: i18n.nodes.odata.v2Request.pin_url, type: "string", direction: "input", defaultValue: "" },
    { id: "pageSize", label: i18n.nodes.odata.v2Request.pin_page_size, type: "number", direction: "input", defaultValue: 1000, integer: true },
    { id: "paginationType", label: i18n.nodes.odata.v2Request.pin_pagination_type, type: "enum", subType: ODATA_PAGINATION_TYPE_ENUM_TYPE, direction: "input", defaultValue: PAGINATION_TYPES[0], options: PAGINATION_TYPES },
    { id: "maxPages", label: i18n.nodes.odata.v2Request.pin_max_pages, type: "number", direction: "input", defaultValue: 50, integer: true },
    { id: "headers", label: i18n.nodes.odata.v2Request.pin_headers, type: "string", direction: "input", defaultValue: "{}" },
    { id: "auth", label: i18n.nodes.__shared.pin_auth, type: "object", direction: "input", defaultValue: null },
    { id: "timeoutMs", label: i18n.nodes.__shared.pin_timeout, type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.__shared.pin_status, type: "number", direction: "output" },
    { id: "rows", label: i18n.nodes.odata.v2Request.pin_rows, type: "object", container: "array", direction: "output" },
    { id: "pageCount", label: i18n.nodes.odata.v2Request.pin_page_count, type: "number", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
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
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await odataV2RequestExecute(${inputs.url}, ${inputs.pageSize}, ${inputs.paginationType}, ${inputs.maxPages}, ${inputs.headers}, ${inputs.auth}, ${inputs.timeoutMs});`, ...compileFrom("exec-out")],
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
