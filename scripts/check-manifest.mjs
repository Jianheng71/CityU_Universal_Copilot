import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const buildDir = join(process.cwd(), 'build/chrome-mv3-prod');
const manifest = JSON.parse(readFileSync(join(buildDir, 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts ?? [];
const aims = scripts.find((script) => (script.matches ?? []).includes('https://*.cityu.edu.hk/*'));

if (!aims) {
  console.error('CityU content script is missing from the MV3 manifest.', JSON.stringify(scripts, null, 2));
  process.exit(1);
}

if (aims.all_frames !== true) {
  console.error('CityU content script must run in all frames.', aims);
  process.exit(1);
}

if (!aims.js?.length) {
  console.error('CityU content script has no JavaScript bundle.', aims);
  process.exit(1);
}

const bundled = aims.js.map((file) => readFileSync(join(buildDir, file), 'utf8')).join('\n');
for (const token of ['show-guide', 'cityu-hole', 'clear-guide']) {
  if (!bundled.includes(token)) {
    console.error(`Packaged content script is missing ${token}.`);
    process.exit(1);
  }
}

const permissions = new Set(manifest.permissions ?? []);
for (const permission of ['scripting', 'storage']) {
  if (!permissions.has(permission)) {
    console.error(`Manifest is missing the ${permission} permission.`);
    process.exit(1);
  }
}

const hosts = manifest.host_permissions ?? [];
if (!hosts.includes('https://*.cityu.edu.hk/*')) {
  console.error('Manifest is missing the CityU host permission.', hosts);
  process.exit(1);
}

console.log(JSON.stringify({
  version: manifest.version,
  matches: aims.matches,
  all_frames: aims.all_frames,
  match_about_blank: aims.match_about_blank ?? false,
  run_at: aims.run_at,
  js: aims.js
}, null, 2));
