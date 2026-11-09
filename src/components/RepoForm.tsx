import { Box, Button, FormControl, ProgressBar, Select, Spinner, Text, TextInput } from "@primer/react";
import { Search } from "lucide-react";

export type LoadPhase = "commits" | "stats" | "patches" | "charts";

export interface FetchProgress {
  phase: LoadPhase;
  done: number;
  total: number;
  /** repo-wide commit count when known (may exceed what we fetch) */
  repoTotal?: number;
}

const PHASE_LABEL: Record<LoadPhase, string> = {
  commits: "Loading commits",
  stats: "Loading diff sizes",
  patches: "Sampling patches",
  charts: "Loading activity",
};

interface RepoFormProps {
  input: string;
  onInputChange: (v: string) => void;
  loading: boolean;
  /** true before the first run — shows the example repos */
  idle: boolean;
  progress: FetchProgress | null;
  onRun: (target?: string) => void;
  onCancel: () => void;
  /** branches of the analyzed repo — the picker appears once known */
  branches: string[];
  branch: string;
  onBranchChange: (branch: string) => void;
}

const EXAMPLES = ["danielsebesta/web", "danielsebesta/PaperBoat", "onlook-dev/onlook"];

function progressPercent(done: number, total: number): number {
  if (total <= 0) return done > 0 ? 100 : 0;
  return Math.min(100, Math.round((Math.min(done, total) / total) * 100));
}

export default function RepoForm({
  input,
  onInputChange,
  loading,
  idle,
  progress,
  onRun,
  onCancel,
  branches,
  branch,
  onBranchChange,
}: RepoFormProps) {
  const pct = progress ? progressPercent(progress.done, progress.total) : 0;
  const label = progress ? PHASE_LABEL[progress.phase] : "";

  return (
    <Box>
      <Box display="flex" sx={{ gap: 2 }}>
        <TextInput
          leadingVisual={Search}
          placeholder="owner/repo or github.com/owner/repo"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && onRun()}
          sx={{ flex: 1, minWidth: 0 }}
          aria-label="Repository"
          autoFocus
          block
        />
        <Button variant="primary" onClick={() => onRun()} disabled={loading} sx={{ flexShrink: 0 }}>
          {loading ? <Spinner size="small" /> : "Estimate"}
        </Button>
        {loading && (
          <Button onClick={onCancel} sx={{ flexShrink: 0 }}>
            Cancel
          </Button>
        )}
      </Box>

      {loading && (
        <Box
          sx={{
            mt: 3,
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            p: 3,
            bg: "canvas.subtle",
          }}
          role="status"
          aria-live="polite"
        >
          <Box display="flex" justifyContent="space-between" alignItems="baseline" sx={{ gap: 2, mb: 2 }}>
            <Text size="small" sx={{ fontWeight: 600 }}>
              {label || "Working"}…
            </Text>
            <Text size="small" color="fg.muted" sx={{ fontFamily: "mono", fontSize: 11 }}>
              {progress && progress.total > 0
                ? `${Math.min(progress.done, progress.total).toLocaleString()} / ${progress.total.toLocaleString()}`
                : progress && progress.done > 0
                  ? `${progress.done.toLocaleString()}…`
                  : "starting"}
              {progress &&
                progress.repoTotal != null &&
                progress.repoTotal > (progress.total || 0) &&
                ` · ~${progress.repoTotal.toLocaleString()} in repo`}
            </Text>
          </Box>
          <ProgressBar
            progress={pct}
            barSize="default"
            aria-label={`${label} ${pct}%`}
            sx={{ height: 8 }}
          />
          <Text size="small" color="fg.muted" sx={{ display: "block", mt: 2, fontSize: 11 }}>
            {progress?.phase === "commits" && "Loading commits"}
            {progress?.phase === "stats" && "Loading diff sizes"}
            {progress?.phase === "patches" && "Sampling patches for AI signals"}
            {progress?.phase === "charts" && "Loading weekly activity"}
            {!progress && "Starting"}
          </Text>
        </Box>
      )}

      {branches.length > 0 && (
        <FormControl sx={{ mt: 2, maxWidth: 260 }}>
          <FormControl.Label visuallyHidden>Branch</FormControl.Label>
          <Select
            value={branch}
            onChange={(e) => onBranchChange(e.target.value)}
            size="small"
            disabled={loading}
            block
          >
            {branches.map((b) => (
              <Select.Option key={b} value={b}>
                {b}
              </Select.Option>
            ))}
          </Select>
        </FormControl>
      )}
      {idle && (
        <Box display="flex" alignItems="center" sx={{ gap: 2, mt: 3, flexWrap: "wrap" }}>
          <Text size="small" color="fg.muted">
            Try:
          </Text>
          {EXAMPLES.map((r) => (
            <Button
              key={r}
              size="small"
              onClick={() => {
                onInputChange(r);
                onRun(r);
              }}
            >
              {r}
            </Button>
          ))}
        </Box>
      )}
    </Box>
  );
}
