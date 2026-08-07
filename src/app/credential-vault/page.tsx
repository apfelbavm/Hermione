"use client";

import { useEffect, useState } from "react";
import { i18n } from "@i18n";
import { createCredential, createVaultConnection, deleteCredential, deleteVaultConnection, getCredential, getVaultSecret, listCredentials, listVaultConnections, listVaultSecrets, updateCredential } from "../../client/api";
import { getCredentialTypeDef, selectableCredentialTypeDefs } from "@hermione/shared/registry";
import type { CredentialData, CredentialSummary, CredentialTypeId } from "@hermione/shared/types";
import { allVaultProviderDefs, getVaultProviderDef } from "@hermione/shared/vaultProviders";
import type { VaultProviderId } from "@hermione/shared/vaultProviders";
import type { VaultConnectionSummary } from "@hermione/core/server/models";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";

const DEFAULT_TYPE: CredentialTypeId = selectableCredentialTypeDefs()[0].id;
const BUILTIN_TAB = "__builtin__";
const ADD_VAULT_TAB = "__add__";

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
      setError(i18n.pages.credential_vault.modal_name_required);
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
        <h2 className="modal-title">{state.id ? i18n.pages.credential_vault.modal_edit_title : i18n.pages.credential_vault.modal_add_title}</h2>

        <label className="modal-field-row">
          <span className="modal-field-label">{i18n.pages.credential_vault.modal_name_label}</span>
          <input type="text" value={state.name} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} disabled={state.id !== null} autoFocus />
        </label>

        <label className="modal-field-row">
          <span className="modal-field-label">{i18n.pages.credential_vault.modal_type_label}</span>
          <select value={state.type} onChange={(e) => changeType(e.target.value as CredentialTypeId)} disabled={state.id !== null}>
            {selectableCredentialTypeDefs().map((def) => (
              <option key={def.id} value={def.id}>
                {def.label}
              </option>
            ))}
          </select>
        </label>

        {typeDef.fields.map((field) => (
          <label className="modal-field-row" key={field.id}>
            <span className="modal-field-label">
              {field.label}
              {field.help && (
                <span className="modal-field-help" title={field.help}>
                  ?
                </span>
              )}
            </span>
            <input
              // type={field.secret ? "password" : "text"}
              type="text"
              value={state.fields[field.id] ?? ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  fields: { ...s.fields, [field.id]: e.target.value },
                }))
              }
            />
          </label>
        ))}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-gray" onClick={onClose}>
            {i18n.pages.credential_vault.modal_cancel}
          </button>
          <button type="button" className="btn btn-green" onClick={() => void handleSubmit()}>
            {i18n.pages.credential_vault.modal_save}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The built-in vault's own list/add/edit/delete UI — exactly what this page used to be before it
 * became one tab among several (see CredentialVaultPage). */
