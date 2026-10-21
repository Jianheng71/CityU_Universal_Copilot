import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  completeGuideStep,
  createGuideSession,
  currentGuideStep,
  pendingCompletionAdvances,
  pickSpotlightWinner,
  readStoredSessions,
  sanitizeGuideSteps
} from '../src/guide/session';

const weeklySteps = sanitizeGuideSteps([
  {
    stepId: 1,
    targetSelector: "a[href*='amenu.P_RegMnu']",
    guideText: 'Click Course Registration'
  },
  {
    stepId: 2,
    targetSelector: "a[href*='hwsstmtbl_matrix_cityu.Show']",
    guideText: 'Click Weekly Schedule'
  },
  {
    stepId: 3,
    targetSelector: 'body',
    guideText: 'ignored'
  }
]);

test('weekly schedule session advances one click at a time and then finishes', () => {
  const created = createGuideSession({ tabId: 4, workflowKey: 'aims-weekly-schedule', steps: weeklySteps, now: 10 });
  assert.ok(created);
  assert.equal(created.steps.length, 2);
  assert.equal(currentGuideStep(created)?.targetSelector, "a[href*='amenu.P_RegMnu']");

  const stale = completeGuideStep(created, "a[href*='hwsstmtbl_matrix_cityu.Show']", 11);
  assert.equal(stale.status, 'ignored');
  assert.equal(stale.session.stepIndex, 0);
  assert.equal(stale.session.generation, 1);

  const advanced = completeGuideStep(created, "a[href*='amenu.P_RegMnu']", 12);
  assert.equal(advanced.status, 'advanced');
  assert.equal(advanced.session.stepIndex, 1);
  assert.equal(advanced.session.generation, 2);
  assert.equal(currentGuideStep(advanced.session)?.targetSelector, "a[href*='hwsstmtbl_matrix_cityu.Show']");

  const repeated = completeGuideStep(advanced.session, "a[href*='amenu.P_RegMnu']", 13);
  assert.equal(repeated.status, 'ignored');
  assert.equal(repeated.session.generation, 2);

  const finished = completeGuideStep(advanced.session, "a[href*='hwsstmtbl_matrix_cityu.Show']", 14);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.session.stepIndex, 2);
  assert.equal(currentGuideStep(finished.session), null);
});

test('a recorded click still advances the guide after the frame reloads', () => {
  const session = createGuideSession({ tabId: 4, workflowKey: 'aims-weekly-schedule', steps: weeklySteps, now: 20 });
  assert.ok(session);
  assert.equal(
    pendingCompletionAdvances(session, { selector: "a[href*='amenu.P_RegMnu']", at: 20_500 }, 21_000),
    true
  );
  assert.equal(
    pendingCompletionAdvances(session, { selector: "a[href*='hwsstmtbl_matrix_cityu.Show']", at: 20_500 }, 21_000),
    false
  );
  assert.equal(
    pendingCompletionAdvances(session, { selector: "a[href*='amenu.P_RegMnu']", at: 1 }, 21_000),
    false
  );
  assert.equal(
    pendingCompletionAdvances(session, { selector: "a[href*='amenu.P_RegMnu']", at: 10 }, 800),
    false
  );
});

test('stored sessions survive a service worker restart', () => {
  const session = createGuideSession({ tabId: 9, workflowKey: 'aims-web-add-drop', steps: weeklySteps, now: 5 });
  assert.ok(session);
  const restored = readStoredSessions({
    '9': session,
    bad: { tabId: 'nope', steps: weeklySteps, stepIndex: 0, generation: 1 }
  });
  assert.equal(restored.length, 1);
  assert.equal(restored[0]?.tabId, 9);
  assert.equal(restored[0]?.stepIndex, 0);
  assert.equal(restored[0]?.steps[1]?.targetSelector, "a[href*='hwsstmtbl_matrix_cityu.Show']");
});

test('a visible frame wins over a later hidden frame', () => {
  const winner = pickSpotlightWinner([
    { ok: false },
    { ok: true, visible: false },
    { ok: true, visible: true }
  ]);
  assert.equal(winner, 2);
  assert.equal(pickSpotlightWinner([{ ok: true, visible: true }, { ok: true, visible: true }]), 0);
  assert.equal(pickSpotlightWinner([{ ok: true, visible: false }]), 0);
  assert.equal(pickSpotlightWinner([{ ok: false }]), -1);
});
