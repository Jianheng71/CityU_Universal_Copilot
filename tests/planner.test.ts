import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planGuide } from '../src/guide/planner';
import { interpretGuideResult } from '../src/guide/protocol';
import { bundledWorkflowRegistry } from '../src/services/registryLoader';

const samples: Record<string, string[]> = {
  'aims-weekly-schedule': ['How do I view my weekly schedule?', '如何查看每周课表？', 'show my timetable'],
  'aims-degree-works': ['How do I check my academic progress?', '如何查询学业进度？', 'open degreeworks'],
  'aims-master-schedule': ['Where is the master class schedule?', '查询全校开课计划'],
  'aims-web-add-drop': ['How do I add or drop a class?', '我要加退选'],
  'aims-paper-add': ['How do I paper add a non-web course?', '纸选课程怎么申请'],
  'aims-cresda-search': ['Where is CRESDA?', '课外活动资料在哪'],
  'aims-student-helper-job-search': ['How do I find a student helper job?', '校内实习怎么找']
};

test('every preset workflow is selected for its questions', () => {
  for (const [workflowKey, questions] of Object.entries(samples)) {
    for (const question of questions) {
      const plan = planGuide(question, bundledWorkflowRegistry);
      assert.ok(plan, question);
      assert.equal(plan.workflowKey, workflowKey, question);
      assert.equal(plan.steps.some((step) => !step.targetSelector || step.targetSelector === 'body'), false, question);
    }
  }
});

test('preset plans keep the verified menu selectors', () => {
  const weekly = planGuide('如何查看每周课表？', bundledWorkflowRegistry);
  assert.deepEqual(weekly?.steps.map((step) => step.targetSelector), [
    "a[href*='amenu.P_RegMnu']",
    "a[href*='hwsstmtbl_matrix_cityu.Show']"
  ]);

  const addDrop = planGuide('web add/drop', bundledWorkflowRegistry);
  assert.deepEqual(addDrop?.steps.map((step) => step.targetSelector), [
    "a[href*='amenu.P_RegMnu']",
    "a[href*='amenu_cityu.P_CrseRegMnu']",
    "a[href*='bwskflib.P_SelDefTerm']",
    "a[href*='bwskfreg.P_AltPin']"
  ]);
});

test('a question with no verified path still gets a Find a Page guide', () => {
  for (const question of ['where is the tuition invoice?', 'hi', '图书馆打印机在哪']) {
    const plan = planGuide(question, bundledWorkflowRegistry);
    assert.ok(plan, question);
    assert.equal(plan.workflowKey, 'aims-find-page', question);
    assert.deepEqual(plan.steps.map((step) => step.targetSelector), [
      'input#p_table',
      "input[type='submit'][value='Go']"
    ]);
    assert.match(plan.steps[0].guideText.en, /Find a Page/);
    assert.match(plan.steps[0].guideText.zh, /Find a Page/);
  }
  assert.equal(planGuide('   ', bundledWorkflowRegistry), null);
});

test('longer task names beat shorter overlapping words', () => {
  assert.equal(planGuide('master class schedule', bundledWorkflowRegistry)?.workflowKey, 'aims-master-schedule');
  assert.equal(planGuide('paper add a non-web course', bundledWorkflowRegistry)?.workflowKey, 'aims-paper-add');
  assert.equal(planGuide('weekly schedule', bundledWorkflowRegistry)?.workflowKey, 'aims-weekly-schedule');
});

test('guide results tell the panel whether the spotlight is showing, waiting, or done', () => {
  assert.equal(interpretGuideResult({ ok: true, code: 'ok', phase: 'showing' }), 'highlighted');
  assert.equal(interpretGuideResult({ ok: true, code: 'ok', phase: 'finished' }), 'finished');
  assert.equal(interpretGuideResult({ ok: false, code: 'element-not-found' }), 'waiting');
  assert.equal(interpretGuideResult({ ok: false, code: 'element-not-visible' }), 'waiting');
  assert.equal(interpretGuideResult({ ok: false, code: 'no-tab' }), 'no-tab');
  assert.equal(interpretGuideResult({ ok: false, code: 'highlight-failed' }), 'failed');
});
