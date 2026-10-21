import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clampTooltip, holeBox, isMeasurableBox } from '../src/content/spotlightGeometry';

test('holeBox pads the target and rejects empty boxes', () => {
  assert.deepEqual(holeBox({ left: 10, top: 20, width: 30, height: 40 }, 8), {
    left: 2,
    top: 12,
    width: 46,
    height: 56
  });
  assert.equal(isMeasurableBox({ left: 0, top: 0, width: 0, height: 12 }), false);
  assert.equal(isMeasurableBox({ left: 1, top: 2, width: 3, height: 4 }), true);
});

test('clampTooltip places the bubble to the right when it fits', () => {
  const pos = clampTooltip(
    { left: 100, top: 80, width: 40, height: 20 },
    { width: 800, height: 600 },
    { width: 200, height: 48 }
  );
  assert.deepEqual(pos, { left: 156, top: 80 });
});

test('clampTooltip flips to the left when the right edge would clip', () => {
  const pos = clampTooltip(
    { left: 700, top: 80, width: 40, height: 20 },
    { width: 800, height: 600 },
    { width: 200, height: 48 }
  );
  assert.deepEqual(pos, { left: 484, top: 80 });
});

test('clampTooltip moves below and stays inside a tight viewport', () => {
  const pos = clampTooltip(
    { left: 10, top: 10, width: 30, height: 20 },
    { width: 240, height: 200 },
    { width: 200, height: 48 }
  );
  assert.deepEqual(pos, { left: 12, top: 46 });
});
