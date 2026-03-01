/**
 * Stair-Doc PWA icon generator.
 * Generates all required PNG icon sizes from an SVG source using `sharp`.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../public/icons");
mkdirSync(OUT, { recursive: true });

// ── Stair-Doc SVG icon source ─────────────────────────────────────────────
// Blue (#3B82F6) background, white robot/stair-step geometric icon.
const iconSvg = (size) => {
  const s = size;
  const r = Math.round(s * 0.18); // border-radius
  const cx = s / 2;
  const cy = s / 2;
  const iconScale = s / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <!-- Background -->
  <rect width="${s}" height="${s}" rx="${r}" fill="#3B82F6"/>

  <!-- Stair-step delivery robot icon (scaled to ${s}px) -->
  <g transform="translate(${cx},${cy}) scale(${iconScale}) translate(-256,-256)">
    <!-- Stair steps (3 steps) -->
    <rect x="80" y="320" width="120" height="100" rx="8" fill="white" opacity="0.95"/>
    <rect x="168" y="248" width="120" height="172" rx="8" fill="white" opacity="0.90"/>
    <rect x="256" y="176" width="120" height="244" rx="8" fill="white" opacity="0.85"/>

    <!-- Robot body on top step -->
    <rect x="272" y="116" width="88" height="72" rx="10" fill="white"/>
    <!-- Robot screen/eye -->
    <rect x="286" y="126" width="60" height="36" rx="6" fill="#1D4ED8"/>
    <!-- Robot eye dots -->
    <circle cx="306" cy="144" r="7" fill="white"/>
    <circle cx="326" cy="144" r="7" fill="white"/>
    <!-- Robot antenna -->
    <line x1="316" y1="116" x2="316" y2="94" stroke="white" stroke-width="6" stroke-linecap="round"/>
    <circle cx="316" cy="88" r="7" fill="white"/>
    <!-- Robot wheels/tracks -->
    <rect x="268" y="184" width="96" height="18" rx="9" fill="white" opacity="0.8"/>

    <!-- Package on robot -->
    <rect x="282" y="80" width="68" height="40" rx="6" fill="#DBEAFE"/>
    <line x1="316" y1="80" x2="316" y2="120" stroke="#3B82F6" stroke-width="3"/>
    <line x1="282" y1="100" x2="350" y2="100" stroke="#3B82F6" stroke-width="3"/>
  </g>
</svg>`;
};

// Badge icon (small, simplified — just the robot)
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="48" fill="#3B82F6"/>
  <rect x="32" y="48" width="16" height="24" rx="3" fill="white" opacity="0.9"/>
  <rect x="48" y="36" width="16" height="36" rx="3" fill="white" opacity="0.85"/>
  <rect x="28" y="40" width="20" height="16" rx="4" fill="white"/>
  <rect x="30" y="42" width="16" height="9" rx="2" fill="#1D4ED8"/>
  <circle cx="35" cy="46" r="2" fill="white"/>
  <circle cx="41" cy="46" r="2" fill="white"/>
</svg>`;

// ── Sizes to generate ─────────────────────────────────────────────────────
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

console.log("🤖 Generating Stair-Doc PWA icons...");

for (const size of sizes) {
  const svg = Buffer.from(iconSvg(size));
  const outFile = join(OUT, `icon-${size}x${size}.png`);
  await sharp(svg).png().toFile(outFile);
  console.log(`  ✓ icon-${size}x${size}.png`);
}

// Maskable icon (full-bleed, no rounded corners — padding handled by safe-area spec)
const maskableSvg = Buffer.from(iconSvg(512).replace(/rx="92"/, 'rx="0"'));
await sharp(maskableSvg).png().toFile(join(OUT, "maskable-icon.png"));
console.log("  ✓ maskable-icon.png");

// Apple touch icon (180x180)
const appleSvg = Buffer.from(iconSvg(180));
await sharp(appleSvg).png().toFile(join(__dirname, "../public/apple-touch-icon.png"));
console.log("  ✓ apple-touch-icon.png");

// Badge icon (96x96 monochrome circle)
await sharp(Buffer.from(badgeSvg)).png().toFile(join(OUT, "badge.png"));
console.log("  ✓ badge.png");

// Shortcut icons for Android
await sharp(Buffer.from(iconSvg(96))).png().toFile(join(OUT, "shortcut-deliveries.png"));
await sharp(Buffer.from(iconSvg(96))).png().toFile(join(OUT, "shortcut-robot.png"));
console.log("  ✓ shortcut icons");

console.log("\n✅ All icons generated in public/icons/");
