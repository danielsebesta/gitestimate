import { fetchCommits, parseRepo } from "../src/lib/github.ts";
import { detectCommit } from "../src/lib/agents.ts";

const p = parseRepo(process.argv[2] ?? "torvalds/linux")!;
const res = await fetchCommits(p.owner, p.repo, process.env.GITHUB_TOKEN);
const counts = new Map<string, number>();
const examples = new Map<string, string>();
for (const c of res.commits) {
  const s = detectCommit(c);
  if (!s) continue;
  const k = `${s.strength}:${s.via} | ${s.marker}`;
  counts.set(k, (counts.get(k) ?? 0) + 1);
  if (!examples.has(k))
    examples.set(k, `${c.sha?.slice(0, 7)} ${c.author}: ${c.message?.split("\n")[0]?.slice(0, 70)}`);
}
console.log("total:", res.commits.length, "| detected:", [...counts.values()].reduce((a, b) => a + b, 0));
for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`${n}x ${k}\n   e.g. ${examples.get(k)}`);
