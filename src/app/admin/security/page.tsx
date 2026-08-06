"use client";

import { useEffect, useState } from "react";
import { addAllowedDomain, getAuthSettings, getCurrentUser, listAllowedDomains, removeAllowedDomain, setSessionScope } from "../../../client/api";
import type { AuthSettings, UserAccount } from "../../../server/models";
import { PageShell } from "../../../components/PageHeader";
import { Breadcrumbs } from "../../../components/Breadcrumbs";

/** Admin-only page for the two global login settings: the email-domain allowlist (models.ts's
 * DatabaseManager.allowed_email_domains) and the "per tab vs per browser" session scope
 * (AuthSettings.sessionScope). Gated by isAdmin (see server/auth.ts's AUTH_ADMIN_EMAILS). */
export default function AdminSecurityPage() {
  const [me, setMe] = useState<UserAccount | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setMe)
      .catch(() => setMe(null));
    listAllowedDomains()
      .then((r) => setDomains(r.domains))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    getAuthSettings().then(setSettings);
  }, []);

  async function addDomain(): Promise<void> {
    if (!newDomain.trim()) return;
    try {
      const { domains: updated } = await addAllowedDomain(newDomain.trim());
      setDomains(updated);
      setNewDomain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeDomain(domain: string): Promise<void> {
    const { domains: updated } = await removeAllowedDomain(domain);
    setDomains(updated);
  }

  async function changeScope(scope: AuthSettings["sessionScope"]): Promise<void> {
    setSettings(await setSessionScope(scope));
  }

  if (me && !me.isAdmin) {
    return (
      <PageShell>
        <Breadcrumbs items={[{ label: "Admin security" }]} />
        <p>You don't have access to this page.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Admin security" }]} />

      <div className="modal-box" style={{ width: 480, maxWidth: "100%", marginBottom: 16 }}>
        <h2 className="modal-title">Allowed email domains</h2>
        <p className="modal-field-label">Only email addresses at these domains can sign in via emailed code or authenticator app. Microsoft sign-in is unaffected.</p>
        <ul>
          {domains.map((domain) => (
            <li key={domain}>
              @{domain}{" "}
              <button type="button" className="auth-page-hint" onClick={() => removeDomain(domain)}>
                remove
              </button>
            </li>
          ))}
          {domains.length === 0 && <li>No domains allowed yet — email sign-in is disabled until one is added.</li>}
        </ul>
        <label className="modal-field-row">
          <span className="modal-field-label">Add a domain</span>
          <input type="text" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="example.com" />
        </label>
        <button type="button" className="btn btn-blue" onClick={addDomain}>
          Add domain
        </button>
      </div>

      <div className="modal-box" style={{ width: 480, maxWidth: "100%" }}>
        <h2 className="modal-title">Session scope</h2>
        <p className="modal-field-label">Whether signing in applies to the whole browser (shared across tabs) or only the tab that signed in.</p>
        <label className="modal-field-row">
          <span>
            <input type="radio" checked={settings?.sessionScope === "browser"} onChange={() => changeScope("browser")} /> Per browser — all tabs share one session
          </span>
        </label>
        <label className="modal-field-row">
          <span>
            <input type="radio" checked={settings?.sessionScope === "tab"} onChange={() => changeScope("tab")} /> Per tab — each tab needs its own sign-in
          </span>
        </label>
      </div>

      {error && <p className="auth-page-error">{error}</p>}
    </PageShell>
  );
}
