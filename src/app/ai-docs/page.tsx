"use client";

import { useMemo, useState } from "react";
import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { buildAiDocsMarkdown } from "../../shared/aiDocsMarkdown";
import { i18n } from "@i18n";

/** Reference doc for feeding an AI enough context (node types, pins, the clipboard paste JSON
 * schema) to generate a graph the user can paste straight into the canvas (Ctrl+V). Generated live
 * from the node registry (see buildAiDocsMarkdown) rather than hand-written, so it can never drift
 * out of sync with the actual nodes shipped in this repo. */
export default function AiDocsPage() {
  const markdown = useMemo(() => buildAiDocsMarkdown(), []);
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: i18n.pages.ai_docs.page_title }]} />
      <h1>{i18n.pages.ai_docs.page_title}</h1>
      <p className="page-empty-note">{i18n.pages.ai_docs.description}</p>

      <div className="search-create-row">
        <button type="button" onClick={() => void handleCopy()}>
          {copied ? i18n.pages.ai_docs.copied : i18n.pages.ai_docs.copy}
        </button>
      </div>

      <pre className="ai-docs-content">{markdown}</pre>
    </PageShell>
  );
}
