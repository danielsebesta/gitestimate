import { Box, Label, Link, Text } from "@primer/react";
import { Bot } from "lucide-react";
import type { AgentUsage } from "../lib/agents";

/** Visible breakdown of AI tools/models detected in the commit history. */
export default function AgentsPanel({
  usage,
  branch,
}: {
  usage: AgentUsage[];
  branch?: string;
}) {
  if (usage.length === 0) {
    return (
      <Box
        sx={{
          border: "1px solid",
          borderColor: "border.default",
          borderRadius: 2,
          p: [2, 3],
        }}
      >
        <Text size="small" color="fg.muted">
          No AI tool markers found{branch ? ` on ${branch}` : ""}. That doesn’t
          prove the code is human-written.
        </Text>
      </Box>
    );
  }

  const total = usage.reduce(
    (s, u) => s + u.authored + u.assisted + u.suspected,
    0,
  );

  return (
    <Box>
      <Text size="small" color="fg.muted" sx={{ display: "block", mb: 2 }}>
        {usage.length} tool{usage.length === 1 ? "" : "s"} · {total.toLocaleString()}{" "}
        hit{total === 1 ? "" : "s"}
      </Text>
      <Box sx={{ border: "1px solid", borderColor: "border.default", borderRadius: 2 }}>
        {usage.map((u, i) => {
          const hits = u.authored + u.assisted + u.suspected;
          return (
            <Box
              key={u.toolId}
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              px={[2, 3]}
              py={2}
              sx={{
                borderTop: i === 0 ? "none" : "1px solid",
                borderColor: "border.muted",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              <Box display="flex" alignItems="center" sx={{ gap: 2, minWidth: 0, flex: 1 }}>
                {u.avatarUrl ? (
                  <Box
                    as="img"
                    src={u.avatarUrl}
                    alt=""
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: "1px solid",
                      borderColor: "border.muted",
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      bg: "var(--bgColor-attention-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={14} strokeWidth={2} />
                  </Box>
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Text sx={{ fontWeight: 600, display: "block" }}>{u.name}</Text>
                  {u.models.length > 0 && (
                    <Text size="small" color="fg.muted" sx={{ display: "block" }}>
                      {u.models.map((m, mi) => (
                        <Text key={m} as="span">
                          {mi > 0 ? ", " : ""}
                          {m}
                        </Text>
                      ))}
                    </Text>
                  )}
                </Box>
              </Box>
              <Box display="flex" alignItems="center" sx={{ gap: 1, flexWrap: "wrap" }}>
                {u.authored > 0 && (
                  <Label size="small" variant="attention">
                    {u.authored} author
                  </Label>
                )}
                {u.assisted > 0 && (
                  <Label size="small" variant="sponsors">
                    {u.assisted} helped
                  </Label>
                )}
                {u.suspected > 0 && (
                  <Label size="small" variant="severe" title="Weak style signal">
                    {u.suspected} maybe
                  </Label>
                )}
                <Text size="small" color="fg.muted" sx={{ ml: 1 }}>
                  {hits} hit{hits === 1 ? "" : "s"}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Text size="small" color="fg.muted" sx={{ display: "block", mt: 2 }}>
        Counts trailers, bot authors, branches, message style, and patch
        tells. Any hit → AI helped. See{" "}
        <Link
          href="https://github.com/chaoss/disclosure"
          target="_blank"
          rel="noreferrer"
          muted
        >
          AI commit trailers
        </Link>
        .
      </Text>
    </Box>
  );
}
