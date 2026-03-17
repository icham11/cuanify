/**
 * Generate PWA icons as simple SVG-based PNGs.
 * Run: node scripts/generate-icons.mjs
 *
 * Since we don't want to install sharp/canvas, we generate SVG placeholders.
 * Replace these with your actual logo PNGs later.
 */

import { writeFileSync } from "fs";

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function generateSVG(size) {
  const fontSize = Math.round(size * 0.35);
  const subFontSize = Math.round(size * 0.1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4f46e5"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="url(#bg)"/>
  <text x="50%" y="45%" text-anchor="middle" dominant-baseline="central"
        font-family="system-ui, sans-serif" font-weight="800"
        font-size="${fontSize}" fill="white">U</text>
  <text x="50%" y="72%" text-anchor="middle" dominant-baseline="central"
        font-family="system-ui, sans-serif" font-weight="600"
        font-size="${subFontSize}" fill="rgba(255,255,255,0.8)">UMKM</text>
</svg>`;
}

for (const size of sizes) {
  const svg = generateSVG(size);
  // Write as SVG (browsers accept SVG icons, and this is a placeholder)
  writeFileSync(`public/icons/icon-${size}x${size}.svg`, svg);
  console.log(`✅ Generated icon-${size}x${size}.svg`);
}

console.log("\n⚠️  These are SVG placeholders. For production, replace with actual PNG files.");
console.log("   You can convert them using: npx svg2png-cli public/icons/*.svg");

