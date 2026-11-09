import { useMemo } from "react";
import { Box, Text } from "@primer/react";
import type { RepoStats } from "../lib/stats";
import { dayKey, levelFor } from "../lib/stats";

const CELL = 10;
const GAP = 3;
// rows are Sun–Sat like github.com; labels on Mon/Wed/Fri rows
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

/** GitHub-style contribution graph — last ~52 weeks of commit activity. */
export default function Heatmap({ stats }: { stats: RepoStats }) {
  const { weeks, months, max, total } = useMemo(() => {
    // local calendar throughout — stats.days keys are local dates too
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // start on the Sunday 52 weeks back (53 columns, like github.com)
    const start = new Date(today);
    start.setDate(start.getDate() - 364 - start.getDay());

    const days: { date: string; commits: number; agent: number; future: boolean }[] = [];
    for (let i = 0; i < 371; i++) {
      // setDate (not +86400000) so DST transitions can't skip or repeat a day
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dayKey(d);
      const cell = stats.days.get(key);
      days.push({
        date: key,
        commits: cell?.commits ?? 0,
        agent: cell?.agentCommits ?? 0,
        future: d.getTime() > today.getTime(),
      });
    }
    const weeks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const months = weeks
      .map((w, i) => ({ i, label: w[0].date.slice(5, 7) }))
      .filter((m, idx, arr) => idx === 0 || m.label !== arr[idx - 1].label)
      .map((m) => {
        const [y, mo, dd] = weeks[m.i][0].date.split("-").map(Number);
        return {
          ...m,
          label: new Date(y, mo - 1, dd).toLocaleDateString(undefined, {
            month: "short",
          }),
        };
      });
    const max = Math.max(1, ...days.map((d) => d.commits));
    const total = days.reduce((s, d) => s + d.commits, 0);
    return { weeks, months, max, total };
  }, [stats]);

  return (
    <Box>
      <Box display="flex" sx={{ gap: 0 }}>
        <Box
          display="grid"
          sx={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px`, mr: 1 }}
        >
          {WEEKDAY_LABELS.map((l, i) => (
            <Text key={i} size="small" color="fg.muted" sx={{ fontSize: 9, lineHeight: `${CELL}px` }}>
              {l}
            </Text>
          ))}
        </Box>
        <Box sx={{ overflowX: "auto", minWidth: 0, flex: 1 }}>
          <Box display="flex" sx={{ position: "relative", height: 14, mb: 1 }}>
            {months.map((m) => (
              <Text
                key={m.i}
                size="small"
                color="fg.muted"
                sx={{ position: "absolute", left: m.i * (CELL + GAP), fontSize: 9 }}
              >
                {m.label}
              </Text>
            ))}
          </Box>
          <Box display="flex" sx={{ gap: `${GAP}px` }}>
            {weeks.map((w, wi) => (
              <Box key={wi} display="grid" sx={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` }}>
                {w.map((d) =>
                  d.future ? (
                    <Box key={d.date} sx={{ width: CELL, height: CELL }} />
                  ) : (
                    <Box
                      key={d.date}
                      title={
                        d.commits
                          ? `${d.commits} commit${d.commits === 1 ? "" : "s"}${
                              d.agent ? ` (${d.agent} agent)` : ""
                            } on ${d.date}`
                          : `No commits on ${d.date}`
                      }
                      sx={{
                        width: CELL,
                        height: CELL,
                        borderRadius: "2px",
                        bg: `var(--contribution-default-bgColor-${levelFor(d.commits, max)})`,
                        border: "1px solid",
                        borderColor: `var(--contribution-default-borderColor-${levelFor(d.commits, max)})`,
                      }}
                    />
                  ),
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
        <Text size="small" color="fg.muted">
          {total.toLocaleString()} commits in the last year
        </Text>
        <Box display="flex" alignItems="center" sx={{ gap: 1 }}>
          <Text size="small" color="fg.muted">
            Less
          </Text>
          {[0, 1, 2, 3, 4].map((l) => (
            <Box
              key={l}
              sx={{
                width: CELL,
                height: CELL,
                borderRadius: "2px",
                bg: `var(--contribution-default-bgColor-${l})`,
              }}
            />
          ))}
          <Text size="small" color="fg.muted">
            More
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
