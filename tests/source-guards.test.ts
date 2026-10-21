import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const contentDir = join(process.cwd(), 'src/content');

test('AIMS content scripts never read input values or inject HTML', () => {
  const files = readdirSync(contentDir).filter((name) => name.endsWith('.ts'));
  assert.ok(files.length >= 4);

  for (const name of files) {
    const source = readFileSync(join(contentDir, name), 'utf8');
    assert.equal(source.includes('.value'), false, `${name} reads .value`);
    assert.equal(source.includes('innerHTML'), false, `${name} uses innerHTML`);
    assert.equal(source.includes('localStorage.setItem'), false, `${name} stores page data`);
  }
});
