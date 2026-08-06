"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

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
        setError("Invalid or expired code");
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
        <h1 className="modal-title">Sign in to Hermione</h1>

        <button type="button" className="btn btn-blue" style={{ width: "100%" }} disabled={loading} onClick={() => signIn("microsoft-entra-id", { callbackUrl })}>
          Sign in with Microsoft
        </button>

        <div className="auth-page-divider">or</div>

        {step === "email" && (
          <form onSubmit={submitEmailStep}>
            <label className="modal-field-row">
              <span className="modal-field-label">Work email (external companies)</span>
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </label>
            <button type="submit" className="btn btn-gray" style={{ width: "100%" }} disabled={loading}>
              {useAuthenticator ? "Continue" : "Send sign-in code"}
            </button>
            <button type="button" className="auth-page-hint" onClick={() => setUseAuthenticator((v) => !v)}>
              {useAuthenticator ? "Use an emailed code instead" : "Use an authenticator app instead"}
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
              <span className="modal-field-label">{useAuthenticator ? "6-digit code from your authenticator app" : `Code sent to ${email}`}</span>
              <input type="text" inputMode="numeric" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
            </label>
            <button type="submit" className="btn btn-blue" style={{ width: "100%" }} disabled={loading}>
              Sign in
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
              Back
            </button>
          </form>
        )}

        {error && <p className="auth-page-error">{error}</p>}
      </div>
    </div>
  );
}
