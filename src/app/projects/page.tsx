"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createProject, deleteProject, listProjects, renameProject } from "../../client/api";
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
    if (!confirm(`Delete project "${name}"? This also deletes every Flow and run log inside it.`)) return;
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
      <Breadcrumbs items={[{ label: "Projects" }]} />
      <h1>Projects</h1>

      <form className="create-row" onSubmit={handleCreate}>
        <input type="text" placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit">Create Project</button>
      </form>

      {projects.length === 0 ? (
        <p className="page-empty-note">No projects yet — create one above.</p>
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
                  onBlur={(e) => void commitRename(project.id, e.currentTarget.value)}
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
                  Rename
                </button>
                <button type="button" onClick={() => void handleDelete(project.id, project.name)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
