import Link from "next/link";

/** Placeholder only, by design — no storage or fields yet. A real vault (encrypted credential
 * storage, referenceable from HTTP/OAuth nodes) is a separate, later piece of work. */
export default function CredentialVaultPage() {
  return (
    <main className="page-shell">
      <div className="page-header">
        <Link href="/" className="back-link">
          ← Back
        </Link>
        <h1>Credential Vault</h1>
      </div>
      <p className="page-empty-note">Coming soon — this is where you'll be able to securely store credentials for your Flows to use.</p>
    </main>
  );
}
