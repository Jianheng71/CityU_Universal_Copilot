export const GUIDE_SESSION_STORAGE_KEY = 'cityu-guide-sessions';
export const GUIDE_PENDING_COMPLETION_KEY = 'cityu-guide-pending-done';
export const GUIDE_PENDING_MAX_AGE_MS = 15000;

export type GuideStepSnapshot = {
  stepId: number;
  targetSelector: string;
  guideText: string;
};

export type GuideSessionState = {
  tabId: number;
  workflowKey: string;
  steps: GuideStepSnapshot[];
  stepIndex: number;
  generation: number;
  updatedAt: number;
};

export type PendingGuideCompletion = {
  selector: string;
  at: number;
};

export function sanitizeGuideSteps(value: unknown): GuideStepSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const steps: GuideStepSnapshot[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const targetSelector = typeof record.targetSelector === 'string' ? record.targetSelector.trim() : '';
    if (!targetSelector || targetSelector === 'body' || targetSelector.length > 500) {
      continue;
    }
    const guideText = typeof record.guideText === 'string' ? record.guideText.trim().slice(0, 500) : '';
    const stepId = typeof record.stepId === 'number' && Number.isFinite(record.stepId) ? record.stepId : steps.length + 1;
    steps.push({ stepId, targetSelector, guideText });
    if (steps.length >= 12) {
      break;
    }
  }
  return steps;
}

export function createGuideSession(input: {
  tabId: number;
  workflowKey: string;
  steps: GuideStepSnapshot[];
  now?: number;
}): GuideSessionState | null {
  if (!Number.isInteger(input.tabId) || input.tabId < 0 || !input.steps.length) {
    return null;
  }

  return {
    tabId: input.tabId,
    workflowKey: input.workflowKey.trim().slice(0, 120) || 'aims-guide',
    steps: input.steps.map((step) => ({ ...step })),
    stepIndex: 0,
    generation: 1,
    updatedAt: input.now ?? Date.now()
  };
}

export function currentGuideStep(session: GuideSessionState): GuideStepSnapshot | null {
  return session.steps[session.stepIndex] ?? null;
}

export function completeGuideStep(
  session: GuideSessionState,
  selector: string,
  now = Date.now()
): { session: GuideSessionState; status: 'advanced' | 'finished' | 'ignored' } {
  const current = currentGuideStep(session);
  if (!current || current.targetSelector !== selector) {
    return { session, status: 'ignored' };
  }

  const next: GuideSessionState = {
    ...session,
    steps: session.steps.map((step) => ({ ...step })),
    stepIndex: session.stepIndex + 1,
    generation: session.generation + 1,
    updatedAt: now
  };

  if (next.stepIndex >= next.steps.length) {
    return { session: next, status: 'finished' };
  }
  return { session: next, status: 'advanced' };
}

export function pendingCompletionAdvances(
  session: GuideSessionState,
  pending: { selector?: unknown; at?: unknown } | null | undefined,
  now: number,
  maxAgeMs = GUIDE_PENDING_MAX_AGE_MS
): pending is PendingGuideCompletion {
  if (!pending || typeof pending.selector !== 'string' || typeof pending.at !== 'number') {
    return false;
  }
  if (!Number.isFinite(pending.at) || pending.at > now + 1000 || now - pending.at > maxAgeMs) {
    return false;
  }
  if (pending.at < session.updatedAt) {
    return false;
  }
  return currentGuideStep(session)?.targetSelector === pending.selector;
}

export function readStoredSessions(value: unknown): GuideSessionState[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const sessions: GuideSessionState[] = [];
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const steps = sanitizeGuideSteps(record.steps);
    const tabId = record.tabId;
    const stepIndex = record.stepIndex;
    const generation = record.generation;
    if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId < 0 || !steps.length) {
      continue;
    }
    if (typeof stepIndex !== 'number' || !Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
      continue;
    }
    if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 1) {
      continue;
    }
    sessions.push({
      tabId,
      workflowKey: typeof record.workflowKey === 'string' && record.workflowKey.trim() ? record.workflowKey : 'aims-guide',
      steps,
      stepIndex,
      generation,
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0
    });
  }
  return sessions;
}

export type SpotlightCandidate = {
  ok: boolean;
  visible?: boolean;
};

/**
 * Prefer the first frame whose target is actually visible.
 * A later hidden Banner frame must not replace that spotlight.
 */
export function pickSpotlightWinner(results: SpotlightCandidate[]): number {
  let hiddenFallback = -1;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (!result?.ok) {
      continue;
    }
    if (result.visible !== false) {
      return index;
    }
    if (hiddenFallback < 0) {
      hiddenFallback = index;
    }
  }
  return hiddenFallback;
}
