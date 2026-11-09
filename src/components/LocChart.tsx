import { useMemo } from "react";
import { Box, Text } from "@primer/react";

interface Props {
  weeks: Array<[number, number, number]>; // [unix_ts, additions, deletions]
}

const WIDTH = 720;
const HEIGHT = 96;

/** GitHub code-frequency style chart — weekly additions (green) / deletions (red). */
export default function LocChart({ weeks }: Props) {
  const { bars, net } = useMemo(() => {
    const max = Math.max(1, ...weeks.map(([, a, d]) => Math.max(a, -d)));
    const net = weeks.reduce((s, [, a, d]) => s + a + d, 0);
    return { bars: weeks, max, net };
  }, [weeks]);

  const mid = HEIGHT / 2;
  const barW = Math.max(1, WIDTH / bars.length - 1);

  return (
    <Box as="figure" m={0}>
      <Box display="flex" justifyContent="space-between" mb={2}>
        <Text size="small" sx={{ fontWeight: 600 }}>
          Lines of code per week
        </Text>
        <Text size="small" color={net >= 0 ? "success.fg" : "danger.fg"} sx={{ fontWeight: 600 }}>
          {net >= 0 ? "+" : ""}
          {net.toLocaleString()} net
        </Text>
      </Box>
      <Box as="svg" width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} sx={{ display: "block" }}>
        <line x1={0} y1={mid} x2={WIDTH} y2={mid} stroke="var(--borderColor-default)" strokeWidth={1} />
        {bars.map(([ts, a, d], i) => {
          const ah = (a / Math.max(1, ...bars.map(([, x, y]) => Math.max(x, -y)))) * (mid - 4);
          const dh = (-d / Math.max(1, ...bars.map(([, x, y]) => Math.max(x, -y)))) * (mid - 4);
          return (
            <g key={ts}>
              <rect
                x={i * (barW + 1)}
                y={mid - ah}
                width={barW}
                height={Math.max(1, ah)}
                fill="var(--fgColor-success, #1a7f37)"
                opacity={0.85}
              >
                <title>
                  {new Date(ts * 1000).toISOString().slice(0, 10)}: +{a.toLocaleString()} /{" "}
                  {d.toLocaleString()}
                </title>
              </rect>
              <rect
                x={i * (barW + 1)}
                y={mid}
                width={barW}
                height={Math.max(1, dh)}
                fill="var(--fgColor-danger, #d1242f)"
                opacity={0.85}
              >
                <title>
                  {new Date(ts * 1000).toISOString().slice(0, 10)}: +{a.toLocaleString()} /{" "}
                  {d.toLocaleString()}
                </title>
              </rect>
            </g>
          );
        })}
      </Box>
      <Box display="flex" justifyContent="space-between" mt={1}>
        <Text size="small" color="fg.muted">
          {new Date(bars[0][0] * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
        </Text>
        <Text size="small" color="fg.muted">
          {new Date(bars[bars.length - 1][0] * 1000).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
          })}
        </Text>
      </Box>
    </Box>
  );
}
