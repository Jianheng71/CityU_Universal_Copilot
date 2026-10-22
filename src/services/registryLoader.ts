import bundledRegistry from '../../registry/aims-workflows.json';
import { planGuide } from '../guide/planner';

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

export const bundledWorkflowRegistry = bundledRegistry as WorkflowCollection;

function isWorkflowCollection(value: unknown): value is WorkflowCollection {
  if (!value || typeof value !== 'object' || !('workflows' in value)) {
    return false;
  }
  const workflows = (value as WorkflowCollection).workflows;
  return Boolean(workflows && workflows['aims-weekly-schedule'] && workflows['aims-web-add-drop']);
}

async function readCachedRegistry(): Promise<WorkflowCollection | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  const result = await chrome.storage.local.get('aims-workflows');
  const stored = result['aims-workflows'];
  if (isWorkflowCollection(stored)) {
    return stored;
  }

  return null;
}

export async function loadWorkflowRegistry(): Promise<WorkflowCollection> {
  try {
    const response = await fetch(FALLBACK_RAW_URL, { method: 'GET', cache: 'no-store' });
    if (response.ok) {
      const parsed = (await response.json()) as unknown;
      if (isWorkflowCollection(parsed)) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ 'aims-workflows': parsed });
        }
        return parsed;
      }
    }
  } catch {
    // The copy shipped with the extension still plans a guide offline.
  }

  try {
    const cached = await readCachedRegistry();
    if (cached) {
      return cached;
    }
  } catch {
    // Cache is only a fallback when the published registry cannot be fetched.
  }

  return bundledWorkflowRegistry;
}

export async function findWorkflowByIntent(intent: string): Promise<WorkflowConfig | null> {
  const registry = await loadWorkflowRegistry();
  return planGuide(intent, registry);
}
