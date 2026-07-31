"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { i18n } from "@i18n";
import {
  createFlow,
  deleteFlow,
  getFlowWithGraph,
  getProject,
  listFlows,
  renameFlow,
  renameProject,
  saveFlowGraph,
} from "../../../client/api";
import type { FlowSummary, ProjectSummary } from "../../../server/models";
import { PageShell } from "../../../components/PageHeader";
import { Breadcrumbs } from "../../../components/Breadcrumbs";

/** The "⋯" options menu on a Flow row — Rename/Duplicate/Delete used to be three separate buttons
 * in .entity-actions; folded into one menu instead as the row's action surface grows. Positioned via
 * getBoundingClientRect rather than CSS anchoring since .row-context-menu (shared with the canvas's
 * own right-click menus — see overlay/rowContextMenu.ts/style.css) is `position: fixed`. */
function FlowRowMenu({
  onRename,
  onDuplicate,
  onDelete,
}: {
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutsideMouseDown(e: MouseEvent): void {
      if (e.target instanceof Node && !wrapperRef.current?.contains(e.target))
        setOpen(false);
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
      <button
        type="button"
        className="entity-menu-button"
        onClick={toggle}
        title="More actions"
        aria-label="More actions"
      >
        ⋯
      </button>
      {open && pos && (
        <div
          className="row-context-menu"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="row-context-menu-item" onClick={() => pick(onRename)}>
            {i18n.pages.project.flow_rename}
          </div>
          <div
            className="row-context-menu-item"
            onClick={() => pick(onDuplicate)}
          >
            {i18n.pages.project.flow_duplicate}
          </div>
          <div className="row-context-menu-item" onClick={() => pick(onDelete)}>
            {i18n.pages.project.flow_delete}
          </div>
        </div>
      )}
    </div>
  );
}

/** Prompts for the duplicate's name before anything is actually copied — must not collide with any
 * other Flow already in this project (checked against `existingNames`, case-insensitively so
 * "Foo"/"foo" don't both slip through as "distinct"). */
function DuplicateFlowDialog({
  sourceName,
  existingNames,
  onClose,
  onConfirm,
}: {
  sourceName: string;
  existingNames: string[];
  onClose: () => void;
  onConfirm: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(`${sourceName} copy`);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(i18n.pages.project.duplicate_name_required);
      return;
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError(
        i18n.pages.project.duplicate_name_exists.replace("{name}", trimmed),
      );
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
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box">
        <h2 className="modal-title">{i18n.pages.project.duplicate_title}</h2>
        <label className="modal-field-row">
          <span className="modal-field-label">
            {i18n.pages.project.duplicate_new_name}
          </span>
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
            {i18n.pages.project.duplicate_cancel}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving
              ? i18n.pages.project.duplicate_saving
              : i18n.pages.project.duplicate_confirm}
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
  const [duplicatingFlow, setDuplicatingFlow] = useState<FlowSummary | null>(
    null,
  );

  async function refresh(): Promise<void> {
    const [proj, flowList] = await Promise.all([
      getProject(projectId).catch(() => null),
      listFlows(projectId),
    ]);
    setProject(proj);
    setFlows(flowList);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreateFlow(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
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
  async function handleDuplicateFlow(
    sourceFlowId: string,
    newName: string,
  ): Promise<void> {
    const { graphJson } = await getFlowWithGraph(projectId, sourceFlowId);
    const newFlow = await createFlow(projectId, newName);
    if (graphJson) await saveFlowGraph(projectId, newFlow.id, graphJson);
    await refresh();
  }

  async function handleDeleteFlow(flowId: string, name: string): Promise<void> {
    if (
      !confirm(i18n.pages.project.delete_flow_confirm.replace("{name}", name))
    )
      return;
    await deleteFlow(projectId, flowId);
    await refresh();
  }

  async function commitFlowRename(
    flowId: string,
    rawName: string,
  ): Promise<void> {
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
      <Breadcrumbs
        items={[
          { label: i18n.pages.projects.title, href: "/projects" },
          { label: project.name },
        ]}
      />
      <Link href="/projects" className="back-link">
        {i18n.pages.project.back}
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
        <h1
          className="page-title-editable"
          title={i18n.pages.project.title_rename_hint}
          onClick={() => setEditingProjectName(true)}
        >
          {i18n.pages.project.title_prefix}
          {project.name}
        </h1>
      )}

      <Link href={`/projects/${projectId}/logs`} className="logs-link">
        {i18n.pages.project.view_run_logs}
      </Link>

      <h2 className="section-heading">{i18n.pages.project.flows_heading}</h2>
      <form className="create-row" onSubmit={handleCreateFlow}>
        <input
          type="text"
          placeholder={i18n.pages.project.new_flow_placeholder}
          value={newFlowName}
          onChange={(e) => setNewFlowName(e.target.value)}
        />
        <button type="submit">{i18n.pages.project.create_flow}</button>
      </form>

      {flows.length === 0 ? (
        <p className="page-empty-note">{i18n.pages.project.flows_empty}</p>
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
                  onBlur={(e) =>
                    void commitFlowRename(flow.id, e.currentTarget.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingFlowId(null);
                  }}
                />
              ) : (
                <Link
                  href={`/projects/${projectId}/flows/${flow.id}`}
                  className="entity-name"
                >
                  {flow.name}
                </Link>
              )}
              <div className="entity-actions">
                <FlowRowMenu
                  onRename={() => setEditingFlowId(flow.id)}
                  onDuplicate={() => setDuplicatingFlow(flow)}
                  onDelete={() => void handleDeleteFlow(flow.id, flow.name)}
                />
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
