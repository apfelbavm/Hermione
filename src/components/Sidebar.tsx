"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { toggleSidebar } from "../client/sidebar";

/** Flat, single-color (fill="currentColor") icons — this project deliberately avoids colored icons
 * (emoji render as full-color glyphs the OS supplies, ignoring CSS `color` entirely) everywhere
 * else, e.g. drawPinShape's plain shapes, container-icon's currentColor cells in style.css — these
 * follow the same convention instead of introducing an icon font/library dependency. */
function ProjectsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M1 3a1 1 0 0 1 1-1h3.5l1.5 1.75H14a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z" />
    </svg>
  );
}

function CredentialVaultIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1.5 1.5 0 0 1 13.5 8.5v5A1.5 1.5 0 0 1 12 15H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 7h.5zm1.5 0h4V5a2 2 0 1 0-4 0v2z" />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h6.19a1.5 1.5 0 0 1 1.06.44l2.81 2.81a1.5 1.5 0 0 1 .44 1.06V13.5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-11zM9.5 2H3.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V6h-3a1 1 0 0 1-1-1V2zm1 .21V5h2.79L10.5 2.21zM4.75 8.5a.5.5 0 0 1 .5-.5h5.5a.5.5 0 0 1 0 1h-5.5a.5.5 0 0 1-.5-.5zm0 2.5a.5.5 0 0 1 .5-.5h5.5a.5.5 0 0 1 0 1h-5.5a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

function DeploymentIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M1.5 2h13A1.5 1.5 0 0 1 16 3.5V10a1.5 1.5 0 0 1-1.5 1.5H9.9l.4 1.5h1.2a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h1.2l.4-1.5H1.5A1.5 1.5 0 0 1 0 10V3.5A1.5 1.5 0 0 1 1.5 2zM1 3.5V10h14V3.5H1z" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <rect y="3" width="16" height="1.6" rx="0.8" />
      <rect y="7.2" width="16" height="1.6" rx="0.8" />
      <rect y="11.4" width="16" height="1.6" rx="0.8" />
    </svg>
  );
}

interface SidebarLinkDef {
  href: string;
  label: string;
  icon: ReactNode;
}

const SIDEBAR_LINKS: SidebarLinkDef[] = [
  { href: "/projects", label: "Projects", icon: <ProjectsIcon /> },
  { href: "/credential-vault", label: "Credential Vault", icon: <CredentialVaultIcon /> },
  { href: "/logs", label: "Logs", icon: <LogsIcon /> },
  { href: "/emulate", label: "Emulate", icon: <DeploymentIcon /> },
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
        <span className="app-sidebar-link-icon">
          <CollapseIcon />
        </span>
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