function BuiltInVaultTab() {
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
    setDialog({
      id: credential.id,
      name: credential.name,
      type: credential.type,
      fields,
    });
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!confirm(i18n.pages.credential_vault.delete_confirm.replace("{name}", name))) return;
    await deleteCredential(id);
    await refresh();
  }

  return (
    <>
      <div className="credentials-create-row">
        <button type="button" className="btn btn-green" onClick={() => setDialog(blankDialogState())}>
          {i18n.pages.credential_vault.add}
        </button>
      </div>

      {credentials.length === 0 ? (
        <p className="page-empty-note">{i18n.pages.credential_vault.empty}</p>
      ) : (
        <ul className="entity-list">
          {credentials.map((credential) => (
            <li key={credential.id} className="entity-row">
              <span className="entity-name">
                {credential.name} <span className="entity-type-tag">{getCredentialTypeDef(credential.type).label}</span>
              </span>
              <div className="entity-actions">
                <button type="button" className="btn btn-gray btn-sm" onClick={() => void openEditDialog(credential.id)}>
                  {i18n.pages.credential_vault.edit}
                </button>
                <button type="button" className="btn btn-gray btn-sm" onClick={() => void handleDelete(credential.id, credential.name)}>
                  {i18n.pages.credential_vault.delete}
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
    </>
  );
}

/** One connected external vault's own tab — read-only browsing of its secrets (see this feature's
 * own scoping: external vaults are for selecting/using existing secrets, never created/edited from
 * here — that stays the responsibility of the external vault itself). */
function ExternalVaultTab({ connection, onRemoved }: { connection: VaultConnectionSummary; onRemoved: () => void }) {
  const [secrets, setSecrets] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedFields, setExpandedFields] = useState<Record<string, string> | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    try {
      setSecrets(await listVaultSecrets(connection.id));
    } catch (err) {
      setSecrets([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
    setExpandedId(null);
    setExpandedFields(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);

  async function toggleView(secretId: string): Promise<void> {
    if (expandedId === secretId) {
      setExpandedId(null);
      setExpandedFields(null);
      return;
    }
    setExpandedId(secretId);
    setExpandedFields(null);
    try {
      setExpandedFields(await getVaultSecret(connection.id, secretId));
    } catch (err) {
      setExpandedFields({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleRemove(): Promise<void> {
    if (!confirm(i18n.pages.credential_vault.remove_vault_confirm.replace("{name}", connection.name))) return;
    await deleteVaultConnection(connection.id);
    onRemoved();
  }

  return (
    <>
      <div className="credentials-create-row">
        <span className="entity-type-tag">{getVaultProviderDef(connection.provider).label}</span>
        <button type="button" className="btn btn-gray" onClick={() => void refresh()}>
          {i18n.pages.credential_vault.secrets_refresh}
        </button>
        <button type="button" className="btn btn-gray" onClick={() => void handleRemove()}>
          {i18n.pages.credential_vault.remove_vault}
        </button>
      </div>

      {error && <p className="modal-error">{i18n.pages.credential_vault.load_error.replace("{error}", error)}</p>}

      {secrets === null ? null : secrets.length === 0 ? (
        <p className="page-empty-note">{i18n.pages.credential_vault.secrets_empty}</p>
      ) : (
        <ul className="entity-list">
          {secrets.map((secret) => (
            <li key={secret.id} className="entity-row">
              <span className="entity-name">{secret.name}</span>
              <div className="entity-actions">
                <button type="button" className="btn btn-gray btn-sm" onClick={() => void toggleView(secret.id)}>
                  {expandedId === secret.id ? i18n.pages.credential_vault.secret_hide : i18n.pages.credential_vault.secret_view}
                </button>
              </div>
              {expandedId === secret.id && (
                <div className="modal-field-row" style={{ width: "100%" }}>
                  {expandedFields === null
                    ? "…"
                    : Object.entries(expandedFields).map(([key, value]) => (
                        <div key={key}>
                          <strong>{key}:</strong> {value}
                        </div>
                      ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Field state for the "Connect Vault" dialog — mirrors DialogState's own shape for the built-in
 * vault's Add/Edit dialog, one plain string per the picked provider's own config fields (see
 * credentials/vaultProviders.ts). */
interface AddVaultDialogState {
  name: string;
  provider: VaultProviderId;
  fields: Record<string, string>;
}

function blankAddVaultDialogState(provider: VaultProviderId = allVaultProviderDefs()[0].id): AddVaultDialogState {
  const fields: Record<string, string> = {};
  for (const field of getVaultProviderDef(provider).fields) fields[field.id] = "";
  return { name: "", provider, fields };
}

function AddVaultConnectionDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (connection: VaultConnectionSummary) => void }) {
  const [state, setState] = useState<AddVaultDialogState>(blankAddVaultDialogState());
  const [error, setError] = useState<string | null>(null);
  const providerDef = getVaultProviderDef(state.provider);

  function changeProvider(provider: VaultProviderId): void {
    setState((s) => ({ ...blankAddVaultDialogState(provider), name: s.name }));
  }

  async function handleSubmit(): Promise<void> {
    if (!state.name.trim()) {
      setError(i18n.pages.credential_vault.modal_name_required);
      return;
    }
    try {
      const connection = await createVaultConnection(state.name.trim(), state.provider, state.fields);
      onSaved(connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">{i18n.pages.credential_vault.add_vault_title}</h2>

        <label className="modal-field-row">
          <span className="modal-field-label">{i18n.pages.credential_vault.modal_name_label}</span>
          <input type="text" value={state.name} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} autoFocus />
        </label>

        <label className="modal-field-row">
          <span className="modal-field-label">{i18n.pages.credential_vault.add_vault_provider_label}</span>
          <select value={state.provider} onChange={(e) => changeProvider(e.target.value as VaultProviderId)}>
            {allVaultProviderDefs().map((def) => (
              <option key={def.id} value={def.id}>
                {def.label}
              </option>
            ))}
          </select>
        </label>

        {providerDef.fields.map((field) => (
          <label className="modal-field-row" key={field.id}>
            <span className="modal-field-label">
              {field.label}
              {field.help && (
                <span className="modal-field-help" title={field.help}>
                  ?
                </span>
              )}
            </span>
            <input
              type="text"
              value={state.fields[field.id] ?? ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  fields: { ...s.fields, [field.id]: e.target.value },
                }))
              }
            />
          </label>
        ))}

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-gray" onClick={onClose}>
            {i18n.pages.credential_vault.modal_cancel}
          </button>
          <button type="button" className="btn btn-green" onClick={() => void handleSubmit()}>
            {i18n.pages.credential_vault.add_vault_save}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CredentialVaultPage() {
  const [vaultConnections, setVaultConnections] = useState<VaultConnectionSummary[]>([]);
  const [activeTab, setActiveTab] = useState<string>(BUILTIN_TAB);
  const [showAddDialog, setShowAddDialog] = useState(false);

  async function refreshVaultConnections(): Promise<void> {
    setVaultConnections(await listVaultConnections());
  }

  useEffect(() => {
    void refreshVaultConnections();
  }, []);

  function selectTab(key: string): void {
    if (key === ADD_VAULT_TAB) {
      setShowAddDialog(true);
      return;
    }
    setActiveTab(key);
  }

  const activeConnection = vaultConnections.find((c) => c.id === activeTab);

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: i18n.pages.credential_vault.title }]} />
      <h1>{i18n.pages.credential_vault.title}</h1>

      <nav className="project-tabs" aria-label="Credential vaults">
        <button type="button" className={`project-tab${activeTab === BUILTIN_TAB ? " project-tab-active" : ""}`} onClick={() => selectTab(BUILTIN_TAB)}>
          {i18n.pages.credential_vault.tab_builtin}
        </button>
        {vaultConnections.map((connection) => (
          <button key={connection.id} type="button" className={`project-tab${activeTab === connection.id ? " project-tab-active" : ""}`} onClick={() => selectTab(connection.id)}>
            {connection.name}
          </button>
        ))}
        <button type="button" className="project-tab" onClick={() => selectTab(ADD_VAULT_TAB)}>
          {i18n.pages.credential_vault.tab_add}
        </button>
      </nav>

      {activeTab === BUILTIN_TAB && <BuiltInVaultTab />}
      {activeConnection && (
        <ExternalVaultTab
          key={activeConnection.id}
          connection={activeConnection}
          onRemoved={() => {
            setActiveTab(BUILTIN_TAB);
            void refreshVaultConnections();
          }}
        />
      )}

      {showAddDialog && (
        <AddVaultConnectionDialog
          onClose={() => setShowAddDialog(false)}
          onSaved={(connection) => {
            setShowAddDialog(false);
            setActiveTab(connection.id);
            void refreshVaultConnections();
          }}
        />
      )}
    </PageShell>
  );
}
