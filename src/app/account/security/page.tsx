"use client";

import { useEffect, useState } from "react";
import { addAllowedDomain, confirmTotp, disableTotp, getAuthSettings, getCurrentUser, listAllowedDomains, removeAllowedDomain, setSessionScope, setupTotp } from "../../../client/api";
import type { AuthSettings, UserAccount } from "@hermione/core/server/models";
import { PageShell } from "../../../components/PageHeader";
import { Breadcrumbs } from "../../../components/Breadcrumbs";

/** Everyone's authenticator-app self-service enrollment, plus (for admins only) the two global
 * login settings formerly on /admin/security: the email-domain allowlist and the "per tab vs per
 * browser" session scope. Admin sections are gated by isAdmin (see server/auth.ts's AUTH_ADMIN_EMAILS). */
export default function AccountSecurityPage() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [enrollment, setEnrollment] = useState<{ otpauthUri: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [settings, setSettings] = useState<AuthSettings | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!user?.isAdmin) return;
    listAllowedDomains()
      .then((r) => setDomains(r.domains))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    getAuthSettings().then(setSettings);
  }, [user?.isAdmin]);

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

  async function startEnrollment(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      setEnrollment(await setupTotp());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await confirmTotp(code);
      setEnrollment(null);
      setCode("");
      setUser(await getCurrentUser());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setBusy(true);
    try {
      await disableTotp();
      setUser(await getCurrentUser());
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Account security" }]} />
      <div className="modal-box" style={{ width: 480, maxWidth: "100%" }}>
        <h2 className="modal-title">Authenticator app sign-in</h2>

        {!user && !error && <p>Loading…</p>}

        {user?.provider === "entra" && <p>You sign in with your Microsoft account — an authenticator app isn't used for Entra ID sign-in.</p>}

        {user?.provider === "email" && !enrollment && user.totpEnabled && (
          <>
            <p>An authenticator app is enrolled for {user.email}. You can sign in with either an emailed code or a code from your app.</p>
            <button type="button" className="btn btn-gray" onClick={disable} disabled={busy}>
              Disable authenticator app
            </button>
          </>
        )}

        {user?.provider === "email" && !enrollment && !user.totpEnabled && (
          <>
            <p>Set up an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy, ...) to sign in with a generated code instead of waiting on an email each time.</p>
            <button type="button" className="btn btn-blue" onClick={startEnrollment} disabled={busy}>
              Set up authenticator app
            </button>
          </>
        )}

        {enrollment && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, no next/image benefit */}
            <img src={enrollment.qrDataUrl} alt="Scan with your authenticator app" width={200} height={200} />
            <p className="modal-field-label">Can't scan? Enter this manually: {enrollment.otpauthUri}</p>
            <label className="modal-field-row">
              <span className="modal-field-label">Enter the 6-digit code your app now shows</span>
              <input type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
            </label>
            <button type="button" className="btn btn-blue" onClick={confirm} disabled={busy}>
              Confirm
            </button>
          </>
        )}

        {error && <p className="auth-page-error">{error}</p>}
      </div>

      {user?.isAdmin && (
        <>
          <div className="modal-box" style={{ width: 480, maxWidth: "100%", marginTop: 16 }}>
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

          <div className="modal-box" style={{ width: 480, maxWidth: "100%", marginTop: 16 }}>
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
        </>
      )}
    </PageShell>
  );
}
