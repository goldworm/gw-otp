/**
 * Package the built `dist/` directory into a zip for Chrome Web Store upload.
 *
 * Prerequisite: run `pnpm build` first so `dist/` is up to date.
 * Output: `gw-otp-<version>.zip` in the project root.
 *
 * Usage: node scripts/package.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

if (!existsSync(distDir)) {
  console.error('dist/ not found. Run `pnpm build` first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const zipName = `gw-otp-${pkg.version}.zip`;
const zipPath = join(root, zipName);

// Remove any previous archive with the same name
if (existsSync(zipPath)) {
  rmSync(zipPath);
}

// Zip the contents of dist/ (not the dist folder itself) so the manifest is at
// the archive root, as required by the Chrome Web Store.
execFileSync('zip', ['-r', '-X', zipPath, '.'], {
  cwd: distDir,
  stdio: 'inherit',
});

console.log(`\nCreated ${zipName}`);
