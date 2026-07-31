"use client";

import { useEffect, useRef } from "react";

/** Sets/clears the native `disabled` property on `root` itself and every button/input/select/
 * textarea nested inside it — these builders return plain buttons, inputs, or wrapper spans/divs
 * containing several of either (see typedValueInput.ts), so a single `.disabled` write on the
 * returned element isn't enough on its own. */
function setSubtreeDisabled(root: HTMLElement, disabled: boolean): void {
  for (const el of [root, ...Array.from(root.querySelectorAll("button, input, select, textarea"))]) {
    (el as HTMLButtonElement | HTMLInputElement).disabled = disabled;
  }
}

/** Mounts a single imperatively-built DOM element (from overlay/typedValueInput.ts's builders —
 * createTypeSelect/createContainerSelect/createTypedValueInput) into React's tree. A pragmatic
 * bridge rather than a rewrite: those builders are shared with the still-imperative canvas
 * pin-widget system (see overlay/widgetSync.ts) and the container ones carry real internal state
 * (a container variable's own add/remove row list) — rewriting them as JSX is real, separate work,
 * not something to redo per call site here. Rebuilds the element whenever `deps` changes. */
export function ImperativeMount({ build, deps, disabled = false }: { build: () => HTMLElement; deps: unknown[]; disabled?: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = build();
    elRef.current = el;
    setSubtreeDisabled(el, disabled);
    containerRef.current?.appendChild(el);
    return () => {
      el.remove();
      elRef.current = null;
    };
    // deps is caller-controlled (see each call site) — this hook intentionally defers to it instead
    // of statically listing `build`, which is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Applied as its own effect (not folded into deps above) so toggling `disabled` alone never
  // rebuilds the element — that would needlessly recreate e.g. a container list's whole row state.
  useEffect(() => {
    if (elRef.current) setSubtreeDisabled(elRef.current, disabled);
  }, [disabled]);

  // display:contents so this wrapper never participates in the parent's flex layout itself — the
  // mounted element (a select button, text input, etc.) is the thing that should size/flex, not us.
  return <span ref={containerRef} style={{ display: "contents" }} />;
}
