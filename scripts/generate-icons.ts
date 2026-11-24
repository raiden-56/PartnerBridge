/** Generates PWA icons from the brand mark.  npm run icons */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import path from "node:path";

const mark = (pad: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#172554"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <path d="M136 290 Q256 70 376 290" stroke="#60a5fa" stroke-width="34" fill="none" stroke-linecap="round"/>
    <path d="M96 332 H416" stroke="#ffffff" stroke-width="26" stroke-linecap="round"/>
    <circle cx="136" cy="290" r="46" fill="#ffffff"/>
    <circle cx="376" cy="290" r="46" fill="#2563eb" stroke="#ffffff" stroke-width="22"/>
  </g>
</svg>`;

async function main() {
  const out = path.join(process.cwd(), "public", "icons");
  mkdirSync(out, { recursive: true });
  const jobs: [string, number, number][] = [
    ["icon-192.png", 192, 0],
    ["icon-512.png", 512, 0],
    ["maskable-512.png", 512, 80], // safe zone padding for maskable icons
    ["apple-touch-icon.png", 180, 0],
    ["favicon-32.png", 32, 0],
  ];
  for (const [name, size, pad] of jobs) {
    await sharp(Buffer.from(mark(pad))).resize(size, size).png().toFile(path.join(out, name));
    console.log("✓", name);
  }
}

main();
