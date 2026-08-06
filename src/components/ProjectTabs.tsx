"use client";

import { i18n } from "@i18n";

export type ProjectTabKey = "flows" | "logs" | "webhooks";

export function ProjectTabs({ active, onSelect }: { active: ProjectTabKey; onSelect: (tab: ProjectTabKey) => void }) {
  const tabs: { key: ProjectTabKey; label: string }[] = [
    { key: "flows", label: i18n.pages.project.tab_flows },
    { key: "logs", label: i18n.pages.project.tab_logs },
    { key: "webhooks", label: i18n.pages.project.tab_webhooks },
  ];

  return (
    <nav className="project-tabs" aria-label="Project sections">
      {tabs.map((tab) => (
        <button key={tab.key} type="button" className={`project-tab${active === tab.key ? " project-tab-active" : ""}`} onClick={() => onSelect(tab.key)}>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
