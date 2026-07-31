import type { CredentialData, CredentialRecord, CredentialSummary, CredentialTypeId } from "../credentials/types";
import type { DeployedScriptSummary, FlowSummary, ProjectSummary, RunLog } from "../server/models";

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
  return requestJson("/api/projects", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }) });
}

export function getProject(projectId: string): Promise<ProjectSummary> {
  return requestJson(`/api/projects/${projectId}`);
}

export function renameProject(projectId: string, name: string): Promise<ProjectSummary> {
  return requestJson(`/api/projects/${projectId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ name }) });
}

export function deleteProject(projectId: string): Promise<void> {
  return requestJson(`/api/projects/${projectId}`, { method: "DELETE" });
}

export function listFlows(projectId: string): Promise<FlowSummary[]> {
  return requestJson(`/api/projects/${projectId}/flows`);
}

export function createFlow(projectId: string, name: string): Promise<FlowSummary> {
  return requestJson(`/api/projects/${projectId}/flows`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }) });
}

export function renameFlow(projectId: string, flowId: string, name: string): Promise<FlowSummary> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ name }) });
}

export function deleteFlow(projectId: string, flowId: string): Promise<void> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}`, { method: "DELETE" });
}

/** `graphJson` is the raw serializeGraph() text (or null if this Flow's never been saved) — the
 * caller deserializes it itself (see persistence/load.ts's deserializeGraph), same as it always has. */
export function getFlowWithGraph(projectId: string, flowId: string): Promise<{ flow: FlowSummary; graphJson: string | null }> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}`);
}

export function saveFlowGraph(projectId: string, flowId: string, graphJson: string): Promise<void> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/graph`, { method: "PUT", body: graphJson });
}

/** The editor's "Deploy" button — compiles `graphJson` server-side and stores it as this Flow's one
 * DeployedScript row (see api/projects/[projectId]/flows/[flowId]/deploy/route.ts), replacing any
 * previous deployment. Returns the compiled `code` so the caller can still trigger a file download
 * from the exact bytes just persisted (see compiler/codegen.ts's downloadCompiledCode). */
export function deployFlow(projectId: string, flowId: string, graphJson: string): Promise<{ code: string; deployedAt: string }> {
  return requestJson(`/api/projects/${projectId}/flows/${flowId}/deploy`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ graph: graphJson }) });
}

/** Every Flow in `projectId` that's actually been deployed (see deployFlow above) — feeds the
 * Emulate page's picker. */
export function listDeployedScripts(projectId: string): Promise<DeployedScriptSummary[]> {
  return requestJson(`/api/projects/${projectId}/deployed-scripts`);
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
export function runProductionFlow(projectId: string, flowId: string): Promise<{ run: RunLog }> {
  return requestJson("/api/emulate/run", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ projectId, flowId }) });
}

export function listCredentials(): Promise<CredentialSummary[]> {
  return requestJson("/api/credentials");
}

export function getCredential(id: string): Promise<CredentialRecord> {
  return requestJson(`/api/credentials/${id}`);
}

export function createCredential(name: string, type: CredentialTypeId, data: CredentialData): Promise<CredentialRecord> {
  return requestJson("/api/credentials", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name, type, data }) });
}

export function updateCredential(id: string, name: string, type: CredentialTypeId, data: CredentialData): Promise<CredentialRecord> {
  return requestJson(`/api/credentials/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ name, type, data }) });
}

export function deleteCredential(id: string): Promise<void> {
  return requestJson(`/api/credentials/${id}`, { method: "DELETE" });
}
