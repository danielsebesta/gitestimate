import type { CommitSample } from "./estimate";

const API = "https://api.github.com";
/** stop paginating after this many commits; GitHub's list endpoint degrades far past it */
const MAX_COMMITS = 10000;

export interface RepoInfo {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  defaultBranch: string;
  createdAt: string;
  pushedAt: string;
  homepage: string | null;
  license: string | null;
  sizeKb: number;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Authenticated user for the given token (`GET /user`). */
export async function fetchViewer(
  token: string,
  signal?: AbortSignal,
): Promise<GitHubUser> {
  const res = await fetch(`${API}/user`, {
    headers: headers(token),
    signal,
  });
  await check(res);
  const j = (await res.json()) as {
    login: string;
    name?: string | null;
    avatar_url: string;
    html_url: string;
  };
  return {
    login: j.login,
    name: j.name ?? null,
    avatarUrl: j.avatar_url,
    htmlUrl: j.html_url,
  };
}

/** true for fetch rejections caused by AbortSignal — callers should ignore these */
export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** Accepts "owner/repo", "github.com/owner/repo", or a full URL. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const m = cleaned.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

function headers(token?: string): HeadersInit {
  const h: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function check(res: Response): Promise<void> {
  if (res.ok) return;
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
    const when = new Date(reset).toLocaleTimeString();
    throw new GitHubError(
      `GitHub rate limit reached — resets at ${when}. Add a token to continue.`,
      403,
    );
  }
  if (res.status === 404)
    throw new GitHubError("Repository not found — check the name or add a token for private repos.", 404);
  if (res.status === 409) throw new GitHubError("This repository is empty.", 409);
  throw new GitHubError(`GitHub API error (${res.status}).`, res.status);
}

export async function fetchRepo(
  owner: string,
  repo: string,
  token?: string,
  signal?: AbortSignal,
): Promise<RepoInfo> {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, {
    headers: headers(token),
    signal,
  });
  await check(res);
  const j = (await res.json()) as {
    full_name: string;
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    watchers_count: number;
    default_branch: string;
    created_at: string;
    pushed_at: string;
    homepage: string | null;
    license: { spdx_id?: string } | null;
    size: number;
  };
  return {
    owner,
    name: repo,
    fullName: j.full_name,
    description: j.description,
    stars: j.stargazers_count,
    forks: j.forks_count,
    openIssues: j.open_issues_count,
    watchers: j.watchers_count,
    defaultBranch: j.default_branch,
    createdAt: j.created_at,
    pushedAt: j.pushed_at,
    homepage: j.homepage,
    license: j.license?.spdx_id ?? null,
    sizeKb: j.size,
  };
}

interface CommitEntry {
  sha?: string;
  author?: { login?: string; avatar_url?: string } | null;
  committer?: { login?: string; avatar_url?: string } | null;
  commit: {
    author?: { name?: string; email?: string; date?: string };
    committer?: { name?: string; email?: string };
    message?: string;
  };
}

interface Page1Response {
  link: string | null;
  data: CommitEntry[];
}

export interface CommitsResult {
  commits: CommitSample[];
  /** exact total commits on the default branch (from pagination Link header) */
  totalCommits: number;
  /** true when totalCommits exceeds what we fetched */
  capped: boolean;
}

const CONCURRENCY = 6;

/** Parse GitHub Link `rel="last"` page number — format varies slightly by proxy. */
export function parseLastPage(link: string | null): number | null {
  if (!link) return null;
  const m =
    link.match(/[?&]page=(\d+)[^>]*>;\s*rel="?last"?/i) ??
    link.match(/rel="?last"?[^<]*<[^>]*[?&]page=(\d+)/i);
  return m ? Number(m[1]) : null;
}

function toSample(c: CommitEntry): CommitSample | null {
  const date = c.commit.author?.date;
  if (!date) return null;
  return {
    authorDate: date,
    author: c.author?.login ?? c.commit.author?.name ?? "unknown",
    authorAvatar: c.author?.avatar_url,
    authorEmail: c.commit.author?.email,
    committer: c.committer?.login ?? c.commit.committer?.name,
    committerAvatar: c.committer?.avatar_url,
    committerEmail: c.commit.committer?.email,
    message: c.commit.message,
    sha: c.sha,
  };
}

