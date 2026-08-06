"use client";

import { useEffect, useState } from "react";
import { confirmTotp, disableTotp, getCurrentUser, setupTotp } from "../../../client/api";
import type { UserAccount } from "../../../server/models";
import { PageShell } from "../../../components/PageHeader";
import { Breadcrumbs } from "../../../components/Breadcrumbs";

/** Self-service enrollment for the "per app" email-login option (models.ts's AuthSettings/
 * DatabaseManager users table) — lets a user with their own authenticator app (Google Authenticator,
 * Authy, 1Password, ...) sign in with a generated code instead of waiting on an emailed one each time. */
export default function AccountSecurityPage() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [enrollment, setEnrollment] = useState<{ otpauthUri: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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
    </PageShell>
  );
}
