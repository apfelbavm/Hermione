"use client";

import { useParams } from "next/navigation";
import { ProjectWorkspace } from "../../../../components/ProjectWorkspace";

export default function LogsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <ProjectWorkspace projectId={projectId} initialTab="logs" />;
}
