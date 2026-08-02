import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "../../../src/graph/engine/executor";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { Graph } from "../../../src/graph/engine/graph";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";
import type { CredentialRecord, GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "../../../src/credentials/types";

/** The googleapis SDK's actual auth classes sign/refresh tokens over the network, so — like
 * @azure/identity in microsoft365.test.ts — the whole module is mocked here: google.auth.JWT/OAuth2
 * become plain passthrough stubs, and each per-service factory (google.drive/sheets/docs/gmail/
 * calendar/admin) returns an object whose methods are vi.fn()s configured per test. */
const { driveFilesList, driveFilesGet, sheetsValuesGet, gmailMessagesSend, calendarEventsInsert, adminUsersList, oauth2GetToken } = vi.hoisted(() => ({
  driveFilesList: vi.fn(),
  driveFilesGet: vi.fn(),
  sheetsValuesGet: vi.fn(),
  gmailMessagesSend: vi.fn(),
  calendarEventsInsert: vi.fn(),
  adminUsersList: vi.fn(),
  oauth2GetToken: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: vi.fn().mockImplementation((opts: unknown) => ({ __kind: "jwt", opts })),
      OAuth2: vi.fn().mockImplementation((clientId: string, clientSecret: string, redirectUri?: string) => ({
        __kind: "oauth2",
        clientId,
        clientSecret,
        redirectUri,
        setCredentials: vi.fn(),
        getToken: oauth2GetToken,
      })),
    },
    drive: vi.fn().mockReturnValue({
      files: { list: driveFilesList, get: driveFilesGet },
    }),
    sheets: vi.fn().mockReturnValue({
      spreadsheets: { values: { get: sheetsValuesGet } },
    }),
    docs: vi.fn().mockReturnValue({}),
    gmail: vi.fn().mockReturnValue({
      users: { messages: { send: gmailMessagesSend } },
    }),
    calendar: vi.fn().mockReturnValue({
      events: { insert: calendarEventsInsert },
    }),
    admin: vi.fn().mockReturnValue({
      users: { list: adminUsersList },
    }),
  },
}));

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.clearAllMocks();
});

function buildGraph(type: string, id: string, pinValues: Record<string, unknown> = {}) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, { x: 0, y: 0 }, def.pins, id);
  for (const [pinId, value] of Object.entries(pinValues)) {
    node.pins[pinId].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

/** Every manager caches its client by credential contents (see forServiceAccount/forOAuth2 in
 * lib/google*Manager.ts), so each test uses unique credential data to avoid a cached mock client
 * from a previous test leaking in. */
let credentialCounter = 0;

function freshServiceAccountCredential(): { name: string; getCredential: (name: string) => CredentialRecord | undefined } {
  credentialCounter += 1;
  const data: GoogleServiceAccountCredentialData = {
    serviceAccountKeyJson: JSON.stringify({ client_email: `svc-${credentialCounter}@example.iam.gserviceaccount.com`, private_key: "key" }),
    impersonateUser: "",
  };
  const credential: CredentialRecord = {
    id: `cred-sa-${credentialCounter}`,
    name: `SA Credential ${credentialCounter}`,
    type: "googleServiceAccount",
    data,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  return { name: credential.name, getCredential: (name) => (name === credential.name ? credential : undefined) };
}

function freshOAuth2Credential(): { name: string; getCredential: (name: string) => CredentialRecord | undefined } {
  credentialCounter += 1;
  const data: GoogleOAuth2CredentialData = {
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://example.com/callback",
    authCode: `auth-code-${credentialCounter}`,
    refreshToken: `refresh-${credentialCounter}`,
  };
  const credential: CredentialRecord = {
    id: `cred-oauth2-${credentialCounter}`,
    name: `OAuth2 Credential ${credentialCounter}`,
    type: "googleOAuth2",
    data,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  return { name: credential.name, getCredential: (name) => (name === credential.name ? credential : undefined) };
}

describe("google.authorize", () => {
  it("exchanges an auth code for tokens", async () => {
    const { name, getCredential } = freshOAuth2Credential();
    oauth2GetToken.mockResolvedValue({ tokens: { access_token: "tok-1", refresh_token: "refresh-1", expiry_date: Date.now() + 3600_000 } });

    const { graph } = buildGraph("google.authorize", "auth", { credentialName: name });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("auth", "exec-in", ctx);

    expect(ctx.execOutputs.get("auth:success")).toBe(true);
    expect(ctx.execOutputs.get("auth:tokens")).toEqual({ accessToken: "tok-1", refreshToken: "refresh-1", expiresIn: expect.any(Number) });
    expect(ctx.execOutputs.get("auth:error")).toBe("");
  });

  it("reports an error when the named credential doesn't exist", async () => {
    const { graph } = buildGraph("google.authorize", "auth", { credentialName: "missing" });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: () => undefined });
    await runExecFrom("auth", "exec-in", ctx);

    expect(ctx.execOutputs.get("auth:success")).toBe(false);
    expect(oauth2GetToken).not.toHaveBeenCalled();
    expect(String(ctx.execOutputs.get("auth:error"))).toContain("not found");
  });
});

describe("google.driveListFiles", () => {
  it("lists files and reports success", async () => {
    const { name, getCredential } = freshServiceAccountCredential();
    driveFilesList.mockResolvedValue({
      data: { files: [{ id: "f1", name: "Report.pdf", mimeType: "application/pdf", size: "1024", webViewLink: "https://drive.google.com/f1" }] },
    });

    const { graph } = buildGraph("google.driveListFiles", "ld", { credentialName: name, query: "" });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("ld", "exec-in", ctx);

    expect(ctx.execOutputs.get("ld:success")).toBe(true);
    expect(ctx.execOutputs.get("ld:files")).toEqual([{ id: "f1", name: "Report.pdf", mimeType: "application/pdf", isFolder: false, size: 1024, webViewLink: "https://drive.google.com/f1" }]);
    expect(ctx.execOutputs.get("ld:error")).toBe("");
  });

  it("reports an error and never calls the SDK when the named credential doesn't exist", async () => {
    const { graph } = buildGraph("google.driveListFiles", "ld", { credentialName: "missing", query: "" });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: () => undefined });
    await runExecFrom("ld", "exec-in", ctx);

    expect(ctx.execOutputs.get("ld:success")).toBe(false);
    expect(driveFilesList).not.toHaveBeenCalled();
    expect(String(ctx.execOutputs.get("ld:error"))).toContain("not found");
  });
});

