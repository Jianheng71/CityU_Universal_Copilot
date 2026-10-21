import { findHighlightTarget } from './domTarget';
import { clipSelector, type GuideResponse, type ShowGuideRequest } from '../guide/protocol';
import { getPreferredLanguage, t } from '../utils/i18n';
import { initDynamicPrivacyShield } from './privacyShield';
import { injectGlassSpotlight, removeSpotlight } from './spotlightOverlay';

const STARTED_FLAG = '__cityuSinnoContentStarted';

async function showPrivacyNotice(): Promise<void> {
  const lang = await getPreferredLanguage();
  const root = document.body ?? document.documentElement;
  if (!root) {
    return;
  }

  document.querySelectorAll('[data-cityu-privacy-notice="true"]').forEach((node) => node.remove());
  const notice = document.createElement('div');
  notice.textContent = t('privacy.shutdown', lang);
  notice.style.position = 'fixed';
  notice.style.right = '20px';
  notice.style.bottom = '20px';
  notice.style.zIndex = '2147483647';
  notice.style.background = 'rgba(15, 23, 42, 0.92)';
  notice.style.color = '#fff';
  notice.style.padding = '10px 12px';
  notice.style.borderRadius = '999px';
  notice.style.font = '12px/1.4 sans-serif';
  notice.style.boxShadow = '0 8px 20px rgba(15, 23, 42, 0.25)';
  notice.setAttribute('data-cityu-privacy-notice', 'true');
  root.appendChild(notice);
  window.setTimeout(() => notice.remove(), 2500);
}

const privacyTrigger = (): void => {
  removeSpotlight();
  try {
    chrome.runtime?.sendMessage?.({ type: 'clear-guide' }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The local spotlight is already gone. Other frames are cleared when messaging works.
  }
  void showPrivacyNotice();
};

async function handleShowGuide(message: ShowGuideRequest): Promise<GuideResponse> {
  const selector = typeof message.selector === 'string' ? message.selector.trim() : '';
  if (!selector || selector === 'body') {
    return { ok: false, code: 'no-selector', reason: 'No target selector was provided.' };
  }

  const found = findHighlightTarget(document, selector, message.searchFrames === true);
  if (found.invalid) {
    return {
      ok: false,
      code: 'invalid-selector',
      reason: `The highlight selector is not valid CSS (${clipSelector(selector)}).`
    };
  }

  if (!found.element) {
    return {
      ok: false,
      code: 'element-not-found',
      reason: 'The requested AIMS element was not found in this frame.'
    };
  }

  const provided = typeof message.guideText === 'string' ? message.guideText.trim() : '';
  const guideText = provided || t('workflow.default', await getPreferredLanguage());
  const drawn = injectGlassSpotlight(found.element, guideText);
  if (!drawn.ok) {
    return drawn;
  }

  return { ok: true, code: 'ok', selector };
}

function registerGuideMessages(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const type = (message as { type?: unknown }).type;
    if (type === 'clear-guide') {
      removeSpotlight();
      sendResponse({ ok: true, code: 'ok' } satisfies GuideResponse);
      return false;
    }

    if (type === 'show-guide') {
      void handleShowGuide(message as ShowGuideRequest).then(sendResponse, (error: unknown) => {
        sendResponse({
          ok: false,
          code: 'highlight-failed',
          reason: error instanceof Error ? error.message : 'Highlight failed.'
        } satisfies GuideResponse);
      });
      return true;
    }

    return false;
  });
}

export function startAimsContentScript(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const scope = window as Window & { [STARTED_FLAG]?: boolean };
  if (scope[STARTED_FLAG]) {
    return;
  }
  scope[STARTED_FLAG] = true;

  registerGuideMessages();
  try {
    initDynamicPrivacyShield(privacyTrigger);
  } catch (error) {
    console.error('CityU privacy shield failed to start', error);
  }
}
