import React, { useEffect, useState } from 'react';
import './style.css';
import { getAISettings, setAISettings, type AIProvider } from './services/aiRouter';
import { getPreferredLanguage, setPreferredLanguage, t, type SupportedLanguage } from './utils/i18n';

export default function Popup(): JSX.Element {
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [provider, setProvider] = useState<AIProvider>('deepseek');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    void getPreferredLanguage().then(setLanguage);
    void getAISettings().then((settings) => {
      setProvider(settings.provider);
      setDeepseekApiKey(settings.deepseekApiKey);
      setGeminiApiKey(settings.geminiApiKey);
    });
  }, []);

  const onLanguageChange = async (nextLanguage: SupportedLanguage): Promise<void> => {
    setLanguage(nextLanguage);
    await setPreferredLanguage(nextLanguage);
  };

  const onSaveSettings = async (): Promise<void> => {
    await setAISettings({ provider, deepseekApiKey, geminiApiKey });
  };

  return (
    <div className="min-w-[360px] bg-slate-50 p-5 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{t('app.title', language)}</div>
          <div className="text-sm text-slate-500">{t('app.subtitle', language)}</div>
        </div>
      </div>

      <label className="mb-3 block text-sm font-medium">
        {t('language.label', language)}
        <select
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          value={language}
          onChange={(event) => void onLanguageChange(event.target.value as SupportedLanguage)}
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </label>

      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium">AI provider</label>
        <select
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          value={provider}
          onChange={(event) => setProvider(event.target.value as AIProvider)}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium">DeepSeek API key</label>
        <input
          type="password"
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          value={deepseekApiKey}
          onChange={(event) => setDeepseekApiKey(event.target.value)}
          placeholder="sk-..."
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium">Gemini API key</label>
        <input
          type="password"
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          value={geminiApiKey}
          onChange={(event) => setGeminiApiKey(event.target.value)}
          placeholder="AIza..."
        />
      </div>

      <button
        type="button"
        className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        onClick={() => void onSaveSettings()}
      >
        Save AI settings
      </button>

      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {t('privacy.safe', language)}
      </div>
    </div>
  );
}
