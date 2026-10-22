import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const outdir = mkdtempSync(join(tmpdir(), 'cityu-unit-'));

await esbuild.build({
  entryPoints: [
    'tests/aims-workflows.test.ts',
    'tests/aimsTab.test.ts',
    'tests/guideSession.test.ts',
    'tests/planner.test.ts',
    'tests/privacyShield.test.ts',
    'tests/spotlightGeometry.test.ts',
    'tests/source-guards.test.ts'
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir,
  external: ['node:test', 'node:assert', 'node:assert/strict', 'node:fs', 'node:path']
});

const files = [];
const collect = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collect(path);
    } else if (entry.name.endsWith('.test.js')) {
      files.push(path);
    }
  }
};
collect(outdir);
if (!files.length) {
  console.error(`No unit tests were bundled into ${outdir}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
