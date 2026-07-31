"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDeployedScript, listDeployedScripts, listProjects, runProductionFlow } from "../../client/api";
import type { DeployedScript, DeployedScriptSummary, ProjectSummary, RunLog } from "../../server/models";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { getCurrentTheme, THEME_CHANGE_EVENT } from "../../client/theme";
import { formatLogTimestamp } from "../../shared/formatLogTimestamp";

// Same reasoning as overlay/scriptEditor.ts: Monaco's own JS is multi-megabyte, so it's only ever
// loaded on demand (here, the moment this page actually renders one) rather than bundled into every
// page's initial load. `ssr:false` since Monaco needs real browser APIs.
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <p className="page-empty-note">Loading editor…</p>,
});

/** Monaco's own theme names, distinct from this app's "light"/"dark" — same mapping
 * overlay/scriptEditor.ts's own (private) monacoThemeFor uses for the Flow editor's Code tabs. */
function monacoThemeFor(theme: "light" | "dark"): string {
  return theme === "light" ? "vs" : "vs-dark";
}

/** Runs a Flow's DEPLOYED compiled output (not the interpreted Simulate path — see
 * api/emulate/run/route.ts) directly on this machine, as a stand-in for an actual deployment
 * target. Only Flows that have actually been deployed (see AppShell.tsx's Deploy button) show up
 * here — picked via two dropdowns (project, then that project's own deployed Flows) rather than one
 * flat list, since a project can have many Flows. The currently-selected Flow's compiled source is
 * shown read-only in Monaco, with its deploy date/version overlaid top-right (see
 * DeployedScript.version's own doc comment for what "version" means here). */
export default function EmulatePage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [scripts, setScripts] = useState<DeployedScriptSummary[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState("");

  const [scriptDetail, setScriptDetail] = useState<DeployedScript | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [monacoTheme, setMonacoTheme] = useState(() => monacoThemeFor("light"));

  useEffect(() => {
    setMonacoTheme(monacoThemeFor(getCurrentTheme()));
    function onThemeChange(): void {
      setMonacoTheme(monacoThemeFor(getCurrentTheme()));
    }
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  useEffect(() => {
    async function loadProjects(): Promise<void> {
      const list = await listProjects();
      setProjects(list);
      setSelectedProjectId((prev) => prev || list[0]?.id || "");
      setLoadingProjects(false);
    }
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setScripts([]);
      return;
    }
    let cancelled = false;
    setLoadingScripts(true);
    void listDeployedScripts(selectedProjectId).then((list) => {
      if (cancelled) return;
      setScripts(list);
      setSelectedFlowId(list[0]?.flowId ?? "");
      setLoadingScripts(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !selectedFlowId) {
      setScriptDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setResult(null);
    setError(null);
    void getDeployedScript(selectedProjectId, selectedFlowId)
      .then((detail) => {
        if (!cancelled) setScriptDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setScriptDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, selectedFlowId]);

  async function handleRun(): Promise<void> {
    if (!selectedProjectId || !selectedFlowId) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { run } = await runProductionFlow(selectedProjectId, selectedFlowId);
      setResult(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Emulate" }]} />
      <h1>Emulate</h1>
      <p className="page-empty-note">
        Runs a Flow&apos;s deployed compiled output directly on this machine — the same snapshot the editor&apos;s &quot;Deploy&quot; button last persisted — instead of the editor&apos;s
        interpreted Simulate.
      </p>

      {loadingProjects ? (
        <p className="page-empty-note">Loading projects…</p>
      ) : projects.length === 0 ? (
        <p className="page-empty-note">No projects yet.</p>
      ) : (
        <div className="create-row">
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} disabled={running}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {loadingScripts ? (
            <span className="page-empty-note">Loading deployed Flows…</span>
          ) : scripts.length === 0 ? (
            <span className="page-empty-note">No Flows deployed in this project yet.</span>
          ) : (
            <select value={selectedFlowId} onChange={(e) => setSelectedFlowId(e.target.value)} disabled={running}>
              {scripts.map((script) => (
                <option key={script.flowId} value={script.flowId}>
                  {script.flowName}
                </option>
              ))}
            </select>
          )}

          <button type="button" onClick={() => void handleRun()} disabled={running || !selectedFlowId || loadingDetail}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
      )}

      {scriptDetail && (
        <div className="emulate-editor-frame">
          <div className="emulate-editor-meta">
            <span>{formatLogTimestamp(scriptDetail.deployedAt)}</span>
            <span>Version: {scriptDetail.version}</span>
          </div>
          <Editor
            height="420px"
            language="typescript"
            path={scriptDetail.flowId}
            value={scriptDetail.code}
            theme={monacoTheme}
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, domReadOnly: true }}
          />
        </div>
      )}

      {error && <p className="log-save-status log-save-status-error">{error}</p>}

      {result && (
        <p className="page-empty-note">
          Ran — {result.entries.length} {result.entries.length === 1 ? "entry" : "entries"}.{" "}
          <Link href="/logs" className="logs-link">
            View in Logs →
          </Link>
        </p>
      )}
    </PageShell>
  );
}
