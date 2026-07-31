"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toggleSidebar } from "../client/sidebar";

interface SidebarLinkDef {
  href: string;
  label: string;
  icon: string;
}

const SIDEBAR_LINKS: SidebarLinkDef[] = [
  { href: "/projects", label: "Projects", icon: "📁" },
  { href: "/credential-vault", label: "Credential Vault", icon: "🔐" },
  { href: "/localhost-deployment", label: "Localhost Deployment", icon: "🖥️" },
];

/** The nav rail every plain page gets via PageShell (see PageHeader.tsx) — never rendered on the
 * Flow editor itself, which has its own toolbar/sidebars (see AppShellMarkup.tsx) and doesn't use
 * PageShell at all. Collapse state is pure CSS (`:root[data-sidebar="collapsed"]`, see style.css)
 * driven by a `data-sidebar` attribute on <html> — toggleSidebar flips that attribute directly
 * rather than through React state, so every page (including this component, server-rendered the
 * same way regardless of collapse state) never has a hydration-mismatch flash to guard against the
 * way ThemeToggle's own "mounted" guard does. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="app-sidebar">
      <button type="button" className="app-sidebar-toggle" onClick={toggleSidebar} title="Collapse/expand sidebar">
        <span className="app-sidebar-link-icon">☰</span>
        <span className="app-sidebar-link-label">Collapse</span>
      </button>
      <ul className="app-sidebar-links">
        {SIDEBAR_LINKS.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link href={link.href} className={active ? "app-sidebar-link app-sidebar-link-active" : "app-sidebar-link"} title={link.label}>
                <span className="app-sidebar-link-icon">{link.icon}</span>
                <span className="app-sidebar-link-label">{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
