import { findWorkflowByIntent, type WorkflowConfig } from './registryLoader';

export type AIProvider = 'deepseek' | 'gemini';

export type AISettings = {
  provider: AIProvider;
};

const STORAGE_KEY = 'cityu-universal-sinno-ai-settings';
const DEFAULT_PROXY_URL =
  process.env.PLASMO_PUBLIC_AI_PROXY_URL ?? 'https://cityu-universal-sinno-ai.vercel.app/api/ai';

function getStorageFallback(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {} as Record<string, string>;
  }
}

export async function getAISettings(): Promise<AISettings> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const existing = await chrome.storage.sync.get(STORAGE_KEY);
    const stored = (existing[STORAGE_KEY] ?? {}) as Partial<AISettings>;
    return {
      provider: stored.provider === 'gemini' ? 'gemini' : 'deepseek'
    };
  }

  const fallback = getStorageFallback();
  return {
    provider: fallback.provider === 'gemini' ? 'gemini' : 'deepseek'
  };
}

export async function setAISettings(next: Partial<AISettings>): Promise<void> {
  const current = await getAISettings();
  const merged = { ...current, ...next };

  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
    return;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
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

  try {
    const response = await fetch(DEFAULT_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: settings.provider,
        intent,
        workflow: workflow ? {
          workflowKey: workflow.workflowKey,
          title: workflow.title,
          category: workflow.category,
          steps: workflow.steps
        } : null
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        provider: settings.provider,
        workflow,
        response: `AI proxy error (${response.status}): ${text}`
      };
    }

    const data = (await response.json()) as { answer?: string; provider?: AIProvider };
    return {
      provider: (data.provider ?? settings.provider) as AIProvider,
      workflow,
      response: data.answer ?? 'No answer returned by the AI proxy.'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    return {
      provider: settings.provider,
      workflow,
      response: `Unable to reach AI proxy: ${message}. Check that the AI service has been deployed and the extension is configured with its URL.`
    };
  }
}
