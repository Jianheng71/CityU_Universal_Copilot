import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

type Step = {
  stepId: number;
  guideText: { en: string; zh: string };
  targetSelector: string;
};

type Workflow = {
  title: { en: string; zh: string };
  steps: Step[];
};

const registry = JSON.parse(readFileSync(join(process.cwd(), 'registry/aims-workflows.json'), 'utf8')) as {
  workflows: Record<string, Workflow>;
};

function workflow(key: string): Workflow {
  const found = registry.workflows[key];
  assert.ok(found, key);
  return found;
}

function selector(key: string, stepId: number): string {
  const step = workflow(key).steps.find((item) => item.stepId === stepId);
  assert.ok(step, `${key} step ${stepId}`);
  return step.targetSelector;
}

function rawIncludesRetiredMenu(steps: Step[]): boolean {
  return JSON.stringify(steps).includes('bmenu.P_RegMenu');
}

test('weekly schedule uses the live Course Registration path', () => {
  assert.equal(selector('aims-weekly-schedule', 1), "a[href*='amenu.P_RegMnu']");
  assert.equal(selector('aims-weekly-schedule', 2), "a[href*='hwsstmtbl_matrix_cityu.Show']");
});

test('degree works, paper add, student services, and CRESDA use live menu hrefs', () => {
  assert.equal(selector('aims-degree-works', 1), "a[href*='amenu_cityu.P_StudyPlan']");
  assert.equal(selector('aims-degree-works', 2), 'a[href*="DW_Student.P_SignOn"]');
  assert.equal(selector('aims-paper-add', 1), "a[href*='amenu.P_RegMnu']");
  assert.equal(selector('aims-paper-add', 2), "a[href*='hwscregapp_cityu.p_get_maintain_crsereg']");
  assert.equal(selector('aims-student-helper-job-search', 1), "a[href*='amenu_cityu.P_StudServMnu']");
  assert.equal(selector('aims-student-helper-job-search', 2), "a[href*='hwosstudmgt_cityu.P_Main']");
  assert.equal(workflow('aims-student-helper-job-search').steps.length, 2);
  assert.match(workflow('aims-student-helper-job-search').steps[1].guideText.en, /Job Search/);
  assert.equal(selector('aims-cresda-search', 1), "a[href*='amenu_cityu.P_StudServMnu']");
  assert.equal(selector('aims-cresda-search', 2), "a[href*='amenu_cityu.P_Cresda_Stud']");
  assert.match(workflow('aims-cresda-search').title.en, /CRESDA/);
});

test('web add/drop follows registration, submenu, term, then add or drop', () => {
  const steps = workflow('aims-web-add-drop').steps;
  assert.deepEqual(steps.map((step) => step.targetSelector), [
    "a[href*='amenu.P_RegMnu']",
    "a[href*='amenu_cityu.P_CrseRegMnu']",
    "a[href*='bwskflib.P_SelDefTerm']",
    "a[href*='bwskfreg.P_AltPin']"
  ]);
  assert.match(steps[2].guideText.en, /Select Term/);
  assert.equal(steps.some((step) => step.targetSelector.includes('Submit')), false);
});

test('retired top-menu procedure names and the unverified job tab are gone', () => {
  const raw = JSON.stringify(registry);
  assert.equal(raw.includes('bmenu.P_RegMenu'), false);
  assert.equal(raw.includes('bmenu.P_StudyPlan'), false);
  assert.equal(raw.includes('bmenu.P_StuAdmin'), false);
  assert.equal(raw.includes('job_search_tab'), false);
  assert.equal(raw.includes('bwskfshd.P_ViewWeeklySchedule'), false);
});

test('master schedule still uses Find a Page and has no retired registration menu selector', () => {
  const steps = workflow('aims-master-schedule').steps;
  assert.equal(steps[0].targetSelector, 'input#p_table');
  assert.equal(steps[1].targetSelector, "input[type='submit'][value='Go']");
  assert.equal(rawIncludesRetiredMenu(steps), false);
});
