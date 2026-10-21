import { pickAimsTabId, isCityuUrl, type TabCandidate } from './guide/aimsTab';
import { clipSelector, type GuideResponse, type ShowGuideRequest } from './guide/protocol';
import { getPreferredLanguage } from './utils/i18n';

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

async function highlightInTab(tabId: number, selector: string, guideText: string): Promise<GuideResponse> {
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

  const { frameIds, enumerated } = await listFrameIds(tabId);
  await broadcast(tabId, frameIds, { type: 'clear-guide' });

  const showGuide: ShowGuideRequest = {
    type: 'show-guide',
    selector,
    guideText,
    searchFrames: !enumerated
  };

  const deliver = async (): Promise<Array<{ frameId: number; response: GuideResponse }>> => {
    return Promise.all(frameIds.map(async (frameId) => ({
      frameId,
      response: await sendToFrame(tabId, frameId, showGuide)
    })));
  };

  const chooseSpotlight = async (delivered: Array<{ frameId: number; response: GuideResponse }>): Promise<GuideResponse | null> => {
    const winners = delivered.filter((result) => result.response.ok);
    if (!winners.length) {
      return null;
    }

    const winner = winners[winners.length - 1];
    await Promise.all(winners.slice(0, -1).map((result) => sendToFrame(tabId, result.frameId, { type: 'clear-guide' })));
    return { ...winner.response, ok: true, frameId: winner.frameId, selector };
  };

  let results = await deliver();
  let success = await chooseSpotlight(results);
  if (!success) {
    const missing = results.filter((result) => result.response.code === 'content-script-unavailable');
    if (missing.length) {
      await Promise.all(missing.map((result) => injectContentScript(tabId, result.frameId)));
      results = await deliver();
      success = await chooseSpotlight(results);
    }
  }

  if (success) {
    return success;
  }

  return summarizeFailure(selector, results.map((result) => result.response));
}

async function clearGuide(tabId: number | undefined): Promise<GuideResponse> {
  const resolved = await resolveAimsTabId(tabId);
  if (resolved === null) {
    return { ok: false, code: 'no-tab', reason: 'Open a CityU AIMS tab (https://*.cityu.edu.hk) and try again.' };
  }

  const { frameIds } = await listFrameIds(resolved);
  await broadcast(resolved, frameIds, { type: 'clear-guide' });
  return { ok: true, code: 'ok' };
}

async function routeToAims(message: { selector?: unknown; guideText?: unknown; tabId?: unknown }): Promise<GuideResponse> {
  const selector = typeof message.selector === 'string' ? message.selector.trim() : '';
  if (!selector || selector === 'body') {
    return { ok: false, code: 'no-selector', reason: 'No target selector was provided.' };
  }

  const explicitTabId = typeof message.tabId === 'number' ? message.tabId : undefined;
  const tabId = await resolveAimsTabId(explicitTabId);
  if (tabId === null) {
    return {
      ok: false,
      code: 'no-tab',
      reason: 'Open a CityU AIMS tab (https://*.cityu.edu.hk) and try again.'
    };
  }

  const guideText = typeof message.guideText === 'string' ? message.guideText : '';
  return highlightInTab(tabId, selector, guideText);
}

const router = (): void => {
  if (typeof chrome === 'undefined') {
    return;
  }

  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Unable to enable side panel on extension icon click:', error);
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

    if (message?.type === 'route-to-aims') {
      const explicitTabId = typeof message.tabId === 'number' ? message.tabId : sender.tab?.id;
      void routeToAims({ ...message, tabId: explicitTabId }).then(sendResponse, (error: unknown) => {
        sendResponse({
          ok: false,
          code: 'highlight-failed',
          reason: error instanceof Error ? error.message : 'Highlight failed.'
        } satisfies GuideResponse);
      });
      return true;
    }

    if (message?.type === 'clear-guide') {
      const explicitTabId = typeof message.tabId === 'number' ? message.tabId : sender.tab?.id;
      void clearGuide(explicitTabId).then(sendResponse, (error: unknown) => {
        sendResponse({
          ok: false,
          code: 'highlight-failed',
          reason: error instanceof Error ? error.message : 'Could not clear the spotlight.'
        } satisfies GuideResponse);
      });
      return true;
    }

    return false;
  });
};

router();
