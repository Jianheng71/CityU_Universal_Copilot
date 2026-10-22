export const GUIDE_SESSION_STORAGE_KEY = 'cityu-guide-sessions';
export const GUIDE_PENDING_COMPLETION_KEY = 'cityu-guide-pending-done';
export const GUIDE_PENDING_MAX_AGE_MS = 15000;

export type GuideStepSnapshot = {
  stepId: number;
  targetSelector: string;
  guideText: string;
  arrivalToken: string | null;
};

export type GuideSessionState = {
  tabId: number;
  workflowKey: string;
  steps: GuideStepSnapshot[];
  stepIndex: number;
  generation: number;
  updatedAt: number;
  /**
   * The last step was activated. Preset guides finish when the destination
   * procedure is open. Guides without a procedure token finish when that
   * activation navigates to a different AIMS page.
   */
  awaitingDestination: boolean;
  departureUrl: string | null;
  createdAt: number;
};

const CITYU_HOST = /(^|\.)cityu\.edu\.hk$/i;

export function arrivalTokenFromSelector(selector: string): string | null {
  const match = selector.match(/href\*\s*=\s*(['"])([^'"]+)\1/i);
  const token = match?.[2]?.trim() ?? '';
  if (!isSpecificProcedureToken(token)) {
    return null;
  }
  return token;
}

export function isSpecificProcedureToken(token: string): boolean {
  return token.length >= 8 && /[a-z]/i.test(token) && /[._]/.test(token);
}

export function urlContainsArrival(url: string, token: string | null | undefined): boolean {
  if (!url || !token) {
    return false;
  }
  let href = url;
  try {
    const parsed = new URL(url);
    href = `${parsed.pathname}${parsed.search}`;
  } catch {
    href = url;
  }
  return href.toLowerCase().includes(token.toLowerCase());
}

export function sameDocument(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return left === right;
  }
}

export function isNavigableAimsUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !CITYU_HOST.test(parsed.hostname)) {
      return false;
    }
    return parsed.pathname.length > 1;
  } catch {
    return false;
  }
}

function clipDepartureUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2000) {
    return null;
  }
  return trimmed;
}

export type PendingGuideCompletion = {
  selector: string;
  at: number;
  departureUrl?: string;
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
    const explicitToken = typeof record.arrivalToken === 'string' ? record.arrivalToken.trim() : '';
    const arrivalToken = isSpecificProcedureToken(explicitToken)
      ? explicitToken
      : arrivalTokenFromSelector(targetSelector);
    steps.push({ stepId, targetSelector, guideText, arrivalToken });
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
    steps: input.steps.map((step, index) => ({
      stepId: step.stepId || index + 1,
      targetSelector: step.targetSelector,
      guideText: step.guideText,
      arrivalToken: step.arrivalToken ?? arrivalTokenFromSelector(step.targetSelector)
    })),
    stepIndex: 0,
    generation: 1,
    updatedAt: input.now ?? Date.now(),
    awaitingDestination: false,
    departureUrl: null,
    createdAt: input.now ?? Date.now()
  };
}

export function currentGuideStep(session: GuideSessionState): GuideStepSnapshot | null {
  return session.steps[session.stepIndex] ?? null;
}

export type GuideAdvanceStatus = 'advanced' | 'finished' | 'awaiting-destination' | 'ignored';

export function completeGuideStep(
  session: GuideSessionState,
  selector: string,
  now = Date.now(),
  departureUrl = ''
): { session: GuideSessionState; status: GuideAdvanceStatus } {
  const current = currentGuideStep(session);
  if (!current || current.targetSelector !== selector) {
    return { session, status: 'ignored' };
  }
  if (session.awaitingDestination) {
    return { session, status: 'awaiting-destination' };
  }

  const steps = session.steps.map((step) => ({ ...step }));
  const leftFrom = clipDepartureUrl(departureUrl) ?? session.departureUrl;
  const isLast = session.stepIndex >= session.steps.length - 1;
  if (isLast && (current.arrivalToken || leftFrom)) {
    return {
      session: {
        ...session,
        steps,
        awaitingDestination: true,
        departureUrl: leftFrom,
        updatedAt: now
      },
      status: 'awaiting-destination'
    };
  }

  const next: GuideSessionState = {
    ...session,
    steps,
    stepIndex: session.stepIndex + 1,
    generation: session.generation + 1,
    updatedAt: now,
    awaitingDestination: false,
    departureUrl: leftFrom
  };

  if (next.stepIndex >= next.steps.length) {
    return { session: next, status: 'finished' };
  }
  return { session: next, status: 'advanced' };
}

