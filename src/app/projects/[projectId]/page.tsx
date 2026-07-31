"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createFlow, deleteFlow, getProject, listFlows, renameFlow, renameProject } from "../../../client/api";
import type { FlowSummary, ProjectSummary } from "../../../server/models";
import { PageHeader } from "../../../components/PageHeader";
import { Breadcrumbs } from "../../../components/Breadcrumbs";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [newFlowName, setNewFlowName] = useState("");
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState(false);

  async function refresh(): Promise<void> {
    const [proj, flowList] = await Promise.all([getProject(projectId).catch(() => null), listFlows(projectId)]);
    setProject(proj);
    setFlows(flowList);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreateFlow(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const name = newFlowName.trim();
    if (!name) return;
    await createFlow(projectId, name);
    setNewFlowName("");
    await refresh();
  }

  async function handleDeleteFlow(flowId: string, name: string): Promise<void> {
    if (!confirm(`Delete Flow "${name}"? This can't be undone.`)) return;
    await deleteFlow(projectId, flowId);
    await refresh();
  }

  async function commitFlowRename(flowId: string, rawName: string): Promise<void> {
    const name = rawName.trim();
    if (name) await renameFlow(projectId, flowId, name);
    setEditingFlowId(null);
    await refresh();
  }

  async function commitProjectRename(rawName: string): Promise<void> {
    const name = rawName.trim();
    if (name) await renameProject(projectId, name);
    setEditingProjectName(false);
    await refresh();
  }

  if (!project) {
    return (
      <main className="page-shell">
        <PageHeader />
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects", href: "/projects" }]} />
        <Link href="/projects" className="back-link">
          ← Back
        </Link>
        <h1>Project not found</h1>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <PageHeader />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects", href: "/projects" }, { label: project.name }]} />
      <Link href="/projects" className="back-link">
        ← Back
      </Link>
      {editingProjectName ? (
        <input
          type="text"
          className="entity-rename-input page-title-input"
          defaultValue={project.name}
          autoFocus
          onBlur={(e) => void commitProjectRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditingProjectName(false);
          }}
        />
      ) : (
        <h1 className="page-title-editable" title="Click to rename" onClick={() => setEditingProjectName(true)}>
          {project.name}
        </h1>
      )}

      <Link href={`/projects/${projectId}/logs`} className="logs-link">
        View Run Logs →
      </Link>

      <h2 className="section-heading">Flows</h2>
      <form className="create-row" onSubmit={handleCreateFlow}>
        <input type="text" placeholder="New Flow name" value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)} />
        <button type="submit">Create Flow</button>
      </form>

      {flows.length === 0 ? (
        <p className="page-empty-note">No Flows yet — create one above.</p>
      ) : (
        <ul className="entity-list">
          {flows.map((flow) => (
            <li key={flow.id} className="entity-row">
              {editingFlowId === flow.id ? (
                <input
                  type="text"
                  className="entity-rename-input"
                  defaultValue={flow.name}
                  autoFocus
                  onBlur={(e) => void commitFlowRename(flow.id, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingFlowId(null);
                  }}
                />
              ) : (
                <Link href={`/projects/${projectId}/flows/${flow.id}`} className="entity-name">
                  {flow.name}
                </Link>
              )}
              <div className="entity-actions">
                <button type="button" onClick={() => setEditingFlowId(flow.id)}>
                  Rename
                </button>
                <button type="button" onClick={() => void handleDeleteFlow(flow.id, flow.name)}>
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
