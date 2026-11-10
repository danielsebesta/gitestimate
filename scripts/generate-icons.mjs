/**
 * Rasterize GitHub Octicon clock into light/dark transparent favicons + GitHub App asset.
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

/** Transparent Octicon clock SVG at a given fill color (viewBox 0 0 24 24). */
function clockSvg(fill) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="${fill}" d="M12.5 7.25a.75.75 0 0 0-1.5 0v5.5c0 .27.144.518.378.651l3.5 2a.75.75 0 0 0 .744-1.302L12.5 12.315V7.25Z"/>
  <path fill="${fill}" d="M12 1c6.075 0 11 4.925 11 11s-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1ZM2.5 12a9.5 9.5 0 0 0 9.5 9.5 9.5 9.5 0 0 0 9.5-9.5A9.5 9.5 0 0 0 12 2.5 9.5 9.5 0 0 0 2.5 12Z"/>
</svg>`);
}

/** Opaque GitHub-dark tile for App / apple-touch upload. */
function appTileSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#0d1117"/>
  <g transform="translate(14 14) scale(1.5)">
    <path fill="#e6edf3" d="M12.5 7.25a.75.75 0 0 0-1.5 0v5.5c0 .27.144.518.378.651l3.5 2a.75.75 0 0 0 .744-1.302L12.5 12.315V7.25Z"/>
    <path fill="#e6edf3" d="M12 1c6.075 0 11 4.925 11 11s-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1ZM2.5 12a9.5 9.5 0 0 0 9.5 9.5 9.5 9.5 0 0 0 9.5-9.5A9.5 9.5 0 0 0 12 2.5 9.5 9.5 0 0 0 2.5 12Z"/>
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

const FILL_ON_LIGHT = "#0d1117";
const FILL_ON_DARK = "#e6edf3";
const TILE = { r: 13, g: 17, b: 23, alpha: 1 };

// Write SVG icons
writeFileSync(join(outDir, "icon-light.svg"), clockSvg(FILL_ON_LIGHT));
writeFileSync(join(outDir, "icon-dark.svg"), clockSvg(FILL_ON_DARK));
writeFileSync(join(outDir, "icon.svg"), clockSvg(FILL_ON_DARK));
writeFileSync(join(assetsDir, "icon.svg"), clockSvg(FILL_ON_DARK));

const favSizes = [16, 32, 48];
const lightPngs = [];
const darkPngs = [];

for (const size of favSizes) {
  const lightName = `favicon-light-${size}x${size}.png`;
  const darkName = `favicon-dark-${size}x${size}.png`;
  lightPngs.push(await pngFromSvg(clockSvg(FILL_ON_LIGHT), size, lightName));
  darkPngs.push(await pngFromSvg(clockSvg(FILL_ON_DARK), size, darkName));
  console.log(`wrote public/${lightName}, public/${darkName}`);
}

// Unscoped aliases -> light stroke / fill (safe default for dark browser chrome)
await pngFromSvg(clockSvg(FILL_ON_DARK), 16, "favicon-16x16.png");
await pngFromSvg(clockSvg(FILL_ON_DARK), 32, "favicon-32x32.png");
await pngFromSvg(clockSvg(FILL_ON_DARK), 48, "favicon-48x48.png");

await pngFromSvg(appTileSvg(), 180, "apple-touch-icon.png", { flatten: TILE });
await pngFromSvg(appTileSvg(), 192, "android-chrome-192x192.png", { flatten: TILE });
await pngFromSvg(appTileSvg(), 512, "android-chrome-512x512.png", { flatten: TILE });
console.log("wrote apple-touch + android-chrome (opaque dark tile)");

const appIcon = await pngFromSvg(appTileSvg(), 1024, "github-app-icon.png", {
  flatten: TILE,
});
writeFileSync(join(assetsDir, "github-app-icon.png"), appIcon);
console.log("wrote public/github-app-icon.png + assets/");

writeFileSync(join(outDir, "favicon-light.ico"), await pngToIco(lightPngs));
writeFileSync(join(outDir, "favicon-dark.ico"), await pngToIco(darkPngs));
// Unscoped .ico -> dark-chrome (light fill) so dark browsers aren't black
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
      src: "/android-chrome-192x192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/android-chrome-512x512.png",
      sizes: "512x512",
      type: "image/png",
    },
  ],
};
writeFileSync(join(outDir, "site.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote public/site.webmanifest");
