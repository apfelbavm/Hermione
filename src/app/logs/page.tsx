"use client";

import { useEffect, useMemo, useState } from "react";
import { listAllRuns, listProjects } from "../../client/api";
import type { ProjectSummary, RunLog } from "@hermione/core/server/models";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { RunRow } from "../../components/logs/RunRow";
import { IconManager } from "../../shared/iconManager";
import { i18n } from "@i18n";

/** The global counterpart of a project's own Logs page (projects/[projectId]/logs/page.tsx) — same
 * run list/entry rendering (shared via components/logs/RunRow.tsx), just spanning every project
 * instead of one, with each run row saying which project it came from. */
export default function GlobalLogsPage() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  function refresh(): void {
    void listAllRuns().then(setRuns);
    void listProjects().then(setProjects);
  }

  useEffect(() => {
    refresh();
  }, []);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: i18n.pages.logs.page_title }]} />
      <div className="page-header">
        <h1>{i18n.pages.logs.page_title}</h1>
        <button type="button" className="btn btn-outline btn-icon" title={i18n.pages.logs.refresh} aria-label={i18n.pages.logs.refresh} onClick={refresh}>
          <IconManager.RefreshIcon />
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="page-empty-note">{i18n.pages.logs.empty}</p>
      ) : (
        <ul className="run-list">
          {runs.map((run) => {
            const project = projectById.get(run.projectId);
            return (
              <RunRow
                key={run.id}
                run={run}
                project={
                  project
                    ? {
                        name: project.name,
                        href: `/projects/${project.id}`,
                      }
                    : undefined
                }
              />
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
