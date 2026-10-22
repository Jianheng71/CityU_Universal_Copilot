import { pickAimsTabId, isCityuUrl, type TabCandidate } from './guide/aimsTab';
import {
  GUIDE_PENDING_COMPLETION_KEY,
  GUIDE_SESSION_STORAGE_KEY,
  applyNavigation,
  completeGuideStep,
  createGuideSession,
  currentGuideStep,
  pendingCompletionAdvances,
  pickSpotlightWinner,
  readStoredSessions,
  sanitizeGuideSteps,
  type GuideSessionState
} from './guide/session';
import { clipSelector, type GuideResponse, type ShowGuideRequest } from './guide/protocol';
import { getPreferredLanguage } from './utils/i18n';

const RETRY_DELAYS_MS = [250, 600, 1200, 2000, 3200, 5000, 8000, 13000];

const sessions = new Map<number, GuideSessionState>();
const retryTimers = new Map<number, ReturnType<typeof setTimeout>[]>();
const reconcileTimers = new Map<number, ReturnType<typeof setTimeout>>();
const pendingArrivals = new Map<number, string>();
const tails = new Map<number, Promise<unknown>>();
let hydratePromise: Promise<void> | null = null;

function toCandidate(tab: chrome.tabs.Tab): TabCandidate {
  return {
    id: tab.id,
    url: tab.url,
    active: tab.active,
    lastAccessed: tab.lastAccessed,
    windowId: tab.windowId
  };
}

async function resolveAimsTabId(explicitTabId?: number): Promise<number | null> {
  const tabs = await chrome.tabs.query({});
  let focusedWindowId: number | undefined;
  try {
    const focused = await chrome.windows.getLastFocused();
    focusedWindowId = focused.id;
  } catch {
    focusedWindowId = undefined;
  }

  return pickAimsTabId({
    explicitTabId,
    focusedWindowId,
    tabs: tabs.map(toCandidate)
  });
}

function sendToFrame(tabId: number, frameId: number, message: object): Promise<GuideResponse> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, { frameId }, (response: GuideResponse | undefined) => {
        const error = chrome.runtime.lastError;
        if (error) {
          resolve({
            ok: false,
            code: 'content-script-unavailable',
            reason: error.message || 'AIMS content script did not respond.'
          });
          return;
        }

        if (!response || typeof response.ok !== 'boolean') {
          resolve({
            ok: false,
            code: 'no-ack',
            reason: 'The AIMS page did not acknowledge the highlight request.'
          });
          return;
        }

        resolve(response);
      });
    } catch (error) {
      resolve({
        ok: false,
        code: 'content-script-unavailable',
        reason: error instanceof Error ? error.message : 'AIMS content script did not respond.'
      });
    }
  });
}

async function listFrameIds(tabId: number): Promise<{ frameIds: number[]; enumerated: boolean }> {
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => true
    });
    const frameIds = (frames ?? []).map((frame) => frame.frameId).filter((frameId) => Number.isInteger(frameId));
    if (frameIds.length) {
      return { frameIds, enumerated: true };
    }
  } catch (error) {
    console.error('Unable to enumerate AIMS frames:', error);
  }

  return { frameIds: [0], enumerated: false };
}

function contentScriptFiles(): string[] {
  return chrome.runtime.getManifest().content_scripts?.flatMap((script) => script.js ?? []) ?? [];
}

async function injectContentScript(tabId: number, frameId: number): Promise<void> {
  const files = contentScriptFiles();
  if (!files.length) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files
    });
  } catch {
    // Inaccessible frames and already-injected documents are reported by the retry.
  }
}

async function broadcast(tabId: number, frameIds: number[], message: object): Promise<GuideResponse[]> {
  return Promise.all(frameIds.map((frameId) => sendToFrame(tabId, frameId, message)));
}

function summarizeFailure(selector: string, responses: GuideResponse[]): GuideResponse {
  const invalid = responses.find((response) => response.code === 'invalid-selector');
  if (invalid) {
    return invalid;
  }

  const unavailable = responses.filter((response) => response.code === 'content-script-unavailable');
  if (responses.length > 0 && unavailable.length === responses.length) {
    return {
      ok: false,
      code: 'content-script-unavailable',
      reason: unavailable[0]?.reason || 'AIMS page content script is unavailable. Refresh the AIMS tab and try again.'
    };
  }

  const hidden = responses.find((response) => response.code === 'element-not-visible');
  if (hidden) {
    return hidden;
  }

  const blockedNote = unavailable.length ? ` ${unavailable.length} frame(s) could not be inspected.` : '';
  return {
    ok: false,
    code: 'element-not-found',
    reason: `The requested AIMS element was not found in any accessible frame on this tab (${clipSelector(selector)}).${blockedNote}`
  };
}

