import { getPreferredLanguage } from './utils/i18n';

const router = (): void => {
  if (typeof chrome === 'undefined') {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'get-language') {
      getPreferredLanguage().then((language) => {
        sendResponse({ language });
      });
      return true;
    }

    if (message?.type === 'route-to-aims') {
      const tabId = message.tabId ?? undefined;
      if (typeof tabId === 'number') {
        chrome.tabs.sendMessage(tabId, { type: 'show-guide', selector: message.selector, guideText: message.guideText }, () => {
          sendResponse({ ok: true });
        });
        return true;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) {
          sendResponse({ ok: false, reason: 'No active tab available' });
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'show-guide', selector: message.selector, guideText: message.guideText }, () => {
          sendResponse({ ok: true, tabId: activeTab.id });
        });
      });
      return true;
    }

    if (message?.type === 'clear-guide') {
      const tabId = message.tabId ?? undefined;

      if (typeof tabId === 'number') {
        chrome.tabs.sendMessage(tabId, { type: 'clear-guide' }, () => {
          sendResponse({ ok: true });
        });
        return true;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) {
          sendResponse({ ok: false, reason: 'No active tab available' });
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'clear-guide' }, () => {
          sendResponse({ ok: true, tabId: activeTab.id });
        });
      });
      return true;
    }

    return false;
  });
};

router();
