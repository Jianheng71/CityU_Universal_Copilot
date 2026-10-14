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

export async function loadWorkflowRegistry(): Promise<WorkflowCollection | null> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get('aims-workflows');
      const stored = result['aims-workflows'];
      if (stored && typeof stored === 'object' && 'workflows' in stored) {
        return stored as WorkflowCollection;
      }
    }

    const response = await fetch(FALLBACK_RAW_URL, { method: 'GET' });
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
    if (haystack.includes(normalizedIntent) || normalizedIntent.includes(workflow.workflowKey)) {
      return workflow;
    }
  }

  return null;
}
