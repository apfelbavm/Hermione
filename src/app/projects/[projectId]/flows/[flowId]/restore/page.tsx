"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { i18n } from "@i18n";
import { getFlowWithGraph, getProject } from "../../../../../../client/api";
import type { FlowSummary, ProjectSummary } from "../../../../../../server/models";
import { PageShell } from "../../../../../../components/PageHeader";
import { Breadcrumbs } from "../../../../../../components/Breadcrumbs";

// Stub for the future "Restore old version" feature (see the Flow row's context menu) — for now
// this just gives the user a way back out; picking an actual historical version comes later.
export default function RestoreFlowVersionPage() {
  const { projectId, flowId } = useParams<{
    projectId: string;
    flowId: string;
  }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [flow, setFlow] = useState<FlowSummary | null>(null);

  useEffect(() => {
    void (async () => {
      const [proj, { flow: f }] = await Promise.all([getProject(projectId).catch(() => null), getFlowWithGraph(projectId, flowId)]);
      setProject(proj);
      setFlow(f);
    })();
  }, [projectId, flowId]);

  return (
    <PageShell>
      <Breadcrumbs
        items={[
          { label: i18n.pages.projects.title, href: "/projects" },
          {
            label: project?.name ?? i18n.pages.project_logs.project_fallback,
            href: `/projects/${projectId}`,
          },
          {
            label: flow?.name ?? "",
            href: `/projects/${projectId}/flows/${flowId}`,
          },
          { label: i18n.pages.restore_flow_version.title },
        ]}
      />
      <h1>{i18n.pages.restore_flow_version.title}</h1>
      <p className="page-empty-note">{i18n.pages.restore_flow_version.placeholder}</p>
      <div className="modal-actions">
        <button type="button" onClick={() => router.push(`/projects/${projectId}`)}>
          {i18n.pages.restore_flow_version.cancel}
        </button>
      </div>
    </PageShell>
  );
}
