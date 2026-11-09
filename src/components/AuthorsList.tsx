import { useMemo, useState } from "react";
import { Box, Button, Label, Link, Text } from "@primer/react";
import { Bot, User } from "lucide-react";
import type { AuthorEstimate, CommitSample } from "../lib/estimate";
import { authorIdentity, formatHours } from "../lib/estimate";
import { detectCommit, stripBotSuffix } from "../lib/agents";

const INITIAL = 12;

/** authors ranked by credited minutes, GitHub contributor-list style */
export default function AuthorsList({
  authors,
  commits,
  viewerLogin,
}: {
  authors: AuthorEstimate[];
  /** used to attach AI tool chips per author */
  commits?: CommitSample[];
  /** signed-in GitHub login — show a You badge on matching authors */
  viewerLogin?: string | null;
}) {
  const you = viewerLogin?.toLowerCase();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? authors : authors.slice(0, INITIAL);
  const hidden = authors.length - shown.length;

  const toolsByAuthor = useMemo(() => {
    const map = new Map<string, Map<string, { name: string; avatarUrl?: string; n: number }>>();
    if (!commits) return map;
    for (const c of commits) {
      const id = authorIdentity(c);
      const signal = detectCommit(c, { patch: c.patch });
      if (!signal?.toolId || !signal.tool) continue;
      const tools = map.get(id) ?? new Map();
      const cur = tools.get(signal.toolId) ?? {
        name: signal.tool,
        avatarUrl: signal.avatarUrl,
        n: 0,
      };
      cur.n++;
      if (!cur.avatarUrl && signal.avatarUrl) cur.avatarUrl = signal.avatarUrl;
      tools.set(signal.toolId, cur);
      map.set(id, tools);
    }
    return map;
  }, [commits]);

  return (
    <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
      {shown.map((a, i) => {
        const share = a.minutes / Math.max(1, authors[0].minutes);
        const tools = [...(toolsByAuthor.get(a.author)?.values() ?? [])].sort((x, y) => y.n - x.n);
        return (
          <Box
            key={a.author}
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            px={3}
            py={2}
            sx={{
              borderTop: i === 0 ? "none" : "1px solid",
              borderColor: "border.muted",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Box display="flex" alignItems="center" sx={{ gap: 2, minWidth: 0, flex: 1 }}>
              {a.avatar ? (
                <Box
                  as="img"
                  src={a.avatar}
                  alt=""
                  sx={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0 }}
                />
              ) : (
                <User size={14} strokeWidth={2} />
              )}
              {a.avatar ? (
                <Link
                  href={`https://github.com/${stripBotSuffix(a.author)}`}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "fg.default",
                  }}
                >
                  {stripBotSuffix(a.author)}
                </Link>
              ) : (
                <Text sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {stripBotSuffix(a.author)}
                </Text>
              )}
              {you && a.author.toLowerCase() === you && (
                <Label size="small" variant="success">
                  You
                </Label>
              )}
              {a.bot && !a.agent && (
                <Label
                  size="small"
                  variant="secondary"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
                >
                  <Bot size={10} strokeWidth={2} /> Bot
                </Label>
              )}
              {a.agent && <Label size="small" variant="attention">AI</Label>}
              {tools.slice(0, 3).map((t) => (
                <Label
                  key={t.name}
                  size="small"
                  variant="sponsors"
                  title={`${t.n} commits`}
                  sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
                >
                  {t.avatarUrl && (
                    <Box
                      as="img"
                      src={t.avatarUrl}
                      alt=""
                      sx={{ width: 12, height: 12, borderRadius: "50%" }}
                    />
                  )}
                  {t.name}
                </Label>
              ))}
            </Box>
            <Box
              sx={{
                width: 96,
                mx: 3,
                bg: "var(--bgColor-neutral-muted)",
                borderRadius: 4,
                height: 6,
                overflow: "hidden",
                display: ["none", "block"],
              }}
            >
              <Box
                sx={{
                  width: `${Math.round(share * 100)}%`,
                  height: "100%",
                  bg: a.agent ? "var(--fgColor-attention)" : "var(--fgColor-accent)",
                }}
              />
            </Box>
            <Box display="flex" alignItems="center" sx={{ gap: 3, flexShrink: 0 }}>
              <Text size="small" color="fg.muted" sx={{ display: ["none", "block"] }}>
                {a.sessions.toLocaleString()} session{a.sessions === 1 ? "" : "s"} ·{" "}
                {a.commits.toLocaleString()} commits
              </Text>
              <Text sx={{ fontWeight: 600, minWidth: 64, textAlign: "right" }}>
                {formatHours(a.minutes)}
              </Text>
            </Box>
          </Box>
        );
      })}
      {hidden > 0 && (
        <Button
          variant="invisible"
          size="small"
          onClick={() => setExpanded(true)}
          sx={{ width: "100%", borderTop: "1px solid", borderColor: "border.muted", borderRadius: 0 }}
        >
          + {hidden} more
        </Button>
      )}
      {expanded && authors.length > INITIAL && (
        <Button
          variant="invisible"
          size="small"
          onClick={() => setExpanded(false)}
          sx={{ width: "100%", borderTop: "1px solid", borderColor: "border.muted", borderRadius: 0 }}
        >
          Show less
        </Button>
      )}
    </Box>
  );
}
