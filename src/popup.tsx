import React, { useEffect, useState } from 'react';
import './style.css';
import { getPreferredLanguage, setPreferredLanguage, t, type SupportedLanguage } from './utils/i18n';

export default function Popup(): JSX.Element {
  const [language, setLanguage] = useState<SupportedLanguage>('en');

  useEffect(() => {
    void getPreferredLanguage().then(setLanguage);
  }, []);

  const onLanguageChange = async (nextLanguage: SupportedLanguage): Promise<void> => {
    setLanguage(nextLanguage);
    await setPreferredLanguage(nextLanguage);
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

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {t('privacy.safe', language)}
      </div>
    </div>
  );
}
