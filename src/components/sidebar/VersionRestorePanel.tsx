"use client";

import { i18n } from "@i18n";
import type { FlowVersionSummary } from "../../server/models";
import { formatLogTimestamp } from "../../shared/formatLogTimestamp";

/** The sole content of #restore-sidebar, the "Restore old version" page's own leftmost sidebar —
 * the version picker plus the Restore/Cancel actions, kept separate from the (read-only, reused)
 * Functions/Variables/Scripts panels in #left-sidebar to its right. */
export function VersionRestorePanel({
  versions,
  selectedVersionId,
  onSelectVersion,
  onRestore,
  onCancel,
  loadingVersions,
  loadingGraph,
  restoring,
}: {
  versions: FlowVersionSummary[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  onRestore: () => void;
  onCancel: () => void;
  loadingVersions: boolean;
  loadingGraph: boolean;
  restoring: boolean;
}) {
  const busy = loadingVersions || loadingGraph || restoring;

  return (
    <div id="version-restore-section" className="panel-section">
      <div className="panel-header">
        <span className="panel-header-title">{i18n.pages.restore_flow_version.title}</span>
      </div>
      <div className="panel-body">
        {loadingVersions ? (
          <p className="page-empty-note">{i18n.pages.restore_flow_version.loading}</p>
        ) : versions.length === 0 ? (
          <p className="page-empty-note">{i18n.pages.restore_flow_version.no_versions}</p>
        ) : (
          <div className="modal-field-row">
            <select value={selectedVersionId ?? ""} disabled={busy} onChange={(e) => onSelectVersion(e.target.value)}>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {i18n.pages.restore_flow_version.version_option.replace("{version}", String(version.version)).replace("{date}", formatLogTimestamp(new Date(version.createdAt)))}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={restoring}>
            {i18n.pages.restore_flow_version.cancel}
          </button>
          <button type="button" onClick={onRestore} disabled={busy || versions.length === 0}>
            {restoring ? i18n.pages.restore_flow_version.restoring : i18n.pages.restore_flow_version.restore}
          </button>
        </div>
      </div>
    </div>
  );
}
