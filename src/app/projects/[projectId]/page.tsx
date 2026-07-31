"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFlow, deleteFlow, getFlowWithGraph, getProject, listFlows, renameFlow, renameProject, saveFlowGraph } from "../../../client/api";
import type { FlowSummary, ProjectSummary } from "../../../server/models";
import { PageShell } from "../../../components/PageHeader";
import { Breadcrumbs } from "../../../components/Breadcrumbs";

/** The "⋯" options menu on a Flow row — Rename/Duplicate/Delete used to be three separate buttons
 * in .entity-actions; folded into one menu instead as the row's action surface grows. Positioned via
 * getBoundingClientRect rather than CSS anchoring since .row-context-menu (shared with the canvas's
 * own right-click menus — see overlay/rowContextMenu.ts/style.css) is `position: fixed`. */
function FlowRowMenu({ onRename, onDuplicate, onDelete }: { onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideMouseDown(e: MouseEvent): void {
      if (e.target instanceof Node && !wrapperRef.current?.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutsideMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutsideMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(e: React.MouseEvent<HTMLButtonElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.right - 140 });
    setOpen((o) => !o);
  }

  function pick(action: () => void): void {
    setOpen(false);
    action();
  }

  return (
    <div className="entity-menu" ref={wrapperRef}>
      <button type="button" className="entity-menu-button" onClick={toggle} title="More actions" aria-label="More actions">
        ⋯
      </button>
      {open && pos && (
        <div className="row-context-menu" style={{ top: pos.top, left: pos.left }}>
          <div className="row-context-menu-item" onClick={() => pick(onRename)}>
            Rename
          </div>
          <div className="row-context-menu-item" onClick={() => pick(onDuplicate)}>
            Duplicate
          </div>
          <div className="row-context-menu-item" onClick={() => pick(onDelete)}>
            Delete
          </div>
        </div>
      )}
    </div>
  );
}

/** Prompts for the duplicate's name before anything is actually copied — must not collide with any
 * other Flow already in this project (checked against `existingNames`, case-insensitively so
 * "Foo"/"foo" don't both slip through as "distinct"). */
function DuplicateFlowDialog({ sourceName, existingNames, onClose, onConfirm }: { sourceName: string; existingNames: string[]; onClose: () => void; onConfirm: (name: string) => Promise<void> }) {
  const [name, setName] = useState(`${sourceName} copy`);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError(`A Flow named "${trimmed}" already exists in this project.`);
      return;
    }
    setSaving(true);
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">Duplicate Flow</h2>
        <label className="modal-field-row">
          <span className="modal-field-label">New name</span>
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
            Cancel
          </button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Duplicating…" : "Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [newFlowName, setNewFlowName] = useState("");
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [duplicatingFlow, setDuplicatingFlow] = useState<FlowSummary | null>(null);

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

  /** Copies the source Flow's graph verbatim into a brand new Flow record — no server-side
   * "duplicate" endpoint needed, just the same three calls a user could make by hand (read the
   * graph, create a Flow, save that graph into it). */
  async function handleDuplicateFlow(sourceFlowId: string, newName: string): Promise<void> {
    const { graphJson } = await getFlowWithGraph(projectId, sourceFlowId);
    const newFlow = await createFlow(projectId, newName);
    if (graphJson) await saveFlowGraph(projectId, newFlow.id, graphJson);
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
      <PageShell>
        <Breadcrumbs items={[{ label: "Projects", href: "/projects" }]} />
        <Link href="/projects" className="back-link">
          ← Back
        </Link>
        <h1>Project not found</h1>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: project.name }]} />
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
          Project: {project.name}
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
                <FlowRowMenu onRename={() => setEditingFlowId(flow.id)} onDuplicate={() => setDuplicatingFlow(flow)} onDelete={() => void handleDeleteFlow(flow.id, flow.name)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {duplicatingFlow && (
        <DuplicateFlowDialog
          sourceName={duplicatingFlow.name}
          existingNames={flows.map((f) => f.name)}
          onClose={() => setDuplicatingFlow(null)}
          onConfirm={async (name) => {
            await handleDuplicateFlow(duplicatingFlow.id, name);
            setDuplicatingFlow(null);
          }}
        />
      )}
    </PageShell>
  );
}
