"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// The whole editor shell is a canvas + localStorage backed tool with no server-rendered content of
// its own — its store is created via a useState lazy initializer that reads localStorage
// synchronously on first render (see AppShell.tsx), which would throw under Next's SSR pass. This
// keeps AppShell entirely client-rendered; the app's actual server-side piece is /api/simulate.
const AppShell = dynamic(() => import("../../../../../components/AppShell"), { ssr: false });

export default function FlowEditorPage() {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  // Keyed by flowId: navigating from one Flow straight to another (without an intervening
  // non-AppShell page) would otherwise reuse the same AppShell instance — same component type at
  // the same tree position — leaving its store's lazy-initialized graph stuck on whichever Flow
  // was open first. The key forces a fresh mount (and a fresh loadFlowGraph read) per Flow.
  return <AppShell key={flowId} projectId={projectId} flowId={flowId} />;
}
