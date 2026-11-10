import { Box, Label, Link, Text } from "@primer/react";
import { HubotIcon } from "@primer/octicons-react";
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
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      color: "fg.muted",
                    }}
                  >
                    <HubotIcon size={16} />
                  </Box>
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Box display="flex" alignItems="center" sx={{ gap: 1, flexWrap: "wrap" }}>
                    <Text sx={{ fontWeight: 600 }}>{u.name}</Text>
                    {u.vendor && (
                      <Text size="small" color="fg.muted">
                        · {u.vendor}
                      </Text>
                    )}
                    {u.model && (
                      <Label size="small" variant="secondary">
                        {u.model}
                      </Label>
                    )}
                    {u.modelSpeedFactor && u.modelSpeedFactor >= 2 && (
                      <Label
                        size="small"
                        variant="secondary"
                        title={`${u.modelSpeedFactor}× estimated token output speed`}
                      >
                        {u.modelSpeedFactor}× fast
                      </Label>
                    )}
                  </Box>
                  <Text size="small" color="fg.muted" sx={{ display: "block" }}>
                    {u.authored > 0 && `${u.authored.toLocaleString()} authored`}
                    {u.assisted > 0 &&
                      `${u.authored > 0 ? " · " : ""}${u.assisted.toLocaleString()} assisted`}
                    {u.suspected > 0 &&
                      `${u.authored + u.assisted > 0 ? " · " : ""}${u.suspected.toLocaleString()} suspected`}
                  </Text>
                </Box>
              </Box>

              <Box display="flex" alignItems="center" sx={{ gap: 2, flexShrink: 0 }}>
                {u.homepage && (
                  <Link
                    href={u.homepage}
                    target="_blank"
                    rel="noreferrer"
                    sx={{ fontSize: 0, color: "fg.muted" }}
                  >
                    site
                  </Link>
                )}
                <Text sx={{ fontWeight: 600, minWidth: 48, textAlign: "right" }}>
                  {hits.toLocaleString()}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
