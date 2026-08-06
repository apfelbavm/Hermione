"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { i18n } from "@i18n";
import { getProject, listProjectWebhooks } from "../../../../client/api";
import type { ProjectSummary, WebhookFlowSummary } from "../../../../server/models";
import { PageShell } from "../../../../components/PageHeader";
import { Breadcrumbs } from "../../../../components/Breadcrumbs";
import { WebhookRow } from "../../../../components/webhooks/WebhookRow";
import { IconManager } from "../../../../shared/iconManager";

export default function WebhooksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [webhooks, setWebhooks] = useState<WebhookFlowSummary[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);

  function refresh(): void {
    void listProjectWebhooks(projectId).then(setWebhooks);
    void getProject(projectId)
      .then(setProject)
      .catch(() => setProject(null));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <PageShell>
      <Breadcrumbs
        items={[
          { label: i18n.pages.projects.title, href: "/projects" },
          {
            label: project?.name ?? i18n.pages.project_webhooks.project_fallback,
            href: `/projects/${projectId}`,
          },
          { label: i18n.pages.project_webhooks.title },
        ]}
      />
      <Link href={`/projects/${projectId}`} className="back-link btn btn-ghost">
        <IconManager.ChevronLeftIcon />
        {i18n.pages.project_webhooks.back}
      </Link>
      <div className="page-header">
        <h1>{i18n.pages.project_webhooks.title}</h1>
        <button type="button" className="btn btn-outline btn-icon" title={i18n.pages.project_webhooks.refresh} aria-label={i18n.pages.project_webhooks.refresh} onClick={refresh}>
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
    </PageShell>
  );
}
