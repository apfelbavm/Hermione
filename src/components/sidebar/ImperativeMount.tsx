"use client";

import { useEffect, useRef } from "react";

/** Mounts a single imperatively-built DOM element (from overlay/typedValueInput.ts's builders —
 * createTypeSelect/createContainerSelect/createTypedValueInput) into React's tree. A pragmatic
 * bridge rather than a rewrite: those builders are shared with the still-imperative canvas
 * pin-widget system (see overlay/widgetSync.ts) and the container ones carry real internal state
 * (a container variable's own add/remove row list) — rewriting them as JSX is real, separate work,
 * not something to redo per call site here. Rebuilds the element whenever `deps` changes. */
export function ImperativeMount({ build, deps }: { build: () => HTMLElement; deps: unknown[] }) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = build();
    containerRef.current?.appendChild(el);
    return () => {
      el.remove();
    };
    // deps is caller-controlled (see each call site) — this hook intentionally defers to it instead
    // of statically listing `build`, which is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // display:contents so this wrapper never participates in the parent's flex layout itself — the
  // mounted element (a select button, text input, etc.) is the thing that should size/flex, not us.
  return <span ref={containerRef} style={{ display: "contents" }} />;
}
