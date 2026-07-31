"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getProject, listRuns } from "../../../../client/api";
import { MAX_RUNS_PER_PROJECT } from "../../../../shared/runLogConstants";
import type { ProjectSummary, RunLog } from "../../../../server/models";
import { PageShell } from "../../../../components/PageHeader";
import { Breadcrumbs } from "../../../../components/Breadcrumbs";
import { RunRow } from "../../../../components/logs/RunRow";

export default function LogsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    void listRuns(projectId).then(setRuns);
    void getProject(projectId)
      .then(setProject)
      .catch(() => setProject(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: project?.name ?? "Project", href: `/projects/${projectId}` }, { label: "Logs" }]} />
      <Link href={`/projects/${projectId}`} className="back-link">
        ← Back
      </Link>
      <h1>Run Logs</h1>
      <p className="page-empty-note">Showing the latest {MAX_RUNS_PER_PROJECT} runs (grouped by run — expand one to inspect its individual log entries).</p>
      {runs.length === 0 ? (
        <p className="page-empty-note">No runs yet — simulate a Flow to see its logs here.</p>
      ) : (
        <ul className="run-list">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}
