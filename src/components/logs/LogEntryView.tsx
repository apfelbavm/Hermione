import * as Papa from "papaparse";
import { formatLogTimestamp } from "../../shared/formatLogTimestamp";
import type { LogEntry } from "../../server/models";

/** Re-parses a "json"-formatted entry's message before display — it was already pretty-printed
 * once by debug.ts's own formatForLog before logging (see ExecutionContext.log's doc comment), so
 * this mostly just re-confirms that indentation; falls back to the raw message if it somehow isn't
 * valid JSON (e.g. formatForLog itself fell back to the raw, unparsed message). */
function formatJsonForDisplay(message: string): string {
  try {
    return JSON.stringify(JSON.parse(message), null, 2);
  } catch {
    return message;
  }
}

const DOWNLOAD_MIME_BY_FORMAT: Partial<Record<LogEntry["format"], string>> = {
  json: "application/json",
  xml: "application/xml",
  csv: "text/csv",
};

/** Only offered for a message actually printed via a chosen format (debug.ts's "Print (Formatted)"
 * node) — plain "text" has no distinct file type of its own worth exporting. */
function downloadLogEntry(entry: LogEntry): void {
  const mime = DOWNLOAD_MIME_BY_FORMAT[entry.format];
  if (!mime) return;
  const blob = new Blob([entry.message], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `log-${entry.id}.${entry.format}`;
  a.click();
  URL.revokeObjectURL(url);
}

/** One log line within a RunRow (see ./RunRow) — shared by the per-project Logs page and the
 * global one (app/logs/page.tsx), since a single run's entries render identically either way. */
export function LogEntryView({ entry }: { entry: LogEntry }) {
  const downloadable = entry.format in DOWNLOAD_MIME_BY_FORMAT;

  let content: React.ReactNode;
  if (entry.format === "csv") {
    const rows = (Papa.parse(entry.message, { delimiter: "," }).data as string[][]).filter((row) => row.length > 1 || row[0] !== "");
    content =
      rows.length > 0 ? (
        <div className="log-entry-csv-wrapper">
          <table className="log-entry-csv">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="log-entry-text log-entry-csv-text">{entry.message}</pre>
      );
  } else {
    const text = entry.format === "json" ? formatJsonForDisplay(entry.message) : entry.message;
    content = <pre className={`log-entry-text log-entry-${entry.format}`}>{text}</pre>;
  }

  return (
    <div className="log-entry">
      <div className="log-entry-header">
        <span className="log-entry-time">{formatLogTimestamp(entry.timestamp)}</span>
        {downloadable && (
          <button type="button" className="log-entry-download" onClick={() => downloadLogEntry(entry)}>
            ⬇ Download
          </button>
        )}
      </div>
      {content}
    </div>
  );
}
