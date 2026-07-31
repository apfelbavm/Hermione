"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { i18n } from "@i18n";
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
      <Breadcrumbs
        items={[
          { label: i18n.pages.projects.title, href: "/projects" },
          {
            label: project?.name ?? i18n.pages.project_logs.project_fallback,
            href: `/projects/${projectId}`,
          },
          { label: i18n.pages.logs.page_title },
        ]}
      />
      <Link href={`/projects/${projectId}`} className="back-link">
        {i18n.pages.project_logs.back}
      </Link>
      <h1>{i18n.pages.project_logs.title}</h1>
      <p className="page-empty-note">
        {i18n.pages.project_logs.description.replace(
          "{max}",
          String(MAX_RUNS_PER_PROJECT),
        )}
      </p>
      {runs.length === 0 ? (
        <p className="page-empty-note">{i18n.pages.project_logs.empty}</p>
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
