"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { i18n } from "@i18n";
import { toggleSidebar } from "../client/sidebar";
import { IconManager } from "../shared/iconManager";

interface SidebarLinkDef {
  href: string;
  label: string;
  icon: ReactNode;
}

const SIDEBAR_LINKS: SidebarLinkDef[] = [
  {
    href: "/projects",
    label: i18n.components.sidebar.projects,
    icon: <IconManager.ProjectsIcon />,
  },
  {
    href: "/credential-vault",
    label: i18n.components.sidebar.credential_vault,
    icon: <IconManager.CredentialVaultIcon />,
  },
  {
    href: "/logs",
    label: i18n.components.sidebar.logs,
    icon: <IconManager.LogsIcon />,
  },
  {
    href: "/emulate",
    label: i18n.components.sidebar.emulate,
    icon: <IconManager.DeploymentIcon />,
  },
  {
    href: "/ai-docs",
    label: i18n.components.sidebar.ai_docs,
    icon: <IconManager.AiDocsIcon />,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="app-sidebar">
      <button type="button" className="app-sidebar-toggle btn btn-ghost" onClick={toggleSidebar} title={i18n.components.sidebar.collapse_title}>
        <span className="app-sidebar-link-icon">
          <IconManager.CollapseIcon />
        </span>
        <span className="app-sidebar-link-label">{i18n.components.sidebar.collapse}</span>
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
