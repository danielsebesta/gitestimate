/**
 * AI-agent authorship detection — aggressive by design.
 * Any clear sign → "assisted" (or "authored" for bot identities).
 * Provenance: Co-Authored-By / Assisted-By / Generated-By / AI-tool trailers,
 * bot emails, tool footers (CHAOSS / OpenInfra / ODS).
 * Heuristics (still counted as assisted, low confidence): teaching-voice
 * messages, comment-heavy patches, bulk greenfield diffs, AI comment markers.
 */

export type AgentKind = "agent" | "human";

export type SignalConfidence = "high" | "medium" | "low";

/**
 * "authored" — bot identity made the commit (author/committer match).
 * "assisted" — human author + AI trailer/footer/branch/heuristic signal.
 * "suspected" — reserved for stacked extras; primary path prefers assisted.
 */
export interface AgentSignal {
  strength: "authored" | "assisted" | "suspected";
  via: "author" | "committer" | "trailer" | "style" | "branch" | "patch";
  /** matched raw marker / pattern id */
  marker: string;
  /** canonical tool id from the catalog, when resolved */
  toolId?: string;
  /** human-readable tool name */
  tool?: string;
  /** model string when present in Assisted-By / Generated-By / git-ai notes style */
  model?: string;
  confidence: SignalConfidence;
  /** optional avatar for the tool (GitHub user avatar URL) */
  avatarUrl?: string;
}

export interface AgentTool {
  id: string;
  name: string;
  /**
   * GitHub App integration id — avatars live at
   * `avatars.githubusercontent.com/in/{id}` (not `/u/`, which is a user).
   */
  githubAppId?: number;
  /** GitHub user id (noreply bot account) — fallback when no app id */
  githubUserId?: number;
  /** fallback login for https://github.com/{login}.png */
  githubLogin?: string;
  /** substrings / emails that map to this tool */
  match: RegExp;
}

/** Brand catalog — used for labels, avatars, and aggregation. */
export const AGENT_TOOLS: AgentTool[] = [
  {
    id: "claude",
    name: "Claude",
    // Bot avatars are GitHub App icons (/in/…); /u/{botUserId} is an empty Identicon.
    githubAppId: 1236702,
    githubUserId: 209825114,
    githubLogin: "claude",
    match: /claude|anthropic|noreply@anthropic\.com/i,
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    githubAppId: 1143301,
    githubUserId: 198982749,
    githubLogin: "copilot",
    match: /copilot|copilot@github\.com/i,
  },
  {
    id: "cursor",
    name: "Cursor",
    githubUserId: 199161495,
    githubLogin: "cursoragent",
    match: /cursor|cursoragent|noreply@cursor\.com/i,
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    githubAppId: 1144995,
    githubUserId: 199175422,
    githubLogin: "chatgpt-codex-connector",
    match: /codex|chatgpt-codex|noreply@openai\.com|openai-codex/i,
  },
  {
    id: "devin",
    name: "Devin",
    githubAppId: 811515,
    githubUserId: 158243242,
    githubLogin: "devin-ai-integration",
    match: /devin|@devin\.ai/i,
  },
  {
    id: "gemini",
    name: "Gemini",
    githubAppId: 842251,
    githubUserId: 161369871,
    githubLogin: "google-labs-jules",
    match: /gemini|google-labs-jules|jules/i,
  },
  {
    id: "amazon-q",
    name: "Amazon Q",
    githubAppId: 1220912,
    githubUserId: 208079219,
    match: /amazon-q|codewhisperer/i,
  },
  {
    id: "aider",
    name: "Aider",
    match: /aider|noreply@aider\.chat|\(aider\)/i,
  },
  {
    id: "cline",
    name: "Cline",
    githubUserId: 205137888,
    match: /cline/i,
  },
  {
    id: "continue",
    name: "Continue",
    githubUserId: 230936708,
    match: /continue\.dev|continue\[bot\]|noreply@continue\.dev/i,
  },
  {
    id: "cody",
    name: "Cody",
    githubUserId: 201248094,
    match: /cody|sourcegraph/i,
  },
  {
    id: "openhands",
    name: "OpenHands",
    match: /openhands|all-hands\.dev/i,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    match: /windsurf|codeium|noreply@windsurf/i,
  },
  {
    id: "jetbrains",
    name: "JetBrains AI",
    githubUserId: 220155983,
    match: /jetbrains|junie/i,
  },
  {
    id: "coderabbit",
    name: "CodeRabbit",
    githubUserId: 136622811,
    match: /coderabbit/i,
  },
  {
    id: "qodo",
    name: "Qodo",
    githubUserId: 151058649,
    match: /qodo|codiumai|pr-agent/i,
  },
  {
    id: "lovable",
    name: "Lovable",
    match: /lovable/i,
  },
  {
    id: "replit",
    name: "Replit",
    match: /replit/i,
  },
  {
    id: "amp",
    name: "Amp",
    match: /ampcode|amp-thread/i,
  },
  {
    id: "codebuff",
    name: "Codebuff",
    match: /codebuff|freebuff/i,
  },
  {
    id: "swe-agent",
    name: "SWE-Agent",
    match: /swe-agent/i,
  },
  {
    id: "roo",
    name: "Roo Code",
    match: /roo[-_]?code|\.roo/i,
  },
  {
    id: "tabnine",
    name: "Tabnine",
    match: /tabnine/i,
  },
  {
    id: "greptile",
    name: "Greptile",
    match: /greptile/i,
  },
  {
    id: "augment",
    name: "Augment",
    match: /augment/i,
  },
  {
    id: "trae",
    name: "Trae",
    match: /trae/i,
  },
  {
    id: "v0",
    name: "v0",
    match: /\bv0\b|v0\.dev|vercel/i,
  },
  {
    id: "bolt",
    name: "Bolt",
    match: /\bbolt\.new\b|\bstackblitz\b/i,
  },
  {
    id: "factory",
    name: "Factory",
    match: /\bfactory\.ai\b|\bdroid\b/i,
  },
  {
    id: "opencode",
    name: "OpenCode",
    match: /opencode|noreply@opencode\.ai/i,
  },
  {
    id: "generic-bot",
    name: "AI bot",
    // Only known AI agent bots — never plain github-actions / dependabot
    match: /(?:claude|copilot|cursor|codex|devin|jules|gemini|cline|cody|openhands|aider|windsurf|amp|swe-agent|factory|bolt|v0|qodo|greptile|tabnine|augment|roo|trae|kilocode|sourcery|codegen|seer-by-sentry|lovable)[-_]?(?:bot|agent|app|swe)?/i,
  },
];

