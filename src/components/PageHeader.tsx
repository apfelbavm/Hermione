import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { Sidebar } from "./Sidebar";

/** Shared top bar for every plain page around the Flow editor (Home/Projects/Project/Logs/
 * Credential Vault) — the editor itself has its own toolbar (see AppShellMarkup.tsx) and doesn't
 * use this. Breadcrumbs (see Breadcrumbs.tsx) and each page's own back link sit below this, not in
 * it — this is just branding + the theme toggle. Always rendered via PageShell below, never on its
 * own, so it stretches edge-to-edge the same way AppShellMarkup's #toolbar does instead of being
 * capped by the content column's own max-width. Its own title/toggle still sit inside
 * .page-top-header-inner, which matches .page-content's own max-width/padding, so they align with
 * the breadcrumbs/back-link/body below rather than just sitting at the true (wider) viewport edge. */
export function PageHeader() {
  return (
    <header className="page-top-header">
      <div className="page-top-header-inner">
        <span className="page-top-header-title">Hermione</span>
        <ThemeToggle />
      </div>
    </header>
  );
}

function PageFooter() {
  return <footer className="page-bottom-footer" />;
}

export function PageShell({ children, contentClassName }: { children: ReactNode; contentClassName?: string }) {
  return (
    <div className="page-frame">
      <PageHeader />
      <div className="page-body">
        <Sidebar />
        <main className={contentClassName ? `page-content ${contentClassName}` : "page-content"}>{children}</main>
      </div>
      <PageFooter />
    </div>
  );
}
