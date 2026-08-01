import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { nextId } from "../graph/engine/graphMutations";
import type { CredentialData, CredentialRecord, CredentialSummary, CredentialTypeId } from "../credentials/types";
import { MAX_RUNS_PER_PROJECT } from "../shared/runLogConstants";
import type { DeployedScript, DeployedScriptSummary, FlowSummary, FlowVersion, FlowVersionSummary, LogEntry, ProjectSummary, RunKind, RunLog } from "./models";
import type { TriggerDescriptor } from "../graph/compiler/codegen";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "hermione.db");

// Row shapes exactly as SQLite returns them (snake_case columns, JSON blobs still serialized) —
// deliberately NOT exported. Nothing outside this class should ever know a column name, let alone
// depend on one; every public method here returns/accepts the plain models in ./models.ts instead.
interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface FlowRow {
  id: string;
  project_id: string;
  name: string;
  graph_json: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  project_id: string;
  flow_id: string;
  flow_name: string;
  started_at: string;
  finished_at: string | null;
  entries_json: string;
  kind: string;
  execution_ms: number | null;
}

interface FlowVersionRow {
  id: string;
  flow_id: string;
  version: number;
  name: string;
  graph_json: string | null;
  created_at: string;
}

interface CredentialRow {
  id: string;
  name: string;
  type: CredentialTypeId;
  data_json: string;
  created_at: string;
  updated_at: string;
}

interface DeployedScriptRow {
  id: string;
  project_id: string;
  flow_id: string;
  flow_name: string;
  code: string;
  manifest_json: string;
  version: number;
  deployed_at: string;
}

/** The one and only place in this app that touches a database — no other module imports
 * `better-sqlite3` or writes SQL (see next.config.mjs's serverExternalPackages, scoped to just this
 * file's own dependency). Every caller (the API routes under src/app/api/, and /api/simulate
 * directly) only ever sees plain method calls returning plain data (see ./models.ts and
 * credentials/types.ts) — swapping the underlying database or access library later means changing
 * only this file, not any of its callers. Get the shared instance via getDatabaseManager() below;
 * the class itself is exported only so tests can construct an isolated instance (e.g. against
 * ":memory:") instead of the one shared file. */
