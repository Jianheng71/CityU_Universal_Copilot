import React, { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import '../style.css';
import { pickAimsTabId, type TabCandidate } from '../guide/aimsTab';
import { planGuide } from '../guide/planner';
import { interpretGuideResult, type GuideResponse } from '../guide/protocol';
import { getAISettings, routeModelRequest, setAISettings, type AIProvider } from '../services/aiRouter';
import { bundledWorkflowRegistry } from '../services/registryLoader';
import { getPreferredLanguage, setPreferredLanguage, type SupportedLanguage } from '../utils/i18n';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

type Copy = {
  greeting: string;
  subtitle: string;
  placeholder: string;
  send: string;
  welcome: string;
  suggestions: string[];
  thinking: string;
  highlight: string;
  waiting: string;
  guideNext: string;
  guideDone: string;
  noTab: string;
  unavailable: string;
  theme: string;
  language: string;
  provider: string;
  privacy: string;
};

const copy: Record<SupportedLanguage, Copy> = {
  en: {
    greeting: 'Hi, how can I help?',
    subtitle: 'Your guide to CityU AIMS',
    placeholder: 'Ask about AIMS...',
    send: 'Send message',
    welcome: 'Ask a question or choose a suggestion to get started.',
    suggestions: ['How do I view my weekly schedule?', 'How do I check my academic progress?'],
    thinking: 'Thinking…',
    highlight: 'Highlighted in your AIMS tab. The spotlight stays on this step and follows each page until you reach the destination.',
    waiting: 'The guide is active. The spotlight stays armed and will show as soon as that AIMS step is on screen.',
    guideNext: 'Next step is highlighted in your AIMS tab.',
    guideDone: 'AIMS guide finished.',
    noTab: 'Open a CityU AIMS page to highlight the matching menu.',
    unavailable: 'Could not highlight the AIMS page. Make sure it is open, then refresh it.',
    theme: 'Toggle color theme',
    language: 'Switch language',
    provider: 'AI model',
    privacy: 'Your questions are sent to the selected AI provider. Do not include passwords or sensitive personal information.'
  },
  zh: {
    greeting: '你好，需要什么帮助？',
    subtitle: '你的 CityU AIMS 操作助手',
    placeholder: '询问 AIMS 操作方法…',
    send: '发送消息',
    welcome: '输入问题，或选择下方建议开始。',
    suggestions: ['如何查看每周课表？', '如何查询学业进度？'],
    thinking: '思考中…',
    highlight: '已在 AIMS 页面高亮。聚光灯会停在当前步骤，并跟随页面直到到达目标页。',
    waiting: '引导已开始。聚光灯会保持，等这个步骤出现在 AIMS 页面上就继续显示。',
    guideNext: '已在 AIMS 页面高亮下一步。',
    guideDone: 'AIMS 引导已完成。',
    noTab: '请先打开 CityU AIMS 页面，再高亮对应菜单。',
    unavailable: '无法高亮 AIMS 页面。请确认页面已打开，然后刷新页面。',
    theme: '切换颜色主题',
    language: '切换语言',
    provider: 'AI 模型',
    privacy: '问题会发送给所选 AI 服务商处理。请勿输入密码或敏感个人信息。'
  }
};

function Icon({ name, size = 20 }: { name: 'send' | 'spark' | 'sun' | 'moon'; size?: number }): JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const
  };

  if (name === 'send') {
    return <svg {...common}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>;
  }
  if (name === 'sun') {
    return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>;
  }
  if (name === 'moon') {
    return <svg {...common}><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></svg>;
  }
  return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></svg>;
}

function sendToBackground(message: {
  type: 'start-guide' | 'clear-guide';
  workflowKey?: string;
  steps?: Array<{ stepId: number; targetSelector: string; guideText: string }>;
  tabId?: number;
  cancel?: boolean;
}): Promise<GuideResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return Promise.resolve({ ok: false, code: 'no-ack', reason: 'Extension messaging is unavailable.' });
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve({
        ok: false,
        code: 'no-ack',
        reason: 'The highlight request timed out before the AIMS page responded.'
      });
    }, 8000);

    try {
      chrome.runtime.sendMessage(message, (response: GuideResponse | undefined) => {
        window.clearTimeout(timer);
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          resolve({ ok: false, code: 'no-ack', reason: runtimeError.message });
          return;
        }
        resolve(response ?? { ok: false, code: 'no-ack', reason: 'No response from the extension background.' });
      });
    } catch (error) {
      window.clearTimeout(timer);
      resolve({
        ok: false,
        code: 'no-ack',
        reason: error instanceof Error ? error.message : 'Extension messaging is unavailable.'
      });
    }
  });
}

