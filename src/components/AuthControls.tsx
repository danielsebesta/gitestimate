import type { ReactNode } from "react";
import { Box, Button, Flash, FormControl, Text, TextInput } from "@primer/react";
import { KeyIcon, MarkGithubIcon, SignOutIcon } from "@primer/octicons-react";

export interface DeviceAuth {
  userCode: string;
  verificationUri: string;
}

interface AuthControlsProps {
  token: string;
  onTokenChange: (v: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  /** estimate running — disables sign-in */
  busy: boolean;
  deviceAuth: DeviceAuth | null;
  onCancelDevice: () => void;
  authError: string | null;
  /** session-parameter selects rendered on the same row */
  children?: ReactNode;
}

export default function AuthControls({
  token,
  onTokenChange,
  onSignIn,
  onSignOut,
  busy,
  deviceAuth,
  onCancelDevice,
  authError,
  children,
}: AuthControlsProps) {
  return (
    <>
      <Box display="flex" sx={{ gap: 2, mt: 3, flexWrap: "wrap" }}>
        {children}
        <Box
          display="flex"
          sx={{ gap: 2, flex: ["1 1 100%", "1 1 200px"], minWidth: 0 }}
        >
          <FormControl sx={{ flex: 1, minWidth: 0 }}>
            <FormControl.Label visuallyHidden>GitHub token</FormControl.Label>
            <TextInput
              leadingVisual={KeyIcon}
              placeholder="token (or sign in →)"
              value={token}
              onChange={(e) => onTokenChange(e.target.value)}
              type="password"
              size="small"
              block
            />
          </FormControl>
          {token ? (
            <Button
              leadingVisual={SignOutIcon}
              onClick={onSignOut}
              size="small"
              sx={{ flexShrink: 0 }}
            >
              Sign out
            </Button>
          ) : (
            <Button
              leadingVisual={MarkGithubIcon}
              onClick={onSignIn}
              disabled={busy || deviceAuth !== null}
              size="small"
              sx={{ flexShrink: 0 }}
            >
              Sign in
            </Button>
          )}
        </Box>
      </Box>

      {deviceAuth && (
        <Flash variant="default" sx={{ mt: 3 }}>
          <Box display="flex" alignItems="center" sx={{ gap: 3, flexWrap: "wrap" }}>
            <Text>
              Authorize at{" "}
              <a href={deviceAuth.verificationUri} target="_blank" rel="noreferrer">
                {deviceAuth.verificationUri}
              </a>{" "}
              with code
            </Text>
            <Text sx={{ fontFamily: "mono", fontWeight: 600, fontSize: 2 }}>
              {deviceAuth.userCode}
            </Text>
            <Button size="small" variant="invisible" onClick={onCancelDevice}>
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
