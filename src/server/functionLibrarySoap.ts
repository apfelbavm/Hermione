import { createClientAsync, BasicAuthSecurity, WSSecurity, type Client } from "soap";

/** Calls a SOAP web service via the official "soap" (node-soap) SDK — a real WSDL-driven client
 * (schema parsing, envelope building, SOAP faults), which is a Node-only dependency ("soap" itself,
 * transitively "axios"/"sax"/etc.) this project deliberately does NOT want pulled into the
 * interpreter/browser bundle. Kept in its own file, separate from functionLibrary.ts, so no
 * interpreter-facing code ever statically imports it — same isolation as functionLibrarySftp.ts,
 * see that file's own header comment for why this matters for Next's browser bundle. */

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

function applySecurity(client: Client, security: string, username: string, password: string, wsSecurityPasswordType: string): void {
  if (security === "Basic") {
    client.setSecurity(new BasicAuthSecurity(username, password));
  } else if (security === "WSSecurity") {
    client.setSecurity(new WSSecurity(username, password, { passwordType: wsSecurityPasswordType === "PasswordDigest" ? "PasswordDigest" : "PasswordText" }));
  }
}

export interface SoapCallInputs {
  wsdlUrl: string;
  operation: string;
  argsJson: string;
  security: string;
  username: string;
  password: string;
  wsSecurityPasswordType: string;
  endpointOverride: string;
  headersJson: string;
  timeoutMs: number;
}

export interface SoapCallOutputs {
  success: boolean;
  result: string;
  rawRequest: string;
  rawResponse: string;
  error: string;
  [key: string]: unknown;
}

export async function soapCall(inputs: SoapCallInputs): Promise<SoapCallOutputs> {
  const empty = { success: false, result: "", rawRequest: "", rawResponse: "" };

  let args: unknown;
  try {
    args = inputs.argsJson ? JSON.parse(inputs.argsJson) : {};
  } catch (err) {
    return { ...empty, error: `Args must be valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  let extraHeaders: Record<string, unknown> | undefined;
  if (inputs.headersJson) {
    try {
      extraHeaders = JSON.parse(inputs.headersJson);
    } catch (err) {
      return { ...empty, error: `Headers must be valid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const timeoutMs = Math.max(0, Math.round(Number(inputs.timeoutMs) || 0));
  const operation = String(inputs.operation ?? "").trim();
  if (!operation) return { ...empty, error: "Operation must name a SOAP method/operation defined on the WSDL." };

  try {
    const client = await withTimeout(createClientAsync(inputs.wsdlUrl, { endpoint: inputs.endpointOverride || undefined }), timeoutMs, `Timed out after ${timeoutMs}ms fetching/parsing the WSDL at ${inputs.wsdlUrl}`);

    applySecurity(client, inputs.security, inputs.username, inputs.password, inputs.wsSecurityPasswordType);

    if (extraHeaders) {
      for (const [name, value] of Object.entries(extraHeaders)) {
        client.addSoapHeader({ [name]: value });
      }
    }

    const method = client[`${operation}Async`];
    if (typeof method !== "function") {
      return { ...empty, error: `Operation "${operation}" was not found on this WSDL's service/port.` };
    }

    const [result] = (await withTimeout(method.call(client, args) as Promise<unknown>, timeoutMs, `Timed out after ${timeoutMs}ms calling operation "${operation}"`)) as [unknown];

    return {
      success: true,
      result: JSON.stringify(result ?? null),
      rawRequest: String(client.lastRequest ?? ""),
      rawResponse: typeof client.lastResponse === "string" ? client.lastResponse : JSON.stringify(client.lastResponse ?? ""),
      error: "",
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface SoapDescribeInputs {
  wsdlUrl: string;
  timeoutMs: number;
}

export interface SoapDescribeOutputs {
  success: boolean;
  descriptionJson: string;
  error: string;
  [key: string]: unknown;
}

export async function soapDescribe(inputs: SoapDescribeInputs): Promise<SoapDescribeOutputs> {
  const timeoutMs = Math.max(0, Math.round(Number(inputs.timeoutMs) || 0));
  try {
    const client = await withTimeout(createClientAsync(inputs.wsdlUrl), timeoutMs, `Timed out after ${timeoutMs}ms fetching/parsing the WSDL at ${inputs.wsdlUrl}`);
    return { success: true, descriptionJson: JSON.stringify(client.describe()), error: "" };
  } catch (err) {
    return { success: false, descriptionJson: "", error: err instanceof Error ? err.message : String(err) };
  }
}
