"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ProjectWorkspace } from "../../../components/ProjectWorkspace";
import type { ProjectTabKey } from "../../../components/ProjectTabs";

const TAB_KEYS: ProjectTabKey[] = ["flows", "logs", "webhooks"];

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const tabParam = useSearchParams().get("tab");
  const initialTab = TAB_KEYS.includes(tabParam as ProjectTabKey) ? (tabParam as ProjectTabKey) : "flows";
  return <ProjectWorkspace projectId={projectId} initialTab={initialTab} />;
}
