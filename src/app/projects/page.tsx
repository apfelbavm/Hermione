"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { i18n } from "@i18n";
import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
} from "../../client/api";
import type { ProjectSummary } from "../../server/models";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";

/** No SSR-unsafe DB access happens during render — every client/api.ts call is only ever made
 * inside an effect/event handler, both client-only — so this can be a plain "use client" page
 * component, unlike the Flow editor route (see flows/[flowId]/page.tsx), which needs the heavier
 * ssr:false dynamic-import treatment because AppShell reads its graph synchronously during its very
 * first render (well, kicks off that fetch there — see that file's own comment). */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setProjects(await listProjects());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await createProject(name);
    setNewName("");
    await refresh();
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!confirm(i18n.pages.projects.delete_confirm.replace("{name}", name)))
      return;
    await deleteProject(id);
    await refresh();
  }

  async function commitRename(id: string, rawName: string): Promise<void> {
    const name = rawName.trim();
    if (name) await renameProject(id, name);
    setEditingId(null);
    await refresh();
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: i18n.pages.projects.title }]} />
      <h1>{i18n.pages.projects.title}</h1>

      <form className="create-row" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder={i18n.pages.projects.new_project_placeholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit">{i18n.pages.projects.create_project}</button>
      </form>

      {projects.length === 0 ? (
        <p className="page-empty-note">{i18n.pages.projects.empty}</p>
      ) : (
        <ul className="entity-list">
          {projects.map((project) => (
            <li key={project.id} className="entity-row">
              {editingId === project.id ? (
                <input
                  type="text"
                  className="entity-rename-input"
                  defaultValue={project.name}
                  autoFocus
                  onBlur={(e) =>
                    void commitRename(project.id, e.currentTarget.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <Link href={`/projects/${project.id}`} className="entity-name">
                  {project.name}
                </Link>
              )}
              <div className="entity-actions">
                <button type="button" onClick={() => setEditingId(project.id)}>
                  {i18n.pages.projects.rename}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(project.id, project.name)}
                >
                  {i18n.pages.projects.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
