"use client";

import dynamic from "next/dynamic";

// The whole editor shell is a canvas + localStorage backed tool with no server-rendered content of
// its own — its store is created via a useState lazy initializer that reads localStorage
// synchronously on first render (see AppShell.tsx), which would throw under Next's SSR pass. This
// keeps AppShell entirely client-rendered; the app's actual server-side piece is /api/simulate.
const AppShell = dynamic(() => import("../components/AppShell"), { ssr: false });

export default function Page() {
  return <AppShell />;
}
