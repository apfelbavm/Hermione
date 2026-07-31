"use client";

import Link from "next/link";
import { useState } from "react";
import type { RunLog } from "../../server/models";
import { LogEntryView } from "./LogEntryView";

function getExecutionTimeString(executionMs: number): string {
  const ms = Math.round(executionMs);
  if (ms < 1000) {
    return ms + " ms";
  }
  const s = ms / 1000;
  if (s < 60) {
    return s + " s";
  }
  const m = Math.floor(s) / 60;
  return m + " m";
}

export function RunRow({ run, project }: { run: RunLog; project?: { name: string; href: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="run-row">
      {/* A real <button> can't legally contain another interactive element (the project Link below),
          so this toggle is a div with the same keyboard semantics instead. */}
      <div
        className="run-row-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((exp) => !exp);
          }
        }}
      >
        <span className="run-row-caret">{expanded ? "▾" : "▸"}</span>
        {project && (
          <Link href={project.href} className="run-row-project-name" onClick={(e) => e.stopPropagation()}>
            {project.name}
          </Link>
        )}
        <span className="run-row-flow-name">
          {run.flowName}
          {run.executionMs !== undefined && <span className="run-row-execution-time"> (Execution time: {getExecutionTimeString(run.executionMs)})</span>}
        </span>
        <span className={`run-row-kind run-row-kind-${run.kind}`}>{run.kind === "simulate" ? "Simulate" : "Production"}</span>
        <span className="run-row-time">{new Date(run.startedAt).toLocaleString()}</span>
        <span className="run-row-count">
          {run.entries.length} {run.entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      {expanded && <div className="run-entries">{run.entries.length === 0 ? <p className="page-empty-note">No log output for this run.</p> : run.entries.map((entry) => <LogEntryView key={entry.id} entry={entry} />)}</div>}
    </li>
  );
}
