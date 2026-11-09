import { useState } from "react";
import { Box, Button, Label, Link, Text } from "@primer/react";
import { PersonIcon } from "@primer/octicons-react";
import type { AuthorEstimate } from "../lib/estimate";
import { formatHours } from "../lib/estimate";

const INITIAL = 12;

/** authors ranked by credited minutes, GitHub contributor-list style */
export default function AuthorsList({ authors }: { authors: AuthorEstimate[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? authors : authors.slice(0, INITIAL);
  const hidden = authors.length - shown.length;

  return (
    <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
      {shown.map((a, i) => {
        const share = a.minutes / Math.max(1, authors[0].minutes);
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
                <PersonIcon size={14} />
              )}
              {a.avatar ? (
                <Link
                  href={`https://github.com/${a.author}`}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "fg.default",
                  }}
                >
                  {a.author}
                </Link>
              ) : (
                <Text sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.author}
                </Text>
              )}
              {a.agent && <Label size="small">AI</Label>}
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
