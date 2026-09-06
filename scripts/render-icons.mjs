/**
 * Render the master SVG icon into PNG icons at the sizes required by the
 * Chrome extension manifest (16, 48, 128).
 *
 * Usage: node scripts/render-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'public', 'icons');
const svgPath = join(root, 'icons-src', 'icon.svg');
const svg = readFileSync(svgPath);

const sizes = [16, 48, 128];

for (const size of sizes) {
  const out = join(iconsDir, `icon-${size}.png`);
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);
  console.log(`rendered ${out}`);
}
