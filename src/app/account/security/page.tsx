"use client";

import { useEffect, useState } from "react";
import { i18n } from "@i18n";
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
      <Breadcrumbs items={[{ label: i18n.pages.account_security.breadcrumb }]} />
      <div className="modal-box" style={{ width: 480, maxWidth: "100%" }}>
        <h2 className="modal-title">{i18n.pages.account_security.totp_section_title}</h2>

        {!user && !error && <p>{i18n.pages.account_security.loading}</p>}

        {user?.provider === "entra" && <p>{i18n.pages.account_security.entra_notice}</p>}

        {user?.provider === "email" && !enrollment && user.totpEnabled && (
          <>
            <p>{i18n.pages.account_security.totp_enrolled_message.replace("{email}", user.email)}</p>
            <button type="button" className="btn btn-gray" onClick={disable} disabled={busy}>
              {i18n.pages.account_security.totp_disable_button}
            </button>
          </>
        )}

        {user?.provider === "email" && !enrollment && !user.totpEnabled && (
          <>
            <p>{i18n.pages.account_security.totp_setup_description}</p>
            <button type="button" className="btn btn-blue" onClick={startEnrollment} disabled={busy}>
              {i18n.pages.account_security.totp_setup_button}
            </button>
          </>
        )}

        {enrollment && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, no next/image benefit */}
            <img src={enrollment.qrDataUrl} alt={i18n.pages.account_security.totp_qr_alt} width={200} height={200} />
            <p className="modal-field-label">{i18n.pages.account_security.totp_manual_entry.replace("{uri}", enrollment.otpauthUri)}</p>
            <label className="modal-field-row">
              <span className="modal-field-label">{i18n.pages.account_security.totp_code_label}</span>
              <input type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder={i18n.pages.account_security.totp_code_placeholder} />
            </label>
            <button type="button" className="btn btn-blue" onClick={confirm} disabled={busy}>
              {i18n.pages.account_security.totp_confirm_button}
            </button>
          </>
        )}

        {error && <p className="auth-page-error">{error}</p>}
      </div>

      {user?.isAdmin && (
        <>
          <div className="modal-box" style={{ width: 480, maxWidth: "100%", marginTop: 16 }}>
            <h2 className="modal-title">{i18n.pages.account_security.domains_section_title}</h2>
            <p className="modal-field-label">{i18n.pages.account_security.domains_description}</p>
            <ul>
              {domains.map((domain) => (
                <li key={domain}>
                  @{domain}{" "}
                  <button type="button" className="auth-page-hint" onClick={() => removeDomain(domain)}>
                    {i18n.pages.account_security.domains_remove_button}
                  </button>
                </li>
              ))}
              {domains.length === 0 && <li>{i18n.pages.account_security.domains_empty}</li>}
            </ul>
            <label className="modal-field-row">
              <span className="modal-field-label">{i18n.pages.account_security.domains_add_label}</span>
              <input type="text" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder={i18n.pages.account_security.domains_placeholder} />
            </label>
            <button type="button" className="btn btn-blue" onClick={addDomain}>
              {i18n.pages.account_security.domains_add_button}
            </button>
          </div>

          <div className="modal-box" style={{ width: 480, maxWidth: "100%", marginTop: 16 }}>
            <h2 className="modal-title">{i18n.pages.account_security.session_scope_section_title}</h2>
            <p className="modal-field-label">{i18n.pages.account_security.session_scope_description}</p>
            <label className="modal-field-row">
              <span>
                <input type="radio" checked={settings?.sessionScope === "browser"} onChange={() => changeScope("browser")} /> {i18n.pages.account_security.session_scope_browser}
              </span>
            </label>
            <label className="modal-field-row">
              <span>
                <input type="radio" checked={settings?.sessionScope === "tab"} onChange={() => changeScope("tab")} /> {i18n.pages.account_security.session_scope_tab}
              </span>
            </label>
          </div>
        </>
      )}
    </PageShell>
  );
}
