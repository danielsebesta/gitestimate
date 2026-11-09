import { useMemo } from "react";
import { Box, Text } from "@primer/react";
import type { Session } from "../lib/estimate";
import { formatHours } from "../lib/estimate";

interface Bucket {
  label: string;
  minutes: number;
  /** share of minutes authored by AI agents (0–1) */
  agentShare: number;
}

function bucketize(sessions: Session[]): Bucket[] {
  const byMonth = new Map<string, { minutes: number; agent: number }>();
  for (const s of sessions) {
    const key = `${s.start.getFullYear()}-${String(s.start.getMonth() + 1).padStart(2, "0")}`;
    const e = byMonth.get(key) ?? { minutes: 0, agent: 0 };
    e.minutes += s.minutes;
    if (s.agentOnly) e.agent += s.minutes;
    byMonth.set(key, e);
  }
  const keys = [...byMonth.keys()].sort();
  const toBucket = (k: string, v: { minutes: number; agent: number }): Bucket => ({
    label: k,
    minutes: v.minutes,
    agentShare: v.minutes ? v.agent / v.minutes : 0,
  });
  if (keys.length <= 36) {
    return keys.map((k) => toBucket(k, byMonth.get(k)!));
  }
  // long histories: roll up to quarters
  const byQuarter = new Map<string, { minutes: number; agent: number }>();
  for (const [k, v] of byMonth) {
    const [y, m] = k.split("-").map(Number);
    const q = `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    const e = byQuarter.get(q) ?? { minutes: 0, agent: 0 };
    e.minutes += v.minutes;
    e.agent += v.agent;
    byQuarter.set(q, e);
  }
  return [...byQuarter.keys()].sort().map((k) => toBucket(k, byQuarter.get(k)!));
}

const WIDTH = 720;
const HEIGHT = 96;
const PAD = 2;

export default function Timeline({ sessions }: { sessions: Session[] }) {
  const buckets = useMemo(() => bucketize(sessions), [sessions]);
  const max = Math.max(...buckets.map((b) => b.minutes), 1);
  const barW = Math.max(1, (WIDTH - PAD * (buckets.length - 1)) / buckets.length);

  return (
    <Box
      as="figure"
      m={0}
      role="img"
      aria-label={`Work sessions over time, peak ${formatHours(max)} in one period`}
      sx={{ width: "100%", overflowX: "auto" }}
    >
      <Box
        as="svg"
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        sx={{ display: "block", minWidth: 320 }}
      >
        {buckets.map((b, i) => {
          const h = Math.max(1, (b.minutes / max) * (HEIGHT - 18));
          const ai = b.agentShare > 0.5;
          return (
            <rect
              key={b.label}
              x={i * (barW + PAD)}
              y={HEIGHT - 4 - h}
              width={barW}
              height={h}
              rx={1}
              fill={
                ai ? "var(--fgColor-attention, #9a6700)" : "var(--fgColor-accent, #0969da)"
              }
              opacity={0.85}
            >
              <title>
                {b.label}: {formatHours(b.minutes)}
                {b.agentShare > 0 ? ` (${Math.round(b.agentShare * 100)}% AI)` : ""}
              </title>
            </rect>
          );
        })}
      </Box>
      <Box display="flex" justifyContent="space-between" mt={1}>
        <Text as="figcaption" size="small" color="fg.muted">
          {buckets[0]?.label}
        </Text>
        <Text size="small" color="fg.muted">
          peak {formatHours(max)} · {buckets[buckets.length - 1]?.label}
        </Text>
      </Box>
    </Box>
  );
}
