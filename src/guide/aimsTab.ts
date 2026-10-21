export type TabCandidate = {
  id?: number;
  url?: string;
  active?: boolean;
  lastAccessed?: number;
  windowId?: number;
};

const CITYU_HOST = /(^|\.)cityu\.edu\.hk$/i;

export function isCityuUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && CITYU_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function pickAimsTabId(options: {
  explicitTabId?: number;
  tabs: TabCandidate[];
  focusedWindowId?: number;
}): number | null {
  const cityuTabs = options.tabs.filter((tab) => tab.id !== undefined && isCityuUrl(tab.url));

  if (typeof options.explicitTabId === 'number') {
    const explicit = cityuTabs.find((tab) => tab.id === options.explicitTabId);
    if (explicit?.id !== undefined) {
      return explicit.id;
    }
  }

  const activeInFocusedWindow = cityuTabs.find((tab) => {
    return tab.active === true && options.focusedWindowId !== undefined && tab.windowId === options.focusedWindowId;
  });
  if (activeInFocusedWindow?.id !== undefined) {
    return activeInFocusedWindow.id;
  }

  const activeCityu = cityuTabs.find((tab) => tab.active === true);
  if (activeCityu?.id !== undefined) {
    return activeCityu.id;
  }

  const recent = [...cityuTabs].sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0));
  return recent[0]?.id ?? null;
}
