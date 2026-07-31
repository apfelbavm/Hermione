"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listFlows, listProjects, runProductionFlow } from "../../client/api";
import type { FlowSummary, ProjectSummary, RunLog } from "../../server/models";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";

interface FlowOption {
  projectId: string;
  projectName: string;
  flowId: string;
  flowName: string;
}

/** Runs a saved Flow's own COMPILED output (not the interpreted Simulate path — see
 * api/localhost-deployment/run/route.ts) directly on this machine, as a stand-in for an actual
 * deployment target. Every project's Flows are fetched up front (there's no flat "all flows" API —
 * see client/api.ts's listProjects/listFlows) and flattened into one picker grouped by project. */
export default function LocalhostDeploymentPage() {
  const [options, setOptions] = useState<FlowOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions(): Promise<void> {
      const projects = await listProjects();
      const perProject = await Promise.all(
        projects.map(async (project: ProjectSummary) => {
          const flows = await listFlows(project.id);
          return flows.map((flow: FlowSummary) => ({ projectId: project.id, projectName: project.name, flowId: flow.id, flowName: flow.name }));
        }),
      );
      const flat = perProject.flat();
      setOptions(flat);
      setSelected((prev) => prev || flat[0]?.flowId || "");
      setLoadingOptions(false);
    }
    void loadOptions();
  }, []);

  const grouped = useMemo(() => {
    const byProject = new Map<string, FlowOption[]>();
    for (const option of options) {
      const list = byProject.get(option.projectName) ?? [];
      list.push(option);
      byProject.set(option.projectName, list);
    }
    return [...byProject.entries()];
  }, [options]);

  const selectedOption = options.find((o) => o.flowId === selected);

  async function handleRun(): Promise<void> {
    if (!selectedOption) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { run } = await runProductionFlow(selectedOption.projectId, selectedOption.flowId);
      setResult(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Localhost Deployment" }]} />
      <h1>Localhost Deployment</h1>
      <p className="page-empty-note">
        Runs a Flow&apos;s own compiled output directly on this machine — the same source a &quot;Compile&quot; click in the editor downloads — instead of the editor&apos;s interpreted
        Simulate.
      </p>

      {loadingOptions ? (
        <p className="page-empty-note">Loading Flows…</p>
      ) : options.length === 0 ? (
        <p className="page-empty-note">No Flows yet — create one from a project first.</p>
      ) : (
        <div className="create-row">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={running}>
            {grouped.map(([projectName, flows]) => (
              <optgroup key={projectName} label={projectName}>
                {flows.map((flow) => (
                  <option key={flow.flowId} value={flow.flowId}>
                    {flow.flowName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" onClick={() => void handleRun()} disabled={running || !selectedOption}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
      )}

      {error && <p className="log-save-status log-save-status-error">{error}</p>}

      {result && (
        <div className="run-entries">
          <h2 className="section-heading">Result</h2>
          <p className="page-empty-note">
            {result.entries.length} {result.entries.length === 1 ? "entry" : "entries"} —{" "}
            <Link href={`/projects/${result.projectId}/logs`} className="logs-link">
              view in Logs →
            </Link>
          </p>
          {result.entries.length === 0 ? (
            <p className="page-empty-note">No log output for this run.</p>
          ) : (
            result.entries.map((entry) => (
              <div className="log-entry" key={entry.id}>
                <pre className="log-entry-text">{entry.message}</pre>
              </div>
            ))
          )}
        </div>
      )}
    </PageShell>
  );
}
