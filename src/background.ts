import { getPreferredLanguage } from './utils/i18n';

const router = (): void => {
  if (typeof chrome === 'undefined') {
    return;
  }

  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.error('Unable to enable side panel on extension icon click:', error);
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'get-language') {
      getPreferredLanguage().then((language) => {
        sendResponse({ language });
      });
      return true;
    }

    if (message?.type === 'route-to-aims') {
      const tabId = message.tabId ?? undefined;
      const guideMessage = {
        type: 'show-guide',
        selector: message.selector,
        guideText: message.guideText
      };

      const sendGuide = (targetTabId: number): void => {
        chrome.tabs.sendMessage(targetTabId, guideMessage, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            sendResponse({ ok: false, reason: 'AIMS page content script is unavailable. Refresh the AIMS tab and try again.' });
            return;
          }
          sendResponse(response ?? { ok: false, reason: 'The AIMS page did not acknowledge the highlight request.' });
        });
      };

      if (typeof tabId === 'number') {
        sendGuide(tabId);
        return true;
      }

      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) {
          sendResponse({ ok: false, reason: error.message });
          return;
        }
        const activeTab = tabs[0];
        if (!activeTab?.id) {
          sendResponse({ ok: false, reason: 'No active tab available' });
          return;
        }

        sendGuide(activeTab.id);
      });
      return true;
    }

    if (message?.type === 'clear-guide') {
      const tabId = message.tabId ?? undefined;

      if (typeof tabId === 'number') {
        chrome.tabs.sendMessage(tabId, { type: 'clear-guide' }, () => {
          const error = chrome.runtime.lastError;
          sendResponse(error ? { ok: false, reason: error.message } : { ok: true });
        });
        return true;
      }

      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) {
          sendResponse({ ok: false, reason: error.message });
          return;
        }
        const activeTab = tabs[0];
        if (!activeTab?.id) {
          sendResponse({ ok: false, reason: 'No active tab available' });
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'clear-guide' }, () => {
          const messageError = chrome.runtime.lastError;
          sendResponse(messageError ? { ok: false, reason: messageError.message } : { ok: true, tabId: activeTab.id });
        });
      });
      return true;
    }

    return false;
  });
};

router();
