import React, { useEffect, useState } from 'react';
import './style.css';
import { getPreferredLanguage, t, type SupportedLanguage } from './utils/i18n';

export default function SidePanel(): JSX.Element {
  const [language, setLanguage] = useState<SupportedLanguage>('en');

  useEffect(() => {
    void getPreferredLanguage().then(setLanguage);
  }, []);

  return (
    <div className="min-h-[500px] bg-slate-100 p-5 text-slate-900">
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="text-xl font-semibold">{t('app.title', language)}</div>
        <div className="mt-1 text-sm text-slate-600">{t('sidebar.welcome', language)}</div>
      </div>

      <div className="rounded-2xl bg-sky-100 p-4 text-sm text-sky-900 ring-1 ring-sky-200">
        {t('sidebar.status', language)}
      </div>
    </div>
  );
}
