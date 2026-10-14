import React, { useEffect, useState } from 'react';
import './style.css';
import { getAISettings, routeModelRequest, setAISettings, type AIProvider } from './services/aiRouter';
import { getPreferredLanguage, t, type SupportedLanguage } from './utils/i18n';

export default function SidePanel(): JSX.Element {
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [provider, setProvider] = useState<AIProvider>('deepseek');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [intent, setIntent] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    void getPreferredLanguage().then(setLanguage);
    void getAISettings().then((settings) => {
      setProvider(settings.provider);
      setDeepseekApiKey(settings.deepseekApiKey);
      setGeminiApiKey(settings.geminiApiKey);
    });
  }, []);

  const onSaveSettings = async (): Promise<void> => {
    await setAISettings({ provider, deepseekApiKey, geminiApiKey });
  };

  const onAskAI = async (): Promise<void> => {
    if (!intent.trim()) {
      setResult('Please enter a question or workflow title first.');
      return;
    }

    const response = await routeModelRequest(intent);
    setResult(response.response);
  };

  return (
    <div className="min-h-[500px] bg-slate-100 p-5 text-slate-900">
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="text-xl font-semibold">{t('app.title', language)}</div>
        <div className="mt-1 text-sm text-slate-600">{t('sidebar.welcome', language)}</div>
      </div>

      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-2 text-sm font-medium">Provider</div>
        <select
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          value={provider}
          onChange={(event) => setProvider(event.target.value as AIProvider)}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="gemini">Gemini</option>
        </select>

        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">DeepSeek Key</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
              value={deepseekApiKey}
              onChange={(event) => setDeepseekApiKey(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Gemini Key</label>
            <input
              type="password"
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
              value={geminiApiKey}
              onChange={(event) => setGeminiApiKey(event.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white"
          onClick={() => void onSaveSettings()}
        >
          Save
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-2 text-sm font-medium">Ask the AI</div>
        <textarea
          className="h-24 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder="Example: How do I check my weekly schedule in AIMS?"
        />
        <button
          type="button"
          className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
          onClick={() => void onAskAI()}
        >
          Ask
        </button>

        {result ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200 whitespace-pre-wrap">
            {result}
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl bg-sky-100 p-4 text-sm text-sky-900 ring-1 ring-sky-200">
        {t('sidebar.status', language)}
      </div>
    </div>
  );
}
