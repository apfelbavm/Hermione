"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { i18n } from "@i18n";
import { createProject, deleteProject, listProjects, renameProject } from "../../client/api";
import type { ProjectSummary } from "../../server/models";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { useDebounce } from "../../hooks/useDebounce";

/** The "Create Project" dialog just collects a name — unlike CreateFlowDialog there's no template
 * concept for Projects, so this stays a single-field modal (same skeleton as DuplicateFlowDialog on
 * the Project page). */
function CreateProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(i18n.pages.projects.create_name_required);
      return;
    }
    setSaving(true);
    try {
      await onCreate(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">{i18n.pages.projects.create_title}</h2>
        <label className="modal-field-row">
          <span className="modal-field-label">{i18n.pages.projects.new_project_placeholder}</span>
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
          />
        </label>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            {i18n.pages.projects.create_cancel}
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? i18n.pages.projects.create_saving : i18n.pages.projects.create_confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** No SSR-unsafe DB access happens during render — every client/api.ts call is only ever made
 * inside an effect/event handler, both client-only — so this can be a plain "use client" page
 * component, unlike the Flow editor route (see flows/[flowId]/page.tsx), which needs the heavier
 * ssr:false dynamic-import treatment because AppShell reads its graph synchronously during its very
 * first render (well, kicks off that fetch there — see that file's own comment). */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 150);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const visibleProjects = projects.filter((project) => project.name.toLowerCase().includes(debouncedSearchTerm.trim().toLowerCase()));

  async function refresh(): Promise<void> {
    setProjects(await listProjects());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(name: string): Promise<void> {
    await createProject(name);
    setShowCreateDialog(false);
    await refresh();
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!confirm(i18n.pages.projects.delete_confirm.replace("{name}", name))) return;
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

      <div className="search-create-row">
        <input type="search" className="search-input" placeholder={i18n.pages.projects.search_placeholder} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <button type="button" onClick={() => setShowCreateDialog(true)}>
          {i18n.pages.projects.create_project}
        </button>
      </div>

      {visibleProjects.length === 0 ? (
        <p className="page-empty-note">{projects.length === 0 ? i18n.pages.projects.empty : i18n.pages.projects.no_matches}</p>
      ) : (
        <ul className="entity-list">
          {visibleProjects.map((project) => (
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
              <span className="entity-meta">
                {i18n.pages.projects.meta_created.replace("{date}", new Date(project.createdAt).toLocaleString())}
                {" · "}
                {i18n.pages.projects.meta_updated.replace("{date}", new Date(project.updatedAt).toLocaleString())}
              </span>
              <div className="entity-actions">
                <button type="button" onClick={() => setEditingId(project.id)}>
                  {i18n.pages.projects.rename}
                </button>
                <button type="button" onClick={() => void handleDelete(project.id, project.name)}>
                  {i18n.pages.projects.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCreateDialog && <CreateProjectDialog onClose={() => setShowCreateDialog(false)} onCreate={handleCreate} />}
    </PageShell>
  );
}
