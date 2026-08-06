"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { i18n } from "@i18n";
import { toggleSidebar } from "../client/sidebar";
import { clearStoredTabToken } from "../client/authClient";
import { IconManager } from "../shared/iconManager";

interface SidebarLinkDef {
  href: string;
  label: string;
  icon: ReactNode;
}

const SIDEBAR_LINKS: SidebarLinkDef[] = [
  {
    href: "/emulate",
    label: i18n.components.sidebar.emulate,
    icon: <IconManager.DeploymentIcon />,
  },
  {
    href: "/credential-vault",
    label: i18n.components.sidebar.credential_vault,
    icon: <IconManager.CredentialVaultIcon />,
  },
  {
    href: "/projects",
    label: i18n.components.sidebar.projects,
    icon: <IconManager.ProjectsIcon />,
  },
  {
    href: "/logs",
    label: i18n.components.sidebar.logs,
    icon: <IconManager.LogsIcon />,
  },
  {
    href: "/ai-docs",
    label: i18n.components.sidebar.ai_docs,
    icon: <IconManager.AiDocsIcon />,
  },
  {
    href: "/account/security",
    label: "Security",
    icon: <IconManager.CredentialVaultIcon />,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(Boolean(session?.user?.isAdmin));
  }, [session]);

  const links = isAdmin ? [...SIDEBAR_LINKS, { href: "/admin/users", label: "Users", icon: <IconManager.CredentialVaultIcon /> }] : SIDEBAR_LINKS;

  async function handleSignOut(): Promise<void> {
    clearStoredTabToken();
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <nav className="app-sidebar">
      <button type="button" className="app-sidebar-toggle btn btn-ghost" onClick={toggleSidebar} title={i18n.components.sidebar.collapse_title}>
        <span className="app-sidebar-link-icon">
          <IconManager.CollapseIcon />
        </span>
        <span className="app-sidebar-link-label">{i18n.components.sidebar.collapse}</span>
      </button>
      <ul className="app-sidebar-links">
        {links.map((link) => {
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
        <li>
          <button type="button" className="app-sidebar-link" title="Sign out" onClick={handleSignOut} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
            <span className="app-sidebar-link-icon">
              <IconManager.ClearIcon />
            </span>
            <span className="app-sidebar-link-label">Sign out</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
