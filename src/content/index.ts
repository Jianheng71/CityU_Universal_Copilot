import { GUIDE_PENDING_COMPLETION_KEY } from '../guide/session';
import type { GuideResponse, ShowGuideRequest } from '../guide/protocol';
import { FONT_SANS } from '../ui/fontStack';
import { getPreferredLanguage, t } from '../utils/i18n';
import { armPageGuide, disarmPageGuide } from './pageGuide';
import { initDynamicPrivacyShield } from './privacyShield';

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
  notice.style.right = '16px';
  notice.style.bottom = '16px';
  notice.style.zIndex = '2147483647';
  notice.style.maxWidth = 'min(320px, calc(100vw - 32px))';
  notice.style.background = '#171b22';
  notice.style.color = '#f4f6f8';
  notice.style.padding = '12px 16px 12px 18px';
  notice.style.borderRadius = '12px';
  notice.style.border = '1px solid rgba(255, 255, 255, 0.14)';
  notice.style.borderLeft = '3px solid #8fb4e8';
  notice.style.font = `500 14px/1.5 ${FONT_SANS}`;
  notice.style.boxShadow = '0 1px 1px rgba(0, 0, 0, 0.18), 0 12px 28px rgba(0, 0, 0, 0.28)';
  notice.style.pointerEvents = 'none';
  notice.setAttribute('data-cityu-privacy-notice', 'true');
  root.appendChild(notice);
  window.setTimeout(() => notice.remove(), 2500);
}

const privacyTrigger = (): void => {
  disarmPageGuide();
  try {
    chrome.runtime?.sendMessage?.({ type: 'clear-guide', cancel: true }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The local spotlight is already gone. Other frames are cleared when messaging works.
  }
  void showPrivacyNotice();
};

function publishStepCompletion(selector: string, departureUrl = ''): void {
  try {
    void chrome.storage?.session?.set({
      [GUIDE_PENDING_COMPLETION_KEY]: { selector, at: Date.now(), departureUrl }
    });
  } catch {
    // The runtime message below is the primary completion signal.
  }

  try {
    chrome.runtime?.sendMessage?.({ type: 'guide-step-done', selector, departureUrl }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // A reloaded frame reads the stored completion and continues the guide.
  }
}

function announceFrameReady(): void {
  try {
    chrome.runtime?.sendMessage?.({ type: 'guide-frame-ready' }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The side panel can still start a guide in this frame.
  }
}

async function handleShowGuide(message: ShowGuideRequest): Promise<GuideResponse> {
  const selector = typeof message.selector === 'string' ? message.selector.trim() : '';
  const provided = typeof message.guideText === 'string' ? message.guideText.trim() : '';
  const guideText = provided || t('workflow.default', await getPreferredLanguage());
  return armPageGuide({
    selector,
    guideText,
    searchFrames: message.searchFrames === true,
    guideToken: typeof message.guideToken === 'string' ? message.guideToken : '',
    onComplete: publishStepCompletion
  });
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
      disarmPageGuide();
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

  announceFrameReady();
  window.addEventListener('pageshow', () => {
    announceFrameReady();
  });
}
