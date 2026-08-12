// Derives the cross-platform SettleUp icon set from the generated master artwork.
// Run with: pnpm --filter @template/web gen:icons
// Outputs are committed so app and web builds do not depend on this step.
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const MASTER_PATH = join(REPO_ROOT, "assets", "brand", "settleup-icon-master.png");
const WEB_PUBLIC_DIR = join(REPO_ROOT, "apps", "web", "public");
const WEB_ICONS_DIR = join(WEB_PUBLIC_DIR, "icons");
const WEB_OG_DIR = join(WEB_PUBLIC_DIR, "og");
const MOBILE_ASSETS_DIR = join(REPO_ROOT, "apps", "mobile", "assets");

const BRAND = "#059669";
const BRAND_DARK = "#047857";
const OFF_WHITE = "#f8fafc";

/** @param {string} outputPath */
function logOutput(outputPath) {
  console.log("  ✓", outputPath.replace(`${REPO_ROOT}/`, ""));
}

/** @param {number} value */
function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Extracts the light logo mark from the full-bleed master artwork.
 * The generated source deliberately uses a dark emerald background, so a
 * channel-floor matte gives us a clean single-color adaptive/notification mark.
 * @param {number} size
 * @param {string} color
 * @returns {Promise<Buffer>}
 */
async function markBuffer(size, color = OFF_WHITE) {
  const { data, info } = await sharp(MASTER_PATH)
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const pixels = Buffer.alloc(info.width * info.height * 4);

  for (let sourceOffset = 0, targetOffset = 0; sourceOffset < data.length; sourceOffset += 3) {
    const channelFloor = Math.min(
      data[sourceOffset] ?? 0,
      data[sourceOffset + 1] ?? 0,
      data[sourceOffset + 2] ?? 0,
    );
    const alpha = byte(((channelFloor - 172) / 62) * 255);
    pixels[targetOffset] = red;
    pixels[targetOffset + 1] = green;
    pixels[targetOffset + 2] = blue;
    pixels[targetOffset + 3] = alpha;
    targetOffset += 4;
  }

  return sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/** @param {number} size @param {string} outputPath */
async function rasterizeMaster(size, outputPath) {
  await sharp(MASTER_PATH).resize(size, size, { fit: "cover" }).png().toFile(outputPath);
  logOutput(outputPath);
}

/** @param {number} size @param {string} color @param {string} outputPath */
async function writeMark(size, color, outputPath) {
  const mark = await markBuffer(size, color);
  await sharp(mark).png().toFile(outputPath);
  logOutput(outputPath);
}

async function generateSocialPreview() {
  const master = await readFile(MASTER_PATH);
  const embeddedMaster = master.toString("base64");
  const preview =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="1" stop-color="#ecfdf5"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BRAND}"/>
        <stop offset="1" stop-color="${BRAND_DARK}"/>
      </linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#065f46" flood-opacity="0.18"/>
      </filter>
      <clipPath id="icon-clip"><rect x="858" y="154" width="246" height="246" rx="58"/></clipPath>
    </defs>
    <rect width="1200" height="630" fill="url(#background)"/>
    <circle cx="1130" cy="54" r="230" fill="#d1fae5" opacity="0.58"/>
    <circle cx="1030" cy="620" r="250" fill="#a7f3d0" opacity="0.32"/>
    <path d="M760 0H1200V630H920C835 520 790 396 774 286C760 190 760 90 760 0Z" fill="#ecfdf5" opacity="0.72"/>

    <g transform="translate(88 82)">
      <rect width="48" height="48" rx="14" fill="url(#accent)"/>
      <path d="M13 15h12l5 5-9 9 4 4 10-10" fill="none" stroke="#f8fafc" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="64" y="35" font-family="Inter, Arial, sans-serif" font-size="31" font-weight="700" fill="#0f172a">SettleUp</text>
    </g>

    <text x="88" y="246" font-family="Inter, Arial, sans-serif" font-size="68" font-weight="750" letter-spacing="-2.6" fill="#0f172a">Split it fair.</text>
    <text x="88" y="326" font-family="Inter, Arial, sans-serif" font-size="68" font-weight="750" letter-spacing="-2.6" fill="#0f172a">Settle it simple.</text>
    <text x="92" y="390" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="400" fill="#475569">Track group expenses, simplify balances, and</text>
    <text x="92" y="426" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="400" fill="#475569">settle debts without awkward math.</text>
    <g transform="translate(92 494)">
      <rect width="172" height="48" rx="24" fill="#d1fae5"/>
      <circle cx="26" cy="24" r="7" fill="${BRAND}"/>
      <text x="43" y="31" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="650" fill="#065f46">Made for groups</text>
    </g>

    <rect x="830" y="126" width="302" height="302" rx="78" fill="#ffffff" filter="url(#shadow)"/>
    <image x="858" y="154" width="246" height="246" href="data:image/png;base64,${embeddedMaster}" clip-path="url(#icon-clip)" preserveAspectRatio="xMidYMid slice"/>
  </svg>`);
  const outputPath = join(WEB_OG_DIR, "settleup-social.png");
  await sharp(preview).flatten({ background: "#ffffff" }).png().toFile(outputPath);
  logOutput(outputPath);
}

async function main() {
  await Promise.all([
    mkdir(WEB_ICONS_DIR, { recursive: true }),
    mkdir(WEB_OG_DIR, { recursive: true }),
    mkdir(MOBILE_ASSETS_DIR, { recursive: true }),
  ]);

  await Promise.all([
    rasterizeMaster(16, join(WEB_ICONS_DIR, "favicon-16.png")),
    rasterizeMaster(32, join(WEB_ICONS_DIR, "favicon-32.png")),
    rasterizeMaster(180, join(WEB_ICONS_DIR, "apple-touch-icon.png")),
    rasterizeMaster(192, join(WEB_ICONS_DIR, "icon-192.png")),
    rasterizeMaster(512, join(WEB_ICONS_DIR, "icon-512.png")),
    rasterizeMaster(192, join(WEB_ICONS_DIR, "icon-maskable-192.png")),
    rasterizeMaster(512, join(WEB_ICONS_DIR, "icon-maskable-512.png")),
    writeMark(512, "#000000", join(WEB_ICONS_DIR, "icon-monochrome-512.png")),
    rasterizeMaster(1024, join(MOBILE_ASSETS_DIR, "icon.png")),
    rasterizeMaster(48, join(MOBILE_ASSETS_DIR, "favicon.png")),
    writeMark(1024, OFF_WHITE, join(MOBILE_ASSETS_DIR, "adaptive-icon.png")),
    writeMark(1024, OFF_WHITE, join(MOBILE_ASSETS_DIR, "monochrome-icon.png")),
    writeMark(512, BRAND, join(MOBILE_ASSETS_DIR, "splash.png")),
    writeMark(96, "#ffffff", join(MOBILE_ASSETS_DIR, "notification-icon.png")),
    generateSocialPreview(),
  ]);

  console.log("\nDone. Generated SettleUp assets for web and mobile.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
