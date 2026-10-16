import { getPreferredLanguage, t } from '../utils/i18n';
import { initDynamicPrivacyShield } from './privacyShield';
import { injectGlassSpotlight, removeSpotlight } from './spotlightOverlay';

const privacyTrigger = async (): Promise<void> => {
  removeSpotlight();
  const lang = await getPreferredLanguage();
  const message = t('privacy.shutdown', lang);
  const root = document.body ?? document.documentElement;

  if (root) {
    const notice = document.createElement('div');
    notice.textContent = message;
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

    setTimeout(() => notice.remove(), 2500);
  }
};

initDynamicPrivacyShield(privacyTrigger);

const initializeContentScript = async (): Promise<void> => {
  const lang = await getPreferredLanguage();
  const key = 'aims-degree-works';
  const selector = 'a[href*="bmenu.P_StudyPlan"]';
  const target = document.querySelector(selector) as HTMLElement | null;
  if (target) {
    injectGlassSpotlight(target, t('workflow.default', lang));
  }

  if (typeof chrome !== 'undefined') {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'show-guide') {
        const targetSelector = typeof message.selector === 'string' ? message.selector : '';
        const nextTarget = targetSelector ? document.querySelector(targetSelector) as HTMLElement | null : null;
        if (!nextTarget) {
          return false;
        }

        injectGlassSpotlight(nextTarget, message.guideText ?? t('workflow.default', lang));
        sendResponse({ ok: true, selector: targetSelector });
        return false;
      }

      if (message?.type === 'clear-guide') {
        removeSpotlight();
        sendResponse({ ok: true });
        return false;
      }

      return false;
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initializeContentScript(), { once: true });
} else {
  void initializeContentScript();
}