describe("google.gmailSendMessage", () => {
  it("sends a message and reports success", async () => {
    const { name, getCredential } = freshServiceAccountCredential();
    gmailMessagesSend.mockResolvedValue({ data: { id: "msg-1" } });

    const { graph } = buildGraph("google.gmailSendMessage", "gs", { credentialName: name, to: "someone@example.com", subject: "Hi", body: "Hello there" });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("gs", "exec-in", ctx);

    expect(ctx.execOutputs.get("gs:success")).toBe(true);
    expect(ctx.execOutputs.get("gs:id")).toBe("msg-1");
    expect(ctx.execOutputs.get("gs:error")).toBe("");
  });
});

describe("google.calendarCreateEvent", () => {
  it("creates an event and reports success", async () => {
    const { name, getCredential } = freshServiceAccountCredential();
    calendarEventsInsert.mockResolvedValue({
      data: { id: "evt-1", summary: "Standup", start: { dateTime: "2024-01-01T09:00:00Z" }, end: { dateTime: "2024-01-01T09:30:00Z" }, htmlLink: "https://calendar.google.com/evt-1" },
    });

    const { graph } = buildGraph("google.calendarCreateEvent", "cc", {
      credentialName: name,
      calendarId: "primary",
      summary: "Standup",
      start: "2024-01-01T09:00:00Z",
      end: "2024-01-01T09:30:00Z",
      description: "",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("cc", "exec-in", ctx);

    expect(ctx.execOutputs.get("cc:success")).toBe(true);
    expect(ctx.execOutputs.get("cc:event")).toEqual({
      id: "evt-1",
      summary: "Standup",
      start: "2024-01-01T09:00:00Z",
      end: "2024-01-01T09:30:00Z",
      htmlLink: "https://calendar.google.com/evt-1",
    });
    expect(ctx.execOutputs.get("cc:error")).toBe("");
  });
});

describe("google.adminListUsers", () => {
  it("lists users and reports success", async () => {
    const { name, getCredential } = freshServiceAccountCredential();
    adminUsersList.mockResolvedValue({
      data: { users: [{ id: "u1", primaryEmail: "ada@example.com", name: { fullName: "Ada Lovelace" }, suspended: false }] },
    });

    const { graph } = buildGraph("google.adminListUsers", "au", { credentialName: name, domain: "example.com", query: "" });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("au", "exec-in", ctx);

    expect(ctx.execOutputs.get("au:success")).toBe(true);
    expect(ctx.execOutputs.get("au:users")).toEqual([{ id: "u1", primaryEmail: "ada@example.com", fullName: "Ada Lovelace", suspended: false }]);
    expect(ctx.execOutputs.get("au:error")).toBe("");
  });

  it("reports an error when given an OAuth2 credential instead of a service account", async () => {
    const { name, getCredential } = freshOAuth2Credential();

    const { graph } = buildGraph("google.adminListUsers", "au", { credentialName: name, domain: "example.com", query: "" });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("au", "exec-in", ctx);

    expect(ctx.execOutputs.get("au:success")).toBe(false);
    expect(adminUsersList).not.toHaveBeenCalled();
    expect(String(ctx.execOutputs.get("au:error"))).toContain("Service Account");
  });
});
