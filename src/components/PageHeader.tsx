import { ThemeToggle } from "./ThemeToggle";

/** Shared top bar for every plain page around the Flow editor (Home/Projects/Project/Logs/
 * Credential Vault) — the editor itself has its own toolbar (see AppShellMarkup.tsx) and doesn't
 * use this. Breadcrumbs (see Breadcrumbs.tsx) and each page's own back link sit below this, not in
 * it — this is just branding + the theme toggle. */
export function PageHeader() {
  return (
    <header className="page-top-header">
      <span className="page-top-header-title">Hermione</span>
      <ThemeToggle />
    </header>
  );
}