function enqueue<T>(tabId: number, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(tabId) ?? Promise.resolve();
  const run = previous.then(task, task);
  tails.set(tabId, run.then(() => undefined, () => undefined));
  return run;
}

async function persistSessions(): Promise<void> {
  if (!chrome.storage?.session) {
    return;
  }
  const stored: Record<string, GuideSessionState> = {};
  for (const [tabId, session] of sessions) {
    stored[String(tabId)] = session;
  }
  try {
    await chrome.storage.session.set({ [GUIDE_SESSION_STORAGE_KEY]: stored });
  } catch (error) {
    console.error('Unable to persist the AIMS guide', error);
  }
}

function ensureHydrated(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      if (!chrome.storage?.session) {
        return;
      }
      try {
        const stored = await chrome.storage.session.get(GUIDE_SESSION_STORAGE_KEY);
        for (const session of readStoredSessions(stored[GUIDE_SESSION_STORAGE_KEY])) {
          sessions.set(session.tabId, session);
        }
      } catch (error) {
        console.error('Unable to restore AIMS guides', error);
      }
    })();
  }
  return hydratePromise;
}

function clearRetryTimers(tabId: number): void {
  for (const timer of retryTimers.get(tabId) ?? []) {
    clearTimeout(timer);
  }
  retryTimers.delete(tabId);
}

function clearReconcileTimer(tabId: number): void {
  const timer = reconcileTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
  }
  reconcileTimers.delete(tabId);
}

function guideToken(session: GuideSessionState): string {
  return `${session.createdAt}:${session.generation}`;
}

async function listFrameHrefs(tabId: number): Promise<string[]> {
  const hrefs: string[] = [];
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      hrefs.push(tab.url);
    }
  } catch {
    return hrefs;
  }

  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => window.location.href
    });
    for (const frame of frames ?? []) {
      if (typeof frame.result === 'string' && frame.result) {
        hrefs.push(frame.result);
      }
    }
  } catch (error) {
    console.error('Unable to read AIMS frame URLs', error);
  }
  return hrefs;
}

async function clearOverlays(tabId: number): Promise<GuideResponse> {
  const { frameIds } = await listFrameIds(tabId);
  await broadcast(tabId, frameIds, { type: 'clear-guide', cancel: true });
  return { ok: true, code: 'ok' };
}

async function dropSession(tabId: number, clearSpotlight: boolean): Promise<void> {
  clearRetryTimers(tabId);
  clearReconcileTimer(tabId);
  pendingArrivals.delete(tabId);
  sessions.delete(tabId);
  await persistSessions();
  if (clearSpotlight) {
    await clearOverlays(tabId);
  }
}

