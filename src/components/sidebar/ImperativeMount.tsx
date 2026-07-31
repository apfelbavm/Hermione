"use client";

import { useEffect, useRef } from "react";

function setSubtreeDisabled(root: HTMLElement, disabled: boolean): void {
  for (const el of [root, ...Array.from(root.querySelectorAll("button, input, select, textarea"))]) {
    (el as HTMLButtonElement | HTMLInputElement).disabled = disabled;
  }
}

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
  }, deps);

  useEffect(() => {
    if (elRef.current) setSubtreeDisabled(elRef.current, disabled);
  }, [disabled]);

  return <span ref={containerRef} style={{ display: "contents" }} />;
}
