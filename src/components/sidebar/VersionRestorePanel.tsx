"use client";

import { i18n } from "@i18n";
import type { FlowVersionSummary } from "../../server/models";
import { formatLogTimestamp } from "../../shared/formatLogTimestamp";

/** The sole content of #toolbar-center on the "Restore old version" page — the version picker plus
 * the Restore/Cancel actions, shown where the live editor's Simulate controls normally sit. */
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
    <div id="version-restore-controls" className="toolbar-center">
      {loadingVersions ? (
        <span className="page-empty-note">{i18n.pages.restore_flow_version.loading}</span>
      ) : versions.length === 0 ? (
        <span className="page-empty-note">{i18n.pages.restore_flow_version.no_versions}</span>
      ) : (
        <select value={selectedVersionId ?? ""} disabled={busy} onChange={(e) => onSelectVersion(e.target.value)}>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {i18n.pages.restore_flow_version.version_option.replace("{version}", String(version.version)).replace("{date}", formatLogTimestamp(new Date(version.createdAt)))}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="btn btn-gray" onClick={onCancel} disabled={restoring}>
        {i18n.pages.restore_flow_version.cancel}
      </button>
      <button type="button" className="restore-version-button btn btn-green" onClick={onRestore} disabled={busy || versions.length === 0}>
        {restoring ? i18n.pages.restore_flow_version.restoring : i18n.pages.restore_flow_version.restore}
      </button>
    </div>
  );
}
