import { Box, Text } from "@primer/react";
import type { ReactNode } from "react";

export interface Stat {
  value: string;
  label: string;
  hint?: string;
}

export function StatCard({ stat }: { stat: Stat }) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "border.default",
        borderRadius: 2,
        p: [2, 3],
      }}
    >
      <Text sx={{ fontSize: [3, 4], fontWeight: 600, lineHeight: 1.1, display: "block" }}>
        {stat.value}
      </Text>
      <Text size="small" color="fg.muted" sx={{ display: "block", mt: 1 }}>
        {stat.label}
      </Text>
      {stat.hint && (
        <Text size="small" color="fg.muted" sx={{ display: "block", mt: 1, fontSize: 11 }}>
          {stat.hint}
        </Text>
      )}
    </Box>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      display="grid"
      sx={{
        gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}