function notifyProgress(payload: { phase: 'showing' | 'finished'; stepIndex: number; stepCount: number }): void {
  try {
    chrome.runtime.sendMessage({ type: 'guide-progress', ...payload }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The side panel may be closed.
  }
}

function isRetryable(response: GuideResponse): boolean {
  return response.code === 'element-not-found'
    || response.code === 'element-not-visible'
    || response.code === 'content-script-unavailable'
    || response.code === 'no-ack'
    || response.code === 'frame-scan-failed';
}

function scheduleRetries(tabId: number, generation: number): void {
  clearRetryTimers(tabId);
  const timers = RETRY_DELAYS_MS.map((delay) => setTimeout(() => {
    void enqueue(tabId, async () => {
      const session = sessions.get(tabId);
      if (!session || session.generation !== generation) {
        return;
      }
      await paintSession(tabId, false);
    }).catch((error: unknown) => {
      console.error('Unable to restore the AIMS spotlight', error);
    });
  }, delay));
  retryTimers.set(tabId, timers);
}

function cancelledGuide(): GuideResponse {
  return { ok: false, code: 'highlight-failed', reason: 'The guide was cancelled.' };
}

async function highlightInTab(
  tabId: number,
  selector: string,
  guideText: string,
  isCurrent: () => boolean = () => true,
  token = ''
): Promise<GuideResponse> {
  if (!isCurrent()) {
    return cancelledGuide();
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && !isCityuUrl(tab.url)) {
      return {
        ok: false,
        code: 'no-tab',
        reason: 'Open a CityU AIMS tab (https://*.cityu.edu.hk) and try again.'
      };
    }
    if (typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
    }
  } catch (error) {
    return {
      ok: false,
      code: 'no-tab',
      reason: error instanceof Error ? error.message : 'The AIMS tab is no longer open.'
    };
  }

  await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
  if (!isCurrent()) {
    return cancelledGuide();
  }

  const { frameIds, enumerated } = await listFrameIds(tabId);
  if (!isCurrent()) {
    return cancelledGuide();
  }
  const showGuide: ShowGuideRequest = {
    type: 'show-guide',
    selector,
    guideText,
    searchFrames: !enumerated,
    guideToken: token
  };

  const deliver = async (): Promise<Array<{ frameId: number; response: GuideResponse }>> => {
    return Promise.all(frameIds.map(async (frameId) => ({
      frameId,
      response: await sendToFrame(tabId, frameId, showGuide)
    })));
  };

  const chooseSpotlight = async (
    delivered: Array<{ frameId: number; response: GuideResponse }>
  ): Promise<GuideResponse | null> => {
    const winnerIndex = pickSpotlightWinner(delivered.map((result) => result.response));
    if (winnerIndex < 0) {
      return null;
    }

    const winner = delivered[winnerIndex];
    await Promise.all(frameIds
      .filter((frameId) => frameId !== winner.frameId)
      .map((frameId) => sendToFrame(tabId, frameId, { type: 'clear-guide' })));
    return { ...winner.response, ok: true, frameId: winner.frameId, selector };
  };

  let results = await deliver();
  if (!isCurrent()) {
    await broadcast(tabId, frameIds, { type: 'clear-guide', cancel: true });
    return cancelledGuide();
  }
  let success = await chooseSpotlight(results);
  if (!success) {
    const missing = results.filter((result) => result.response.code === 'content-script-unavailable');
    if (missing.length && isCurrent()) {
      await Promise.all(missing.map((result) => injectContentScript(tabId, result.frameId)));
      if (!isCurrent()) {
        await broadcast(tabId, frameIds, { type: 'clear-guide', cancel: true });
        return cancelledGuide();
      }
      results = await deliver();
      if (!isCurrent()) {
        await broadcast(tabId, frameIds, { type: 'clear-guide', cancel: true });
        return cancelledGuide();
      }
      success = await chooseSpotlight(results);
    }
  }

  if (!isCurrent()) {
    await broadcast(tabId, frameIds, { type: 'clear-guide', cancel: true });
    return cancelledGuide();
  }

  if (success) {
    return success;
  }

  // Leave a spotlight that is already showing the previous step until the next target exists.
  return summarizeFailure(selector, results.map((result) => result.response));
}

async function forgetPendingCompletion(): Promise<void> {
  if (!chrome.storage?.session) {
    return;
  }
  try {
    await chrome.storage.session.remove(GUIDE_PENDING_COMPLETION_KEY);
  } catch {
    // A duplicate completion is ignored once the current selector no longer matches.
  }
}

async function readPendingCompletion(): Promise<{ selector?: unknown; at?: unknown; departureUrl?: unknown } | null> {
  if (!chrome.storage?.session) {
    return null;
  }
  try {
    const stored = await chrome.storage.session.get(GUIDE_PENDING_COMPLETION_KEY);
    const pending = stored[GUIDE_PENDING_COMPLETION_KEY];
    if (!pending || typeof pending !== 'object') {
      return null;
    }
    return pending as { selector?: unknown; at?: unknown; departureUrl?: unknown };
  } catch {
    return null;
  }
}

async function applyPendingCompletion(tabId: number): Promise<void> {
  const session = sessions.get(tabId);
  if (!session) {
    return;
  }
  const pending = await readPendingCompletion();
  if (!pendingCompletionAdvances(session, pending, Date.now())) {
    return;
  }

  await forgetPendingCompletion();
  const departureUrl = typeof pending.departureUrl === 'string' ? pending.departureUrl : '';
  const outcome = completeGuideStep(session, pending.selector as string, Date.now(), departureUrl);
  if (outcome.status === 'ignored') {
    return;
  }
  if (outcome.status === 'finished') {
    await dropSession(tabId, true);
    notifyProgress({ phase: 'finished', stepIndex: session.steps.length, stepCount: session.steps.length });
    return;
  }
  sessions.set(tabId, outcome.session);
  await persistSessions();
}

