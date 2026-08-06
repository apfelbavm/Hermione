import type { LogFormat } from "../graph/engine/types";
import type { TriggerDescriptor } from "../graph/compiler/codegen";

/** Plain data shapes returned by DatabaseManager — never anything SQL/row-shaped (see that file's
 * own doc comment). Safe to import (type-only) from anywhere, including client components, since
 * these carry no runtime code of their own. */

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowSummary {
  id: string;
  projectId: string;
  name: string;
  version: number;
  /** Bumped every time the graph itself is saved (autosave/Save), independent of `version` (which
   * only bumps on an explicit "Save new version" / restore) — see DatabaseManager.saveFlowGraphJson. */
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** One archived row from `flow_versions` — every one of these is strictly older than the Flow's
 * current live version (see DatabaseManager.saveNewFlowVersion/restoreFlowVersion). Feeds the
 * "Restore old version" page's version-picker dropdown. */
export interface FlowVersionSummary {
  id: string;
  flowId: string;
  version: number;
  name: string;
  createdAt: string;
}

export interface FlowVersion extends FlowVersionSummary {
  graphJson: string | null;
}

export interface LogEntry {
  id: string;
  message: string;
  format: LogFormat;
  timestamp: string;
}

export type RunKind = "simulate" | "manual" | "chained" | "deploy" | "request";

export interface RunLog {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  startedAt: string;
  finishedAt?: string;
  entries: LogEntry[];
  kind: RunKind;
  executionMs?: number;
  /** The Flow's `revision` (manual) or the deployed script's own `revision` at the time this ran. */
  revision?: number;
  /** The Flow's `version` (manual: the deployed script's own `version`) at the time this ran. */
  version?: number;
}

export interface DeployedScriptSummary {
  id: string;
  projectId: string;
  flowId: string;
  flowName: string;
  manifest: { triggers: TriggerDescriptor[] };
  /** The Flow's own `version` at the moment it was compiled/deployed — passed into compileGraph. */
  version: number;
  /** The Flow's own `revision` at the moment it was compiled/deployed — passed into compileGraph. */
  revision: number;
  deployedAt: string;
}

export interface DeployedScript extends DeployedScriptSummary {
  code: string;
}

/** Per-Flow inbound webhook security settings — one row per Flow, created lazily (with a token
 * auto-generated) the first time it's ever read. See DatabaseManager.getOrCreateWebhookConfig. */
export interface WebhookConfig {
  flowId: string;
  projectId: string;
  /** Bearer token a caller must send as `Authorization: Bearer <token>` — always required, never
   * null (see DatabaseManager.getOrCreateWebhookConfig/regenerateWebhookToken). */
  token: string;
  createdAt: string;
  updatedAt: string;
}

/** One flow with an inbound "On HTTP Request" trigger, for the Webhooks page's list — combines the
 * deployed script's own manifest info with this Flow's WebhookConfig. */
export interface WebhookFlowSummary {
  flowId: string;
  flowName: string;
  projectId: string;
  deployedAt: string;
  config: WebhookConfig;
}

/** One recorded inbound call against a Flow's webhook endpoint — feeds the Webhooks page's
 * delivery inspector. Captured regardless of whether the call was authorized/succeeded. */
export interface WebhookDelivery {
  id: string;
  flowId: string;
  projectId: string;
  receivedAt: string;
  method: string;
  status: number;
  success: boolean;
  /** JSON-stringified headers map — the Authorization header's value is redacted before storing. */
  headersJson: string;
  bodyText: string;
  error?: string;
}

/** "admin" can manage users (see /admin/users); "editor" and "viewer" don't yet have any
 * enforced permission difference elsewhere in the app — they exist so an admin can record
 * intended access level ahead of finer-grained permission checks being added. */
export type UserRole = "viewer" | "editor" | "admin";

/** One person who has ever signed in — see DatabaseManager's users table comment for
 * provider/totp semantics. */
export interface UserAccount {
  id: string;
  email: string;
  name: string | null;
  provider: "entra" | "email";
  role: UserRole;
  /** Convenience for `role === "admin"` — kept because most of the app's admin gates already
   * check this boolean. */
  isAdmin: boolean;
  blocked: boolean;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Global, admin-controlled login behavior — see DatabaseManager's auth_settings table comment. */
export interface AuthSettings {
  /** "browser": a normal shared cookie session (all tabs signed in together, one sign-out signs out
   * everywhere). "tab": each tab holds its own independent session token in sessionStorage — a
   * brand-new tab always starts signed out, and closing/signing out of one tab never affects
   * others. See src/components/AuthGate.tsx for the client-side half of this. */
  sessionScope: "browser" | "tab";
}
