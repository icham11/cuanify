const { writeFileSync } = require('fs');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const fontSize = Math.round(size * 0.35);
  const subFontSize = Math.round(size * 0.1);
  const rx = Math.round(size * 0.18);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#4f46e5"/><stop offset="100%" style="stop-color:#7c3aed"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#bg)"/>
  <text x="50%" y="45%" text-anchor="middle" dominant-baseline="central" font-family="system-ui" font-weight="800" font-size="${fontSize}" fill="white">U</text>
  <text x="50%" y="72%" text-anchor="middle" dominant-baseline="central" font-family="system-ui" font-weight="600" font-size="${subFontSize}" fill="rgba(255,255,255,0.8)">UMKM</text>
</svg>`;
  writeFileSync(`public/icons/icon-${size}x${size}.png`, svg);
  console.log(`Generated icon-${size}x${size}.png`);
}

