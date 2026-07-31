"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createProject, deleteProject, listProjects, renameProject, type ProjectSummary } from "../../persistence/projects";

/** No SSR-unsafe localStorage read happens during render — listProjects() is only ever called
 * inside an effect/event handler, both client-only — so this can be a plain "use client" page
 * component, unlike the Flow editor route (see flows/[flowId]/page.tsx), which needs the heavier
 * ssr:false dynamic-import treatment because AppShell reads localStorage synchronously during its
 * very first render. */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function refresh(): void {
    setProjects(listProjects());
  }

  useEffect(refresh, []);

  function handleCreate(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createProject(name);
    setNewName("");
    refresh();
  }

  function handleDelete(id: string, name: string): void {
    if (!confirm(`Delete project "${name}"? This also deletes every Flow and run log inside it.`)) return;
    deleteProject(id);
    refresh();
  }

  function commitRename(id: string, rawName: string): void {
    const name = rawName.trim();
    if (name) renameProject(id, name);
    setEditingId(null);
    refresh();
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <Link href="/" className="back-link">
          ← Back
        </Link>
        <h1>Projects</h1>
      </div>

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
                  onBlur={(e) => commitRename(project.id, e.currentTarget.value)}
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
                <button type="button" onClick={() => handleDelete(project.id, project.name)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
