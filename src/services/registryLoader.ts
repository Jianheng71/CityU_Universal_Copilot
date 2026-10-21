export type BilingualText = {
  en: string;
  zh: string;
};

export type WorkflowStep = {
  stepId: number;
  guideText: BilingualText;
  targetSelector: string;
};

export type WorkflowConfig = {
  workflowKey: string;
  title: BilingualText;
  category: string;
  steps: WorkflowStep[];
};

export type WorkflowCollection = {
  version: string;
  lastUpdated: string;
  workflows: Record<string, WorkflowConfig>;
};

const FALLBACK_RAW_URL = 'https://raw.githubusercontent.com/Jianheng71/CityU_Universal_Copilot/main/registry/aims-workflows.json';
const CITYU_DOCS_URL = 'https://cityu.netlify.app/docs/welcome/academicresources/it/print';

const normalize = (value: string): string => value.trim().toLowerCase();

const intentAliases: Record<string, string[]> = {
  'aims-weekly-schedule': ['weekly schedule', 'timetable', '课表', '每周课表', '周课表', '查看课表'],
  'aims-degree-works': ['degreeworks', 'academic progress', '学业进度', '毕业要求', '学分进度'],
  'aims-master-schedule': ['master class schedule', 'master schedule', '全校开课', '开课计划'],
  'aims-web-add-drop': ['web add drop', 'add drop', '加退选', '选课', '加课', '退课'],
  'aims-paper-add': ['paper add', 'non-web course', '纸选', '纸选课程'],
  'aims-cresda-search': ['cresda', 'activity search', '课外活动'],
  'aims-student-helper-job-search': ['student helper', 'internship', '学生助理', '校内实习']
};

async function readCachedRegistry(): Promise<WorkflowCollection | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  const result = await chrome.storage.local.get('aims-workflows');
  const stored = result['aims-workflows'];
  if (stored && typeof stored === 'object' && 'workflows' in stored) {
    return stored as WorkflowCollection;
  }

  return null;
}

export async function loadWorkflowRegistry(): Promise<WorkflowCollection | null> {
  try {
    const response = await fetch(FALLBACK_RAW_URL, { method: 'GET', cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Registry fetch failed');
    }

    const parsed = (await response.json()) as WorkflowCollection;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ 'aims-workflows': parsed });
    }
    return parsed;
  } catch {
    try {
      const cached = await readCachedRegistry();
      if (cached) {
        return cached;
      }
    } catch {
      // Cache is only a fallback when the published registry cannot be fetched.
    }

    try {
      const docsResponse = await fetch(CITYU_DOCS_URL, { method: 'GET' });
      if (!docsResponse.ok) {
        return null;
      }
      const docsHtml = await docsResponse.text();
      return {
        version: '1.0.0',
        lastUpdated: new Date().toISOString().slice(0, 10),
        workflows: {
          'cityu-docs-fallback': {
            workflowKey: 'cityu-docs-fallback',
            title: { en: 'CityU Academic Resources', zh: '城大学术资源' },
            category: 'docs',
            steps: [{
              stepId: 1,
              guideText: {
                en: 'Review the CityU IT and academic resources guide',
                zh: '请参考城大教学与 IT 资源说明页'
              },
              targetSelector: 'body',
            }]
          }
        }
      };
    } catch {
      return null;
    }
  }
}

export async function findWorkflowByIntent(intent: string): Promise<WorkflowConfig | null> {
  const registry = await loadWorkflowRegistry();
  if (!registry) {
    return null;
  }

  const normalizedIntent = normalize(intent);
  const candidates = Object.values(registry.workflows);

  for (const workflow of candidates) {
    const haystack = normalize(`${workflow.workflowKey} ${workflow.title.en} ${workflow.title.zh} ${workflow.category} ${workflow.steps.map((step) => `${step.guideText.en} ${step.guideText.zh}`).join(' ')}`);
    const aliases = intentAliases[workflow.workflowKey] ?? [];
    if (
      haystack.includes(normalizedIntent) ||
      normalizedIntent.includes(workflow.workflowKey) ||
      aliases.some((alias) => normalizedIntent.includes(normalize(alias)))
    ) {
      return workflow;
    }
  }

  return null;
}
