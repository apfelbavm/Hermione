"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { i18n } from "@i18n";
import { createFlow, deleteFlow, getFlowWithGraph, getProject, listFlows, listProjectWebhooks, listRuns, renameFlow, saveFlowGraph, saveNewFlowVersion } from "../client/api";
import { MAX_RUNS_PER_PROJECT } from "../shared/runLogConstants";
import type { FlowSummary, ProjectSummary, RunLog, WebhookFlowSummary } from "../server/models";
import { PageShell } from "./PageHeader";
import { Breadcrumbs } from "./Breadcrumbs";
import { CreateFlowDialog } from "./CreateFlowDialog";
import { ProjectHeader } from "./ProjectHeader";
import type { ProjectTabKey } from "./ProjectTabs";
import { RunRow } from "./logs/RunRow";
import { WebhookRow } from "./webhooks/WebhookRow";
import { useDebounce } from "../hooks/useDebounce";
import { IconManager } from "../shared/iconManager";

/** The "⋯" options menu on a Flow row — Rename/Duplicate/Delete used to be three separate buttons
 * in .entity-actions; folded into one menu instead as the row's action surface grows. Positioned via
 * getBoundingClientRect rather than CSS anchoring since .row-context-menu (shared with the canvas's
 * own right-click menus — see overlay/rowContextMenu.ts/style.css) is `position: fixed`. */