export type NavigationEffect = {
  session: GuideSessionState;
  status: 'unchanged' | 'advanced' | 'finished';
};

function guideHasArrivalToken(session: GuideSessionState): boolean {
  return session.steps.some((step) => Boolean(step.arrivalToken));
}

function destinationReached(session: GuideSessionState, urls: string[]): boolean {
  const last = session.steps[session.steps.length - 1];
  if (!last) {
    return false;
  }
  if (last.arrivalToken && urls.some((url) => urlContainsArrival(url, last.arrivalToken))) {
    return true;
  }
  if (guideHasArrivalToken(session) || !session.departureUrl) {
    return false;
  }

  const live = urls.filter((url) => isNavigableAimsUrl(url));
  if (!live.length) {
    return false;
  }
  const stillOpen = live.some((url) => sameDocument(url, session.departureUrl as string));
  if (stillOpen) {
    return false;
  }
  return live.some((url) => !sameDocument(url, session.departureUrl as string));
}

function furthestStepIndex(session: GuideSessionState, urls: string[]): number {
  let index = session.stepIndex;
  const last = session.steps.length - 1;
  for (let cursor = session.stepIndex; cursor < last; cursor += 1) {
    const token = session.steps[cursor]?.arrivalToken;
    if (token && urls.some((url) => urlContainsArrival(url, token))) {
      index = cursor + 1;
    }
  }
  return index;
}

/**
 * Move only forward. A preset step is done when a frame is already on the page
 * its link opens. The guide is done when the final procedure is open, or when
 * a Find a Page guide has left the page the user activated.
 */
export function applyNavigation(
  session: GuideSessionState,
  frameUrls: string[],
  arrivedUrl?: string,
  now = Date.now()
): NavigationEffect {
  const urls = frameUrls.filter((url) => typeof url === 'string' && url.length > 0);
  if (arrivedUrl && isNavigableAimsUrl(arrivedUrl) && !urls.some((url) => sameDocument(url, arrivedUrl))) {
    urls.push(arrivedUrl);
  }

  if (destinationReached(session, urls)) {
    return {
      session: {
        ...session,
        steps: session.steps.map((step) => ({ ...step })),
        stepIndex: session.steps.length,
        awaitingDestination: false,
        updatedAt: now
      },
      status: 'finished'
    };
  }

  const stepIndex = furthestStepIndex(session, urls);
  if (stepIndex === session.stepIndex) {
    return { session, status: 'unchanged' };
  }

  return {
    session: {
      ...session,
      steps: session.steps.map((step) => ({ ...step })),
      stepIndex,
      generation: session.generation + 1,
      updatedAt: now,
      awaitingDestination: false,
      departureUrl: null
    },
    status: 'advanced'
  };
}

export function pendingCompletionAdvances(
  session: GuideSessionState,
  pending: { selector?: unknown; at?: unknown; departureUrl?: unknown } | null | undefined,
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
  if (pending.departureUrl !== undefined && typeof pending.departureUrl !== 'string') {
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
    const departureUrl = typeof record.departureUrl === 'string' ? clipDepartureUrl(record.departureUrl) : null;
    sessions.push({
      tabId,
      workflowKey: typeof record.workflowKey === 'string' && record.workflowKey.trim() ? record.workflowKey : 'aims-guide',
      steps,
      stepIndex,
      generation,
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
      awaitingDestination: record.awaitingDestination === true,
      departureUrl,
      createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : (typeof record.updatedAt === 'number' ? record.updatedAt : 0)
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
