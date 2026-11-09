import type { AuthorEstimate, Session } from "./estimate";

/** triggers a browser download of `text` under `filename` */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: string | number | boolean | undefined): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(headers: string[], rows: Array<Array<string | number | boolean | undefined>>): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function sessionsCsv(sessions: Session[]): string {
  return csv(
    ["start", "end", "author", "commits", "minutes", "agent_only", "first_sha"],
    [...sessions]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((s) => [
        s.start.toISOString(),
        s.end.toISOString(),
        s.author,
        s.commitCount,
        Math.round(s.minutes * 100) / 100,
        s.agentOnly,
        s.firstSha,
      ]),
  );
}

export function authorsCsv(authors: AuthorEstimate[]): string {
  return csv(
    ["author", "commits", "sessions", "minutes", "agent"],
    authors.map((a) => [a.author, a.commits, a.sessions, Math.round(a.minutes * 100) / 100, a.agent]),
  );
}