/**
 * CI / dependency / release bots — automation, not AI coding agents.
 * Matched before any AI author pattern so `[bot]` catch-alls can't claim them.
 */
const NON_AI_BOTS =
  /\b(?:github-actions|dependabot(?:-preview)?|renovate|greenkeeper|imgbot|allcontributors|semantic-release(?:-bot)?|github-classroom|mergify|codecov|snyk(?:-bot)?|stale|netlify|vercel|googleapis|github-pages|release-please|pyup|weblate|crowdin|restyled-io|pre-commit-ci|github-advanced-security|actions-user|github-hookshot|web-flow|github-merge-queue|gfscoderabbitnoop|fossabot|coveralls|deepsource-io|sonarcloud|codeclimate|whitesource|mend(?:-for-github-com)?|socket-security|stepsecurity|gitleaks|github-learning-lab|microsoft-github-policy-service|pull(?:\[bot\])?|delete-merged-branch|branch-cleaner|auto-assign|todo|probot|bors|homu|googlebot|facebook-github-bot|electron-bot|rust-lang|swift-ci|scala-steward|metamaskbot|solidity-bot)\b/i;

export function isNonAiBot(text: string): boolean {
  return NON_AI_BOTS.test(text);
}

/** Drop the GitHub `[bot]` suffix for display — badge carries that meaning. */
export function stripBotSuffix(name: string): string {
  return name.replace(/\s*\[bot\]\s*/gi, "").replace(/\s+/g, " ").trim() || name;
}

/** Any GitHub App / automation login (AI or CI). */
export function isBotLogin(name?: string | null): boolean {
  if (!name) return false;
  return /\[bot\]/i.test(name) || isNonAiBot(name);
}

export function toolAvatarUrl(tool: AgentTool, size = 80): string | undefined {
  // GitHub Apps use /in/{appId}; bot *users* use /u/{userId}. Prefer the app
  // icon when known (e.g. Devin = in/811515).
  if (tool.githubAppId)
    return `https://avatars.githubusercontent.com/in/${tool.githubAppId}?s=${size}&v=4`;
  if (tool.githubUserId)
    return `https://avatars.githubusercontent.com/u/${tool.githubUserId}?v=4&s=${size}`;
  if (tool.githubLogin) return `https://github.com/${tool.githubLogin}.png?size=${size}`;
  return undefined;
}

