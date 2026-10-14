export type SupportedLanguage = 'en' | 'zh';

const STORAGE_KEY = 'cityu-universal-sinno-language';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const translationCatalog: Record<string, { en: string; zh: string }> = {
  'app.title': { en: 'CityU Universal Sinno', zh: '城大通用 Sinno' },
  'app.subtitle': { en: 'Digital adoption platform for CityU administrative systems', zh: '城大行政系统数字化适配平台' },
  'privacy.safe': { en: 'Privacy-safe mode is active', zh: '隐私防护模式已开启' },
  'privacy.shutdown': { en: 'Privacy shield triggered for safety', zh: '隐私保护已触发，已停止操作' },
  'sidebar.welcome': { en: 'Welcome', zh: '欢迎' },
  'sidebar.status': { en: 'Status ready', zh: '状态就绪' },
  'workflow.default': { en: 'Start guidance', zh: '开始引导' },
  'language.label': { en: 'Language', zh: '语言' },
  'provider.label': { en: 'AI provider', zh: 'AI 提供商' }
};

export function t(key: string, lang: SupportedLanguage = DEFAULT_LANGUAGE): string {
  return translationCatalog[key]?.[lang] ?? translationCatalog[key]?.en ?? key;
}

export async function getPreferredLanguage(): Promise<SupportedLanguage> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const result = await chrome.storage.sync.get(STORAGE_KEY);
      const value = result[STORAGE_KEY];
      return value === 'zh' ? 'zh' : 'en';
    }
  } catch {
    // Fallback to local storage when extension storage is unavailable.
  }

  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  return stored === 'zh' ? 'zh' : 'en';
}

export async function setPreferredLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: lang });
      return;
    }
  } catch {
    // Fall back to the browser localStorage when storage API is unavailable.
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }
}
