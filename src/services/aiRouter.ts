import { findWorkflowByIntent, type WorkflowConfig } from './registryLoader';

export type AIProvider = 'deepseek' | 'gemini';

export type AISettings = {
  provider: AIProvider;
  deepseekApiKey: string;
  geminiApiKey: string;
};

const STORAGE_KEY = 'cityu-universal-sinno-ai-settings';

export async function getAISettings(): Promise<AISettings> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const existing = await chrome.storage.sync.get(STORAGE_KEY);
    const stored = (existing[STORAGE_KEY] ?? {}) as Partial<AISettings>;
    return {
      provider: stored.provider === 'gemini' ? 'gemini' : 'deepseek',
      deepseekApiKey: stored.deepseekApiKey ?? '',
      geminiApiKey: stored.geminiApiKey ?? ''
    };
  }

  return {
    provider: 'deepseek',
    deepseekApiKey: '',
    geminiApiKey: ''
  };
}

export async function setAISettings(next: Partial<AISettings>): Promise<void> {
  const current = await getAISettings();
  const merged = { ...current, ...next };

  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
    return;
  }
}

export async function resolveWorkflowIntent(intent: string): Promise<WorkflowConfig | null> {
  const workflow = await findWorkflowByIntent(intent);
  if (workflow) {
    return workflow;
  }

  const docsFallback = {
    workflowKey: 'docs-fallback',
    title: { en: 'Academic resources help', zh: '学术资源帮助' },
    category: 'docs',
    steps: [{
      stepId: 1,
      guideText: {
        en: 'Use the CityU academic resources portal for system guidance.',
        zh: '请使用城大学术资源门户获取系统操作说明。'
      },
      targetSelector: 'body'
    }]
  } satisfies WorkflowConfig;

  return docsFallback;
}

export async function routeModelRequest(intent: string): Promise<{ provider: AIProvider; workflow: WorkflowConfig | null; response: string }> {
  const settings = await getAISettings();
  const workflow = await resolveWorkflowIntent(intent);

  if (settings.provider === 'gemini') {
    return {
      provider: 'gemini',
      workflow,
      response: `Gemini fallback route: ${workflow?.title.en ?? 'General CityU guidance'} is selected for: ${intent}`
    };
  }

  return {
    provider: 'deepseek',
    workflow,
    response: `DeepSeek route: ${workflow?.title.en ?? 'General CityU guidance'} is selected for: ${intent}`
  };
}
