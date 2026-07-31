import Link from "next/link";
import { PageHeader } from "../components/PageHeader";
import { Breadcrumbs } from "../components/Breadcrumbs";

/** The app's true landing page — plain server-rendered (no localStorage/canvas involved, unlike
 * everything under /projects) — two doors: Projects (the actual graph-editing side of the app) and
 * the Credential Vault stub. Root page, so no back link (nothing above it to go back to) — every
 * other plain page has one, right below its own Breadcrumbs. */
export default function HomePage() {
  return (
    <main className="landing-page">
      <PageHeader />
      <Breadcrumbs items={[{ label: "Home" }]} />
      <div className="landing-hero">
        <h1 className="landing-title">Hermione</h1>
        <div className="landing-links">
          <Link href="/projects" className="landing-link">
            Projects
          </Link>
          <Link href="/credential-vault" className="landing-link">
            Credential Vault
          </Link>
        </div>
      </div>
    </main>
  );
}
