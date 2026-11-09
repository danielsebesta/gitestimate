import { Box, Button, FormControl, Select, Spinner, Text, TextInput } from "@primer/react";
import { SearchIcon } from "@primer/octicons-react";

export interface FetchProgress {
  fetched: number;
  target: number;
  total: number;
}

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
  return (
    <Box>
      <Box display="flex" sx={{ gap: 2 }}>
        <TextInput
          leadingVisual={SearchIcon}
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
      {loading && progress && (
        <Text as="p" size="small" color="fg.muted" sx={{ mt: 2 }}>
          Fetching commits… {progress.fetched.toLocaleString()}
          {progress.target > 0 && ` / ${progress.target.toLocaleString()}`}
          {progress.total > progress.target &&
            ` — repo has ~${progress.total.toLocaleString()}, capped at ${progress.target.toLocaleString()}`}
        </Text>
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