function FlowRowMenu({ onRename, onDuplicate, onDelete, onSaveNewVersion, onRestoreVersion }: { onRename: () => void; onDuplicate: () => void; onDelete: () => void; onSaveNewVersion: () => void; onRestoreVersion: () => void }) {
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
      <button type="button" className="entity-menu-button btn btn-ghost" onClick={toggle} title="More actions" aria-label="More actions">
        ⋯
      </button>
      {open && pos && (
        <div className="row-context-menu" style={{ top: pos.top, left: pos.left }}>
          <div className="row-context-menu-item" onClick={() => pick(onRename)}>
            {i18n.pages.project.flow_rename}
          </div>
          <div className="row-context-menu-item" onClick={() => pick(onDuplicate)}>
            {i18n.pages.project.flow_duplicate}
          </div>
          <div className="row-context-menu-item" onClick={() => pick(onSaveNewVersion)}>
            {i18n.pages.project.flow_save_new_version}
          </div>
          <div className="row-context-menu-item" onClick={() => pick(onRestoreVersion)}>
            {i18n.pages.project.flow_restore_version}
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
function DuplicateFlowDialog({ sourceName, existingNames, onClose, onConfirm }: { sourceName: string; existingNames: string[]; onClose: () => void; onConfirm: (name: string) => Promise<void> }) {
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
      setError(i18n.pages.project.duplicate_name_exists.replace("{name}", trimmed));
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
        <h2 className="modal-title">{i18n.pages.project.duplicate_title}</h2>
        <label className="modal-field-row">
          <span className="modal-field-label">{i18n.pages.project.duplicate_new_name}</span>
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
          <button type="button" className="btn btn-gray" onClick={onClose} disabled={saving}>
            {i18n.pages.project.duplicate_cancel}
          </button>
          <button type="button" className="btn btn-green" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? i18n.pages.project.duplicate_saving : i18n.pages.project.duplicate_confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Backs all three project routes (flows/logs/webhooks) — the tab bar just swaps which section
 * renders below the shared header, no navigation, so the project title/description never vanish. */
export function ProjectWorkspace({ projectId, initialTab }: { projectId: string; initialTab: ProjectTabKey }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectTabKey>(initialTab);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookFlowSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 150);
  const [showCreateFlowDialog, setShowCreateFlowDialog] = useState(false);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [duplicatingFlow, setDuplicatingFlow] = useState<FlowSummary | null>(null);
  const visibleFlows = flows.filter((flow) => flow.name.toLowerCase().includes(debouncedSearchTerm.trim().toLowerCase()));

  async function refreshFlows(): Promise<void> {
    const [proj, flowList] = await Promise.all([getProject(projectId).catch(() => null), listFlows(projectId)]);
    setProject(proj);
    setFlows(flowList);
  }

  function refreshRuns(): void {
    void listRuns(projectId).then(setRuns);
    void getProject(projectId)
      .then(setProject)
      .catch(() => {});
  }

  function refreshWebhooks(): void {
    void listProjectWebhooks(projectId).then(setWebhooks);
    void getProject(projectId)
      .then(setProject)
      .catch(() => {});
  }

  useEffect(() => {
    void refreshFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Logs/webhooks data is only fetched once its tab is actually viewed, not up front.
  useEffect(() => {
    if (activeTab === "logs") refreshRuns();
    if (activeTab === "webhooks") refreshWebhooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, projectId]);

  async function handleCreateFlow(name: string, graphJson: string): Promise<void> {
    const flow = await createFlow(projectId, name);
    await saveFlowGraph(projectId, flow.id, graphJson);
    setShowCreateFlowDialog(false);
    await refreshFlows();
  }

  /** Copies the source Flow's graph verbatim into a brand new Flow record — no server-side
   * "duplicate" endpoint needed, just the same three calls a user could make by hand (read the
   * graph, create a Flow, save that graph into it). */
  async function handleDuplicateFlow(sourceFlowId: string, newName: string): Promise<void> {
    const { graphJson } = await getFlowWithGraph(projectId, sourceFlowId);
    const newFlow = await createFlow(projectId, newName);
    if (graphJson) await saveFlowGraph(projectId, newFlow.id, graphJson);
    await refreshFlows();
  }

  async function handleDeleteFlow(flowId: string, name: string): Promise<void> {
    if (!confirm(i18n.pages.project.delete_flow_confirm.replace("{name}", name))) return;
    await deleteFlow(projectId, flowId);
    await refreshFlows();
  }

  async function handleSaveNewVersion(flowId: string): Promise<void> {
    await saveNewFlowVersion(projectId, flowId);
    await refreshFlows();
  }

  async function commitFlowRename(flowId: string, rawName: string): Promise<void> {
    const name = rawName.trim();
    if (name) await renameFlow(projectId, flowId, name);
    setEditingFlowId(null);
    await refreshFlows();
  }

  if (!project) {
    return (
      <PageShell>
        <Breadcrumbs items={[{ label: i18n.pages.projects.title, href: "/projects" }]} />
        <h1>{i18n.pages.project.not_found}</h1>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: i18n.pages.projects.title, href: "/projects" }, { label: project.name }]} />
      <ProjectHeader projectId={projectId} project={project} onProjectUpdate={setProject} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "flows" && (
        <>
          <h2 className="section-heading">{i18n.pages.project.flows_heading}</h2>
          <div className="search-create-row">
            <input type="search" className="search-input" placeholder={i18n.pages.project.search_flows_placeholder} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <button type="button" className="btn btn-green" onClick={() => setShowCreateFlowDialog(true)}>
              {i18n.pages.project.create_flow}
            </button>
          </div>

          {visibleFlows.length === 0 ? (
            <p className="page-empty-note">{flows.length === 0 ? i18n.pages.project.flows_empty : i18n.pages.project.flows_no_matches}</p>
          ) : (
            <ul className="entity-list">
              {visibleFlows.map((flow) => (
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
                  <span className="entity-version-badge">
                    {i18n.pages.project.flow_version_prefix}
                    {flow.version}
                  </span>
                  <span className="entity-meta">
                    {i18n.components.run_row.revision}
                    {flow.revision}
                  </span>
                  <span className="entity-meta">
                    {i18n.pages.project.meta_created.replace("{date}", new Date(flow.createdAt).toLocaleString())}
                    {" · "}
                    {i18n.pages.project.meta_updated.replace("{date}", new Date(flow.updatedAt).toLocaleString())}
                  </span>
                  <div className="entity-actions">
                    <FlowRowMenu
                      onRename={() => setEditingFlowId(flow.id)}
                      onDuplicate={() => setDuplicatingFlow(flow)}
                      onDelete={() => void handleDeleteFlow(flow.id, flow.name)}
                      onSaveNewVersion={() => void handleSaveNewVersion(flow.id)}
                      onRestoreVersion={() => router.push(`/projects/${projectId}/flows/${flow.id}/restore`)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {showCreateFlowDialog && <CreateFlowDialog onClose={() => setShowCreateFlowDialog(false)} onCreate={handleCreateFlow} />}

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
        </>
      )}

      {activeTab === "logs" && (
        <>
          <div className="section-header-row">
            <h2 className="section-heading">{i18n.pages.project_logs.title}</h2>
            <button type="button" className="btn btn-outline btn-icon" title={i18n.pages.project_logs.refresh} aria-label={i18n.pages.project_logs.refresh} onClick={refreshRuns}>
              <IconManager.RefreshIcon />
            </button>
          </div>
          <p className="page-empty-note">{i18n.pages.project_logs.description.replace("{max}", String(MAX_RUNS_PER_PROJECT))}</p>
          {runs.length === 0 ? (
            <p className="page-empty-note">{i18n.pages.project_logs.empty}</p>
          ) : (
            <ul className="run-list">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </ul>
          )}
        </>
      )}

      {activeTab === "webhooks" && (
        <>
          <div className="section-header-row">
            <h2 className="section-heading">{i18n.pages.project_webhooks.title}</h2>
            <button type="button" className="btn btn-outline btn-icon" title={i18n.pages.project_webhooks.refresh} aria-label={i18n.pages.project_webhooks.refresh} onClick={refreshWebhooks}>
              <IconManager.RefreshIcon />
            </button>
          </div>
          <p className="page-empty-note">{i18n.pages.project_webhooks.description}</p>
          {webhooks.length === 0 ? (
            <p className="page-empty-note">{i18n.pages.project_webhooks.empty}</p>
          ) : (
            <ul className="run-list">
              {webhooks.map((webhook) => (
                <WebhookRow key={webhook.flowId} webhook={webhook} projectId={projectId} />
              ))}
            </ul>
          )}
        </>
      )}
    </PageShell>
  );
}