export class DatabaseManager {
  private readonly db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.bootstrapSchema();
  }

  private bootstrapSchema(): void {
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS flows (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        graph_json TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flows_project_id ON flows (project_id);

      -- Archived snapshots created by "Save new version" - the live row in flows above always
      -- holds the current/active version; nothing here is ever deleted when a newer version is saved.
      CREATE TABLE IF NOT EXISTS flow_versions (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        graph_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_id ON flow_versions (flow_id);

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        flow_id TEXT NOT NULL,
        flow_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        entries_json TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'simulate',
        execution_ms REAL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_project_id ON runs (project_id, started_at);

      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deployed_scripts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        flow_id TEXT NOT NULL UNIQUE,
        flow_name TEXT NOT NULL,
        code TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        deployed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deployed_scripts_project_id ON deployed_scripts (project_id);
    `);
  }

  // --- Row -> model mapping — the only place a snake_case column name is ever read. ---

  private toProjectSummary(row: ProjectRow): ProjectSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toFlowSummary(row: FlowRow): FlowSummary {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toRunLog(row: RunRow): RunLog {
    return {
      id: row.id,
      projectId: row.project_id,
      flowId: row.flow_id,
      flowName: row.flow_name,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      entries: JSON.parse(row.entries_json) as LogEntry[],
      kind: (row.kind as RunKind) || "simulate",
      executionMs: row.execution_ms ?? undefined,
    };
  }

  private toCredentialSummary(row: CredentialRow): CredentialSummary {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toFlowVersionSummary(row: FlowVersionRow): FlowVersionSummary {
    return {
      id: row.id,
      flowId: row.flow_id,
      version: row.version,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  private toFlowVersion(row: FlowVersionRow): FlowVersion {
    return { ...this.toFlowVersionSummary(row), graphJson: row.graph_json };
  }

  private toCredentialRecord(row: CredentialRow): CredentialRecord {
    return {
      ...this.toCredentialSummary(row),
      data: JSON.parse(row.data_json) as CredentialData,
    };
  }

  private toDeployedScriptSummary(row: DeployedScriptRow): DeployedScriptSummary {
    return {
      id: row.id,
      projectId: row.project_id,
      flowId: row.flow_id,
      flowName: row.flow_name,
      manifest: JSON.parse(row.manifest_json) as {
        triggers: TriggerDescriptor[];
      },
      version: row.version,
      deployedAt: row.deployed_at,
    };
  }

  private toDeployedScript(row: DeployedScriptRow): DeployedScript {
    return { ...this.toDeployedScriptSummary(row), code: row.code };
  }

  // --- Projects ---

  listProjects(): ProjectSummary[] {
    const rows = this.db.prepare<[], ProjectRow>("SELECT * FROM projects ORDER BY created_at").all();
    return rows.map((row) => this.toProjectSummary(row));
  }

  getProject(projectId: string): ProjectSummary | undefined {
    const row = this.db.prepare<[string], ProjectRow>("SELECT * FROM projects WHERE id = ?").get(projectId);
    return row ? this.toProjectSummary(row) : undefined;
  }

  createProject(name: string): ProjectSummary {
    const now = new Date().toISOString();
    const project: ProjectSummary = {
      id: nextId("project"),
      name,
      description: "",
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare("INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(project.id, project.name, project.description, project.createdAt, project.updatedAt);
    return project;
  }

  renameProject(projectId: string, name: string): void {
    this.db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(name, new Date().toISOString(), projectId);
  }

  updateProjectDescription(projectId: string, description: string): void {
    this.db.prepare("UPDATE projects SET description = ?, updated_at = ? WHERE id = ?").run(description, new Date().toISOString(), projectId);
  }

  /** Bumps a project's own `updated_at` whenever something inside it changes — a Flow is added,
   * renamed, deleted, saved, or versioned — so the project row reflects the most recent activity
   * anywhere within it, not just edits to the project's own name. */
  private touchProject(projectId: string, updatedAt: string): void {
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(updatedAt, projectId);
  }

  /** Deletes the project along with everything scoped to it — its Flows and its run/log history —
   * nothing scoped to a project should survive it. Credentials are NOT project-scoped (the vault is
   * global, shared across every project), so they're untouched here. */
  deleteProject(projectId: string): void {
    const del = this.db.transaction((id: string) => {
      this.db.prepare("DELETE FROM runs WHERE project_id = ?").run(id);
      this.db.prepare("DELETE FROM deployed_scripts WHERE project_id = ?").run(id);
      this.db.prepare("DELETE FROM flow_versions WHERE flow_id IN (SELECT id FROM flows WHERE project_id = ?)").run(id);
      this.db.prepare("DELETE FROM flows WHERE project_id = ?").run(id);
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    });
    del(projectId);
  }

  // --- Flows ---

  listFlows(projectId: string): FlowSummary[] {
    const rows = this.db.prepare<[string], FlowRow>("SELECT * FROM flows WHERE project_id = ? ORDER BY created_at").all(projectId);
    return rows.map((row) => this.toFlowSummary(row));
  }

  getFlow(projectId: string, flowId: string): FlowSummary | undefined {
    const row = this.db.prepare<[string, string], FlowRow>("SELECT * FROM flows WHERE project_id = ? AND id = ?").get(projectId, flowId);
    return row ? this.toFlowSummary(row) : undefined;
  }

  createFlow(projectId: string, name: string): FlowSummary {
    const now = new Date().toISOString();
    const flow: FlowSummary = {
      id: nextId("flow"),
      projectId,
      name,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare("INSERT INTO flows (id, project_id, name, graph_json, version, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)").run(flow.id, flow.projectId, flow.name, flow.version, flow.createdAt, flow.updatedAt);
    this.touchProject(projectId, now);
    return flow;
  }

  renameFlow(projectId: string, flowId: string, name: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE flows SET name = ?, updated_at = ? WHERE project_id = ? AND id = ?").run(name, now, projectId, flowId);
    this.touchProject(projectId, now);
  }

  deleteFlow(projectId: string, flowId: string): void {
    const del = this.db.transaction((pId: string, fId: string) => {
      this.db.prepare("DELETE FROM deployed_scripts WHERE flow_id = ?").run(fId);
      this.db.prepare("DELETE FROM flow_versions WHERE flow_id = ?").run(fId);
      this.db.prepare("DELETE FROM flows WHERE project_id = ? AND id = ?").run(pId, fId);
      this.touchProject(pId, new Date().toISOString());
    });
    del(projectId, flowId);
  }

  /** Archives the Flow's current name/graph as a `flow_versions` snapshot under its current version
   * number, then bumps the live `flows` row to the next version — the live row stays the one and
   * only active version; nothing under `flow_versions` is ever deleted (see "Restore old version"). */
  saveNewFlowVersion(projectId: string, flowId: string): FlowSummary | undefined {
    const now = new Date().toISOString();
    const save = this.db.transaction((pId: string, fId: string) => {
      const row = this.db.prepare<[string, string], FlowRow>("SELECT * FROM flows WHERE project_id = ? AND id = ?").get(pId, fId);
      if (!row) return undefined;
      this.db.prepare("INSERT INTO flow_versions (id, flow_id, version, name, graph_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(nextId("flow_version"), row.id, row.version, row.name, row.graph_json, now);
      this.db.prepare("UPDATE flows SET version = ?, updated_at = ? WHERE project_id = ? AND id = ?").run(row.version + 1, now, pId, fId);
      this.touchProject(pId, now);
      return this.getFlow(pId, fId);
    });
    return save(projectId, flowId);
  }

  /** Every archived snapshot for this Flow, newest-version-first — always strictly older than the
   * live `flows` row's own current version, since that live row (the newest version) is never
   * itself a row in `flow_versions` (see saveNewFlowVersion's own comment). Feeds the "Restore old
   * version" page's version-picker dropdown, which by design never offers the current version. */
  listFlowVersions(flowId: string): FlowVersionSummary[] {
    const rows = this.db.prepare<[string], FlowVersionRow>("SELECT * FROM flow_versions WHERE flow_id = ? ORDER BY version DESC").all(flowId);
    return rows.map((row) => this.toFlowVersionSummary(row));
  }

  /** One archived snapshot's full content (graph included) — feeds the "Restore old version" page's
   * read-only graph view once the user picks a version from the dropdown. */
  getFlowVersion(flowId: string, versionId: string): FlowVersion | undefined {
    const row = this.db.prepare<[string, string], FlowVersionRow>("SELECT * FROM flow_versions WHERE flow_id = ? AND id = ?").get(flowId, versionId);
    return row ? this.toFlowVersion(row) : undefined;
  }

  /** "Restore old version" — archives the Flow's CURRENT state first (same as saveNewFlowVersion,
   * so it's never lost), then makes the picked archived version's name/graph the new live state,
   * bumping the version number same as any other save. Nothing under `flow_versions` is ever
   * deleted or overwritten — restoring is just another forward step, not a rewind. */
  restoreFlowVersion(projectId: string, flowId: string, versionId: string): FlowSummary | undefined {
    const now = new Date().toISOString();
    const restore = this.db.transaction((pId: string, fId: string, vId: string) => {
      const current = this.db.prepare<[string, string], FlowRow>("SELECT * FROM flows WHERE project_id = ? AND id = ?").get(pId, fId);
      const target = this.db.prepare<[string, string], FlowVersionRow>("SELECT * FROM flow_versions WHERE flow_id = ? AND id = ?").get(fId, vId);
      if (!current || !target) return undefined;
      this.db.prepare("INSERT INTO flow_versions (id, flow_id, version, name, graph_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(nextId("flow_version"), current.id, current.version, current.name, current.graph_json, now);
      this.db.prepare("UPDATE flows SET name = ?, graph_json = ?, version = ?, updated_at = ? WHERE project_id = ? AND id = ?").run(target.name, target.graph_json, current.version + 1, now, pId, fId);
      this.touchProject(pId, now);
      return this.getFlow(pId, fId);
    });
    return restore(projectId, flowId, versionId);
  }

  /** A Flow's actual graph content, stored and returned as the same opaque serializeGraph/
   * deserializeGraph JSON text (see persistence/schema.ts/save.ts/load.ts) the client already
   * produces/consumes — this class never constructs a `Graph` instance itself, it just stores the
   * text. Null for a freshly created Flow that's never been saved yet. */
  loadFlowGraphJson(flowId: string): string | null {
    const row = this.db.prepare<[string], { graph_json: string | null }>("SELECT graph_json FROM flows WHERE id = ?").get(flowId);
    return row?.graph_json ?? null;
  }

  saveFlowGraphJson(flowId: string, graphJson: string): void {
    const now = new Date().toISOString();
    const save = this.db.transaction((fId: string, json: string, ts: string) => {
      const row = this.db.prepare<[string], { project_id: string }>("SELECT project_id FROM flows WHERE id = ?").get(fId);
      this.db.prepare("UPDATE flows SET graph_json = ?, updated_at = ? WHERE id = ?").run(json, ts, fId);
      if (row) this.touchProject(row.project_id, ts);
    });
    save(flowId, graphJson, now);
  }

  // --- Runs ---

  /** Every run for `projectId`, newest first. */
  listRuns(projectId: string): RunLog[] {
    const rows = this.db.prepare<[string], RunRow>("SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC").all(projectId);
    return rows.map((row) => this.toRunLog(row));
  }

  /** Every run across every project, newest first — feeds the global Logs page (app/logs/page.tsx),
   * as opposed to listRuns above, which is scoped to one project's own Logs page. */
  listAllRuns(): RunLog[] {
    const rows = this.db.prepare<[], RunRow>("SELECT * FROM runs ORDER BY started_at DESC").all();
    return rows.map((row) => this.toRunLog(row));
  }

  /** Persists a completed run and caps the project's history at MAX_RUNS_PER_PROJECT, deleting the
   * oldest rows past that count in the same transaction. */
  appendRun(run: RunLog): void {
    const insertAndCap = this.db.transaction((r: RunLog) => {
      this.db
        .prepare("INSERT INTO runs (id, project_id, flow_id, flow_name, started_at, finished_at, entries_json, kind, execution_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(r.id, r.projectId, r.flowId, r.flowName, r.startedAt, r.finishedAt ?? null, JSON.stringify(r.entries), r.kind, r.executionMs ?? null);

      const staleIds = this.db.prepare<[string, number], { id: string }>("SELECT id FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT -1 OFFSET ?").all(r.projectId, MAX_RUNS_PER_PROJECT);
      if (staleIds.length > 0) {
        const placeholders = staleIds.map(() => "?").join(", ");
        this.db.prepare(`DELETE FROM runs WHERE id IN (${placeholders})`).run(...staleIds.map((row) => row.id));
      }
    });
    insertAndCap(run);
  }

  // --- Credentials ---

  /** Never includes `data` — the vault's list view (and anything else that doesn't need the actual
   * secret) has no business reading it. */
  listCredentials(): CredentialSummary[] {
    const rows = this.db.prepare<[], CredentialRow>("SELECT * FROM credentials ORDER BY name").all();
    return rows.map((row) => this.toCredentialSummary(row));
  }

  getCredential(id: string): CredentialRecord | undefined {
    const row = this.db.prepare<[string], CredentialRow>("SELECT * FROM credentials WHERE id = ?").get(id);
    return row ? this.toCredentialRecord(row) : undefined;
  }

  /** Used by the oauth2Saml node (see engine/types.ts's ExecutionContext.getCredential) — credential
   * names are unique (see the DB's own UNIQUE constraint), so this is a stable way for a node to
   * reference a credential by the same name shown in the vault's list, without needing its id. */
  getCredentialByName(name: string): CredentialRecord | undefined {
    const row = this.db.prepare<[string], CredentialRow>("SELECT * FROM credentials WHERE name = ?").get(name);
    return row ? this.toCredentialRecord(row) : undefined;
  }

  createCredential(name: string, type: CredentialTypeId, data: CredentialData): CredentialRecord {
    const now = new Date().toISOString();
    const record: CredentialRecord = {
      id: nextId("credential"),
      name,
      type,
      data,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare("INSERT INTO credentials (id, name, type, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(record.id, record.name, record.type, JSON.stringify(record.data), record.createdAt, record.updatedAt);
    return record;
  }

  updateCredential(id: string, name: string, type: CredentialTypeId, data: CredentialData): void {
    this.db.prepare("UPDATE credentials SET name = ?, type = ?, data_json = ?, updated_at = ? WHERE id = ?").run(name, type, JSON.stringify(data), new Date().toISOString(), id);
  }

  deleteCredential(id: string): void {
    this.db.prepare("DELETE FROM credentials WHERE id = ?").run(id);
  }

  // --- Deployed scripts ---

  /** Every deployed Flow in `projectId`, newest first — never includes `code` (see
   * DeployedScriptSummary's own doc comment), just enough for the Emulate page's
   * picker to show what's actually runnable. */
  listDeployedScripts(projectId: string): DeployedScriptSummary[] {
    const rows = this.db.prepare<[string], DeployedScriptRow>("SELECT * FROM deployed_scripts WHERE project_id = ? ORDER BY deployed_at DESC").all(projectId);
    return rows.map((row) => this.toDeployedScriptSummary(row));
  }

  /** Includes `code` — only ever called server-side, right before actually running it (see
   * api/emulate/run/route.ts). */
  getDeployedScript(flowId: string): DeployedScript | undefined {
    const row = this.db.prepare<[string], DeployedScriptRow>("SELECT * FROM deployed_scripts WHERE flow_id = ?").get(flowId);
    return row ? this.toDeployedScript(row) : undefined;
  }

  /** One row per Flow — a redeploy overwrites the previous snapshot (same `id`) rather than growing
   * a history, matching "Deploy" as "replace what's currently live," not an audit log. `version`
   * starts at 1 and increments by one on every redeploy of this same Flow (see
   * DeployedScript.version's own doc comment). */
  upsertDeployedScript(input: { projectId: string; flowId: string; flowName: string; code: string; manifest: { triggers: TriggerDescriptor[] } }): DeployedScript {
    const existing = this.db.prepare<[string], { id: string; version: number }>("SELECT id, version FROM deployed_scripts WHERE flow_id = ?").get(input.flowId);
    const record: DeployedScript = {
      id: existing?.id ?? nextId("deployment"),
      projectId: input.projectId,
      flowId: input.flowId,
      flowName: input.flowName,
      code: input.code,
      manifest: input.manifest,
      version: (existing?.version ?? 0) + 1,
      deployedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO deployed_scripts (id, project_id, flow_id, flow_name, code, manifest_json, version, deployed_at) VALUES (@id, @projectId, @flowId, @flowName, @code, @manifestJson, @version, @deployedAt)
         ON CONFLICT(flow_id) DO UPDATE SET flow_name = @flowName, code = @code, manifest_json = @manifestJson, version = @version, deployed_at = @deployedAt`,
      )
      .run({
        id: record.id,
        projectId: record.projectId,
        flowId: record.flowId,
        flowName: record.flowName,
        code: record.code,
        manifestJson: JSON.stringify(record.manifest),
        version: record.version,
        deployedAt: record.deployedAt,
      });
    return record;
  }
}

/** Module-level singleton — Next.js keeps this module instance alive for the life of the dev/prod
 * server process, so a single shared connection (rather than one per request) is both correct and
 * the whole point of `better-sqlite3`'s synchronous, single-connection design. Every API route
 * should go through this, not `new DatabaseManager()` directly. */
let sharedInstance: DatabaseManager | null = null;
export function getDatabaseManager(): DatabaseManager {
  if (!sharedInstance) sharedInstance = new DatabaseManager();
  return sharedInstance;
}