export function resolveTool(text: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.id !== "generic-bot" && t.match.test(text))
    ?? (AGENT_TOOLS.find((t) => t.id === "generic-bot" && t.match.test(text)));
}

function decorate(
  partial: Omit<AgentSignal, "confidence" | "tool" | "toolId" | "avatarUrl"> & {
    confidence?: SignalConfidence;
    toolHint?: string;
  },
): AgentSignal {
  const hint = partial.toolHint ?? partial.marker;
  const tool = resolveTool(hint);
  return {
    strength: partial.strength,
    via: partial.via,
    marker: partial.marker,
    model: partial.model,
    confidence: partial.confidence ?? (partial.strength === "suspected" ? "low" : "high"),
    toolId: tool?.id,
    tool: tool?.name,
    avatarUrl: tool ? toolAvatarUrl(tool) : undefined,
  };
}

/** git author / committer identities — matched against login, name, and email */
const AUTHOR_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  { re: /devin-ai-integration/i, hint: "devin" },
  { re: /@devin\.ai/i, hint: "devin" },
  { re: /copilot-swe-agent/i, hint: "copilot" },
  { re: /copilot\[bot\]/i, hint: "copilot" },
  { re: /copilot@github\.com/i, hint: "copilot" },
  { re: /copilot(?:\[bot\])?@users\.noreply\.github\.com/i, hint: "copilot" },
  { re: /^copilot(\s*\[bot\])?\s*$/i, hint: "copilot" },
  { re: /\bclaude(?:-code-action)?\[bot\]/i, hint: "claude" },
  { re: /anthropic-claude/i, hint: "claude" },
  { re: /^claude(\s*\[bot\])?\s*$/i, hint: "claude" },
  { re: /noreply@anthropic\.com/i, hint: "claude" },
  { re: /\bcursor\[bot\]/i, hint: "cursor" },
  { re: /cursoragent/i, hint: "cursor" },
  { re: /cursoragent@cursor\.com/i, hint: "cursor" },
  { re: /openai-codex\[bot\]/i, hint: "codex" },
  { re: /chatgpt-codex-connector/i, hint: "codex" },
  { re: /codex@openai\.com/i, hint: "codex" },
  { re: /noreply@openai\.com/i, hint: "codex" },
  { re: /google-labs-jules/i, hint: "gemini" },
  { re: /amazon-q-developer/i, hint: "amazon-q" },
  { re: /jetbrains-(ai|junie)/i, hint: "jetbrains" },
  { re: /cline[-\w]*\[bot\]/i, hint: "cline" },
  { re: /continue\[bot\]/i, hint: "continue" },
  { re: /noreply@continue\.dev/i, hint: "continue" },
  { re: /sourcegraph-cody/i, hint: "cody" },
  { re: /openhands/i, hint: "openhands" },
  { re: /all-hands\.dev/i, hint: "openhands" },
  { re: /noreply@opencode\.ai/i, hint: "opencode" },
  { re: /ampcode\.com/i, hint: "amp" },
  { re: /noreply@codebuff\.com/i, hint: "codebuff" },
  { re: /noreply@freebuff\.com/i, hint: "codebuff" },
  { re: /noreply@codeium\.com/i, hint: "windsurf" },
  { re: /windsurf@codeium\.com/i, hint: "windsurf" },
  { re: /noreply@windsurf\.com/i, hint: "windsurf" },
  { re: /aider\.chat/i, hint: "aider" },
  { re: /\(aider\)/i, hint: "aider" },
  { re: /sweep-ai/i, hint: "generic-bot" },
  { re: /coderabbit/i, hint: "coderabbit" },
  { re: /codiumai|pr-agent-pro|qodo/i, hint: "qodo" },
  { re: /gemini-code-assist/i, hint: "gemini" },
  { re: /lovable-dev/i, hint: "lovable" },
  { re: /sourcery-ai/i, hint: "generic-bot" },
  { re: /greptile/i, hint: "greptile" },
  { re: /tabnine/i, hint: "tabnine" },
  { re: /augmentcode|augment-agent/i, hint: "augment" },
  { re: /kilocode/i, hint: "generic-bot" },
  { re: /roo[-_]?code/i, hint: "roo" },
  { re: /trae[-_]agent/i, hint: "trae" },
  { re: /seer-by-sentry/i, hint: "generic-bot" },
  { re: /codegen-sh|codegen-ai/i, hint: "generic-bot" },
  { re: /swe-agent/i, hint: "swe-agent" },
  { re: /factory\.ai|droid\[bot\]/i, hint: "factory" },
  { re: /bolt\.new|stackblitz/i, hint: "bolt" },
  { re: /v0\[bot\]|v0@vercel/i, hint: "v0" },
  {
    // Numeric noreply emails only when the login looks like a known AI agent
    re: /\d+\+[^@+]*(?:claude|copilot|cursor|codex|devin|jules|gemini|cline|cody|openhands|amazon-q|jetbrains|aider|sourcery|greptile|qodo|lovable|amp|windsurf|opencode|factory|bolt|swe-agent|kilocode|trae|roo)[-_]?(?:bot|agent|app|swe|dev)?[^@]*@users\.noreply\.github\.com/i,
    hint: "generic-bot",
  },
  { re: /sourcegraph.*bot/i, hint: "cody" },
  // Intentionally no bare /\[bot\]/ — that catches dependabot, github-actions, etc.
];

