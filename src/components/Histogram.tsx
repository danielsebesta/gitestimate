import { Box, Text } from "@primer/react";

interface Props {
  title: string;
  values: number[];
  labels: string[];
  /** label index step for x-axis (labels in between are hidden) */
  labelEvery?: number;
  accent?: string;
}

/** minimal vertical-bar histogram, GitHub insights style */
export default function Histogram({ title, values, labels, labelEvery = 1, accent }: Props) {
  const max = Math.max(1, ...values);
  return (
    <Box as="figure" m={0}>
      <Text as="figcaption" size="small" sx={{ fontWeight: 600, display: "block", mb: 2 }}>
        {title}
      </Text>
      <Box display="flex" alignItems="flex-end" sx={{ gap: 2, height: 72 }}>
        {values.map((v, i) => (
          <Box
            key={i}
            title={`${labels[i]}: ${v.toLocaleString()}`}
            sx={{
              flex: 1,
              height: `${Math.max(v > 0 ? 4 : 1, (v / max) * 72)}px`,
              bg: accent ?? "var(--bgColor-accent-muted)",
              borderRadius: "3px 3px 0 0",
            }}
          />
        ))}
      </Box>
      <Box display="flex" sx={{ gap: 2 }}>
        {labels.map((l, i) => (
          <Text
            key={i}
            size="small"
            color="fg.muted"
            sx={{
              flex: "1 1 0",
              minWidth: 0,
              whiteSpace: "nowrap",
              textAlign: "center",
              fontSize: 9,
              visibility: i % labelEvery ? "hidden" : "visible",
            }}
          >
            {l}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
