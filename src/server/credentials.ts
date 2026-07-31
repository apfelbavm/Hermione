import { nextId } from "../engine/graphMutations";
import type { CredentialData, CredentialRecord, CredentialSummary, CredentialTypeId } from "../credentials/types";
import { getDb } from "./db";

interface CredentialRow {
  id: string;
  name: string;
  type: CredentialTypeId;
  data_json: string;
  created_at: string;
  updated_at: string;
}

function toSummary(row: CredentialRow): CredentialSummary {
  return { id: row.id, name: row.name, type: row.type, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toRecord(row: CredentialRow): CredentialRecord {
  return { ...toSummary(row), data: JSON.parse(row.data_json) as CredentialData };
}

/** Never includes `data` — the vault's list view (and anything else that doesn't need the actual
 * secret) has no business reading it. */
export function listCredentials(): CredentialSummary[] {
  const rows = getDb().prepare<[], CredentialRow>("SELECT * FROM credentials ORDER BY name").all();
  return rows.map(toSummary);
}

export function getCredential(id: string): CredentialRecord | undefined {
  const row = getDb().prepare<[string], CredentialRow>("SELECT * FROM credentials WHERE id = ?").get(id);
  return row ? toRecord(row) : undefined;
}

/** Used by the oauth2Saml node (see engine/types.ts's ExecutionContext.getCredential) — credential
 * names are unique (see the DB's own UNIQUE constraint), so this is a stable way for a node to
 * reference a credential by the same name shown in the vault's list, without needing its id. */
export function getCredentialByName(name: string): CredentialRecord | undefined {
  const row = getDb().prepare<[string], CredentialRow>("SELECT * FROM credentials WHERE name = ?").get(name);
  return row ? toRecord(row) : undefined;
}

export function createCredential(name: string, type: CredentialTypeId, data: CredentialData): CredentialRecord {
  const now = new Date().toISOString();
  const record: CredentialRecord = { id: nextId("credential"), name, type, data, createdAt: now, updatedAt: now };
  getDb().prepare("INSERT INTO credentials (id, name, type, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(record.id, record.name, record.type, JSON.stringify(record.data), record.createdAt, record.updatedAt);
  return record;
}

export function updateCredential(id: string, name: string, type: CredentialTypeId, data: CredentialData): void {
  getDb().prepare("UPDATE credentials SET name = ?, type = ?, data_json = ?, updated_at = ? WHERE id = ?").run(name, type, JSON.stringify(data), new Date().toISOString(), id);
}

export function deleteCredential(id: string): void {
  getDb().prepare("DELETE FROM credentials WHERE id = ?").run(id);
}
