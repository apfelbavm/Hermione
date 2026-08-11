"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { i18n } from "@i18n";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [useAuthenticator, setUseAuthenticator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email-code/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to send code");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const result = await signIn(useAuthenticator ? "email-totp" : "email-code", { email, code, redirect: false });
      if (result?.error) {
        setError(i18n.pages.login.error_invalid_code);
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function submitEmailStep(e: React.FormEvent): void {
    e.preventDefault();
    if (!email.trim()) return;
    if (useAuthenticator) setStep("code");
    else void requestCode();
  }

  return (
    <div className="auth-page">
      <div className="modal-box auth-page-card">
        <h1 className="modal-title">{i18n.pages.login.title}</h1>

        <button type="button" className="btn btn-blue" style={{ width: "100%" }} disabled={loading} onClick={() => signIn("microsoft-entra-id", { callbackUrl })}>
          {i18n.pages.login.microsoft_button}
        </button>

        <div className="auth-page-divider">{i18n.pages.login.divider}</div>

        {step === "email" && (
          <form onSubmit={submitEmailStep}>
            <label className="modal-field-row">
              <span className="modal-field-label">{i18n.pages.login.email_label}</span>
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={i18n.pages.login.email_placeholder} />
            </label>
            <button type="submit" className="btn btn-gray" style={{ width: "100%" }} disabled={loading}>
              {useAuthenticator ? i18n.pages.login.submit_button_continue : i18n.pages.login.submit_button_send_code}
            </button>
            <button type="button" className="auth-page-hint" onClick={() => setUseAuthenticator((v) => !v)}>
              {useAuthenticator ? i18n.pages.login.toggle_email : i18n.pages.login.toggle_authenticator}
            </button>
          </form>
        )}

        {step === "code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
          >
            <label className="modal-field-row">
              <span className="modal-field-label">{useAuthenticator ? i18n.pages.login.code_label_authenticator : i18n.pages.login.code_label_email.replace("{email}", email)}</span>
              <input type="text" inputMode="numeric" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder={i18n.pages.login.code_placeholder} />
            </label>
            <button type="submit" className="btn btn-blue" style={{ width: "100%" }} disabled={loading}>
              {i18n.pages.login.sign_in_button}
            </button>
            <button
              type="button"
              className="auth-page-hint"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              {i18n.pages.login.back_button}
            </button>
          </form>
        )}

        {error && <p className="auth-page-error">{error}</p>}
      </div>
    </div>
  );
}
