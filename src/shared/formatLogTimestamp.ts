/** Shared between the live in-app log panel (AppShell.tsx's appendLog) and the persisted Logs page
 * (which reads a LogEntry's own stored `timestamp`) — every log line always shows this immediately
 * before its message, so both places format it identically. `YYYY-MM-DD HH:MM:SS` (local time, no
 * timezone letters) — compact enough to sit inline without crowding out the message itself. */
export function formatLogTimestamp(when: string | Date): string {
  const date = typeof when === "string" ? new Date(when) : when;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
