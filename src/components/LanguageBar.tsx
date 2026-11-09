import { Box, Text } from "@primer/react";

/** GitHub linguist colors for the common languages */
const COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00b4ab",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  Scala: "#c22d40",
  Lua: "#000080",
  "Jupyter Notebook": "#da5b0b",
  Dockerfile: "#384d54",
  Zig: "#ec915c",
  "Objective-C": "#438eff",
  R: "#198ce7",
};

export default function LanguageBar({ languages }: { languages: Record<string, number> }) {
  const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return null;

  return (
    <Box as="figure" m={0}>
      <Text as="figcaption" size="small" sx={{ fontWeight: 600, display: "block", mb: 2 }}>
        Languages
      </Text>
      <Box display="flex" sx={{ borderRadius: 2, overflow: "hidden", height: 8, mb: 2 }}>
        {entries.map(([lang, v]) => (
          <Box
            key={lang}
            title={`${lang} ${((v / total) * 100).toFixed(1)}%`}
            sx={{ width: `${(v / total) * 100}%`, bg: COLORS[lang] ?? "var(--bgColor-neutral-emphasis)" }}
          />
        ))}
      </Box>
      <Box display="flex" sx={{ gap: 3, flexWrap: "wrap" }}>
        {entries.slice(0, 6).map(([lang, v]) => (
          <Box key={lang} display="flex" alignItems="center" sx={{ gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bg: COLORS[lang] ?? "var(--bgColor-neutral-emphasis)",
              }}
            />
            <Text size="small" sx={{ fontWeight: 600 }}>
              {lang}
            </Text>
            <Text size="small" color="fg.muted">
              {((v / total) * 100).toFixed(1)}%
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