const COAUTHOR_TRAILER = /^co-?authored-?by:\s*(.+?)\s*$/gim;
const ASSISTED_BY = /^assisted-by\s*:\s*(.+?)\s*$/gim;
const GENERATED_BY = /^generated-by\s*:\s*(.+?)\s*$/gim;
const AI_ASSISTED_BY = /^ai-assisted-by\s*:\s*(.+?)\s*$/gim;
const AI_TOOL = /^ai-tool\s*:\s*(.+?)\s*$/gim;
const AI_ASSISTED_FLAG = /^ai-assisted\s*:\s*(.+?)\s*$/gim;
const GENERATED_WITH = /^generated[- ]with\s*:\s*(.+?)\s*$/gim;

/** Extract optional model token from "Claude Code 4.5" / "gpt-4o" / "Claude Sonnet 4" */
export function extractModel(value: string): string | undefined {
  const cleaned = value.replace(/<[^>]+>/g, "").trim();
  // common model tokens
  const m =
    cleaned.match(
      /\b((?:claude|gpt|o\d|gemini|grok|llama|mistral|codestral|deepseek|qwen|sonnet|opus|haiku|codex)[\w.\-+]*)\b/i,
    ) ?? cleaned.match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
  if (!m) return undefined;
  // Prefer fuller phrase when it looks like "Claude Sonnet 4.5"
  const phrase = cleaned.match(
    /\b((?:Claude|GPT|Gemini|Grok|Llama|Mistral|DeepSeek|Qwen|Codex)[\w.\-]*(?:\s+[\w.\-+]+){0,3})/i,
  );
  return (phrase?.[1] ?? m[1]).trim();
}

