"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// Same reasoning as app/projects/[projectId]/flows/[flowId]/page.tsx's own dynamic import: the
// whole shell is a canvas-backed client component with no server-rendered content of its own.
const RestoreVersionShell = dynamic(() => import("../../../../../../components/RestoreVersionShell"), { ssr: false });

export default function RestoreFlowVersionPage() {
  const { projectId, flowId } = useParams<{
    projectId: string;
    flowId: string;
  }>();
  // Keyed by flowId for the same reason as FlowEditorPage's own key — forces a fresh mount (and a
  // fresh version list/graph load) per Flow.
  return <RestoreVersionShell key={flowId} projectId={projectId} flowId={flowId} />;
}
