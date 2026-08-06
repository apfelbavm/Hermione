/** Thin wrapper around the official SAP Cloud SDK for JavaScript's `@sap-cloud-sdk/http-client` +
 * `@sap-cloud-sdk/connectivity` packages, covering SAP's OData/Gateway REST surface (S/4HANA and
 * SAP Gateway-fronted systems). Both packages transitively depend on Node-only packages
 * (jsonwebtoken, @sap/xssec, jks-js, etc. — see `connectivity`'s package.json) and must never be
 * imported by browser-bundled code (see nodes/sap.ts's own header comment for how that's enforced,
 * same pattern as the twilio/stripe/smtp connectors).
 *
 * `executeHttpRequest(destination, requestConfig, options)` replaces the hand-rolled fetch/CSRF
 * code this file used to contain: a plain `Destination` object literal ({url, sapClient, username,
 * password}) covers our simple Basic-auth credential model without needing SAP BTP's destination
 * service, and the SDK's built-in CSRF middleware automatically fetches and replays the
 * `X-CSRF-Token` handshake SAP OData requires for write operations — the SDK fetches it itself by
 * default for any non-GET request (`HttpRequestOptions.fetchCsrfToken`, default `true`).
 *
 * `@sap-cloud-sdk/odata-v2` was deliberately NOT adopted: its request builders (`GetAllRequestBuilder`,
 * `CreateRequestBuilder`, etc.) operate on typed `Entity` subclasses normally generated at build time
 * by the separate `@sap-cloud-sdk/generator` package from a service's EDMX metadata — it has no
 * generic/dynamic way to address an arbitrary entity set by a runtime string, which is what every
 * node in this connector needs (`servicePath`/`entitySet` are free-text input pins).
 *
 * SAP's proprietary IDoc/BAPI/RFC protocols still require the NetWeaver RFC SDK (not available via
 * npm, and not something either of the adopted packages provides) and remain out of scope here; this
 * connector only covers OData/Gateway services. RFC-enabled function modules exposed as a SOAP web
 * service can still be reached via the existing generic soap.call node (src/graph/nodes/soap.ts). */
import { executeHttpRequest } from "@sap-cloud-sdk/http-client";
import type { HttpDestination } from "@sap-cloud-sdk/connectivity";

interface SapErrorBody {
  error?: { code?: string; message?: { value?: string }; innererror?: unknown };
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: unknown; status?: number; statusText?: string } }).response;
    const body = (response?.data ?? {}) as SapErrorBody;
    if (body.error?.message?.value) return body.error.message.value;
    if (response?.statusText) return `SAP OData error (status ${response.status}): ${response.statusText}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface SapOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface SapGetEntitySetResult extends SapOpResult {
  results: Record<string, unknown>[];
}

export interface SapGetEntityResult extends SapOpResult {
  entity: Record<string, unknown>;
}

export interface SapCreateEntityResult extends SapOpResult {
  entity: Record<string, unknown>;
}

export class SapManager {
  private readonly destination: HttpDestination;

  constructor(baseUrl: string, client: string, username: string, password: string) {
    this.destination = { url: baseUrl, sapClient: client, username, password, authentication: "BasicAuthentication" };
  }

  async getEntitySet(servicePath: string, entitySet: string, queryOptions: string): Promise<SapGetEntitySetResult> {
    try {
      const params: Record<string, string> = { $format: "json" };
      if (queryOptions) {
        for (const pair of queryOptions.split("&")) {
          const [key, value] = pair.split("=");
          if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
        }
      }
      const res = await executeHttpRequest(this.destination, { method: "GET", url: `${servicePath}/${entitySet}`, params });
      const d = (res.data as { d?: { results?: Record<string, unknown>[] } })?.d;
      return { success: true, results: d?.results ?? [], error: "" };
    } catch (err) {
      return { success: false, results: [], error: errorMessage(err) };
    }
  }

  async getEntity(servicePath: string, entitySet: string, keyPredicate: string): Promise<SapGetEntityResult> {
    try {
      const res = await executeHttpRequest(this.destination, { method: "GET", url: `${servicePath}/${entitySet}(${keyPredicate})`, params: { $format: "json" } });
      const d = (res.data as { d?: Record<string, unknown> })?.d;
      return { success: true, entity: d ?? {}, error: "" };
    } catch (err) {
      return { success: false, entity: {}, error: errorMessage(err) };
    }
  }

  async createEntity(servicePath: string, entitySet: string, bodyJson: Record<string, unknown>): Promise<SapCreateEntityResult> {
    try {
      const res = await executeHttpRequest(this.destination, { method: "POST", url: `${servicePath}/${entitySet}`, headers: { "Content-Type": "application/json", Accept: "application/json" }, data: bodyJson });
      const d = (res.data as { d?: Record<string, unknown> })?.d;
      return { success: true, entity: d ?? {}, error: "" };
    } catch (err) {
      return { success: false, entity: {}, error: errorMessage(err) };
    }
  }

  async updateEntity(servicePath: string, entitySet: string, keyPredicate: string, bodyJson: Record<string, unknown>): Promise<SapOpResult> {
    try {
      // SAP Gateway traditionally expects the X-HTTP-Method override on a POST rather than a literal
      // MERGE/PATCH verb, since many HTTP clients/environments can't send one.
      await executeHttpRequest(this.destination, { method: "POST", url: `${servicePath}/${entitySet}(${keyPredicate})`, headers: { "X-HTTP-Method": "MERGE", "Content-Type": "application/json", Accept: "application/json" }, data: bodyJson });
      // SAP typically returns 204 No Content on a successful MERGE — nothing to parse.
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async deleteEntity(servicePath: string, entitySet: string, keyPredicate: string): Promise<SapOpResult> {
    try {
      await executeHttpRequest(this.destination, { method: "DELETE", url: `${servicePath}/${entitySet}(${keyPredicate})` });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }
}
