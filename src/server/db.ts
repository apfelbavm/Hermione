import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Server-only — better-sqlite3 is a native binding (see next.config.mjs's serverExternalPackages)
// and this file touches the filesystem directly. Never import this (or anything under src/server/)
// from a "use client" component; pages talk to it exclusively through the API routes under
// src/app/api/, the same boundary the rest of this app already keeps between the browser and
// anything Node-only (see simulate/route.ts's own "must run under the Node runtime" comment).

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "hermione.db");

/** Module-level singleton — Next.js keeps this module instance alive for the life of the dev/prod
 * server process, so a single shared connection (rather than one per request) is both correct and
 * the whole point of `better-sqlite3`'s synchronous, single-connection design. */
let db: Database.Database | null = null;

function bootstrapSchema(instance: Database.Database): void {
  instance.pragma("journal_mode = WAL");
  instance.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      graph_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flows_project_id ON flows (project_id);

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      flow_id TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      entries_json TEXT NOT NULL
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
  `);
}

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    bootstrapSchema(db);
  }
  return db;
}