async function fetchCommitPage(
  owner: string,
  repo: string,
  page: number,
  perPage: number,
  token?: string,
  sha?: string,
  signal?: AbortSignal,
): Promise<Page1Response> {
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}${
      sha ? `&sha=${encodeURIComponent(sha)}` : ""
    }`,
    { headers: headers(token), signal },
  );
  await check(res);
  return { link: res.headers.get("link"), data: (await res.json()) as CommitEntry[] };
}

const cacheKey = (o: string, r: string, sha?: string) => `ge_cache_v2:${o}/${r}@${sha ?? ""}`;

/**
 * Probes head sha (and exact count when Link is visible on per_page=1),
 * validates the session cache, then downloads pages in parallel.
 * If Link is missing (CORS/proxy), walks pages until a short page instead of
 * trusting probe.data.length === 1 — that used to show "97 / 1" in the UI.
 */
export interface FetchCommitsOptions {
  /** branch, tag or commit sha to list commits for (default: the repo's default branch) */
  sha?: string;
  signal?: AbortSignal;
}

export async function fetchCommits(
  owner: string,
  repo: string,
  token: string | undefined,
  onProgress?: (fetched: number, target: number, total: number) => void,
  opts?: FetchCommitsOptions,
): Promise<CommitsResult> {
  const sha = opts?.sha;
  const signal = opts?.signal;
  const probe = await fetchCommitPage(owner, repo, 1, 1, token, sha, signal);
  const headSha = probe.data[0]?.sha;
  /** exact only when GitHub's Link last is readable on per_page=1 */
  const exactTotal = parseLastPage(probe.link);

  const key = cacheKey(owner, repo, sha);
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
      headSha?: string;
      commits?: CommitSample[];
    } | null;
    if (cached?.headSha && cached.headSha === headSha && cached.commits?.length) {
      const total = exactTotal ?? cached.commits.length;
      const target = Math.min(total, MAX_COMMITS);
      onProgress?.(cached.commits.length, target, total);
      return {
        commits: cached.commits,
        totalCommits: total,
        capped: total > MAX_COMMITS || cached.commits.length >= MAX_COMMITS,
      };
    }
  } catch {
    /* ignore corrupt cache */
  }

  const out: CommitSample[] = [];
  const pushPage = (data: CommitEntry[]) => {
    for (const c of data) {
      const s = toSample(c);
      if (s) out.push(s);
    }
  };

  const report = (totalHint: number) => {
    const total = Math.max(exactTotal ?? 0, totalHint, out.length);
    const target = Math.min(Math.max(total, out.length), MAX_COMMITS);
    onProgress?.(out.length, target, exactTotal ?? total);
  };

  const first = await fetchCommitPage(owner, repo, 1, 100, token, sha, signal);
  pushPage(first.data);

  // Prefer exact (per_page=1) count; else infer page count from per_page=100 Link
  let totalPages =
    exactTotal != null
      ? Math.ceil(Math.min(exactTotal, MAX_COMMITS) / 100)
      : parseLastPage(first.link);

  if (totalPages != null)
    totalPages = Math.min(totalPages, Math.ceil(MAX_COMMITS / 100));

  report(
    exactTotal ??
      (totalPages != null ? totalPages * 100 : out.length),
  );

  if (totalPages != null && totalPages >= 2) {
    for (let start = 2; start <= totalPages; start += CONCURRENCY) {
      const pages = Array.from(
        { length: Math.min(CONCURRENCY, totalPages - start + 1) },
        (_, i) => start + i,
      );
      const results = await Promise.all(
        pages.map((p) => fetchCommitPage(owner, repo, p, 100, token, sha, signal)),
      );
      for (const r of results) pushPage(r.data);
      report(exactTotal ?? totalPages * 100);
    }
  } else if (totalPages == null && first.data.length >= 100) {
    // No Link header — keep paging until a short/empty page
    let page = 2;
    while (out.length < MAX_COMMITS) {
      const pages = Array.from(
        { length: Math.min(CONCURRENCY, Math.ceil((MAX_COMMITS - out.length) / 100)) },
        (_, i) => page + i,
      );
      const results = await Promise.all(
        pages.map((p) => fetchCommitPage(owner, repo, p, 100, token, sha, signal)),
      );
      let short = false;
      for (const r of results) {
        if (r.data.length === 0) {
          short = true;
          break;
        }
        pushPage(r.data);
        if (r.data.length < 100) short = true;
      }
      report(out.length + (short ? 0 : 100));
      if (short) break;
      page += pages.length;
    }
  }

  const totalCommits = exactTotal ?? out.length;
  try {
    if (out.length) sessionStorage.setItem(key, JSON.stringify({ headSha, commits: out }));
  } catch {
    /* quota — cache is best-effort */
  }
  return {
    commits: out.slice(0, MAX_COMMITS),
    totalCommits,
    capped: totalCommits > MAX_COMMITS || out.length > MAX_COMMITS,
  };
}

const GRAPHQL_ENRICH_MAX = 4000;
const GRAPHQL_BATCH = 50;

/**
 * Fills additions/deletions/changedFiles on fetched commits via GraphQL
 * `object(oid:)` aliased batches — ~50 commits per query, 6 in flight.
 * Requires a token (GraphQL has no anonymous tier); fails soft — batches
 * that error are simply skipped, commits keep undefined stats.
 */
export async function enrichCommitStats(
  owner: string,
  repo: string,
  commits: CommitSample[],
  token: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const targets = commits.filter((c) => c.sha).slice(0, GRAPHQL_ENRICH_MAX);
  const batches: CommitSample[][] = [];
  for (let i = 0; i < targets.length; i += GRAPHQL_BATCH)
    batches.push(targets.slice(i, i + GRAPHQL_BATCH));

  let enriched = 0;
  let done = 0;
  for (let s = 0; s < batches.length; s += CONCURRENCY) {
    await Promise.all(
      batches.slice(s, s + CONCURRENCY).map(async (batch) => {
        try {
          const fields = batch
            .map(
              (c, i) =>
                `o${i}: object(oid: "${c.sha}") { ...on Commit { oid additions deletions changedFilesIfAvailable } }`,
            )
            .join("\n");
          const res = await fetch(`${API}/graphql`, {
            method: "POST",
            headers: { ...headers(token), "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
              query: `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){${fields}}}`,
              variables: { owner, name: repo },
            }),
          });
          if (!res.ok) return;
          const j = await res.json();
          const objects = j.data?.repository;
          if (!objects) return;
          for (let i = 0; i < batch.length; i++) {
            const o = objects[`o${i}`];
            if (!o) continue;
            batch[i].additions = o.additions ?? 0;
            batch[i].deletions = o.deletions ?? 0;
            batch[i].changedFiles = o.changedFilesIfAvailable;
            enriched++;
          }
        } catch (e) {
          /* skip failed batch — partial stats still useful; abort is real */
          if (isAbortError(e)) throw e;
        }
      }),
    );
    done += Math.min(CONCURRENCY, batches.length - s);
    onProgress?.(Math.min(done * GRAPHQL_BATCH, targets.length), targets.length);
  }
  return enriched;
}

const PATCH_SAMPLE = 40;

/**
 * Attach unified-diff patches to a sample of recent commits (for comment-density
 * AI heuristics). Soft-fails per commit; anonymous works on public repos.
 */
export async function enrichCommitPatches(
  owner: string,
  repo: string,
  commits: CommitSample[],
  token?: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const targets = commits.filter((c) => c.sha && !c.patch).slice(0, PATCH_SAMPLE);
  let filled = 0;
  let done = 0;
  onProgress?.(0, targets.length);
  for (let s = 0; s < targets.length; s += CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = targets.slice(s, s + CONCURRENCY);
    await Promise.all(
      batch.map(async (c) => {
        try {
          const res = await fetch(`${API}/repos/${owner}/${repo}/commits/${c.sha}`, {
            headers: headers(token),
            signal,
          });
          if (!res.ok) return;
          const j = (await res.json()) as {
            stats?: { additions?: number; deletions?: number; total?: number };
            files?: Array<{ patch?: string; filename?: string }>;
          };
          // REST commit detail carries LOC stats — use them for sized ramp-up
          // even when GraphQL enrichment didn't run (no token / public repos).
          if (c.additions === undefined && j.stats) {
            c.additions = j.stats.additions ?? 0;
            c.deletions = j.stats.deletions ?? 0;
          }
          if (c.changedFiles === undefined && j.files)
            c.changedFiles = j.files.length;
          const patch = (j.files ?? [])
            .map((f) => f.patch)
            .filter(Boolean)
            .join("\n");
          if (patch) c.patch = patch;
          if (patch || j.stats) filled++;
        } catch (e) {
          if (isAbortError(e)) throw e;
        }
      }),
    );
    done += batch.length;
    onProgress?.(done, targets.length);
  }
  return filled;
}

/** Weekly [additions, deletions] per GitHub's stats; returns null when not yet computed. */
export async function fetchCodeFrequency(
  owner: string,
  repo: string,
  token?: string,
  signal?: AbortSignal,
): Promise<Array<[number, number, number]> | null> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/stats/code_frequency`, {
    headers: headers(token),
    signal,
  });
  await check(res);
  if (res.status === 202) return null;
  const j = (await res.json()) as Array<[number, number, number]>;
  return Array.isArray(j) ? j : null;
}

/** language name -> byte count */
export async function fetchLanguages(
  owner: string,
  repo: string,
  token?: string,
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/languages`, {
    headers: headers(token),
    signal,
  });
  await check(res);
  return (await res.json()) as Record<string, number>;
}

/** Recursive file list of the default branch — one call, used for AI-tooling markers. */
export async function fetchFilePaths(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: headers(token), signal },
  );
  await check(res);
  const j = (await res.json()) as { tree?: Array<{ path?: string }> };
  return (j.tree ?? []).flatMap((e) => (e.path ? [e.path] : []));
}

/** branch names, up to 300 — feeds the branch picker */
export async function fetchBranches(
  owner: string,
  repo: string,
  token?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const names: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `${API}/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
      { headers: headers(token), signal },
    );
    await check(res);
    const arr = (await res.json()) as Array<{ name?: string }>;
    for (const b of arr) if (b.name) names.push(b.name);
    if (arr.length < 100) break;
  }
  return names;
}
