import { useState } from "react";
import { Box, Button, Flash, FormControl, Label, Link, Text, TextInput } from "@primer/react";
import {
  CheckIcon,
  DeviceDesktopIcon,
  KeyIcon,
  MarkGithubIcon,
  SignOutIcon,
} from "@primer/octicons-react";
import type { GitHubUser } from "../lib/github";

export interface DeviceAuth {
  userCode: string;
  verificationUri: string;
}

interface AuthControlsProps {
  token: string;
  onTokenChange: (v: string) => void;
  onSignIn: () => void;
  onDeviceSignIn: () => void;
  onSignOut: () => void;
  busy: boolean;
  deviceAuth: DeviceAuth | null;
  onCancelDevice: () => void;
  authError: string | null;
  exchanging?: boolean;
  user: GitHubUser | null;
  /** viewer profile still loading after token is set */
  userLoading?: boolean;
}

const btnSx = {
  flex: "1 1 140px",
  justifyContent: "center",
} as const;

export default function AuthControls({
  token,
  onTokenChange,
  onSignIn,
  onDeviceSignIn,
  onSignOut,
  busy,
  deviceAuth,
  onCancelDevice,
  authError,
  exchanging,
  user,
  userLoading,
}: AuthControlsProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const locked = busy || deviceAuth !== null || exchanging;

  if (token) {
    return (
      <>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            mt: 3,
            gap: 2,
            flexWrap: "wrap",
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            px: 3,
            py: 2,
          }}
        >
          <Box display="flex" alignItems="center" sx={{ gap: 2, minWidth: 0 }}>
            <Box
              aria-hidden
              sx={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                bg: "success.emphasis",
                color: "fg.onEmphasis",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CheckIcon size={12} />
            </Box>
            {user?.avatarUrl ? (
              <Box
                as="img"
                src={user.avatarUrl}
                alt=""
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: "1px solid",
                  borderColor: "border.muted",
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  bg: "neutral.muted",
                  flexShrink: 0,
                }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              {userLoading && !user ? (
                <Text size="small" color="fg.muted">
                  Loading profile…
                </Text>
              ) : user ? (
                <>
                  <Box display="flex" alignItems="center" sx={{ gap: 2, flexWrap: "wrap" }}>
                    <Text sx={{ fontWeight: 600 }}>{user.name || user.login}</Text>
                    <Label size="small" variant="success">
                      Signed in
                    </Label>
                  </Box>
                  <Link
                    href={user.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    muted
                    sx={{ fontSize: 0 }}
                  >
                    @{user.login}
                  </Link>
                </>
              ) : (
                <Text size="small" color="fg.muted">
                  Token set — profile unavailable
                </Text>
              )}
            </Box>
          </Box>
          <Button
            leadingVisual={SignOutIcon}
            onClick={onSignOut}
            size="small"
            sx={{ flexShrink: 0 }}
          >
            Sign out
          </Button>
        </Box>
        {authError && (
          <Flash variant="danger" sx={{ mt: 3 }}>
            {authError}
          </Flash>
        )}
      </>
    );
  }

  return (
    <>
      <Box display="flex" sx={{ gap: 2, mt: 3, flexWrap: "wrap" }}>
        <Button
          leadingVisual={MarkGithubIcon}
          onClick={onSignIn}
          disabled={locked}
          size="small"
          variant="primary"
          sx={btnSx}
        >
          {exchanging ? "Signing in…" : "Sign in with GitHub"}
        </Button>
        <Button
          leadingVisual={DeviceDesktopIcon}
          onClick={onDeviceSignIn}
          disabled={locked}
          size="small"
          sx={btnSx}
        >
          Device code
        </Button>
        <Button
          leadingVisual={KeyIcon}
          onClick={() => setManualOpen((v) => !v)}
          disabled={locked}
          size="small"
          sx={btnSx}
          aria-expanded={manualOpen}
        >
          Paste token
        </Button>
      </Box>

      {manualOpen && (
        <Box display="flex" sx={{ gap: 2, mt: 2, flexWrap: "wrap" }}>
          <FormControl sx={{ flex: "1 1 220px", minWidth: 0 }}>
            <FormControl.Label visuallyHidden>GitHub token</FormControl.Label>
            <TextInput
              leadingVisual={KeyIcon}
              placeholder="ghp_… or fine-grained PAT"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              type="password"
              size="small"
              block
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  onTokenChange(draft.trim());
                  setDraft("");
                  setManualOpen(false);
                }
              }}
            />
          </FormControl>
          <Button
            size="small"
            variant="primary"
            disabled={!draft.trim()}
            onClick={() => {
              onTokenChange(draft.trim());
              setDraft("");
              setManualOpen(false);
            }}
            sx={{ flexShrink: 0 }}
          >
            Use token
          </Button>
          <Button
            size="small"
            variant="invisible"
            onClick={() => {
              setManualOpen(false);
              setDraft("");
            }}
          >
            Cancel
          </Button>
        </Box>
      )}

      {deviceAuth && (
        <Flash variant="warning" sx={{ mt: 3 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ gap: 2 }}>
            <Box>
              <Text sx={{ fontWeight: 600 }}>Authorize GitEstimate on GitHub</Text>
              <Text size="small" sx={{ display: "block" }}>
                Enter code{" "}
                <Text
                  as="strong"
                  sx={{
                    fontFamily: "mono",
                    fontSize: 2,
                    letterSpacing: "0.1em",
                    px: 1,
                    py: "2px",
                    bg: "canvas.default",
                    borderRadius: 1,
                  }}
                >
                  {deviceAuth.userCode}
                </Text>{" "}
                at{" "}
                <Link href={deviceAuth.verificationUri} target="_blank" rel="noreferrer">
                  {deviceAuth.verificationUri}
                </Link>
                . Waiting for authorization…
              </Text>
            </Box>
            <Button size="small" onClick={onCancelDevice}>
              Cancel
            </Button>
          </Box>
        </Flash>
      )}

      {authError && (
        <Flash variant="danger" sx={{ mt: 3 }}>
          {authError}
        </Flash>
      )}
    </>
  );
}