async function paintSession(tabId: number, allowRetry: boolean, arrivedUrl?: string): Promise<GuideResponse> {
  await applyPendingCompletion(tabId);
  let session = sessions.get(tabId);
  if (!session) {
    return { ok: true, code: 'ok' };
  }

  const frameUrls = await listFrameHrefs(tabId);
  const navigated = applyNavigation(session, frameUrls, arrivedUrl);
  if (navigated.status === 'finished') {
    const stepCount = session.steps.length;
    await dropSession(tabId, true);
    notifyProgress({ phase: 'finished', stepIndex: stepCount, stepCount });
    return { ok: true, code: 'ok', phase: 'finished' };
  }
  if (navigated.status === 'advanced') {
    sessions.set(tabId, navigated.session);
    await persistSessions();
    session = navigated.session;
  }

  const generation = session.generation;
  const step = currentGuideStep(session);
  if (!step) {
    await dropSession(tabId, true);
    notifyProgress({ phase: 'finished', stepIndex: session.steps.length, stepCount: session.steps.length });
    return { ok: true, code: 'ok', phase: 'finished' };
  }

  const response = await highlightInTab(tabId, step.targetSelector, step.guideText, () => {
    return sessions.get(tabId)?.generation === generation;
  }, guideToken(session));
  const latest = sessions.get(tabId);
  if (!latest || latest.generation !== generation) {
    return response;
  }

  if (response.ok) {
    clearRetryTimers(tabId);
    notifyProgress({
      phase: 'showing',
      stepIndex: latest.stepIndex,
      stepCount: latest.steps.length
    });
    return { ...response, phase: 'showing' };
  }
  if (allowRetry && isRetryable(response)) {
    scheduleRetries(tabId, generation);
  }
  return response;
}

function scheduleReconcile(tabId: number, arrivedUrl?: string): void {
  if (!sessions.has(tabId)) {
    return;
  }
  if (arrivedUrl) {
    pendingArrivals.set(tabId, arrivedUrl);
  }
  clearReconcileTimer(tabId);
  reconcileTimers.set(tabId, setTimeout(() => {
    reconcileTimers.delete(tabId);
    const url = pendingArrivals.get(tabId);
    pendingArrivals.delete(tabId);
    void enqueue(tabId, () => paintSession(tabId, true, url)).catch((error: unknown) => {
      console.error('Unable to restore the AIMS guide', error);
    });
  }, 200));
}

async function startGuide(message: {
  selector?: unknown;
  guideText?: unknown;
  workflowKey?: unknown;
  steps?: unknown;
  tabId?: unknown;
}): Promise<GuideResponse> {
  await ensureHydrated();
  const explicitTabId = typeof message.tabId === 'number' ? message.tabId : undefined;
  const tabId = await resolveAimsTabId(explicitTabId);
  if (tabId === null) {
    return {
      ok: false,
      code: 'no-tab',
      reason: 'Open a CityU AIMS tab (https://*.cityu.edu.hk) and try again.'
    };
  }

  const steps = sanitizeGuideSteps(message.steps);
  if (!steps.length && typeof message.selector === 'string') {
    steps.push({
      stepId: 1,
      targetSelector: message.selector.trim(),
      guideText: typeof message.guideText === 'string' ? message.guideText.trim() : '',
      arrivalToken: null
    });
  }
  const usable = sanitizeGuideSteps(steps);
  if (!usable.length) {
    return { ok: false, code: 'no-selector', reason: 'No target selector was provided.' };
  }

  const workflowKey = typeof message.workflowKey === 'string' ? message.workflowKey : 'aims-guide';
  return enqueue(tabId, async () => {
    clearRetryTimers(tabId);
    clearReconcileTimer(tabId);
    pendingArrivals.delete(tabId);
    await forgetPendingCompletion();
    const session = createGuideSession({ tabId, workflowKey, steps: usable });
    if (!session) {
      return { ok: false, code: 'no-selector', reason: 'No target selector was provided.' };
    }
    sessions.set(tabId, session);
    await persistSessions();
    return paintSession(tabId, true);
  });
}

