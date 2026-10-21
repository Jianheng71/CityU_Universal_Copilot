import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCityuUrl, pickAimsTabId, type TabCandidate } from '../src/guide/aimsTab';

const cityu = (overrides: TabCandidate): TabCandidate => ({
  id: 1,
  url: 'https://banweb.cityu.edu.hk/pls/PROD/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu',
  active: false,
  lastAccessed: 0,
  windowId: 1,
  ...overrides
});

test('isCityuUrl accepts CityU https hosts only', () => {
  assert.equal(isCityuUrl('https://banweb.cityu.edu.hk/pls/PROD/bwskfshd.P_ViewWeeklySchedule'), true);
  assert.equal(isCityuUrl('https://cityu.edu.hk/'), true);
  assert.equal(isCityuUrl('https://www.cityu.edu.hk/aims'), true);
  assert.equal(isCityuUrl('http://banweb.cityu.edu.hk/pls/PROD'), false);
  assert.equal(isCityuUrl('https://cityu.edu.hk.evil.com/'), false);
  assert.equal(isCityuUrl('https://evilcityu.edu.hk/'), false);
  assert.equal(isCityuUrl('https://notcityu.edu.hk.attacker.com/'), false);
  assert.equal(isCityuUrl(undefined), false);
  assert.equal(isCityuUrl('not a url'), false);
});

test('pickAimsTabId prefers an explicit CityU tab', () => {
  const picked = pickAimsTabId({
    explicitTabId: 7,
    focusedWindowId: 1,
    tabs: [
      cityu({ id: 3, active: true, windowId: 1, lastAccessed: 50 }),
      cityu({ id: 7, active: false, windowId: 2, lastAccessed: 10 })
    ]
  });
  assert.equal(picked, 7);
});

test('pickAimsTabId ignores an explicit non-CityU tab and uses the focused AIMS tab', () => {
  const picked = pickAimsTabId({
    explicitTabId: 9,
    focusedWindowId: 4,
    tabs: [
      { id: 9, url: 'https://example.com/', active: true, windowId: 4, lastAccessed: 100 },
      cityu({ id: 4, active: true, windowId: 4, lastAccessed: 20 }),
      cityu({ id: 5, active: true, windowId: 8, lastAccessed: 90 })
    ]
  });
  assert.equal(picked, 4);
});

test('pickAimsTabId falls back to any active CityU tab, then the most recently used one', () => {
  assert.equal(pickAimsTabId({
    focusedWindowId: 1,
    tabs: [
      cityu({ id: 2, active: false, windowId: 3, lastAccessed: 10 }),
      cityu({ id: 6, active: true, windowId: 3, lastAccessed: 11 })
    ]
  }), 6);

  assert.equal(pickAimsTabId({
    tabs: [
      cityu({ id: 2, active: false, lastAccessed: 10 }),
      cityu({ id: 8, active: false, lastAccessed: 40 })
    ]
  }), 8);
});

test('pickAimsTabId returns null when no CityU tab is open', () => {
  assert.equal(pickAimsTabId({
    explicitTabId: 1,
    tabs: [{ id: 1, url: 'chrome://extensions/', active: true, windowId: 1 }]
  }), null);
});
