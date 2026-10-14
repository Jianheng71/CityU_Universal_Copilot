import { findWorkflowByIntent, type WorkflowConfig } from './registryLoader';

export type AIProvider = 'deepseek' | 'gemini';

export type AISettings = {
  provider: AIProvider;
  deepseekApiKey: string;
  geminiApiKey: string;
};

const STORAGE_KEY = 'cityu-universal-sinno-ai-settings';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';

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

function buildSystemPrompt(workflow: WorkflowConfig | null): string {
  const workflowSummary = workflow
    ? `Workflow: ${workflow.title.en}. Category: ${workflow.category}. Steps: ${workflow.steps.map((step) => `${step.stepId}. ${step.guideText.en}`).join(' ')}`
    : 'No exact workflow match. Offer general guidance for CityU AIMS and link the user to the CityU academic resources portal.';

  return `You are CityU Universal Sinno, a privacy-first guide for CityU AIMS and academic systems. Deliver concise, step-by-step, bilingual-aware help. ${workflowSummary}. Do not ask for or read any personal data. If the user asks for a workflow, use the provided step sequence. If not found, give general, safe instructions.`;
}

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

  const fallback = getStorageFallback();
  return {
    provider: fallback.provider === 'gemini' ? 'gemini' : 'deepseek',
    deepseekApiKey: fallback.deepseekApiKey ?? '',
    geminiApiKey: fallback.geminiApiKey ?? ''
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

async function callDeepSeek(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: 'You are CityU Universal Sinno. Keep answers concise and practical.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() ?? 'No response returned by DeepSeek.';
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'You are CityU Universal Sinno. Help students navigate CityU AIMS safely and concisely.' }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join(' ') ?? '';
  return text.trim() || 'No response returned by Gemini.';
}

export async function routeModelRequest(intent: string): Promise<{ provider: AIProvider; workflow: WorkflowConfig | null; response: string }> {
  const settings = await getAISettings();
  const workflow = await resolveWorkflowIntent(intent);
  const basePrompt = `User intent: ${intent}\n\nWorkflow context: ${workflow ? JSON.stringify({ workflowKey: workflow.workflowKey, title: workflow.title, category: workflow.category, steps: workflow.steps }, null, 2) : 'No workflow found'}\n\nInstructions: Provide a short, practical answer for CityU students using the workflow if applicable.`;

  try {
    if (settings.provider === 'gemini') {
      const key = settings.geminiApiKey.trim();
      if (!key) {
        return {
          provider: 'gemini',
          workflow,
          response: 'Gemini key is not configured. Add your API key in the extension settings first.'
        };
      }

      const response = await callGemini(basePrompt, key);
      return { provider: 'gemini', workflow, response };
    }

    const key = settings.deepseekApiKey.trim();
    if (!key) {
      return {
        provider: 'deepseek',
        workflow,
        response: 'DeepSeek key is not configured. Add your API key in the extension settings first.'
      };
    }

    const response = await callDeepSeek(basePrompt, key);
    return { provider: 'deepseek', workflow, response };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown AI request error';
    return {
      provider: settings.provider,
      workflow,
      response: `AI request failed: ${message}`
    };
  }
}
