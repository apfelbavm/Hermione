import type { CredentialData, CredentialRecord, CredentialSummary, CredentialTypeId } from "../credentials/types";
import type { DeployedScript, DeployedScriptSummary, FlowSummary, FlowVersion, FlowVersionSummary, ProjectSummary, RunLog, WebhookConfig, WebhookDelivery, WebhookFlowSummary } from "../server/models";

// Browser-side counterpart to src/server/DatabaseManager.ts — every function here is a thin
// fetch() wrapper around the API routes under src/app/api/, since the database itself
// (better-sqlite3, a native binding, all encapsulated in that one class) can only ever be touched
// server-side. Only TYPES are imported from src/server/models.ts above (erased at compile time),
// never any runtime value, so this file stays safe to import from "use client" pages/components.

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `${input} failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function listProjects(): Promise<ProjectSummary[]> {
  return requestJson("/api/projects");
}

export function createProject(name: string): Promise<ProjectSummary> {
  return requestJson("/api/projects", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export function getProject(projectId: string): Promise<ProjectSummary> {
  return requestJson(`/api/projects/${projectId}`);
}

export function renameProject(projectId: string, name: string): Promise<ProjectSummary> {
  return requestJson(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export function updateProjectDescription(projectId: string, description: string): Promise<ProjectSummary> {
  return requestJson(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ description }),
  });
}

export function deleteProject(projectId: string): Promise<void> {
  return requestJson(`/api/projects/${projectId}`, { method: "DELETE" });
}

export function listFlows(projectId: string): Promise<FlowSummary[]> {
  return requestJson(`/api/projects/${projectId}/flows`);
}

export function createFlow(projectId: string, name: string): Promise<FlowSummary> {
  return requestJson(`/api/projects/${projectId}/flows`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export function renameFlow(projectId: string, flowId: string, name: string): Promise<FlowSummary> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export function deleteFlow(projectId: string, flowId: string): Promise<void> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}`, {
    method: "DELETE",
  });
}

/** Archives the Flow's current state and bumps its live version number (see
 * DatabaseManager.saveNewFlowVersion's own comment). */
export function saveNewFlowVersion(projectId: string, flowId: string): Promise<FlowSummary> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/versions`, {
    method: "POST",
  });
}

/** `graphJson` is the raw serializeGraph() text (or null if this Flow's never been saved) — the
 * caller deserializes it itself (see persistence/load.ts's deserializeGraph), same as it always has. */
export function getFlowWithGraph(projectId: string, flowId: string): Promise<{ flow: FlowSummary; graphJson: string | null }> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}`);
}

export function saveFlowGraph(projectId: string, flowId: string, graphJson: string): Promise<void> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/graph`, {
    method: "PUT",
    body: graphJson,
  });
}

/** Every archived version of `flowId`, newest-first, excluding the current live version (see
 * DatabaseManager.listFlowVersions's own comment) — feeds the "Restore old version" page's dropdown. */
export function listFlowVersions(projectId: string, flowId: string): Promise<FlowVersionSummary[]> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/versions`);
}

/** One archived version's full content (graph included) — feeds the "Restore old version" page's
 * read-only graph view once the user picks a version from the dropdown. */
export function getFlowVersion(projectId: string, flowId: string, versionId: string): Promise<FlowVersion> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/versions/${versionId}`);
}

/** Makes the picked archived version the Flow's new live state (see
 * DatabaseManager.restoreFlowVersion's own comment). */
export function restoreFlowVersion(projectId: string, flowId: string, versionId: string): Promise<FlowSummary> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/versions/${versionId}/restore`, {
    method: "POST",
  });
}

/** The editor's "Deploy" button — compiles `graphJson` server-side and stores it as this Flow's one
 * DeployedScript row (see api/projects/[projectId]/flows/[flowId]/deploy/route.ts), replacing any
 * previous deployment. No longer triggers a file download of its own — the compiled script only
 * ever runs from the Emulate page now (see getDeployedScript below). */
export function deployFlow(projectId: string, flowId: string, graphJson: string): Promise<{ version: number; revision: number; deployedAt: string }> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/deploy`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ graph: graphJson }),
  });
}

/** Every Flow in `projectId` that's actually been deployed (see deployFlow above) — feeds the
 * Emulate page's picker. */
export function listDeployedScripts(projectId: string): Promise<DeployedScriptSummary[]> {
  return requestJson(`/api/projects/${projectId}/deployed-scripts`);
}

/** The full deployed record (`code` included) for one Flow — feeds the Emulate page's read-only
 * script viewer (see the deploy route's own GET handler). */
export function getDeployedScript(projectId: string, flowId: string): Promise<DeployedScript> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/deploy`);
}

export function listRuns(projectId: string): Promise<RunLog[]> {
  return requestJson(`/api/projects/${projectId}/runs`);
}

/** Every run across every project (see api/runs/route.ts) — feeds the global Logs page. */
export function listAllRuns(): Promise<RunLog[]> {
  return requestJson("/api/runs");
}

/** Runs a Flow's DEPLOYED compiled output server-side (see api/emulate/run/route.ts) —
 * used by the Emulate page, distinct from Simulate (which streams via SSE for the
 * editor's own step-through visualization). This one just awaits the whole run and returns its
 * RunLog. */
export function runManualFlow(projectId: string, flowId: string): Promise<{ run: RunLog }> {
  return requestJson("/api/emulate/run", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ projectId, flowId }),
  });
}

export function listCredentials(): Promise<CredentialSummary[]> {
  return requestJson("/api/credentials");
}

export function getCredential(id: string): Promise<CredentialRecord> {
  return requestJson(`/api/credentials/${id}`);
}

export function createCredential(name: string, type: CredentialTypeId, data: CredentialData): Promise<CredentialRecord> {
  return requestJson("/api/credentials", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, type, data }),
  });
}

export function updateCredential(id: string, name: string, type: CredentialTypeId, data: CredentialData): Promise<CredentialRecord> {
  return requestJson(`/api/credentials/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, type, data }),
  });
}

export function deleteCredential(id: string): Promise<void> {
  return requestJson(`/api/credentials/${id}`, { method: "DELETE" });
}

/** Every deployed Flow with an "On HTTP Request" trigger in this project, each combined with its
 * webhook security config — feeds the Webhooks page's list. */
export function listProjectWebhooks(projectId: string): Promise<WebhookFlowSummary[]> {
  return requestJson(`/api/projects/${projectId}/webhooks`);
}

/** This Flow's webhook config plus its recent delivery history — feeds the Webhooks page's
 * per-flow expandable delivery inspector. */
export function getWebhookDetail(projectId: string, flowId: string): Promise<{ config: WebhookConfig; deliveries: WebhookDelivery[] }> {
  return requestJson(`/api/projects/${projectId}/webhooks/${flowId}`);
}

/** Issues a brand new bearer token for this Flow's endpoint, invalidating the previous one
 * immediately. The returned config is the only time the plaintext token is ever sent to the
 * browser again after this call. */
export function regenerateWebhookToken(projectId: string, flowId: string): Promise<WebhookConfig> {
  return requestJson(`/api/projects/${projectId}/webhooks/${flowId}/regenerate-token`, { method: "POST" });
}
