import { nextId } from "../engine/graphMutations";
import { Graph } from "../engine/graph";
import { serializeGraph } from "./save";
import { deserializeGraph } from "./load";
import { LOCAL_STORAGE_KEY as LEGACY_GRAPH_KEY } from "./schema";
import { clearRunsForProject } from "./runLogs";

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

const PROJECTS_KEY = "hermione:projects";
const flowsKey = (projectId: string): string => `hermione:project:${projectId}:flows`;
const flowGraphKey = (flowId: string): string => `hermione:flow:${flowId}:graph`;

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** One-time upgrade from the pre-Projects single-graph save (see schema.ts's LOCAL_STORAGE_KEY) into
 * a "Default Project" containing one "Main Flow" — runs only the first time listProjects() is ever
 * called after this feature shipped (i.e. hermione:projects doesn't exist yet). The legacy key is
 * left untouched rather than deleted, so this stays safely re-runnable/non-destructive even if
 * something goes wrong partway through. */
function migrateLegacyGraphIfNeeded(): void {
  if (localStorage.getItem(PROJECTS_KEY) !== null) return;

  const legacyRaw = localStorage.getItem(LEGACY_GRAPH_KEY);
  if (!legacyRaw) {
    writeJson(PROJECTS_KEY, []);
    return;
  }

  const now = new Date().toISOString();
  const project: ProjectSummary = { id: nextId("project"), name: "Default Project", createdAt: now, updatedAt: now };
  const flow: FlowSummary = { id: nextId("flow"), projectId: project.id, name: "Main Flow", createdAt: now, updatedAt: now };
  writeJson(PROJECTS_KEY, [project]);
  writeJson(flowsKey(project.id), [flow]);
  localStorage.setItem(flowGraphKey(flow.id), legacyRaw);
}

export function listProjects(): ProjectSummary[] {
  migrateLegacyGraphIfNeeded();
  return readJson<ProjectSummary[]>(PROJECTS_KEY, []);
}

export function getProject(projectId: string): ProjectSummary | undefined {
  return listProjects().find((p) => p.id === projectId);
}

export function createProject(name: string): ProjectSummary {
  const projects = listProjects();
  const now = new Date().toISOString();
  const project: ProjectSummary = { id: nextId("project"), name, createdAt: now, updatedAt: now };
  writeJson(PROJECTS_KEY, [...projects, project]);
  writeJson(flowsKey(project.id), []);
  return project;
}

export function renameProject(projectId: string, name: string): void {
  const projects = listProjects().map((p) => (p.id === projectId ? { ...p, name, updatedAt: new Date().toISOString() } : p));
  writeJson(PROJECTS_KEY, projects);
}

/** Deletes the project along with everything scoped to it — its Flows, each Flow's own saved graph,
 * and its run/log history (see runLogs.ts) — nothing scoped to a project should survive it. */
export function deleteProject(projectId: string): void {
  for (const flow of listFlows(projectId)) {
    localStorage.removeItem(flowGraphKey(flow.id));
  }
  localStorage.removeItem(flowsKey(projectId));
  clearRunsForProject(projectId);
  writeJson(
    PROJECTS_KEY,
    listProjects().filter((p) => p.id !== projectId),
  );
}

export function listFlows(projectId: string): FlowSummary[] {
  return readJson<FlowSummary[]>(flowsKey(projectId), []);
}

export function getFlow(projectId: string, flowId: string): FlowSummary | undefined {
  return listFlows(projectId).find((f) => f.id === flowId);
}

export function createFlow(projectId: string, name: string): FlowSummary {
  const flows = listFlows(projectId);
  const now = new Date().toISOString();
  const flow: FlowSummary = { id: nextId("flow"), projectId, name, createdAt: now, updatedAt: now };
  writeJson(flowsKey(projectId), [...flows, flow]);
  return flow;
}

export function renameFlow(projectId: string, flowId: string, name: string): void {
  const flows = listFlows(projectId).map((f) => (f.id === flowId ? { ...f, name, updatedAt: new Date().toISOString() } : f));
  writeJson(flowsKey(projectId), flows);
}

export function deleteFlow(projectId: string, flowId: string): void {
  writeJson(
    flowsKey(projectId),
    listFlows(projectId).filter((f) => f.id !== flowId),
  );
  localStorage.removeItem(flowGraphKey(flowId));
}

/** A Flow's actual graph content — the same SavedDocument/serializeGraph/deserializeGraph machinery
 * schema.ts/save.ts/load.ts already use for the legacy single-graph save, just keyed per Flow
 * instead of one fixed key. Null for a freshly created Flow that's never been saved yet. */
export function loadFlowGraph(flowId: string): Graph | null {
  const raw = localStorage.getItem(flowGraphKey(flowId));
  return raw ? deserializeGraph(raw) : null;
}

export function saveFlowGraph(flowId: string, graph: Graph): void {
  localStorage.setItem(flowGraphKey(flowId), serializeGraph(graph));
}

export function deleteFlowGraph(flowId: string): void {
  localStorage.removeItem(flowGraphKey(flowId));
}
