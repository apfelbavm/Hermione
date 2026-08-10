import { i18n } from "@i18n";

/** Bottom-left countdown shown when the periodic autosave timer fires — mirrors the panel
 * language of modal-box (see modals.css) but positioned as a corner overlay, not a centered dialog. */
export function AutosavePopup({ secondsRemaining, onCancel }: { secondsRemaining: number; onCancel: () => void }) {
  return (
    <div className="autosave-popup">
      <span>{i18n.components.autosave_popup.message.replace("{seconds}", String(secondsRemaining))}</span>
      <button type="button" className="btn btn-gray" onClick={onCancel}>
        {i18n.components.autosave_popup.cancel}
      </button>
    </div>
  );
}
