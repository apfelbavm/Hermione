import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

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

/** Wraps every plain page's content: a full-bleed PageHeader (see above) followed by the actual
 * page body in its own scrollable, width-capped column — mirrors the Flow editor's own
 * #toolbar-then-#main-area split (AppShellMarkup.tsx), just for the plain pages around it. Replaces
 * the old pattern of each page rendering `<main className="page-shell"><PageHeader />...</main>`
 * itself, which left PageHeader inside that same width-capped column instead of stretching full
 * width. `contentClassName` is an escape hatch for Home's own extra flex/centering needs (see
 * app/page.tsx) without every other page having to carry classes it doesn't use. */
export function PageShell({ children, contentClassName }: { children: ReactNode; contentClassName?: string }) {
  return (
    <div className="page-frame">
      <PageHeader />
      <main className={contentClassName ? `page-content ${contentClassName}` : "page-content"}>{children}</main>
    </div>
  );
}