async function resolveAimsTabId(): Promise<number | undefined> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return undefined;
  }

  try {
    const [tabs, currentWindow] = await Promise.all([
      chrome.tabs.query({}),
      chrome.windows.getCurrent()
    ]);
    const candidates: TabCandidate[] = tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      active: tab.active,
      lastAccessed: tab.lastAccessed,
      windowId: tab.windowId
    }));
    return pickAimsTabId({ tabs: candidates, focusedWindowId: currentWindow?.id }) ?? undefined;
  } catch {
    return undefined;
  }
}

export default function SidePanel(): JSX.Element {
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [provider, setProvider] = useState<AIProvider>('deepseek');
  const [darkMode, setDarkMode] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const text = copy[language];

  useEffect(() => {
    void getPreferredLanguage().then(setLanguage);
    void getAISettings().then((settings) => setProvider(settings.provider));
    setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      return undefined;
    }

    const listener = (message: { type?: string; phase?: string; stepIndex?: number }): void => {
      if (!message || message.type !== 'guide-progress') {
        return;
      }
      if (message.phase === 'finished') {
        setNotice(copy[language].guideDone);
        return;
      }
      if (message.phase === 'showing' && typeof message.stepIndex === 'number') {
        setNotice(message.stepIndex > 0 ? copy[language].guideNext : copy[language].highlight);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [language]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, notice]);

  const changeProvider = async (nextProvider: AIProvider): Promise<void> => {
    setProvider(nextProvider);
    await setAISettings({ provider: nextProvider });
  };

  const changeLanguage = async (): Promise<void> => {
    const nextLanguage = language === 'en' ? 'zh' : 'en';
    setLanguage(nextLanguage);
    await setPreferredLanguage(nextLanguage);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const intent = prompt.trim();
    if (!intent || busy) return;

    setPrompt('');
    setNotice('');
    setMessages((current) => [...current, { role: 'user', text: intent }]);
    setBusy(true);

    try {
      const planned = planGuide(intent, bundledWorkflowRegistry);
      const steps = planned
        ? planned.steps.filter((step) => step.targetSelector && step.targetSelector !== 'body')
        : [];
      const tabId = await resolveAimsTabId();
      const showGuideNotice = (highlight: GuideResponse): void => {
        const kind = interpretGuideResult(highlight);
        if (kind === 'finished') {
          setNotice(text.guideDone);
        } else if (kind === 'highlighted') {
          setNotice(text.highlight);
        } else if (kind === 'waiting') {
          setNotice(text.waiting);
        } else if (kind === 'no-tab') {
          setNotice(highlight.reason ? `${text.noTab} (${highlight.reason})` : text.noTab);
        } else {
          setNotice(highlight.reason ? `${text.unavailable} (${highlight.reason})` : text.unavailable);
        }
      };
      const highlightPromise = planned && steps.length
        ? sendToBackground({
          type: 'start-guide',
          workflowKey: planned.workflowKey,
          steps: steps.map((step) => ({
            stepId: step.stepId,
            targetSelector: step.targetSelector,
            guideText: step.guideText[language]
          })),
          tabId
        }).then((highlight) => {
          showGuideNotice(highlight);
          return highlight;
        })
        : Promise.resolve(null);
      const [, result] = await Promise.all([highlightPromise, routeModelRequest(intent)]);

      setMessages((current) => [...current, { role: 'assistant', text: result.response }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setMessages((current) => [...current, { role: 'assistant', text: message }]);
    } finally {
      setBusy(false);
    }
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const selectSuggestion = (suggestion: string): void => {
    setPrompt(suggestion);
  };

  return (
    <main className={darkMode ? 'dark min-h-screen' : 'min-h-screen'}>
      <div className="flex h-screen min-h-[520px] flex-col overflow-hidden bg-[#f0f4f9] text-[#1f1f1f] transition-colors dark:bg-[#131314] dark:text-[#e3e3e3]">
        <header className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#5276d8] shadow-sm dark:bg-[#282a2c] dark:text-[#a8c7fa]">
              <Icon name="spark" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Sinno</div>
              <div className="truncate text-xs text-[#5f6368] dark:text-[#aeb0b3]">{text.subtitle}</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <label className="sr-only" htmlFor="ai-provider">{text.provider}</label>
            <select
              id="ai-provider"
              value={provider}
              onChange={(event) => void changeProvider(event.target.value as AIProvider)}
              className="max-w-[128px] rounded-full border border-[#d8dce3] bg-white px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-[#a8c7fa] dark:border-[#444746] dark:bg-[#282a2c]"
              aria-label={text.provider}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="gemini">Gemini</option>
            </select>
            <button
              type="button"
              onClick={() => void changeLanguage()}
              aria-label={text.language}
              className="rounded-full border border-[#d8dce3] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#e8edf5] dark:border-[#444746] dark:bg-[#282a2c] dark:hover:bg-[#353739]"
            >
              {language === 'en' ? 'EN' : '中文'}
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              aria-label={text.theme}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#e4e9f1] dark:hover:bg-[#282a2c]"
            >
              <Icon name={darkMode ? 'sun' : 'moon'} size={18} />
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center py-8">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[#5f6368] dark:text-[#aeb0b3]">
                CityU AIMS
              </div>
              <h1 className="mb-3 text-3xl font-medium leading-tight tracking-tight text-[#3c4043] dark:text-[#e3e3e3]">
                {text.greeting}
              </h1>
              <p className="mb-7 text-sm text-[#5f6368] dark:text-[#aeb0b3]">{text.welcome}</p>
              <div className="grid gap-3">
                {text.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => selectSuggestion(suggestion)}
                    className="group flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-4 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-[#1e1f20] dark:hover:bg-[#282a2c]"
                  >
                    <span>{suggestion}</span>
                    <span className="text-[#6f7f99] transition group-hover:translate-x-1 dark:text-[#a8c7fa]">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-lg flex-col gap-5 py-5">
              {messages.map((message, index) => (
                <article key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  {message.role === 'assistant' ? (
                    <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#5276d8] dark:bg-[#282a2c] dark:text-[#a8c7fa]">
                      <Icon name="spark" size={16} />
                    </div>
                  ) : null}
                  <div className={message.role === 'user'
                    ? 'max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-[#d3e3fd] px-4 py-3 text-sm leading-6 text-[#1f1f1f] dark:bg-[#004a77] dark:text-[#e3e3e3]'
                    : 'max-w-[90%] whitespace-pre-wrap rounded-3xl bg-white px-4 py-3 text-sm leading-6 shadow-sm dark:bg-[#1e1f20]'}>
                    {message.text}
                  </div>
                </article>
              ))}
              {busy ? (
                <div className="flex items-center gap-3 px-2 text-sm text-[#5f6368] dark:text-[#aeb0b3]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#5276d8] dark:bg-[#a8c7fa]" />
                  {text.thinking}
                </div>
              ) : null}
              {notice ? (
                <div className="rounded-2xl bg-[#e2eaf8] px-4 py-3 text-xs text-[#3c526e] dark:bg-[#202a36] dark:text-[#c2d7f5]">
                  {notice}
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <footer className="px-4 pb-3 pt-2">
          <form
            onSubmit={(event) => void onSubmit(event)}
            className="mx-auto flex max-w-2xl items-end gap-2 rounded-full bg-white p-2 pl-4 shadow-sm ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[#a8c7fa] dark:bg-[#1e1f20] dark:ring-white/10"
          >
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={text.placeholder}
              aria-label={text.placeholder}
              rows={1}
              className="max-h-28 min-h-10 flex-1 resize-none self-center bg-transparent py-2 text-sm leading-6 outline-none placeholder:text-[#7a8087] dark:placeholder:text-[#aeb0b3]"
            />
            <button
              type="submit"
              disabled={!prompt.trim() || busy}
              aria-label={text.send}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5276d8] text-white transition hover:bg-[#4166c8] disabled:cursor-not-allowed disabled:bg-[#d8dce3] disabled:text-[#7a8087] dark:bg-[#a8c7fa] dark:text-[#10233f] dark:hover:bg-[#c1d7fa] dark:disabled:bg-[#353739] dark:disabled:text-[#8e9194]"
            >
              <Icon name="send" size={17} />
            </button>
          </form>
          <p className="mx-auto mt-2 max-w-2xl px-2 text-center text-[10px] leading-4 text-[#72777f] dark:text-[#9aa0a6]">
            {text.privacy}
          </p>
        </footer>
      </div>
    </main>
  );
}