const MESSAGE_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  { re: /generated with \[?claude/i, hint: "claude" },
  { re: /generated with claude code/i, hint: "claude" },
  { re: /generated with (?:codebuff|freebuff)/i, hint: "codebuff" },
  { re: /generated with:\s+github\.com\/[^@]*(?:codebuff|freebuff)/i, hint: "codebuff" },
  { re: /made[- ]with:? ?cursor/i, hint: "cursor" },
  { re: /cursor agent|cursoragent/i, hint: "cursor" },
  { re: /generated by (?:jules|devin|codex|copilot|claude|cursor|gemini|aider|windsurf|v0)/i, hint: "generic-bot" },
  { re: /(?:written|authored|created|built|implemented)\s+(?:by|with)\s+(?:claude|gpt|chatgpt|copilot|cursor|codex|gemini|devin|aider)/i, hint: "generic-bot" },
  { re: /\b(?:ai[- ]?(?:assisted|generated|authored)|llm[- ]?(?:assisted|generated)|with (?:ai|llm) (?:assistance|help))\b/i, hint: "generic-bot" },
  // U+1F916 robot face, U+2728 sparkles — match emoji in *other* commits, never render them in UI
  { re: /\u{1F916}|\u{2728}\s*generated|auto[- ]generated by (?:ai|an? (?:llm|agent))/iu, hint: "generic-bot" },
  { re: /claude-session:/i, hint: "claude" },
  { re: /agent-logs-url:/i, hint: "generic-bot" },
  { re: /replit-commit-(author|session-id):/i, hint: "replit" },
  { re: /amp-thread-id:/i, hint: "amp" },
  { re: /^entire-(metadata|session|checkpoint|agent|strategy|condensation|source-ref)/im, hint: "generic-bot" },
  { re: /^aider:\s/m, hint: "aider" },
  { re: /automated security fix.*orbis/i, hint: "generic-bot" },
  { re: /chatgpt\.com\/codex\/(cloud\/)?tasks\//i, hint: "codex" },
  { re: /pr created automatically by jules/i, hint: "gemini" },
  { re: /openai\.com\/codex|platform\.openai\.com/i, hint: "codex" },
  { re: /claude\.ai\/chat|console\.anthropic\.com/i, hint: "claude" },
  { re: /bolt\.new|stackblitz\.com\/~\/bolt/i, hint: "bolt" },
  { re: /v0\.dev|v0 by vercel/i, hint: "v0" },
  { re: /factory\.ai|droid run/i, hint: "factory" },
  {
    re: /<!--\s*(generated by replit ai|generated by v0|v0 by vercel|cursor_summary|windsurf|claude|copilot)\s*-->/i,
    hint: "generic-bot",
  },
  { re: /<!--\s*generated with aider\s*-->/i, hint: "aider" },
  { re: /signed-off-by:\s*.*(?:claude|copilot|cursor|codex|devin|jules|gemini|aider)/i, hint: "generic-bot" },
];

/** Teaching / LLM-style commit message voice (vibecheck / crocking). */
const TEACHING_VOICE: RegExp[] = [
  /\bthis (?:commit|change|patch|pr|update) (?:ensures|ensures that|introduces|implements|refactors|improves|addresses)\b/i,
  /\bin order to (?:ensure|improve|provide|allow|make sure|support|enable)\b/i,
  /\b(?:comprehensive|robust|seamless|streamlined|holistic|scalable|maintainable|extensible)\b/i,
  /\b(?:leverages|utilizes|facilitates|enhances the (?:overall )?ability|streamlines)\b/i,
  /\bkey (?:changes|improvements|benefits|features|updates):\s*$/im,
  /\b(?:as requested|as discussed|per your request|as per your|happy to help)\b/i,
  /\b(?:let'?s|we(?:'ll| will)) (?:now |also )?(?:add|update|refactor|implement|ensure)\b/i,
  /\b(?:here(?:'s| is) (?:what|a)|i(?:'ve| have) (?:added|updated|refactored|implemented))\b/i,
  /\b(?:to (?:ensure|improve|provide|allow) (?:that |better |proper )?)\b/i,
  /\b(?:overview|summary|what(?:'s| is) changed|changes made):\s*$/im,
  /\b(?:additionally|furthermore|moreover|notably),?\s+(?:we|this|the)\b/i,
];

const BRANCH_PREFIXES: Array<[RegExp, string]> = [
  [/^codex\//i, "codex"],
  [/^claude\//i, "claude"],
  [/^copilot\//i, "copilot"],
  [/^cursor\//i, "cursor"],
  [/^devin\//i, "devin"],
  [/^cline\//i, "cline"],
  [/^aider\//i, "aider"],
  [/^gemini\//i, "gemini"],
  [/^jules\//i, "gemini"],
  [/^roo(?:-code)?\//i, "roo"],
  [/^windsurf\//i, "windsurf"],
  [/^codeium\//i, "windsurf"],
  [/^openhands\//i, "openhands"],
  [/^swe-agent\//i, "swe-agent"],
  [/^amp\//i, "amp"],
  [/^factory\//i, "factory"],
  [/^bolt\//i, "bolt"],
  [/^v0\//i, "v0"],
  [/^ai[-_/]/i, "generic-bot"],
  [/^agent[-_/]/i, "generic-bot"],
];

export function detectBranch(branch?: string): AgentSignal | null {
  if (!branch) return null;
  for (const [re, hint] of BRANCH_PREFIXES) {
    if (re.test(branch))
      return decorate({
        strength: "assisted",
        via: "branch",
        marker: `branch ${branch}`,
        toolHint: hint,
        confidence: "medium",
      });
  }
  return null;
}

/**
 * Comment-density heuristic on a unified diff patch.
 * Sonar: Claude ~16% comment density; crocking flags >35% as LOW confidence.
 * Aggressive mode: ≥18% comments or any teaching comments → assisted.
 */
export function analyzePatchCommentDensity(patch: string): {
  added: number;
  commentLines: number;
  density: number;
  teachingComments: number;
  aiMarkerComments: number;
  newFiles: number;
  deletedLines: number;
} {
  let added = 0;
  let commentLines = 0;
  let teachingComments = 0;
  let aiMarkerComments = 0;
  let newFiles = 0;
  let deletedLines = 0;
  const teach =
    /\b(?:this (?:function|method|class|ensures|handles)|in order to|note that|important:|we (?:need|want|ensure)|ensures that|for (?:clarity|readability|maintainability))\b/i;
  const aiMark =
    /\b(?:generated by|ai[- ]generated|written by (?:claude|gpt|copilot|cursor|codex)|do not edit|auto[- ]generated)\b/i;
  for (const line of patch.split("\n")) {
    if (/^diff --git /.test(line) && /\/dev\/null/.test(line)) newFiles++;
    if (/^new file mode /.test(line)) newFiles++;
    if (line.startsWith("-") && !line.startsWith("---")) {
      if (line.slice(1).trim()) deletedLines++;
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const body = line.slice(1).trim();
    if (!body) continue;
    added++;
    const isComment =
      /^(\/\/|\/\*|\*|\#|<!--|'''|""")/.test(body) ||
      /^\/\//.test(body) ||
      body.startsWith("* ") ||
      body.startsWith("<!--");
    if (isComment) {
      commentLines++;
      if (teach.test(body)) teachingComments++;
      if (aiMark.test(body)) aiMarkerComments++;
    } else if (aiMark.test(body)) {
      aiMarkerComments++;
    }
  }
  return {
    added,
    commentLines,
    density: added ? commentLines / added : 0,
    teachingComments,
    aiMarkerComments,
    newFiles,
    deletedLines,
  };
}

/** Explicit AI markers inside the patch body. */
export function detectPatchAiMarkers(patch: string): AgentSignal | null {
  const { aiMarkerComments, added } = analyzePatchCommentDensity(patch);
  if (aiMarkerComments >= 1 && added >= 3) {
    return decorate({
      strength: "assisted",
      via: "patch",
      marker: `ai-comment-marker ×${aiMarkerComments}`,
      confidence: "medium",
      toolHint: "generic-bot",
    });
  }
  return null;
}

/** Bulk greenfield / pure-addition diffs (crocking AUTH-004). */
export function detectPatchBulk(patch: string): AgentSignal | null {
  const { added, deletedLines, newFiles } = analyzePatchCommentDensity(patch);
  if (newFiles >= 5 && added >= 400) {
    return decorate({
      strength: "assisted",
      via: "patch",
      marker: `bulk-new-files ${newFiles} (+${added})`,
      confidence: "medium",
      toolHint: "generic-bot",
    });
  }
  if (newFiles >= 3 && added >= 200 && deletedLines <= Math.max(5, added * 0.05)) {
    return decorate({
      strength: "assisted",
      via: "patch",
      marker: `greenfield-diff ${newFiles} files`,
      confidence: "low",
      toolHint: "generic-bot",
    });
  }
  if (added >= 250 && deletedLines <= 3 && newFiles >= 1) {
    return decorate({
      strength: "assisted",
      via: "patch",
      marker: `pure-addition +${added}`,
      confidence: "low",
      toolHint: "generic-bot",
    });
  }
  return null;
}

export function detectPatchStyle(patch: string): AgentSignal | null {
  const marker = detectPatchAiMarkers(patch);
  if (marker) return marker;
  const bulk = detectPatchBulk(patch);
  if (bulk) return bulk;

  const { added, density, teachingComments, commentLines } = analyzePatchCommentDensity(patch);
  if (added < 8) return null;
  // Aggressive: any teaching comments, or modest density
  if (
    teachingComments >= 1 ||
    density >= 0.3 ||
    (density >= 0.18 && teachingComments >= 1) ||
    (density >= 0.22 && added >= 12)
  ) {
    return decorate({
      strength: "assisted",
      via: "patch",
      marker: `comment-density ${(density * 100).toFixed(0)}% (${commentLines}/${added})`,
      confidence: teachingComments >= 2 || density >= 0.35 ? "medium" : "low",
      toolHint: teachingComments >= 1 ? "claude" : "generic-bot",
    });
  }
  return null;
}

export function detectMessageStyle(message?: string): AgentSignal | null {
  if (!message) return null;
  const lines = message.split("\n").filter((l) => l.trim());
  if (lines.length < 3) return null;
  const hits = TEACHING_VOICE.filter((re) => re.test(message)).length;
  const bullets = lines.filter((l) => /^\s*[-*•]/.test(l)).length;
  const numbered = lines.filter((l) => /^\s*\d+[.)]\s/.test(l)).length;
  const conventional = /^(feat|fix|chore|docs|refactor|test|style|perf|ci|build)(\(.+\))?!?:\s+/i.test(
    lines[0] ?? "",
  );
  // Any teaching hit + structure, or classic LLM walls of text
  if (
    hits >= 1 ||
    (bullets + numbered >= 3 && lines.length >= 5) ||
    (conventional && bullets >= 2 && message.length > 180) ||
    (message.length > 400 && bullets >= 2)
  ) {
    return decorate({
      strength: "assisted",
      via: "style",
      marker:
        hits >= 1
          ? "teaching-voice"
          : conventional
            ? "conventional-structured"
            : "verbose-structured-message",
      confidence: hits >= 2 ? "medium" : "low",
    });
  }
  return null;
}

function fromTrailerLine(
  kind: "assisted" | "generated" | "coauthor" | "ai-assisted" | "ai-tool" | "generated-with",
  value: string,
): AgentSignal | null {
  const model = extractModel(value);
  const tool = resolveTool(value);
  if (kind === "coauthor") {
    if (isNonAiBot(value)) return null;
    // Aggressive: Co-Authored-By with any model-ish token also counts
    const matched = AUTHOR_PATTERNS.find((p) => p.re.test(value));
    const looksAi =
      !!matched ||
      !!tool ||
      !!model ||
      /\b(ai|llm|agent|assistant)\b/i.test(value);
    if (!looksAi) return null;
    return decorate({
      strength: "assisted",
      via: "trailer",
      marker: `co-author ${matched?.hint ?? tool?.id ?? value.slice(0, 40)}`,
      toolHint: matched?.hint ?? tool?.id ?? value,
      model,
      confidence: tool || matched ? "high" : "medium",
    });
  }
  if (kind === "ai-assisted") {
    // `AI-assisted: true` / `yes` / tool name
    if (/^(false|no|0|off)\b/i.test(value.trim())) return null;
  }
  return decorate({
    strength: "assisted",
    via: "trailer",
    marker: `${kind}: ${value.slice(0, 80)}`,
    toolHint: tool?.id ?? value,
    model,
    confidence: "high",
  });
}

export function detectCommit(
  fields: {
    author?: string;
    authorEmail?: string;
    authorAvatar?: string;
    committer?: string;
    committerEmail?: string;
    committerAvatar?: string;
    message?: string;
  },
  opts?: { branch?: string; patch?: string },
): AgentSignal | null {
  for (const [via, val, avatar] of [
    ["author", `${fields.author ?? ""} ${fields.authorEmail ?? ""}`, fields.authorAvatar],
    [
      "committer",
      `${fields.committer ?? ""} ${fields.committerEmail ?? ""}`,
      fields.committerAvatar,
    ],
  ] as const) {
    if (isNonAiBot(val)) continue;
    const m = AUTHOR_PATTERNS.find((p) => p.re.test(val));
    if (m) {
      const signal = decorate({
        strength: "authored",
        via,
        marker: m.re.source,
        toolHint: m.hint,
      });
      // Prefer the avatar GitHub already sent on the commit (correct App icon)
      if (avatar) signal.avatarUrl = avatar;
      return signal;
    }
  }

  if (fields.message) {
    for (const [re, kind] of [
      [ASSISTED_BY, "assisted"],
      [GENERATED_BY, "generated"],
      [AI_ASSISTED_BY, "ai-assisted"],
      [AI_TOOL, "ai-tool"],
      [AI_ASSISTED_FLAG, "ai-assisted"],
      [GENERATED_WITH, "generated-with"],
    ] as const) {
      re.lastIndex = 0;
      let hit: RegExpExecArray | null;
      while ((hit = re.exec(fields.message))) {
        const s = fromTrailerLine(kind, hit[1]);
        if (s) return s;
      }
    }

    COAUTHOR_TRAILER.lastIndex = 0;
    let co: RegExpExecArray | null;
    while ((co = COAUTHOR_TRAILER.exec(fields.message))) {
      const s = fromTrailerLine("coauthor", co[1]);
      if (s) return s;
    }

    const m = MESSAGE_PATTERNS.find((p) => p.re.test(fields.message!));
    if (m)
      return decorate({
        strength: "assisted",
        via: "trailer",
        marker: m.re.source,
        toolHint: m.hint,
      });
  }

  const branchHit = detectBranch(opts?.branch);
  if (branchHit) return branchHit;

  if (opts?.patch) {
    const patchHit = detectPatchStyle(opts.patch);
    if (patchHit) return patchHit;
  }

  // Style heuristics count as assisted (aggressive attribution)
  return detectMessageStyle(fields.message);
}

/** All signals for a commit (primary + extras), strongest first. */
export function detectCommitAll(
  fields: Parameters<typeof detectCommit>[0],
  opts?: { branch?: string; patch?: string },
): AgentSignal[] {
  const primary = detectCommit(fields, opts);
  const extras: AgentSignal[] = [];
  if (fields.message) {
    const style = detectMessageStyle(fields.message);
    if (style && style.marker !== primary?.marker) extras.push(style);
  }
  if (opts?.patch) {
    const patch = detectPatchStyle(opts.patch);
    if (patch && patch.marker !== primary?.marker) extras.push(patch);
  }
  const branch = detectBranch(opts?.branch);
  if (branch && branch.marker !== primary?.marker) extras.push(branch);
  return primary ? [primary, ...extras] : extras;
}

/** repo file paths that signal AI tooling in use */
const FILE_PATTERNS: Array<[RegExp, string]> = [
  [/^\.?agents\.md$/i, "AGENTS.md"],
  [/^\.?claude\.md$/i, "CLAUDE.md"],
  [/^\.claude\//i, ".claude/"],
  [/^\.cursor\//i, ".cursor/"],
  [/^\.cursorrules$/i, ".cursorrules"],
  [/^\.windsurf/i, ".windsurf"],
  [/^\.github\/copilot-instructions\.md$/i, "copilot-instructions.md"],
  [/^\.github\/instructions\//i, ".github/instructions/"],
  [/^\.aider/i, ".aider"],
  [/^\.cline/i, ".cline"],
  [/^\.roo/i, ".roo"],
  [/^\.continue\//i, ".continue/"],
  [/^\.openhands/i, ".openhands"],
  [/^\.devin\//i, ".devin/"],
  [/^\.codex\//i, ".codex/"],
  [/^\.jules\//i, ".jules/"],
  [/^\.gemini\//i, ".gemini/"],
  [/^gemini\.md$/i, "GEMINI.md"],
  [/^\.qwen\//i, ".qwen/"],
  [/^\.?claude[._-]?local\.md$/i, "CLAUDE.local.md"],
  [/^\.kiro\//i, ".kiro/"],
  [/^\.trae\//i, ".trae/"],
  [/^\.amazonq\//i, ".amazonq/"],
  [/^\.junie\//i, ".junie/"],
  [/^\.augment\//i, ".augment/"],
  [/^\.kilocode\//i, ".kilocode/"],
  [/^\.qodo\//i, ".qodo/"],
  [/^\.lovable\//i, ".lovable/"],
  [/^\.opencode\//i, ".opencode/"],
  [/^\.factory\//i, ".factory/"],
  [/^\.v0\//i, ".v0/"],
  [/^agents\.md$/i, "AGENTS.md"],
  [/^\.github\/agents\//i, ".github/agents/"],
];

export function detectFiles(paths: string[]): string[] {
  const found = new Set<string>();
  for (const p of paths)
    for (const [re, label] of FILE_PATTERNS) if (re.test(p)) found.add(label);
  return [...found];
}

export interface AgentUsage {
  toolId: string;
  name: string;
  avatarUrl?: string;
  authored: number;
  assisted: number;
  suspected: number;
  models: string[];
  /** example markers for transparency */
  samples: string[];
}

/** Aggregate which tools/models showed up across commits. */
export function summarizeAgents(
  commits: Array<{
    author?: string;
    authorEmail?: string;
    committer?: string;
    committerEmail?: string;
    message?: string;
    sha?: string;
    patch?: string;
  }>,
  opts?: { branch?: string },
): AgentUsage[] {
  const map = new Map<string, AgentUsage>();
  for (const c of commits) {
    const signals = detectCommitAll(c, { branch: opts?.branch, patch: c.patch });
    for (const s of signals) {
      const id = s.toolId ?? "unknown";
      const name = s.tool ?? "Unknown AI";
      const entry =
        map.get(id) ??
        ({
          toolId: id,
          name,
          avatarUrl: s.avatarUrl,
          authored: 0,
          assisted: 0,
          suspected: 0,
          models: [],
          samples: [],
        } satisfies AgentUsage);
      if (s.strength === "authored") entry.authored++;
      else if (s.strength === "assisted") entry.assisted++;
      else entry.suspected++;
      if (s.model && !entry.models.includes(s.model)) entry.models.push(s.model);
      if (entry.samples.length < 3 && !entry.samples.includes(s.marker))
        entry.samples.push(s.marker);
      if (!entry.avatarUrl && s.avatarUrl) entry.avatarUrl = s.avatarUrl;
      map.set(id, entry);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.authored + b.assisted + b.suspected - (a.authored + a.assisted + a.suspected),
  );
}
