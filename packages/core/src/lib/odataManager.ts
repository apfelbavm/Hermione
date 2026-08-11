export interface ODataV2RequestInputs {
  baseUrl: string;
  pageSize: number;
  paginationType: string;
  maxPages: number;
  headersJson: string;
  auth: { header?: unknown; value?: unknown } | null | undefined;
  timeoutMs: number;
}

export interface ODataV2RequestOutputs {
  success: boolean;
  status: number;
  rows: unknown[];
  pageCount: number;
  error: string;
  [key: string]: unknown;
}

/** Called directly both by the interpreter (see graph/nodes/odata.ts's execute) and, via a real ESM
 * import, by a deployed/compiled flow script (see ODATA_MANAGER_IMPORT). Runs under plain Node with no
 * build/transpile step, given NODE_OPTIONS=--experimental-strip-types. */
export class ODataManager {
  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /** Fetches EVERY page of an OData v2 GET request and returns the combined rows — unlike a single
   * HTTP request (one call, one response), pagination inherently needs a loop across several physical
   * requests. Paging conventions are chosen via `paginationType` (see enum/odata.ts's
   * ODATA_PAGINATION_TYPE_ENUM_TYPE):
   *  - "Client": we drive the loop ourselves, appending "$top"/"$skip" to the given URL and stopping
   *    once a page comes back with fewer than pageSize rows.
   *  - "Server": the server drives it — each OData v2 JSON response carries its own "d.__next" (or
   *    "__next") URL for the next page; we just keep following it verbatim (it already encodes its
   *    own $skiptoken/paging state) until it's absent. */
  static async v2Request(inputs: ODataV2RequestInputs): Promise<ODataV2RequestOutputs> {
    const HARD_MAX_PAGES = 1000; // absolute ceiling regardless of maxPages, guards a misbehaving server
    // Falls back to 1000 — a generous default that matches the common OData v2 server-side default/
    // cap (e.g. SuccessFactors) — only when pageSize itself is unset/invalid; unrelated to
    // HARD_MAX_PAGES just above despite sharing the same number.
    const top = Math.max(1, Math.round(Number(inputs.pageSize)) || 1000);
    const userCap = Math.max(1, Math.round(Number(inputs.maxPages)) || 50);
    const cap = Math.min(userCap, HARD_MAX_PAGES);
    const serverDriven = inputs.paginationType !== "Client";
    const timeoutMs = Math.round(Number(inputs.timeoutMs) || 0);

    const rawHeaders = String(inputs.headersJson ?? "").trim();
    let mergedHeaders: Record<string, string> | undefined;
    try {
      const parsedHeaders = rawHeaders ? JSON.parse(rawHeaders) : undefined;
      const auth = inputs.auth;
      mergedHeaders = auth && typeof auth.header === "string" && typeof auth.value === "string" ? { ...parsedHeaders, [auth.header]: auth.value } : parsedHeaders;
    } catch (err) {
      return { success: false, status: 0, rows: [], pageCount: 0, error: `Headers (JSON) is not valid JSON: ${ODataManager.errorMessage(err)}` };
    }

    function withParam(url: string, key: string, value: unknown): string {
      const u = new URL(url);
      u.searchParams.set(key, String(value));
      // URLSearchParams percent-encodes "$" to "%24" — technically equivalent, but OData servers
      // conventionally expect "$top"/"$skip" sent unescaped, and not every server bothers to decode
      // its own query string before pattern-matching on it. Safe to undo globally: "%24" has no other
      // realistic source here (it's specific to the "$" this function itself just introduced).
      return u.toString().replace(/%24/g, "$");
    }

    function extractRows(parsed: any): unknown[] {
      const d = parsed && parsed.d;
      if (d && Array.isArray(d.results)) return d.results;
      if (Array.isArray(d)) return d;
      if (parsed && Array.isArray(parsed.value)) return parsed.value; // tolerate a v4-ish shape too
      return [];
    }

    function extractNextLink(parsed: any): string | null {
      const d = parsed && parsed.d;
      if (d && typeof d.__next === "string" && d.__next) return d.__next;
      if (parsed && typeof parsed.__next === "string" && parsed.__next) return parsed.__next;
      return null;
    }

    async function fetchOnePage(url: string): Promise<{ status: number; ok: boolean; bodyText: string; error?: string }> {
      const controller = new AbortController();
      const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
      try {
        const res = await fetch(url, { method: "GET", headers: mergedHeaders, signal: controller.signal });
        return { status: res.status, ok: res.ok, bodyText: await res.text() };
      } catch (err) {
        return { status: 0, ok: false, bodyText: "", error: ODataManager.errorMessage(err) };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    let rows: unknown[] = [];
    let page = 0;
    let status = 0;
    let nextUrl: string | null = serverDriven ? withParam(inputs.baseUrl, "$top", top) : withParam(withParam(inputs.baseUrl, "$top", top), "$skip", 0);

    while (nextUrl && page < cap) {
      const res = await fetchOnePage(nextUrl);
      status = res.status;
      if (!res.ok) {
        return { success: false, status, rows, pageCount: page, error: res.error || `HTTP ${res.status}` };
      }

      let parsed: any;
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
        nextUrl = pageRows.length < top ? null : withParam(withParam(inputs.baseUrl, "$top", top), "$skip", page * top);
      }
    }

    return { success: true, status, rows, pageCount: page, error: "" };
  }
}
