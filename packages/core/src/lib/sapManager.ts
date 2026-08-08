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
 * service can still be reached via the existing generic soap.call node (src/graph/nodes/soap.ts).
 *
 * Credential resolution mirrors twilioManager.ts: this manager reaches the Credential Vault database
 * directly via findCredential/resolveAllCredentials, so both the interpreter (nodes/sap.ts) and the
 * compiled/deployed path call the same static methods here — there is no separate
 * functionLibrarySap.ts env-var-reading layer. */
import { executeHttpRequest } from "@sap-cloud-sdk/http-client";
import type { HttpDestination } from "@sap-cloud-sdk/connectivity";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { SapBasicAuthCredentialData } from "@hermione/shared/types";

export interface SapAuth {
  baseUrl: string;
  client: string;
  username: string;
  password: string;
}

interface SapErrorBody {
  error?: { code?: string; message?: { value?: string }; innererror?: unknown };
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

const managerCache = new Map<string, SapManager>();

export class SapManager {
  private readonly destination: HttpDestination;

  static getInstance(auth: SapAuth): SapManager {
    const key = `${auth.baseUrl}:${auth.client}:${auth.username}:${auth.password}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new SapManager(auth.baseUrl, auth.client, auth.username, auth.password);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(baseUrl: string, client: string, username: string, password: string) {
    this.destination = { url: baseUrl, sapClient: client, username, password, authentication: "BasicAuthentication" };
  }

  static errorMessage(err: unknown): string {
    if (err && typeof err === "object" && "response" in err) {
      const response = (err as { response?: { data?: unknown; status?: number; statusText?: string } }).response;
      const body = (response?.data ?? {}) as SapErrorBody;
      if (body.error?.message?.value) return body.error.message.value;
      if (response?.statusText) return `SAP OData error (status ${response.status}): ${response.statusText}`;
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: SapAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "sapBasicAuth") return { ok: false, error: `Credential "${credentialName}" is not a SAP Basic Auth credential` };
    const data = credRecord.data as SapBasicAuthCredentialData;
    return { ok: true, auth: { baseUrl: data.baseUrl, client: data.client, username: data.username, password: data.password } };
  }

  static async getEntitySet(credentialName: string, servicePath: string, entitySet: string, queryOptions: string): Promise<SapGetEntitySetResult> {
    const cred = await SapManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, results: [], error: cred.error };
    return SapManager.getInstance(cred.auth).getEntitySet(servicePath, entitySet, queryOptions);
  }

  static async getEntity(credentialName: string, servicePath: string, entitySet: string, keyPredicate: string): Promise<SapGetEntityResult> {
    const cred = await SapManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, entity: {}, error: cred.error };
    return SapManager.getInstance(cred.auth).getEntity(servicePath, entitySet, keyPredicate);
  }

  static async createEntity(credentialName: string, servicePath: string, entitySet: string, bodyJson: Record<string, unknown>): Promise<SapCreateEntityResult> {
    const cred = await SapManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, entity: {}, error: cred.error };
    return SapManager.getInstance(cred.auth).createEntity(servicePath, entitySet, bodyJson);
  }

  static async updateEntity(credentialName: string, servicePath: string, entitySet: string, keyPredicate: string, bodyJson: Record<string, unknown>): Promise<SapOpResult> {
    const cred = await SapManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SapManager.getInstance(cred.auth).updateEntity(servicePath, entitySet, keyPredicate, bodyJson);
  }

  static async deleteEntity(credentialName: string, servicePath: string, entitySet: string, keyPredicate: string): Promise<SapOpResult> {
    const cred = await SapManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SapManager.getInstance(cred.auth).deleteEntity(servicePath, entitySet, keyPredicate);
  }

  private async getEntitySet(servicePath: string, entitySet: string, queryOptions: string): Promise<SapGetEntitySetResult> {
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
      return { success: false, results: [], error: SapManager.errorMessage(err) };
    }
  }

  private async getEntity(servicePath: string, entitySet: string, keyPredicate: string): Promise<SapGetEntityResult> {
    try {
      const res = await executeHttpRequest(this.destination, { method: "GET", url: `${servicePath}/${entitySet}(${keyPredicate})`, params: { $format: "json" } });
      const d = (res.data as { d?: Record<string, unknown> })?.d;
      return { success: true, entity: d ?? {}, error: "" };
    } catch (err) {
      return { success: false, entity: {}, error: SapManager.errorMessage(err) };
    }
  }

  private async createEntity(servicePath: string, entitySet: string, bodyJson: Record<string, unknown>): Promise<SapCreateEntityResult> {
    try {
      const res = await executeHttpRequest(this.destination, { method: "POST", url: `${servicePath}/${entitySet}`, headers: { "Content-Type": "application/json", Accept: "application/json" }, data: bodyJson });
      const d = (res.data as { d?: Record<string, unknown> })?.d;
      return { success: true, entity: d ?? {}, error: "" };
    } catch (err) {
      return { success: false, entity: {}, error: SapManager.errorMessage(err) };
    }
  }

  private async updateEntity(servicePath: string, entitySet: string, keyPredicate: string, bodyJson: Record<string, unknown>): Promise<SapOpResult> {
    try {
      // SAP Gateway traditionally expects the X-HTTP-Method override on a POST rather than a literal
      // MERGE/PATCH verb, since many HTTP clients/environments can't send one.
      await executeHttpRequest(this.destination, { method: "POST", url: `${servicePath}/${entitySet}(${keyPredicate})`, headers: { "X-HTTP-Method": "MERGE", "Content-Type": "application/json", Accept: "application/json" }, data: bodyJson });
      // SAP typically returns 204 No Content on a successful MERGE — nothing to parse.
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SapManager.errorMessage(err) };
    }
  }

  private async deleteEntity(servicePath: string, entitySet: string, keyPredicate: string): Promise<SapOpResult> {
    try {
      await executeHttpRequest(this.destination, { method: "DELETE", url: `${servicePath}/${entitySet}(${keyPredicate})` });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SapManager.errorMessage(err) };
    }
  }
}
