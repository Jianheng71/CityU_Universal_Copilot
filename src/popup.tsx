import React, { useEffect, useState } from 'react';
import './style.css';
import { getAISettings, setAISettings, type AIProvider } from './services/aiRouter';
import { getPreferredLanguage, setPreferredLanguage, t, type SupportedLanguage } from './utils/i18n';

const fieldClass =
  'h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-body font-normal text-ink';

export default function Popup(): JSX.Element {
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [provider, setProvider] = useState<AIProvider>('deepseek');

  useEffect(() => {
    void getPreferredLanguage().then(setLanguage);
    void getAISettings().then((settings) => {
      setProvider(settings.provider);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-Hans' : 'en';
  }, [language]);

  const onLanguageChange = async (nextLanguage: SupportedLanguage): Promise<void> => {
    setLanguage(nextLanguage);
    await setPreferredLanguage(nextLanguage);
  };

  const onSaveSettings = async (): Promise<void> => {
    await setAISettings({ provider });
  };

  return (
    <div className="w-[360px] bg-canvas p-6 font-sans text-ink">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-accent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
            <path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-balance text-body font-semibold">{t('app.title', language)}</h1>
          <p className="text-pretty text-secondary text-muted">{t('app.subtitle', language)}</p>
        </div>
      </header>

      <div className="grid gap-4">
        <label className="grid gap-2 text-secondary font-medium" htmlFor="popup-language">
          {t('language.label', language)}
          <select
            id="popup-language"
            className={fieldClass}
            value={language}
            onChange={(event) => void onLanguageChange(event.target.value as SupportedLanguage)}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </label>

        <label className="grid gap-2 text-secondary font-medium" htmlFor="popup-provider">
          {t('provider.label', language)}
          <select
            id="popup-provider"
            className={fieldClass}
            value={provider}
            onChange={(event) => setProvider(event.target.value as AIProvider)}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        className="mt-6 flex h-11 w-full cursor-pointer items-center justify-center rounded-control bg-accent text-body font-medium text-on-accent transition-colors duration-150 ease-out hover:bg-accent-hover active:bg-accent-active"
        onClick={() => void onSaveSettings()}
      >
        {t('settings.save', language)}
      </button>

      <div className="mt-4 flex items-start gap-2 rounded-card border border-line bg-surface px-4 py-3 text-secondary text-ink">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 shrink-0 text-accent">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 12.5 10.5 15 16 9.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p>{t('privacy.safe', language)}</p>
      </div>
    </div>
  );
}
