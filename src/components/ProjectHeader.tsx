"use client";

import { useEffect, useState } from "react";
import { i18n } from "@i18n";
import { updateProjectDescription } from "../client/api";
import type { ProjectSummary } from "../server/models";
import { IconManager } from "../shared/iconManager";
import { ProjectTabs, type ProjectTabKey } from "./ProjectTabs";

/** Shows the project name, its editable description, and the Flows/Logs/Webhooks tab bar — shared
 * across all three project tabs so neither vanishes when switching between them. */
export function ProjectHeader({ projectId, project, onProjectUpdate, activeTab, onTabChange }: { projectId: string; project: ProjectSummary | null; onProjectUpdate: (project: ProjectSummary) => void; activeTab: ProjectTabKey; onTabChange: (tab: ProjectTabKey) => void }) {
  const [description, setDescription] = useState(project?.description ?? "");
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  useEffect(() => {
    setDescription(project?.description ?? "");
  }, [project?.description]);

  async function commitDescription(value: string): Promise<void> {
    setIsEditingDescription(false);
    if (project && value === project.description) return;
    const updated = await updateProjectDescription(projectId, value);
    onProjectUpdate(updated);
  }

  if (!project) return null;

  return (
    <>
      <h1>{project.name}</h1>

      <div className="project-description-box">
        {isEditingDescription ? (
          <textarea className="project-description-input" placeholder={i18n.pages.project.description_placeholder} value={description} autoFocus onChange={(e) => setDescription(e.target.value)} onBlur={(e) => void commitDescription(e.target.value)} />
        ) : (
          <p className="project-description-text">{description || i18n.pages.project.description_placeholder}</p>
        )}
        {!isEditingDescription && (
          <button type="button" className="project-description-edit-button" onClick={() => setIsEditingDescription(true)} title="Edit description" aria-label="Edit description">
            {IconManager.EditIcon()}
          </button>
        )}
      </div>

      <ProjectTabs active={activeTab} onSelect={onTabChange} />
    </>
  );
}
