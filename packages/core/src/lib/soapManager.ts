import { createClientAsync, BasicAuthSecurity, WSSecurity, type Client } from "soap";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { SoapBasicAuthCredentialData } from "@hermione/shared/types";

/** Calls a SOAP web service via the official "soap" (node-soap) SDK — a real WSDL-driven client
 * (schema parsing, envelope building, SOAP faults), which is a Node-only dependency ("soap" itself,
 * transitively "axios"/"sax"/etc.) this project deliberately does NOT want pulled into the
 * interpreter/browser bundle (see nodes/soap.ts's own header comment for how that's enforced).
 *
 * Credential resolution mirrors twilioManager.ts: this manager reaches the Credential Vault
 * database directly via findCredential/resolveAllCredentials, so both the interpreter (nodes/soap.ts)
 * and the compiled/deployed path call the exact same static methods here — there is no separate
 * functionLibrarySoap.ts env-var-reading layer. Unlike Twilio's account SID/token, the WSDL URL
 * itself still varies per call (a single credential only fixes the security mode/username/password),
 * so — unlike TwilioManager's persistent SDK client — an instance here just holds the resolved auth
 * and builds a fresh "soap" client per call, since createClientAsync itself is what does the
 * (necessarily per-WSDL) network fetch/parse. */

export interface SoapAuth {
  security: string;
  username: string;
  password: string;
  wsSecurityPasswordType: string;
}

export interface SoapOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface SoapCallResult extends SoapOpResult {
  result: string;
  rawRequest: string;
  rawResponse: string;
}

export interface SoapDescribeResult extends SoapOpResult {
  descriptionJson: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const managerCache = new Map<string, SoapManager>();

export class SoapManager {
  private readonly security: string;
  private readonly username: string;
  private readonly password: string;
  private readonly wsSecurityPasswordType: string;

  static getInstance(auth: SoapAuth): SoapManager {
    const key = `${auth.security}:${auth.username}:${auth.password}:${auth.wsSecurityPasswordType}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new SoapManager(auth.security, auth.username, auth.password, auth.wsSecurityPasswordType);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(security: string, username: string, password: string, wsSecurityPasswordType: string) {
    this.security = security;
    this.username = username;
    this.password = password;
    this.wsSecurityPasswordType = wsSecurityPasswordType;
  }

  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: SoapAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "soapBasicAuth") return { ok: false, error: `Credential "${credentialName}" is not a SOAP Web Service credential` };
    const data = credRecord.data as SoapBasicAuthCredentialData;
    return { ok: true, auth: { security: data.security, username: data.username, password: data.password, wsSecurityPasswordType: data.wsSecurityPasswordType } };
  }

  static async call(credentialName: string, wsdlUrl: string, operation: string, argsJson: string, endpointOverride: string, headersJson: string, timeoutMs: number): Promise<SoapCallResult> {
    const cred = await SoapManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, result: "", rawRequest: "", rawResponse: "", error: cred.error };
    return SoapManager.getInstance(cred.auth).call(wsdlUrl, operation, argsJson, endpointOverride, headersJson, timeoutMs);
  }

  static async describe(wsdlUrl: string, timeoutMs: number): Promise<SoapDescribeResult> {
    try {
      const client = await withTimeout(createClientAsync(wsdlUrl), timeoutMs, `Timed out after ${timeoutMs}ms fetching/parsing the WSDL at ${wsdlUrl}`);
      return { success: true, descriptionJson: JSON.stringify(client.describe()), error: "" };
    } catch (err) {
      return { success: false, descriptionJson: "", error: SoapManager.errorMessage(err) };
    }
  }

  private applySecurity(client: Client): void {
    if (this.security === "Basic") {
      client.setSecurity(new BasicAuthSecurity(this.username, this.password));
    } else if (this.security === "WSSecurity") {
      client.setSecurity(new WSSecurity(this.username, this.password, { passwordType: this.wsSecurityPasswordType === "PasswordDigest" ? "PasswordDigest" : "PasswordText" }));
    }
  }

  private async call(wsdlUrl: string, operation: string, argsJson: string, endpointOverride: string, headersJson: string, timeoutMs: number): Promise<SoapCallResult> {
    const empty = { success: false, result: "", rawRequest: "", rawResponse: "" };

    let args: unknown;
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch (err) {
      return { ...empty, error: `Args must be valid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }

    let extraHeaders: Record<string, unknown> | undefined;
    if (headersJson) {
      try {
        extraHeaders = JSON.parse(headersJson);
      } catch (err) {
        return { ...empty, error: `Headers must be valid JSON: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    const trimmedOperation = operation.trim();
    if (!trimmedOperation) return { ...empty, error: "Operation must name a SOAP method/operation defined on the WSDL." };

    try {
      const client = await withTimeout(createClientAsync(wsdlUrl, { endpoint: endpointOverride || undefined }), timeoutMs, `Timed out after ${timeoutMs}ms fetching/parsing the WSDL at ${wsdlUrl}`);

      this.applySecurity(client);

      if (extraHeaders) {
        for (const [name, value] of Object.entries(extraHeaders)) {
          client.addSoapHeader({ [name]: value });
        }
      }

      const method = client[`${trimmedOperation}Async`];
      if (typeof method !== "function") {
        return { ...empty, error: `Operation "${trimmedOperation}" was not found on this WSDL's service/port.` };
      }

      const [result] = (await withTimeout(method.call(client, args) as Promise<unknown>, timeoutMs, `Timed out after ${timeoutMs}ms calling operation "${trimmedOperation}"`)) as [unknown];

      return {
        success: true,
        result: JSON.stringify(result ?? null),
        rawRequest: String(client.lastRequest ?? ""),
        rawResponse: typeof client.lastResponse === "string" ? client.lastResponse : JSON.stringify(client.lastResponse ?? ""),
        error: "",
      };
    } catch (err) {
      return { ...empty, error: SoapManager.errorMessage(err) };
    }
  }
}
