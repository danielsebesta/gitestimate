import { Box, Label, Link, Text } from "@primer/react";
import { CopilotIcon, GitCommitIcon } from "@primer/octicons-react";
import type { CommitSample } from "../lib/estimate";
import { detectCommit } from "../lib/agents";

function rel(d: Date): string {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** latest commits, GitHub feed style — subject, sha, author, AI badge */
export default function CommitList({
  commits,
  repoFullName,
}: {
  commits: CommitSample[];
  /** owner/repo — links each sha to github.com when provided */
  repoFullName?: string;
}) {
  const recent = [...commits]
    .filter((c) => !Number.isNaN(new Date(c.authorDate).getTime()))
    .sort((a, b) => new Date(b.authorDate).getTime() - new Date(a.authorDate).getTime())
    .slice(0, 12);

  return (
    <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
      {recent.map((c, i) => {
        const signal = detectCommit(c);
        const subject = (c.message ?? "(no message)").split("\n")[0];
        return (
          <Box
            key={c.sha ?? i}
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            px={[2, 3]}
            py={2}
            sx={{ borderTop: i === 0 ? "none" : "1px solid", borderColor: "border.muted" }}
          >
            <Box display="flex" alignItems="center" sx={{ gap: 2, minWidth: 0 }}>
              <GitCommitIcon size={14} />
              <Text
                size="small"
                sx={{
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {subject}
              </Text>
              {signal && (
                <Label size="small" variant={signal.strength === "authored" ? "attention" : "default"}>
                  <CopilotIcon size={10} /> {signal.strength === "authored" ? "agent" : "AI-assisted"}
                </Label>
              )}
            </Box>
            <Box display="flex" alignItems="center" sx={{ gap: 2, flexShrink: 0, ml: 2 }}>
              {c.additions !== undefined && (
                <Text
                  size="small"
                  sx={{ fontFamily: "mono", fontSize: 11, whiteSpace: "nowrap", display: ["none", "inline"] }}
                >
                  <Text sx={{ color: "success.fg" }}>+{c.additions}</Text>{" "}
                  <Text sx={{ color: "danger.fg" }}>−{c.deletions}</Text>
                </Text>
              )}
              {c.sha &&
                (repoFullName ? (
                  <Link
                    href={`https://github.com/${repoFullName}/commit/${c.sha}`}
                    target="_blank"
                    rel="noreferrer"
                    muted
                    sx={{ fontFamily: "mono", fontSize: 11 }}
                  >
                    {c.sha.slice(0, 7)}
                  </Link>
                ) : (
                  <Text size="small" color="fg.muted" sx={{ fontFamily: "mono", fontSize: 11 }}>
                    {c.sha.slice(0, 7)}
                  </Text>
                ))}
              <Text
                size="small"
                color="fg.muted"
                sx={{ fontSize: 11, display: ["none", "inline"] }}
              >
                {c.author}
              </Text>
              <Text size="small" color="fg.muted" sx={{ minWidth: 56, textAlign: "right", fontSize: 11 }}>
                {rel(new Date(c.authorDate))}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
