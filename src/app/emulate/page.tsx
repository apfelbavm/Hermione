"use client";

import { useEffect, useMemo, useState } from "react";
import { listDeployedScripts, listProjects, runProductionFlow } from "../../client/api";
import type { ProjectSummary, RunLog } from "../../server/models";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";

interface FlowOption {
  projectId: string;
  projectName: string;
  flowId: string;
  flowName: string;
}

/** Runs a Flow's DEPLOYED compiled output (not the interpreted Simulate path — see
 * api/localhost-deployment/run/route.ts) directly on this machine, as a stand-in for an actual
 * deployment target. Only Flows that have actually been deployed (see AppShell.tsx's Deploy button)
 * show up here — every project's deployed scripts are fetched up front (there's no flat "all
 * deployments" API — see client/api.ts's listProjects/listDeployedScripts) and flattened into one
 * picker grouped by project. */
export default function LocalhostDeploymentPage() {
  const [options, setOptions] = useState<FlowOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState(false);
  const [_result, setResult] = useState<RunLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions(): Promise<void> {
      const projects = await listProjects();
      const perProject = await Promise.all(
        projects.map(async (project: ProjectSummary) => {
          const deployed = await listDeployedScripts(project.id);
          return deployed.map((script) => ({ projectId: project.id, projectName: project.name, flowId: script.flowId, flowName: script.flowName }));
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
      <Breadcrumbs items={[{ label: "Emulate" }]} />
      <h1>Emulate</h1>
      <p className="page-empty-note">Runs a Flow's deployed compiled output directly on this machine — the same snapshot the editor&apos;s &quot;Deploy&quot; button last persisted — instead of the editor&apos;s interpreted Simulate.</p>

      {loadingOptions ? (
        <p className="page-empty-note">Loading deployed Flows…</p>
      ) : options.length === 0 ? (
        <p className="page-empty-note">No Flows have been deployed yet — open one in the editor and click Deploy.</p>
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
    </PageShell>
  );
}
