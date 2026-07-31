import { nextId } from "../engine/graphMutations";
import { getDb } from "./db";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowSummary {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface FlowRow {
  id: string;
  project_id: string;
  name: string;
  graph_json: string | null;
  created_at: string;
  updated_at: string;
}

function toProjectSummary(row: ProjectRow): ProjectSummary {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toFlowSummary(row: FlowRow): FlowSummary {
  return { id: row.id, projectId: row.project_id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listProjects(): ProjectSummary[] {
  const rows = getDb().prepare<[], ProjectRow>("SELECT * FROM projects ORDER BY created_at").all();
  return rows.map(toProjectSummary);
}

export function getProject(projectId: string): ProjectSummary | undefined {
  const row = getDb().prepare<[string], ProjectRow>("SELECT * FROM projects WHERE id = ?").get(projectId);
  return row ? toProjectSummary(row) : undefined;
}

export function createProject(name: string): ProjectSummary {
  const now = new Date().toISOString();
  const project: ProjectSummary = { id: nextId("project"), name, createdAt: now, updatedAt: now };
  getDb().prepare("INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(project.id, project.name, project.createdAt, project.updatedAt);
  return project;
}

export function renameProject(projectId: string, name: string): void {
  getDb().prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(name, new Date().toISOString(), projectId);
}

/** Deletes the project along with everything scoped to it — its Flows and its run/log history —
 * nothing scoped to a project should survive it. Credentials are NOT project-scoped (the vault is
 * global, shared across every project), so they're untouched here. */
export function deleteProject(projectId: string): void {
  const db = getDb();
  const del = db.transaction((id: string) => {
    db.prepare("DELETE FROM runs WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM flows WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  });
  del(projectId);
}

export function listFlows(projectId: string): FlowSummary[] {
  const rows = getDb().prepare<[string], FlowRow>("SELECT * FROM flows WHERE project_id = ? ORDER BY created_at").all(projectId);
  return rows.map(toFlowSummary);
}

export function getFlow(projectId: string, flowId: string): FlowSummary | undefined {
  const row = getDb().prepare<[string, string], FlowRow>("SELECT * FROM flows WHERE project_id = ? AND id = ?").get(projectId, flowId);
  return row ? toFlowSummary(row) : undefined;
}

export function createFlow(projectId: string, name: string): FlowSummary {
  const now = new Date().toISOString();
  const flow: FlowSummary = { id: nextId("flow"), projectId, name, createdAt: now, updatedAt: now };
  getDb().prepare("INSERT INTO flows (id, project_id, name, graph_json, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)").run(flow.id, flow.projectId, flow.name, flow.createdAt, flow.updatedAt);
  return flow;
}

export function renameFlow(projectId: string, flowId: string, name: string): void {
  getDb().prepare("UPDATE flows SET name = ?, updated_at = ? WHERE project_id = ? AND id = ?").run(name, new Date().toISOString(), projectId, flowId);
}

export function deleteFlow(projectId: string, flowId: string): void {
  const db = getDb();
  const del = db.transaction((pId: string, fId: string) => {
    db.prepare("DELETE FROM flows WHERE project_id = ? AND id = ?").run(pId, fId);
  });
  del(projectId, flowId);
}

/** A Flow's actual graph content, stored and returned as the same opaque serializeGraph/
 * deserializeGraph JSON text (see schema.ts/save.ts/load.ts) the client already produces/consumes —
 * this module never constructs a `Graph` instance itself, it just stores the text. Null for a
 * freshly created Flow that's never been saved yet. */
export function loadFlowGraphJson(flowId: string): string | null {
  const row = getDb().prepare<[string], { graph_json: string | null }>("SELECT graph_json FROM flows WHERE id = ?").get(flowId);
  return row?.graph_json ?? null;
}

export function saveFlowGraphJson(flowId: string, graphJson: string): void {
  getDb().prepare("UPDATE flows SET graph_json = ?, updated_at = ? WHERE id = ?").run(graphJson, new Date().toISOString(), flowId);
}

export function deleteFlowGraph(flowId: string): void {
  getDb().prepare("UPDATE flows SET graph_json = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), flowId);
}
