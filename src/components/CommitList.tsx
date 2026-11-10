import { Box, Label, Link, Text } from "@primer/react";
import { GitCommitIcon, HubotIcon } from "@primer/octicons-react";
import type { CommitSample } from "../lib/estimate";
import { detectCommit, isBotLogin, stripBotSuffix } from "../lib/agents";

function rel(d: Date): string {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function strengthLabel(strength: "authored" | "assisted" | "suspected"): string {
  if (strength === "authored") return "AI author";
  if (strength === "assisted") return "AI helped";
  return "Maybe AI";
}

/** latest commits, GitHub feed style — subject, sha, author, AI badge */
export default function CommitList({
  commits,
  repoFullName,
  branch,
}: {
  commits: CommitSample[];
  /** owner/repo — links each sha to github.com when provided */
  repoFullName?: string;
  branch?: string;
}) {
  const recent = [...commits]
    .filter((c) => !Number.isNaN(new Date(c.authorDate).getTime()))
    .sort((a, b) => new Date(b.authorDate).getTime() - new Date(a.authorDate).getTime())
    .slice(0, 12);

  return (
    <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
      {recent.map((c, i) => {
        const signal = detectCommit(c, { branch, patch: c.patch });
        const botOnly = !signal && isBotLogin(c.author);
        const subject = (c.message ?? "(no message)").split("\n")[0];
        const badge =
          signal?.strength === "suspected"
            ? "attention"
            : "secondary";
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
                <Label
                  size="small"
                  variant={badge}
                  title={[signal.tool, signal.model, signal.marker].filter(Boolean).join(" · ")}
                  sx={{ display: "inline-flex", alignItems: "center", gap: 1, flexShrink: 0, lineHeight: 1 }}
                >
                  {signal.avatarUrl ? (
                    <Box
                      as="img"
                      src={signal.avatarUrl}
                      alt=""
                      sx={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0 }}
                    />
                  ) : (
                    <HubotIcon size={10} />
                  )}
                  {signal.tool ?? strengthLabel(signal.strength)}
                  {signal.model ? ` · ${signal.model}` : ""}
                </Label>
              )}
              {botOnly && (
                <Label
                  size="small"
                  variant="secondary"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 1, flexShrink: 0, lineHeight: 1 }}
                >
                  <HubotIcon size={10} /> Bot
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
                {stripBotSuffix(c.author ?? "")}
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
