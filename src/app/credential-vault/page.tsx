"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createCredential, deleteCredential, getCredential, listCredentials, updateCredential } from "../../client/api";
import { allCredentialTypeDefs, getCredentialTypeDef } from "../../credentials/registry";
import type { CredentialData, CredentialSummary, CredentialTypeId } from "../../credentials/types";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";

const DEFAULT_TYPE: CredentialTypeId = allCredentialTypeDefs()[0].id;

/** Editing state for the Add/Edit modal — `id` is null while creating a brand new credential,
 * set while editing an existing one (so submit knows whether to POST or PATCH). `fields` is a
 * plain string map keyed by the current type's field ids (see credentials/registry.ts), rebuilt
 * whenever the type selector changes. */
interface DialogState {
  id: string | null;
  name: string;
  type: CredentialTypeId;
  fields: Record<string, string>;
}

function blankDialogState(type: CredentialTypeId = DEFAULT_TYPE): DialogState {
  const fields: Record<string, string> = {};
  for (const field of getCredentialTypeDef(type).fields) fields[field.id] = "";
  return { id: null, name: "", type, fields };
}

function CredentialDialog({ initial, onClose, onSaved }: { initial: DialogState; onClose: () => void; onSaved: () => void }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const typeDef = getCredentialTypeDef(state.type);

  function changeType(type: CredentialTypeId): void {
    setState((s) => ({ ...blankDialogState(type), id: s.id, name: s.name }));
  }

  async function handleSubmit(): Promise<void> {
    if (!state.name.trim()) {
      setError("Name is required");
      return;
    }
    const data = { ...state.fields } as unknown as CredentialData;
    try {
      if (state.id) await updateCredential(state.id, state.name.trim(), state.type, data);
      else await createCredential(state.name.trim(), state.type, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">{state.id ? "Edit Credential" : "Add Credential"}</h2>

        <label className="modal-field-row">
          <span className="modal-field-label">Name</span>
          <input type="text" value={state.name} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} autoFocus />
        </label>

        <label className="modal-field-row">
          <span className="modal-field-label">Type</span>
          <select value={state.type} onChange={(e) => changeType(e.target.value as CredentialTypeId)} disabled={state.id !== null}>
            {allCredentialTypeDefs().map((def) => (
              <option key={def.id} value={def.id}>
                {def.label}
              </option>
            ))}
          </select>
        </label>

        {typeDef.fields.map((field) => (
          <label className="modal-field-row" key={field.id}>
            <span className="modal-field-label">{field.label}</span>
            <input
              type={field.secret ? "password" : "text"}
              value={state.fields[field.id] ?? ""}
              onChange={(e) => setState((s) => ({ ...s, fields: { ...s.fields, [field.id]: e.target.value } }))}
            />
          </label>
        ))}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSubmit()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CredentialVaultPage() {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  async function refresh(): Promise<void> {
    setCredentials(await listCredentials());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openEditDialog(id: string): Promise<void> {
    const credential = await getCredential(id);
    const fields: Record<string, string> = {};
    for (const field of getCredentialTypeDef(credential.type).fields) {
      fields[field.id] = String((credential.data as unknown as Record<string, unknown>)[field.id] ?? "");
    }
    setDialog({ id: credential.id, name: credential.name, type: credential.type, fields });
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!confirm(`Delete credential "${name}"? Any node referencing it by name will start failing.`)) return;
    await deleteCredential(id);
    await refresh();
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Credential Vault" }]} />
      <Link href="/" className="back-link">
        ← Back
      </Link>
      <h1>Credential Vault</h1>

      <div className="create-row">
        <button type="button" onClick={() => setDialog(blankDialogState())}>
          Add Credential
        </button>
      </div>

      {credentials.length === 0 ? (
        <p className="page-empty-note">No credentials yet — add one above. A graph node references one by its Name.</p>
      ) : (
        <ul className="entity-list">
          {credentials.map((credential) => (
            <li key={credential.id} className="entity-row">
              <span className="entity-name">
                {credential.name} <span className="entity-type-tag">{getCredentialTypeDef(credential.type).label}</span>
              </span>
              <div className="entity-actions">
                <button type="button" onClick={() => void openEditDialog(credential.id)}>
                  Edit
                </button>
                <button type="button" onClick={() => void handleDelete(credential.id, credential.name)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <CredentialDialog
          initial={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
    </PageShell>
  );
}
