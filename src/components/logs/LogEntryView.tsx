import * as Papa from "papaparse";
import { i18n } from "@i18n";
import { formatLogTimestamp } from "../../shared/formatLogTimestamp";
import type { LogEntry } from "../../server/models";

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
            {i18n.components.log_entry.download}
          </button>
        )}
      </div>
      {content}
    </div>
  );
}
