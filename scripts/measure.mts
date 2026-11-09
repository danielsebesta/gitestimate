import { fetchRepo, fetchCommits, fetchFilePaths, parseRepo, enrichCommitStats } from "../src/lib/github.ts";
import { estimate, formatHours } from "../src/lib/estimate.ts";
import { detectFiles } from "../src/lib/agents.ts";

const repoArg = process.argv[2] ?? "danielsebesta/PaperBoat";
const p = parseRepo(repoArg);
if (!p) {
  console.error("bad repo:", repoArg);
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN;
const repo = await fetchRepo(p.owner, p.repo, token);
const [commitsRes, paths] = await Promise.all([
  fetchCommits(p.owner, p.repo, token, (n, t) =>
    process.stdout.write(`\r${n} / ${t} commits`),
  ),
  fetchFilePaths(p.owner, p.repo, repo.defaultBranch, token).catch(() => [] as string[]),
]);
if (commitsRes.capped)
  console.log(`\n  capped: latest ${commitsRes.commits.length} of ${commitsRes.totalCommits} commits`);
if (token) {
  const enriched = await enrichCommitStats(p.owner, p.repo, commitsRes.commits, token).catch(() => 0);
  console.log(`\n  enriched ${enriched} commits with diff stats`);
}
const r = estimate(commitsRes.commits);
if (!r) {
  console.log("no commits");
  process.exit(0);
}
const aiFiles = detectFiles(paths);
console.log(
  `\n${repo.fullName} (${repo.stars} stars) | ${formatHours(r.totalMinutes)} over ` +
    `${r.sessionCount} sessions, ${r.commitCount} commits, ${r.authors.length} authors`,
);
console.log(
  `  human: ${formatHours(r.humanMinutes)} | agent: ${formatHours(r.agentMinutes)} ` +
    `(${r.agentCommitCount} authored + ${r.assistedCommitCount} assisted commits, ` +
    `${r.agentSessionCount} agent-only sessions)`,
);
if (aiFiles.length) console.log(`  AI tooling files: ${aiFiles.join(", ")}`);
console.log(
  "span",
  r.firstCommit.toISOString().slice(0, 10),
  "->",
  r.lastCommit.toISOString().slice(0, 10),
);
for (const a of r.authors.slice(0, 8))
  console.log(
    `  ${a.author}${a.agent ? " [AI]" : ""}: ${formatHours(a.minutes)} (${a.commits} commits)`,
  );
