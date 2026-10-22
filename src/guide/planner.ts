import type { WorkflowCollection, WorkflowConfig, WorkflowStep } from '../services/registryLoader';

/**
 * Longer aliases win, so "master class schedule" is not swallowed by "schedule".
 * Keep each phrase specific to one AIMS task.
 */
const intentAliases: Record<string, string[]> = {
  'aims-weekly-schedule': [
    'weekly schedule',
    'weekly timetable',
    'my timetable',
    'my schedule',
    'timetable',
    '课表',
    '每周课表',
    '周课表',
    '本周课表',
    '查看课表',
    '课程表',
    '时间表'
  ],
  'aims-degree-works': [
    'degreeworks',
    'degree works',
    'degree audit',
    'academic progress',
    'graduation requirements',
    '学业进度',
    '毕业要求',
    '学分进度',
    '毕业审核'
  ],
  'aims-master-schedule': [
    'master class schedule',
    'master schedule',
    'class search',
    'course catalog',
    '全校开课',
    '开课计划',
    '开课时间',
    '全校课程'
  ],
  'aims-web-add-drop': [
    'web add/drop',
    'web add drop',
    'add or drop',
    'add/drop',
    'add drop',
    '加退选',
    '选课',
    '加课',
    '退课',
    '加选',
    '退选'
  ],
  'aims-paper-add': [
    'paper-add',
    'paper add',
    'non-web-enabled',
    'non-web course',
    'non web course',
    '纸选课程',
    '纸选'
  ],
  'aims-cresda-search': [
    'student development activities',
    'cresda',
    'activity search',
    '课外活动',
    '活动资料库'
  ],
  'aims-student-helper-job-search': [
    'student helper',
    'campus internship',
    'internship',
    'job search',
    '学生助理',
    '学生帮手',
    '校内实习',
    '校内工'
  ]
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clipPhrase(intent: string): string {
  const compact = intent.replace(/\s+/g, ' ').trim();
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
}

function genericFindPageGuide(intent: string): WorkflowConfig {
  const phrase = clipPhrase(intent);
  const steps: WorkflowStep[] = [
    {
      stepId: 1,
      targetSelector: 'input#p_table',
      guideText: {
        en: `Type keywords for "${phrase}" into Find a Page, then press Enter`,
        zh: `在 Find a Page 输入与「${phrase}」相关的关键词，然后按 Enter`
      }
    },
    {
      stepId: 2,
      targetSelector: "input[type='submit'][value='Go']",
      guideText: {
        en: 'Click Go. This guide finishes when the next AIMS page opens.',
        zh: '点击 Go。打开下一个 AIMS 页面后，这段引导结束。'
      }
    }
  ];
  return {
    workflowKey: 'aims-find-page',
    title: { en: 'Find an AIMS page', zh: '在 AIMS 中查找页面' },
    category: 'search',
    steps
  };
}

function presetScore(intent: string, workflow: WorkflowConfig): number {
  const aliases = [
    ...(intentAliases[workflow.workflowKey] ?? []),
    workflow.title.en,
    workflow.title.zh,
    workflow.workflowKey
  ];
  let score = 0;
  for (const alias of aliases) {
    const needle = normalize(alias);
    if (needle.length < 2) {
      continue;
    }
    if (intent.includes(needle)) {
      score = Math.max(score, needle.length);
    }
  }
  return score;
}

/**
 * Every non-empty question gets a guide. Known AIMS tasks use their menu path.
 * Anything else is guided through Find a Page, which is the on-screen control
 * that can reach a page we do not have a verified menu path for.
 */
export function planGuide(intent: string, registry: WorkflowCollection): WorkflowConfig | null {
  const normalized = normalize(intent);
  if (!normalized) {
    return null;
  }

  let best: { workflow: WorkflowConfig; score: number } | null = null;
  for (const workflow of Object.values(registry.workflows)) {
    const score = presetScore(normalized, workflow);
    if (score > 0 && (!best || score > best.score)) {
      best = { workflow, score };
    }
  }
  if (best) {
    return best.workflow;
  }
  return genericFindPageGuide(intent);
}
