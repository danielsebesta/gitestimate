import { Box, Label, Link, Text } from "@primer/react";
import { GitCommitIcon, HubotIcon } from "@primer/octicons-react";
import { isBotLogin, stripBotSuffix } from "../lib/agents";
import type { Session } from "../lib/estimate";
import { formatHours } from "../lib/estimate";

function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** last N sessions, GitHub commit-feed style grouped by day */
export default function SessionList({
  sessions,
  repoFullName,
}: {
  sessions: Session[];
  /** owner/repo — links each session's first sha to github.com when provided */
  repoFullName?: string;
}) {
  const recent = [...sessions].sort((a, b) => b.start.getTime() - a.start.getTime()).slice(0, 12);
  const byDay = new Map<string, Session[]>();
  for (const s of recent) {
    const key = s.start.toDateString();
    const arr = byDay.get(key) ?? [];
    arr.push(s);
    byDay.set(key, arr);
  }

  return (
    <Box>
      {[...byDay.entries()].map(([day, list]) => (
        <Box key={day} sx={{ mb: 3 }}>
          <Text size="small" color="fg.muted" sx={{ display: "block", mb: 1 }}>
            {fmtDay(list[0].start)}
          </Text>
          <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
            {list.map((s, i) => (
              <Box
                key={i}
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                px={[2, 3]}
                py={2}
                sx={{
                  borderTop: i === 0 ? "none" : "1px solid",
                  borderColor: "border.muted",
                  flexWrap: "wrap",
                  rowGap: 1,
                }}
              >
                <Box display="flex" alignItems="center" sx={{ gap: 2, minWidth: 0 }}>
                  <GitCommitIcon size={14} />
                  <Text size="small" sx={{ whiteSpace: "nowrap" }}>
                    {fmtTime(s.start)} → {fmtTime(s.end)}
                  </Text>
                  {s.firstSha &&
                    (repoFullName ? (
                      <Link
                        href={`https://github.com/${repoFullName}/commit/${s.firstSha}`}
                        target="_blank"
                        rel="noreferrer"
                        muted
                        title="first commit in this session"
                        sx={{ fontFamily: "mono", fontSize: 11 }}
                      >
                        {s.firstSha.slice(0, 7)}
                      </Link>
                    ) : (
                      <Text size="small" color="fg.muted" sx={{ fontFamily: "mono", fontSize: 11 }}>
                        {s.firstSha.slice(0, 7)}
                      </Text>
                    ))}
                  {s.author && (
                    <Text
                      size="small"
                      color="fg.muted"
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: ["none", "inline"],
                      }}
                    >
                      {stripBotSuffix(s.author)}
                    </Text>
                  )}
                  {s.author && isBotLogin(s.author) && !s.agentOnly && (
                    <Label
                      size="small"
                      variant="secondary"
                      sx={{ display: "inline-flex", alignItems: "center", gap: 1, lineHeight: 1 }}
                    >
                      <HubotIcon size={10} /> Bot
                    </Label>
                  )}
                  {s.agentOnly && (
                    <Label
                      size="small"
                      variant="secondary"
                      title="Timed from model speed, not human hours"
                    >
                      <HubotIcon size={10} /> AI
                    </Label>
                  )}
                </Box>
                <Box display="flex" alignItems="center" sx={{ gap: 3 }}>
                  <Text size="small" color="fg.muted" sx={{ whiteSpace: "nowrap" }}>
                    {s.commitCount} commit{s.commitCount === 1 ? "" : "s"}
                    {s.sized && s.churn !== undefined && (
                      <>
                        {" "}
                        · ±{Math.round(s.churn).toLocaleString()}
                        {s.changedFiles !== undefined && s.changedFiles > 0
                          ? ` / ${s.changedFiles} file${s.changedFiles === 1 ? "" : "s"}`
                          : ""}
                      </>
                    )}
                  </Text>
                  {s.sized && (s.churn ?? 0) <= 5 && (
                    <Label size="small" variant="default" title="Small diff — short ramp-up">
                      tiny
                    </Label>
                  )}
                  <Text size="small" sx={{ fontWeight: 600, minWidth: 56, textAlign: "right" }}>
                    {formatHours(s.minutes)}
                  </Text>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
