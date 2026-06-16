// Generates the PWA icon set from the SettleUp "S" brand mark.
// Run with: pnpm --filter @template/web gen:icons
// Output PNGs are committed so CI/Vercel builds don't depend on this step.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const ICONS_DIR = join(PUBLIC_DIR, "icons");

const BRAND = "#4f46e5"; // brand-600

/**
 * Master icon SVG.
 * @param {object} opts
 * @param {number} opts.size  viewBox size
 * @param {boolean} opts.maskable  full-bleed background (no rounded corners) for Android masking
 * @returns {string}
 */
function iconSvg({ size = 512, maskable = false } = {}) {
  // For maskable icons the safe zone is the inner ~80%, so keep the "S" smaller and centered.
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const fontSize = maskable ? Math.round(size * 0.52) : Math.round(size * 0.62);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BRAND}"/>
  <text x="50%" y="50%" dy="0.04em" text-anchor="middle" dominant-baseline="central"
        font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="#ffffff">S</text>
</svg>`;
}

/** @param {string} svg @param {number} size @param {string} out */
async function rasterize(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log("  ✓", out.replace(PUBLIC_DIR, "public"));
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  // Master scalable SVG (used as a crisp favicon and base asset).
  const masterSvg = iconSvg({ size: 512, maskable: false });
  await writeFile(join(PUBLIC_DIR, "icon.svg"), masterSvg, "utf8");
  console.log("  ✓ public/icon.svg");

  const maskableSvg = iconSvg({ size: 512, maskable: true });

  await rasterize(masterSvg, 192, join(ICONS_DIR, "icon-192.png"));
  await rasterize(masterSvg, 512, join(ICONS_DIR, "icon-512.png"));
  await rasterize(maskableSvg, 192, join(ICONS_DIR, "icon-maskable-192.png"));
  await rasterize(maskableSvg, 512, join(ICONS_DIR, "icon-maskable-512.png"));

  // Apple touch icon: opaque, no transparency/masking honored by iOS.
  await rasterize(masterSvg, 180, join(ICONS_DIR, "apple-touch-icon.png"));

  // Favicons.
  await rasterize(masterSvg, 32, join(ICONS_DIR, "favicon-32.png"));
  await rasterize(masterSvg, 16, join(ICONS_DIR, "favicon-16.png"));

  console.log("\nDone. Generated PWA icon set in public/icons/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
