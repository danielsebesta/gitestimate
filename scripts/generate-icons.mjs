/**
 * Rasterize Lucide clock into light/dark transparent favicons + GitHub App asset.
 * Run: node scripts/generate-icons.mjs
 *
 * Theme switching is done in HTML via media="(prefers-color-scheme: …)" —
 * browsers often ignore CSS @media inside SVG favicons.
 */
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public");
const assetsDir = join(root, "assets");

mkdirSync(outDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });

/** Transparent clock-only SVG at a given stroke color. */
function clockSvg(stroke) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     transform="translate(12 12) scale(1.66667)">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </g>
</svg>`);
}

/** Opaque GitHub-dark tile for App / apple-touch upload. */
function appTileSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0d1117"/>
  <g fill="none" stroke="#e6edf3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     transform="translate(12 12) scale(1.66667)">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </g>
</svg>`);
}

async function pngFromSvg(svg, size, file, { flatten } = {}) {
  let pipeline = sharp(svg, { density: Math.max(288, size * 4) }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (flatten) {
    pipeline = pipeline.flatten({ background: flatten });
  }
  const buf = await pipeline.png().toBuffer();
  writeFileSync(join(outDir, file), buf);
  return buf;
}

const STROKE_ON_LIGHT = "#0d1117";
const STROKE_ON_DARK = "#e6edf3";
const TILE = { r: 13, g: 17, b: 23, alpha: 1 };

const favSizes = [16, 32, 48];
const lightPngs = [];
const darkPngs = [];

for (const size of favSizes) {
  const lightName = `favicon-light-${size}x${size}.png`;
  const darkName = `favicon-dark-${size}x${size}.png`;
  lightPngs.push(await pngFromSvg(clockSvg(STROKE_ON_LIGHT), size, lightName));
  darkPngs.push(await pngFromSvg(clockSvg(STROKE_ON_DARK), size, darkName));
  console.log(`wrote public/${lightName}, public/${darkName}`);
}

// Unscoped aliases → light stroke (safe default for dark browser chrome)
await pngFromSvg(clockSvg(STROKE_ON_DARK), 16, "favicon-16x16.png");
await pngFromSvg(clockSvg(STROKE_ON_DARK), 32, "favicon-32x32.png");
await pngFromSvg(clockSvg(STROKE_ON_DARK), 48, "favicon-48x48.png");

await pngFromSvg(appTileSvg(), 180, "apple-touch-icon.png", { flatten: TILE });
await pngFromSvg(appTileSvg(), 192, "android-chrome-192x192.png", { flatten: TILE });
await pngFromSvg(appTileSvg(), 512, "android-chrome-512x512.png", { flatten: TILE });
console.log("wrote apple-touch + android-chrome (opaque dark tile)");

const appIcon = await pngFromSvg(appTileSvg(), 1024, "github-app-icon.png", {
  flatten: TILE,
});
writeFileSync(join(assetsDir, "github-app-icon.png"), appIcon);
copyFileSync(join(outDir, "icon.svg"), join(assetsDir, "icon.svg"));
console.log("wrote public/github-app-icon.png + assets/");

writeFileSync(join(outDir, "favicon-light.ico"), await pngToIco(lightPngs));
writeFileSync(join(outDir, "favicon-dark.ico"), await pngToIco(darkPngs));
// Unscoped .ico → dark-chrome (light stroke) so dark browsers aren't black
writeFileSync(join(outDir, "favicon.ico"), await pngToIco(darkPngs));
console.log("wrote favicon-light.ico, favicon-dark.ico, favicon.ico");

const manifest = {
  name: "GitEstimate",
  short_name: "GitEstimate",
  description:
    "Estimate how much time was spent building a GitHub repository from its commit history.",
  start_url: "/",
  display: "standalone",
  background_color: "#0d1117",
  theme_color: "#0d1117",
  icons: [
    {
      src: "./android-chrome-192x192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "./android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
};
writeFileSync(join(outDir, "site.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote public/site.webmanifest");
