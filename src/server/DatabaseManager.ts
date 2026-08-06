import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { nextId } from "../graph/engine/graphMutations.ts";
import type { CredentialData, CredentialRecord, CredentialSummary, CredentialTypeId } from "../credentials/types";
import { MAX_RUNS_PER_PROJECT } from "../shared/runLogConstants.ts";
import { MAX_WEBHOOK_DELIVERIES_PER_FLOW } from "../shared/webhookConstants.ts";
import type { AuthSettings, DeployedScript, DeployedScriptSummary, FlowSummary, FlowVersion, FlowVersionSummary, LogEntry, ProjectSummary, RunKind, RunLog, UserAccount, WebhookConfig, WebhookDelivery, WebhookFlowSummary } from "./models";
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
  revision: number;
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
  revision: number | null;
  version: number | null;
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
  revision: number;
  deployed_at: string;
}

interface WebhookConfigRow {
  id: string;
  flow_id: string;
  project_id: string;
  token: string;
  created_at: string;
  updated_at: string;
}

interface WebhookDeliveryRow {
  id: string;
  flow_id: string;
  project_id: string;
  received_at: string;
  method: string;
  status: number;
  success: number;
  headers_json: string;
  body_text: string;
  error: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  provider: string;
  is_admin: number;
  totp_secret: string | null;
  totp_enabled: number;
  created_at: string;
  last_login_at: string | null;
}

interface EmailLoginCodeRow {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
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
        revision INTEGER NOT NULL DEFAULT 1,
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
        execution_ms REAL,
        revision INTEGER,
        version INTEGER
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
        revision INTEGER NOT NULL DEFAULT 1,
        deployed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deployed_scripts_project_id ON deployed_scripts (project_id);

      -- One row per Flow, created lazily on first read (see getOrCreateWebhookConfig) with a token
      -- auto-generated immediately — every inbound webhook call always requires it.
      CREATE TABLE IF NOT EXISTS webhook_configs (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Every recorded inbound call against a Flow's webhook endpoint, newest first, capped per Flow
      -- at MAX_WEBHOOK_DELIVERIES_PER_FLOW the same way runs is capped per project.
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        received_at TEXT NOT NULL,
        method TEXT NOT NULL,
        status INTEGER NOT NULL,
        success INTEGER NOT NULL,
        headers_json TEXT NOT NULL,
        body_text TEXT NOT NULL,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_flow_id ON webhook_deliveries (flow_id, received_at);

      -- One row per person who has ever signed in, regardless of provider (Entra ID vs email) —
      -- provider records how they most recently signed in, totp_secret/totp_enabled are only
      -- ever set for email-provider users who opted into an authenticator app (see server/auth.ts).
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        provider TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );

      -- Domain allowlist gating email-address login (Entra ID logins aren't checked against this —
      -- see server/auth.ts's signIn callback). Empty table means no email domain is allowed yet.
      CREATE TABLE IF NOT EXISTS allowed_email_domains (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      -- One-time email login codes; a new row per requested code, never updated except to mark it
      -- consumed. Old/expired rows for an email are pruned whenever a new one is requested.
      CREATE TABLE IF NOT EXISTS email_login_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_email_login_codes_email ON email_login_codes (email, created_at);

      -- Singleton-per-key app-wide settings (e.g. "sessionScope" = "browser" | "tab") — see
      -- server/authSettings.ts. Not per-user; controlled from the admin security page.
      CREATE TABLE IF NOT EXISTS auth_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
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
      revision: row.revision,
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
      revision: row.revision ?? undefined,
      version: row.version ?? undefined,
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
      revision: row.revision,
      deployedAt: row.deployed_at,
    };
  }

  private toDeployedScript(row: DeployedScriptRow): DeployedScript {
    return { ...this.toDeployedScriptSummary(row), code: row.code };
  }

