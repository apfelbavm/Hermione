import { i18n } from "@i18n";

/** Shown when the toolbar's "Back to project" button is clicked while the graph has edits that
 * haven't been persisted via Save — mirrors DuplicateFlowDialog's modal-backdrop/modal-box skeleton
 * (see app/projects/[projectId]/page.tsx) but offers three actions instead of confirm/cancel. */
export function UnsavedChangesDialog({ saving, onCancel, onDiscard, onSaveAndLeave }: { saving: boolean; onCancel: () => void; onDiscard: () => void; onSaveAndLeave: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onCancel()}>
      <div className="modal-box unsaved-changes-dialog">
        <h2 className="modal-title">{i18n.components.unsaved_changes_dialog.title}</h2>
        <p>{i18n.components.unsaved_changes_dialog.message}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-gray" onClick={onCancel} disabled={saving}>
            {i18n.components.unsaved_changes_dialog.cancel}
          </button>
          <button type="button" className="btn btn-gray" onClick={onDiscard} disabled={saving}>
            {i18n.components.unsaved_changes_dialog.discard}
          </button>
          <button type="button" className="btn btn-green" onClick={onSaveAndLeave} disabled={saving}>
            {saving ? i18n.components.unsaved_changes_dialog.saving : i18n.components.unsaved_changes_dialog.save_and_leave}
          </button>
        </div>
      </div>
    </div>
  );
}
