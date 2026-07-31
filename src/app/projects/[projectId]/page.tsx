"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createFlow, deleteFlow, getProject, listFlows, renameFlow, renameProject, type FlowSummary, type ProjectSummary } from "../../../persistence/projects";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [newFlowName, setNewFlowName] = useState("");
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState(false);

  function refresh(): void {
    setProject(getProject(projectId) ?? null);
    setFlows(listFlows(projectId));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [projectId]);

  function handleCreateFlow(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const name = newFlowName.trim();
    if (!name) return;
    createFlow(projectId, name);
    setNewFlowName("");
    refresh();
  }

  function handleDeleteFlow(flowId: string, name: string): void {
    if (!confirm(`Delete Flow "${name}"? This can't be undone.`)) return;
    deleteFlow(projectId, flowId);
    refresh();
  }

  function commitFlowRename(flowId: string, rawName: string): void {
    const name = rawName.trim();
    if (name) renameFlow(projectId, flowId, name);
    setEditingFlowId(null);
    refresh();
  }

  function commitProjectRename(rawName: string): void {
    const name = rawName.trim();
    if (name) renameProject(projectId, name);
    setEditingProjectName(false);
    refresh();
  }

  if (!project) {
    return (
      <main className="page-shell">
        <div className="page-header">
          <Link href="/projects" className="back-link">
            ← Back
          </Link>
          <h1>Project not found</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <Link href="/projects" className="back-link">
          ← Back
        </Link>
        {editingProjectName ? (
          <input
            type="text"
            className="entity-rename-input page-title-input"
            defaultValue={project.name}
            autoFocus
            onBlur={(e) => commitProjectRename(e.currentTarget.value)}
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
      </div>

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
                  onBlur={(e) => commitFlowRename(flow.id, e.currentTarget.value)}
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
                <button type="button" onClick={() => handleDeleteFlow(flow.id, flow.name)}>
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