  private toWebhookConfig(row: WebhookConfigRow): WebhookConfig {
    return {
      flowId: row.flow_id,
      projectId: row.project_id,
      token: row.token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toWebhookDelivery(row: WebhookDeliveryRow): WebhookDelivery {
    return {
      id: row.id,
      flowId: row.flow_id,
      projectId: row.project_id,
      receivedAt: row.received_at,
      method: row.method,
      status: row.status,
      success: Boolean(row.success),
      headersJson: row.headers_json,
      bodyText: row.body_text,
      error: row.error ?? undefined,
    };
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
      this.db.prepare("DELETE FROM webhook_deliveries WHERE project_id = ?").run(id);
      this.db.prepare("DELETE FROM webhook_configs WHERE project_id = ?").run(id);
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
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare("INSERT INTO flows (id, project_id, name, graph_json, version, revision, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)").run(flow.id, flow.projectId, flow.name, flow.version, flow.revision, flow.createdAt, flow.updatedAt);
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
      this.db.prepare("DELETE FROM webhook_deliveries WHERE flow_id = ?").run(fId);
      this.db.prepare("DELETE FROM webhook_configs WHERE flow_id = ?").run(fId);
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
      this.db.prepare("UPDATE flows SET name = ?, graph_json = ?, version = ?, revision = revision + 1, updated_at = ? WHERE project_id = ? AND id = ?").run(target.name, target.graph_json, current.version + 1, now, pId, fId);
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

  /** Bumps `revision` on every save — unlike `version` (only bumped by "Save new version"/restore),
   * `revision` tracks every time the graph's own content is persisted, autosave included. */
  saveFlowGraphJson(flowId: string, graphJson: string): void {
    const now = new Date().toISOString();
    const save = this.db.transaction((fId: string, json: string, ts: string) => {
      const row = this.db.prepare<[string], { project_id: string }>("SELECT project_id FROM flows WHERE id = ?").get(fId);
      this.db.prepare("UPDATE flows SET graph_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?").run(json, ts, fId);
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
        .prepare("INSERT INTO runs (id, project_id, flow_id, flow_name, started_at, finished_at, entries_json, kind, execution_ms, revision, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(r.id, r.projectId, r.flowId, r.flowName, r.startedAt, r.finishedAt ?? null, JSON.stringify(r.entries), r.kind, r.executionMs ?? null, r.revision ?? null, r.version ?? null);

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
   * is the Flow's own `version` at the moment it was compiled/deployed (see
   * DeployedScript.version's own doc comment), not an independent counter. */
  upsertDeployedScript(input: { projectId: string; flowId: string; flowName: string; code: string; manifest: { triggers: TriggerDescriptor[] }; version: number; revision: number }): DeployedScript {
    const existing = this.db.prepare<[string], { id: string }>("SELECT id FROM deployed_scripts WHERE flow_id = ?").get(input.flowId);
    const record: DeployedScript = {
      id: existing?.id ?? nextId("deployment"),
      projectId: input.projectId,
      flowId: input.flowId,
      flowName: input.flowName,
      code: input.code,
      manifest: input.manifest,
      version: input.version,
      revision: input.revision,
      deployedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO deployed_scripts (id, project_id, flow_id, flow_name, code, manifest_json, version, revision, deployed_at) VALUES (@id, @projectId, @flowId, @flowName, @code, @manifestJson, @version, @revision, @deployedAt)
         ON CONFLICT(flow_id) DO UPDATE SET flow_name = @flowName, code = @code, manifest_json = @manifestJson, version = @version, revision = @revision, deployed_at = @deployedAt`,
      )
      .run({
        id: record.id,
        projectId: record.projectId,
        flowId: record.flowId,
        flowName: record.flowName,
        code: record.code,
        manifestJson: JSON.stringify(record.manifest),
        version: record.version,
        revision: record.revision,
        deployedAt: record.deployedAt,
      });
    return record;
  }

  // --- Webhooks ---

  /** Every Flow in `projectId` with a deployed "On HTTP Request" trigger, newest-deployed-first,
   * each combined with its WebhookConfig (lazily created/defaulted — see getOrCreateWebhookConfig).
   * Feeds the Webhooks page's list. */
  listWebhookFlows(projectId: string): WebhookFlowSummary[] {
    const rows = this.db.prepare<[string], DeployedScriptRow>("SELECT * FROM deployed_scripts WHERE project_id = ? ORDER BY deployed_at DESC").all(projectId);
    return rows
      .filter((row) => (JSON.parse(row.manifest_json) as { triggers: TriggerDescriptor[] }).triggers.some((t) => t.kind === "request"))
      .map((row) => ({
        flowId: row.flow_id,
        flowName: row.flow_name,
        projectId: row.project_id,
        deployedAt: row.deployed_at,
        config: this.getOrCreateWebhookConfig(row.flow_id, row.project_id),
      }));
  }

  /** Reads this Flow's webhook security config, creating a row with a freshly generated token the
   * first time it's ever asked for — every deployed Flow with an "On HTTP Request" trigger has
   * exactly one of these once read, never conjured on the fly by the hooks route itself. */
  getOrCreateWebhookConfig(flowId: string, projectId: string): WebhookConfig {
    const existing = this.db.prepare<[string], WebhookConfigRow>("SELECT * FROM webhook_configs WHERE flow_id = ?").get(flowId);
    if (existing) return this.toWebhookConfig(existing);
    const now = new Date().toISOString();
    const row: WebhookConfigRow = { id: nextId("webhook_config"), flow_id: flowId, project_id: projectId, token: randomBytes(24).toString("hex"), created_at: now, updated_at: now };
    this.db.prepare("INSERT INTO webhook_configs (id, flow_id, project_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.flow_id, row.project_id, row.token, row.created_at, row.updated_at);
    return this.toWebhookConfig(row);
  }

  /** Issues a brand new bearer token, invalidating the previous one immediately — any caller still
   * using the old value starts getting 401s the next call. */
  regenerateWebhookToken(flowId: string, projectId: string): WebhookConfig {
    this.getOrCreateWebhookConfig(flowId, projectId);
    const token = randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    this.db.prepare("UPDATE webhook_configs SET token = ?, updated_at = ? WHERE flow_id = ?").run(token, now, flowId);
    return this.getOrCreateWebhookConfig(flowId, projectId);
  }

  /** Persists one inbound call against a Flow's webhook endpoint and caps its history at
   * MAX_WEBHOOK_DELIVERIES_PER_FLOW, same pattern as appendRun's per-project cap. */
  recordWebhookDelivery(delivery: WebhookDelivery): void {
    const insertAndCap = this.db.transaction((d: WebhookDelivery) => {
      this.db
        .prepare("INSERT INTO webhook_deliveries (id, flow_id, project_id, received_at, method, status, success, headers_json, body_text, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(d.id, d.flowId, d.projectId, d.receivedAt, d.method, d.status, d.success ? 1 : 0, d.headersJson, d.bodyText, d.error ?? null);

      const staleIds = this.db.prepare<[string, number], { id: string }>("SELECT id FROM webhook_deliveries WHERE flow_id = ? ORDER BY received_at DESC LIMIT -1 OFFSET ?").all(d.flowId, MAX_WEBHOOK_DELIVERIES_PER_FLOW);
      if (staleIds.length > 0) {
        const placeholders = staleIds.map(() => "?").join(", ");
        this.db.prepare(`DELETE FROM webhook_deliveries WHERE id IN (${placeholders})`).run(...staleIds.map((row) => row.id));
      }
    });
    insertAndCap(delivery);
  }

  /** Every recorded delivery for this Flow, newest first — feeds the Webhooks page's per-flow
   * delivery inspector. */
  listWebhookDeliveries(flowId: string): WebhookDelivery[] {
    const rows = this.db.prepare<[string], WebhookDeliveryRow>("SELECT * FROM webhook_deliveries WHERE flow_id = ? ORDER BY received_at DESC").all(flowId);
    return rows.map((row) => this.toWebhookDelivery(row));
  }

  // --- Users / login ---

  private toUserAccount(row: UserRow): UserAccount {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      provider: row.provider === "entra" ? "entra" : "email",
      isAdmin: Boolean(row.is_admin),
      totpEnabled: Boolean(row.totp_enabled),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }

  getUserByEmail(email: string): UserAccount | undefined {
    const row = this.db.prepare<[string], UserRow>("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    return row ? this.toUserAccount(row) : undefined;
  }

  /** Creates the user row on first-ever sign-in, otherwise just refreshes name/provider/last-login
   * — called once per successful sign-in from server/auth.ts's `jwt` callback. `isAdmin` is
   * recomputed from the ADMIN_EMAILS env var every time, so removing an email there revokes access
   * on that user's next sign-in without needing a DB migration. */
  upsertUserFromLogin(email: string, name: string | null, provider: "entra" | "email", isAdmin: boolean): UserAccount {
    const normalizedEmail = email.toLowerCase();
    const now = new Date().toISOString();
    const existing = this.db.prepare<[string], UserRow>("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    if (existing) {
      this.db.prepare("UPDATE users SET name = ?, provider = ?, is_admin = ?, last_login_at = ? WHERE id = ?").run(name, provider, isAdmin ? 1 : 0, now, existing.id);
      return this.toUserAccount({ ...existing, name, provider, is_admin: isAdmin ? 1 : 0, last_login_at: now });
    }
    const row: UserRow = { id: nextId("user"), email: normalizedEmail, name, provider, is_admin: isAdmin ? 1 : 0, totp_secret: null, totp_enabled: 0, created_at: now, last_login_at: now };
    this.db.prepare("INSERT INTO users (id, email, name, provider, is_admin, totp_secret, totp_enabled, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.email, row.name, row.provider, row.is_admin, row.totp_secret, row.totp_enabled, row.created_at, row.last_login_at);
    return this.toUserAccount(row);
  }

  /** Stores a freshly generated TOTP secret as *pending* (not yet enabled) until confirmed via
   * confirmUserTotpSecret — never trust a secret the user hasn't proven they can generate codes for. */
  setPendingUserTotpSecret(email: string, secret: string): void {
    this.db.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE email = ?").run(secret, email.toLowerCase());
  }

  getUserTotpSecret(email: string): string | undefined {
    const row = this.db.prepare<[string], Pick<UserRow, "totp_secret">>("SELECT totp_secret FROM users WHERE email = ?").get(email.toLowerCase());
    return row?.totp_secret ?? undefined;
  }

  confirmUserTotpEnabled(email: string): void {
    this.db.prepare("UPDATE users SET totp_enabled = 1 WHERE email = ?").run(email.toLowerCase());
  }

  disableUserTotp(email: string): void {
    this.db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE email = ?").run(email.toLowerCase());
  }

  // --- Allowed email domains ---

  listAllowedDomains(): string[] {
    return this.db
      .prepare<[], { domain: string }>("SELECT domain FROM allowed_email_domains ORDER BY domain")
      .all()
      .map((row) => row.domain);
  }

  addAllowedDomain(domain: string): void {
    const normalized = domain.trim().toLowerCase().replace(/^@/, "");
    if (!normalized) return;
    this.db.prepare("INSERT OR IGNORE INTO allowed_email_domains (id, domain, created_at) VALUES (?, ?, ?)").run(nextId("domain"), normalized, new Date().toISOString());
  }

  removeAllowedDomain(domain: string): void {
    this.db.prepare("DELETE FROM allowed_email_domains WHERE domain = ?").run(domain.trim().toLowerCase().replace(/^@/, ""));
  }

  /** Deny-by-default: an email is only accepted for email-based login once its domain has been
   * explicitly added to the allowlist by an admin. */
  isEmailDomainAllowed(email: string): boolean {
    const domain = email.toLowerCase().split("@")[1];
    if (!domain) return false;
    const row = this.db.prepare<[string], { domain: string }>("SELECT domain FROM allowed_email_domains WHERE domain = ?").get(domain);
    return Boolean(row);
  }

  // --- Email login codes ---

  /** One code at a time per email — clears out any previous unconsumed codes before issuing a new
   * one, and also opportunistically sweeps anything already expired. */
  createEmailLoginCode(email: string, code: string, ttlMs: number): void {
    const normalizedEmail = email.toLowerCase();
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const codeHash = createHash("sha256").update(code).digest("hex");
    const insert = this.db.transaction(() => {
      this.db.prepare("DELETE FROM email_login_codes WHERE email = ? AND consumed_at IS NULL").run(normalizedEmail);
      this.db.prepare("DELETE FROM email_login_codes WHERE expires_at < ?").run(nowIso);
      this.db.prepare("INSERT INTO email_login_codes (id, email, code_hash, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)").run(nextId("login_code"), normalizedEmail, codeHash, expiresAt, nowIso);
    });
    insert();
  }

  /** True (and marks the code consumed) only for the most recent, unexpired, unconsumed code for
   * this email whose hash matches — every other case (wrong code, expired, already used) is false,
   * with no distinction surfaced to the caller (avoids leaking which case it was). */
  verifyAndConsumeEmailLoginCode(email: string, code: string): boolean {
    const normalizedEmail = email.toLowerCase();
    const codeHash = createHash("sha256").update(code).digest("hex");
    const now = new Date().toISOString();
    const row = this.db.prepare<[string, string, string], EmailLoginCodeRow>("SELECT * FROM email_login_codes WHERE email = ? AND code_hash = ? AND consumed_at IS NULL AND expires_at >= ? ORDER BY created_at DESC LIMIT 1").get(normalizedEmail, codeHash, now);
    if (!row) return false;
    this.db.prepare("UPDATE email_login_codes SET consumed_at = ? WHERE id = ?").run(now, row.id);
    return true;
  }

  /** Guards against spamming the mailer — refuses a new code request within `cooldownMs` of the
   * last one issued for this email. */
  wasEmailLoginCodeRequestedRecently(email: string, cooldownMs: number): boolean {
    const row = this.db.prepare<[string], { created_at: string }>("SELECT created_at FROM email_login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1").get(email.toLowerCase());
    if (!row) return false;
    return Date.now() - new Date(row.created_at).getTime() < cooldownMs;
  }

  // --- Auth settings (global, admin-controlled) ---

  getAuthSettings(): AuthSettings {
    const row = this.db.prepare<[string], { value: string }>("SELECT value FROM auth_settings WHERE key = ?").get("sessionScope");
    return { sessionScope: row?.value === "tab" ? "tab" : "browser" };
  }

  setSessionScope(scope: "browser" | "tab"): void {
    this.db.prepare("INSERT INTO auth_settings (key, value) VALUES ('sessionScope', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(scope);
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
