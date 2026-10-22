import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyNavigation,
  arrivalTokenFromSelector,
  completeGuideStep,
  createGuideSession,
  currentGuideStep,
  pendingCompletionAdvances,
  pickSpotlightWinner,
  readStoredSessions,
  sanitizeGuideSteps
} from '../src/guide/session';

const mainMenu = 'https://banweb.cityu.edu.hk/pls/PROD/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu';
const registrationMenu = 'https://banweb.cityu.edu.hk/pls/PROD/twbkwbis.P_GenMenu?name=amenu.P_RegMnu';
const weeklyPage = 'https://banweb.cityu.edu.hk/pls/PROD/hwsstmtbl_matrix_cityu.Show';
const selectTermPage = 'https://banweb.cityu.edu.hk/pls/PROD/bwskflib.P_SelDefTerm';
const addDropPage = 'https://banweb.cityu.edu.hk/pls/PROD/bwskfreg.P_AltPin';
const degreePage = 'https://banweb.cityu.edu.hk/pls/PROD/DW_Student.P_SignOn';

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

  const awaiting = completeGuideStep(
    advanced.session,
    "a[href*='hwsstmtbl_matrix_cityu.Show']",
    14,
    registrationMenu
  );
  assert.equal(awaiting.status, 'awaiting-destination');
  assert.equal(awaiting.session.awaitingDestination, true);
  assert.equal(awaiting.session.stepIndex, 1);
  assert.equal(currentGuideStep(awaiting.session)?.targetSelector, "a[href*='hwsstmtbl_matrix_cityu.Show']");

  const repeatedLast = completeGuideStep(awaiting.session, "a[href*='hwsstmtbl_matrix_cityu.Show']", 15, registrationMenu);
  assert.equal(repeatedLast.status, 'awaiting-destination');
  assert.equal(repeatedLast.session.generation, awaiting.session.generation);

  const stillOnMenu = applyNavigation(awaiting.session, [registrationMenu], registrationMenu, 16);
  assert.equal(stillOnMenu.status, 'unchanged');
  assert.equal(currentGuideStep(stillOnMenu.session)?.targetSelector, "a[href*='hwsstmtbl_matrix_cityu.Show']");

  const finished = applyNavigation(awaiting.session, [weeklyPage], weeklyPage, 17);
  assert.equal(finished.status, 'finished');
  assert.equal(currentGuideStep(finished.session), null);
});

test('weekly schedule follows the open page when the click message is lost', () => {
  const created = createGuideSession({ tabId: 4, workflowKey: 'aims-weekly-schedule', steps: weeklySteps, now: 30 });
  assert.ok(created);
  assert.equal(arrivalTokenFromSelector(weeklySteps[0].targetSelector), 'amenu.P_RegMnu');
  assert.equal(arrivalTokenFromSelector(weeklySteps[1].targetSelector), 'hwsstmtbl_matrix_cityu.Show');
  assert.equal(arrivalTokenFromSelector('a[href*="P_"]'), null);

  const stayed = applyNavigation(created, [mainMenu], mainMenu, 31);
  assert.equal(stayed.status, 'unchanged');
  assert.equal(stayed.session.stepIndex, 0);

  const registration = applyNavigation(created, [registrationMenu], registrationMenu, 32);
  assert.equal(registration.status, 'advanced');
  assert.equal(registration.session.stepIndex, 1);
  assert.equal(currentGuideStep(registration.session)?.targetSelector, "a[href*='hwsstmtbl_matrix_cityu.Show']");

  const unrelated = applyNavigation(registration.session, [degreePage], degreePage, 33);
  assert.equal(unrelated.status, 'unchanged');
  assert.equal(unrelated.session.stepIndex, 1);

  const backward = applyNavigation(registration.session, [mainMenu], mainMenu, 34);
  assert.equal(backward.status, 'unchanged');
  assert.equal(backward.session.stepIndex, 1);

  const done = applyNavigation(created, [registrationMenu, weeklyPage], weeklyPage, 35);
  assert.equal(done.status, 'finished');
});

test('web add/drop skips to the furthest reached page and finishes only on the destination', () => {
  const steps = sanitizeGuideSteps([
    { stepId: 1, targetSelector: "a[href*='amenu.P_RegMnu']", guideText: 'Course Registration' },
    { stepId: 2, targetSelector: "a[href*='amenu_cityu.P_CrseRegMnu']", guideText: 'Web Add/Drop' },
    { stepId: 3, targetSelector: "a[href*='bwskflib.P_SelDefTerm']", guideText: 'Select Term' },
    { stepId: 4, targetSelector: "a[href*='bwskfreg.P_AltPin']", guideText: 'Add or Drop Classes' }
  ]);
  const created = createGuideSession({ tabId: 4, workflowKey: 'aims-web-add-drop', steps, now: 40 });
  assert.ok(created);

  const selectTerm = applyNavigation(created, [selectTermPage], selectTermPage, 41);
  assert.equal(selectTerm.status, 'advanced');
  assert.equal(selectTerm.session.stepIndex, 3);
  assert.equal(currentGuideStep(selectTerm.session)?.targetSelector, "a[href*='bwskfreg.P_AltPin']");

  const done = applyNavigation(selectTerm.session, [addDropPage], addDropPage, 42);
  assert.equal(done.status, 'finished');

  const alreadyThere = applyNavigation(created, [mainMenu, addDropPage], addDropPage, 43);
  assert.equal(alreadyThere.status, 'finished');
});

test('a question without a preset finishes when Find a Page navigates away', () => {
  const steps = sanitizeGuideSteps([
    { stepId: 1, targetSelector: 'input#p_table', guideText: 'Type keywords' },
    { stepId: 2, targetSelector: "input[type='submit'][value='Go']", guideText: 'Click Go' }
  ]);
  const created = createGuideSession({ tabId: 4, workflowKey: 'aims-find-page', steps, now: 50 });
  assert.ok(created);
  assert.equal(created.steps[0]?.arrivalToken, null);
  assert.equal(created.steps[1]?.arrivalToken, null);

  const typed = completeGuideStep(created, 'input#p_table', 51, mainMenu);
  assert.equal(typed.status, 'advanced');
  assert.equal(typed.session.departureUrl, mainMenu);
  assert.equal(currentGuideStep(typed.session)?.targetSelector, "input[type='submit'][value='Go']");

  const stillTyping = applyNavigation(typed.session, [mainMenu], mainMenu, 52);
  assert.equal(stillTyping.status, 'unchanged');

  const otherFrameOnly = applyNavigation(typed.session, [mainMenu, degreePage], degreePage, 53);
  assert.equal(otherFrameOnly.status, 'unchanged');

  const searched = applyNavigation(typed.session, [degreePage], degreePage, 54);
  assert.equal(searched.status, 'finished');
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
