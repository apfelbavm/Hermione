import Link from "next/link";

/** The app's true landing page — plain server-rendered (no localStorage/canvas involved, unlike
 * everything under /projects) — two doors: Projects (the actual graph-editing side of the app) and
 * the Credential Vault stub. */
export default function HomePage() {
  return (
    <main className="landing-page">
      <h1 className="landing-title">Hermione</h1>
      <div className="landing-links">
        <Link href="/projects" className="landing-link">
          Projects
        </Link>
        <Link href="/credential-vault" className="landing-link">
          Credential Vault
        </Link>
      </div>
    </main>
  );
}
