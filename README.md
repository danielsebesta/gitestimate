<img src="assets/icon.svg" width="64" height="64" alt="">

# GitEstimate

Paste a GitHub repository, get an estimate of the time its authors spent
building it — reconstructed from commit timestamps.

Runs entirely in the browser. No backend, no tracking. Public repos work
without a token; **private repos work via OAuth sign-in** (Device Flow —
no client secret in the bundle) or a
[fine-grained PAT](https://github.com/settings/tokens).

Shareable links: `/owner/name` (or `?repo=owner/name`) prefills and runs
the estimate on load; the address bar updates to it after every run.
Static hosts need an SPA fallback (all paths → `index.html`) for the
path form — query links work everywhere (see **Deploy** below).

## Private repos — OAuth sign-in

GitHub's OAuth endpoints send no CORS headers, so a static SPA can't call
them directly. This repo ships the smallest possible bridge:

- **Dev** — `vite.config.ts` already proxies `/api/oauth/* → github.com`.
  Sign-in works on `localhost:5173` out of the box.
- **Production** — deploy the ~70-line Cloudflare Worker in
  `workers/oauth-proxy/` (`cd workers/oauth-proxy && npx wrangler deploy`).
  It whitelists exactly the two endpoints the flow needs and only reflects
  CORS origins on an allowlist: `localhost:5173`/`127.0.0.1:5173` plus
  whatever you set in `ALLOWED_ORIGINS` (comma-separated) in
  `wrangler.toml`'s `[vars]`. No `account_id` is committed — wrangler
  deploys to the account you're logged into.

Setup (once):

1. [Create an OAuth App](https://github.com/settings/developers) →
   **Enable Device Flow**. Any callback URL works (Device Flow doesn't use it).
2. Copy the Client ID into `.env` (see `.env.example`):
   ```
   VITE_GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
   ```
   …or pass it at runtime: `?oauth_client_id=Iv1.xxx` (saved to localStorage).
3. For production: `VITE_OAUTH_PROXY=https://<your-worker>.workers.dev`
   (defaults to `/api/oauth`).

Click **Sign in**, enter the shown code at github.com/login/device —
the app polls until you authorize and keeps the token in `sessionStorage`
only (never logged, never sent anywhere but `api.github.com`). Scope is
`repo` — needed to read private repo metadata and commits.

The manual token field stays as a fallback for PATs / CI.

## How the estimate works

1. Fetch the commit list (`/repos/{owner}/{repo}/commits`, paginated).
2. Sort commits by **author date** — when the work was written, not pushed.
3. Group commits into sessions: a gap of more than 2 h (configurable) ends a session.
4. Credit each session its commit span plus a fixed ramp-up (default 30 min).

This mirrors the classic `git-hours` approach. It is an estimate — squashed
commits, rebases and bulk commits will skew it.

## AI-agent detection

Each commit is classified into three buckets:

- **Agent-authored** — the git author/committer is a known AI bot
  (`devin-ai-integration[bot]`, `claude[bot]`, `copilot-swe-agent[bot]`,
  `cursoragent`, `chatgpt-codex-connector[bot]`, `google-labs-jules[bot]`,
  `cline-*[bot]`, `openhands`, `amazon-q-developer`, `jetbrains-ai/junie`,
  aider, cody, codebuff, qodo, lovable-dev, …) or matches a numeric-ID GitHub
  noreply bot email. Sessions built entirely from these are credited at
  **5 min** (prompt + review time), not the human rate.
- **AI-assisted** — a human authored it but an AI tool signed on:
  `Co-Authored-By`/`Assisted-By` trailers, `Generated with Claude Code`,
  `Made with Cursor`, `Claude-Session:`, `Agent-Logs-Url:`,
  `Replit-Commit-Author:`, `Amp-Thread-ID:`, `Entire-*` trailers, `aider:`
  subjects, HTML comment markers (`<!-- CURSOR_SUMMARY -->` etc.).
  Counted as human time but reported separately.
- **Repo signals** — `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.cursor/rules`,
  `.windsurf`, `copilot-instructions.md`, `.aider`, `.cline`, `.roo`,
  `.continue`, `.openhands`, `.devin/`, `.codex/`, `.kiro/`, `.trae/`,
  `.amazonq/`, `.junie/`, `.augment/`, `.kilocode/`, `.qodo/`, `GEMINI.md`.

Markers are detections, not proof — they can be disabled, stripped, or added
by hand. Absence of a marker does not mean the code is human-written.

## Stack

React 18 · TypeScript · Vite · [Primer](https://primer.style) (`@primer/react` +
Octicons). Deployable as a static site (e.g. GitHub Pages).

## Develop

```sh
cp .env.example .env   # optional — needed for OAuth sign-in
npm install
npm run dev
```

`npm run build` typechecks and emits a static bundle to `dist/`.
`npm test` runs the unit tests.

CLI helpers (run against the live GitHub API; `GITHUB_TOKEN` env optional):

```sh
npm run measure -- owner/repo        # print the estimate for a repo
npm run detect-debug -- owner/repo   # dump AI-marker detection stats
```

## Deploy

The app is a static SPA — `npm run build` → `dist/`. Because share links
use paths (`/owner/name`), the host needs a fallback that serves
`index.html` for unknown paths:

- **GitHub Pages** — Pages serves `404.html` for missing paths; copy the
  built `index.html` to `dist/404.html` (e.g.
  `npm run build && cp dist/index.html dist/404.html`) so deep links load
  the app.
- **Cloudflare Pages** — SPAs work out of the box: Pages falls back to
  `index.html` for paths that don't match a file (or add a `dist/_redirects`
  file with `/*  /index.html  200` to be explicit).
- **Netlify / others** — standard `/* → /index.html` rewrite.

Set `VITE_GITHUB_CLIENT_ID` / `VITE_OAUTH_PROXY` at build time for OAuth
sign-in in production (see `.env.example`).

## License

MIT — see [LICENSE](LICENSE).
