"use client";

import Link from "next/link";
import { useState } from "react";
import { i18n } from "@i18n";
import type { RunLog } from "../../server/models";
import { IconManager } from "../../shared/iconManager";
import { LogEntryView } from "./LogEntryView";

function getExecutionTimeString(executionMs: number): string {
  const ms = Math.round(executionMs);
  if (ms < 1000) {
    return ms + i18n.components.run_row.ms;
  }
  const s = ms / 1000;
  if (s < 60) {
    return s + i18n.components.run_row.s;
  }
  const m = Math.floor(s) / 60;
  return m + i18n.components.run_row.m;
}

export function RunRow({ run, project }: { run: RunLog; project?: { name: string; href: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="run-row">
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
        <span className="run-row-caret">{expanded ? <IconManager.ChevronDownIcon /> : <IconManager.ChevronRightIcon />}</span>
        {project && (
          <Link href={project.href} className="run-row-project-name" onClick={(e) => e.stopPropagation()}>
            {project.name}
          </Link>
        )}
        <span className="run-row-flow-name">
          {run.flowName}
          {run.executionMs !== undefined && (
            <span className="run-row-execution-time">
              {" "}
              ({i18n.components.run_row.execution_time}
              {getExecutionTimeString(run.executionMs)})
            </span>
          )}
        </span>
        <span className={`run-row-kind run-row-kind-${run.kind}`}>
          {run.kind === "simulate" ? i18n.components.run_row.simulate : run.kind === "chained" ? i18n.components.run_row.chained : run.kind === "deploy" ? i18n.components.run_row.deploy : run.kind === "request" ? i18n.components.run_row.request : i18n.components.run_row.manual}
        </span>
        {run.version !== undefined && (
          <span className="entity-version-badge">
            {i18n.pages.project.flow_version_prefix}
            {run.version}
          </span>
        )}
        {run.revision !== undefined && (
          <span className="run-row-revision">
            {i18n.components.run_row.revision}
            {run.revision}
          </span>
        )}
        <span className="run-row-time">{new Date(run.startedAt).toLocaleString()}</span>
        <span className="run-row-count">
          {run.entries.length} {run.entries.length === 1 ? i18n.components.run_row.entry : i18n.components.run_row.entries}
        </span>
      </div>
      {expanded && <div className="run-entries">{run.entries.length === 0 ? <p className="page-empty-note">{i18n.components.run_row.no_output}</p> : run.entries.map((entry) => <LogEntryView key={entry.id} entry={entry} />)}</div>}
    </li>
  );
}