async function completeStepAndHighlight(tabId: number, selector: string, departureUrl = ''): Promise<GuideResponse> {
  await ensureHydrated();
  return enqueue(tabId, async () => {
    await forgetPendingCompletion();
    const session = sessions.get(tabId);
    if (!session) {
      return { ok: false, code: 'no-selector', reason: 'No AIMS guide is active.' };
    }

    const outcome = completeGuideStep(session, selector, Date.now(), departureUrl);
    if (outcome.status === 'ignored') {
      return { ok: true, code: 'ok' };
    }

    clearRetryTimers(tabId);
    if (outcome.status === 'finished') {
      await dropSession(tabId, true);
      notifyProgress({ phase: 'finished', stepIndex: session.steps.length, stepCount: session.steps.length });
      return { ok: true, code: 'ok', phase: 'finished' };
    }

    sessions.set(tabId, outcome.session);
    await persistSessions();
    return paintSession(tabId, true);
  });
}

async function cancelGuide(tabId: number | undefined): Promise<GuideResponse> {
  await ensureHydrated();
  const resolved = await resolveAimsTabId(tabId);
  if (resolved === null) {
    return { ok: false, code: 'no-tab', reason: 'Open a CityU AIMS tab (https://*.cityu.edu.hk) and try again.' };
  }
  return enqueue(resolved, async () => {
    await forgetPendingCompletion();
    await dropSession(resolved, true);
    return { ok: true, code: 'ok' } satisfies GuideResponse;
  });
}

function failureResponse(error: unknown, fallback: string): GuideResponse {
  return {
    ok: false,
    code: 'highlight-failed',
    reason: error instanceof Error ? error.message : fallback
  };
}

const router = (): void => {
  if (typeof chrome === 'undefined') {
    return;
  }

  void ensureHydrated();

  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Unable to enable side panel on extension icon click:', error);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void ensureHydrated().then(() => dropSession(tabId, false)).catch((error: unknown) => {
      console.error('Unable to drop the AIMS guide for a closed tab', error);
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (typeof info.url === 'string' && info.url) {
      pendingArrivals.set(tabId, info.url);
    }
    if (info.status !== 'complete') {
      return;
    }
    void ensureHydrated().then(() => {
      if (sessions.has(tabId)) {
        scheduleReconcile(tabId);
      }
    }).catch((error: unknown) => {
      console.error('Unable to restore the AIMS guide after navigation', error);
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'get-language') {
      getPreferredLanguage().then((language) => {
        sendResponse({ language });
      }).catch((error: unknown) => {
        sendResponse({ language: 'en', reason: error instanceof Error ? error.message : 'Language lookup failed.' });
      });
      return true;
    }

    if (message?.type === 'route-to-aims' || message?.type === 'start-guide') {
      const explicitTabId = typeof message.tabId === 'number' ? message.tabId : sender.tab?.id;
      void startGuide({ ...message, tabId: explicitTabId }).then(sendResponse, (error: unknown) => {
        sendResponse(failureResponse(error, 'Highlight failed.'));
      });
      return true;
    }

    if (message?.type === 'guide-step-done') {
      const tabId = sender.tab?.id;
      const selector = typeof message.selector === 'string' ? message.selector : '';
      const departureUrl = typeof message.departureUrl === 'string' ? message.departureUrl : '';
      if (typeof tabId !== 'number' || !selector) {
        sendResponse({ ok: false, code: 'no-tab', reason: 'The AIMS guide could not tell which tab advanced.' });
        return false;
      }
      void completeStepAndHighlight(tabId, selector, departureUrl).then(sendResponse, (error: unknown) => {
        sendResponse(failureResponse(error, 'Could not advance the AIMS guide.'));
      });
      return true;
    }

    if (message?.type === 'guide-frame-ready') {
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        void ensureHydrated().then(() => {
          if (sessions.has(tabId)) {
            scheduleReconcile(tabId);
          }
        }).catch(() => undefined);
      }
      sendResponse({ ok: true, code: 'ok' });
      return false;
    }

    if (message?.type === 'clear-guide') {
      const explicitTabId = typeof message.tabId === 'number' ? message.tabId : sender.tab?.id;
      const task = message.cancel === true
        ? cancelGuide(explicitTabId)
        : resolveAimsTabId(explicitTabId).then(async (resolved) => {
          if (resolved === null) {
            return { ok: false, code: 'no-tab', reason: 'Open a CityU AIMS tab (https://*.cityu.edu.hk) and try again.' } satisfies GuideResponse;
          }
          return clearOverlays(resolved);
        });
      void task.then(sendResponse, (error: unknown) => {
        sendResponse(failureResponse(error, 'Could not clear the spotlight.'));
      });
      return true;
    }

    return false;
  });
};

router();
