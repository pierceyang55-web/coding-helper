'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Interface copy only. Nothing here is ever sent to a model — switching the
 * language costs zero tokens. The *answer* language is a separate thing: it is
 * stored per submission and steers the system prompt (see lib/modes.ts).
 */
export type Locale = 'zh-TW' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh-TW';
const STORAGE_KEY = 'coding-helper.locale';

type Vars = Record<string, string | number>;

const EN = {
  'app.tagline': 'Snap a problem. Read the answer anywhere you are signed in.',
  'app.signOut': 'Sign out',
  'app.newProblem': 'New problem',

  'login.placeholder': 'Passcode',
  'login.unlock': 'Unlock',
  'login.unlocking': 'Unlocking…',
  'login.wrong': 'Wrong passcode.',
  'login.network': 'Could not reach the server. Check your connection and try again.',
  'login.notConfigured':
    'APP_EMAIL is not set on this deployment, so there is no account to sign in to.',
  'login.hint':
    'Once per device — the session refreshes itself after that. Unlock on your phone and your computer and results appear on both at once.',

  'capture.heading': 'New problem',
  'capture.choose': 'Choose photos',
  'capture.addMore': 'Add more photos',
  'capture.takePhoto': 'Take a photo',
  'capture.ready': '{n} photo{s} ready',
  'capture.max': ' · max {n}',
  'capture.clear': 'Clear',
  'capture.solveWith': 'Solve with {mode}',

  'capture.uploading': 'Uploading…',
  'capture.hintMulti':
    'All the photos are read together as one problem — shoot a long question across several screens.',
  'capture.hintSingle':
    'Add up to {n} photos of the same problem, then pick a model. Whichever you press is the one that runs — the other waits on its tab.',
  'capture.removePhoto': 'Remove photo {n}',

  'history.heading': 'History',
  'history.reading': 'Reading photo…',
  'history.justNow': 'just now',
  'history.minutes': '{n}m ago',
  'history.hours': '{n}h ago',

  'problem.reading': 'Reading the photo…',
  'problem.loading': 'Loading…',
  'problem.none': 'Nothing captured yet',
  'problem.showPhoto': 'Show the original photo',
  'problem.showPhotos': 'Show all {n} photos',
  'problem.rerun': 'Run {mode} again',

  'panel.emptyTitle': 'No problem captured yet',
  'panel.emptyBody':
    'Add a photo of a question on your phone and pick a model. The answer lands here on every device you are signed in on.',
  'panel.queued': 'Queued',
  'panel.onDemandBody': 'Nothing runs until you ask. Start {mode} on this problem:',
  'panel.startMode': 'Run {mode}',
  'panel.estimatedCost': 'about {cost}',
  'panel.tokens': '{in} in / {out} out',
  'panel.failed': 'This pass failed',
  'panel.unknownError': 'Unknown error',
  'panel.timeout':
    'Stopped at the {s}s ceiling for {mode} mode — everything above is what arrived in time. Switch to a slower tab for the complete answer.',
  'panel.follow': 'Follow output',
  'panel.following': 'Following output',
  'panel.jumpToNewest': 'Jump to newest',
  'panel.followOn': 'Keep the newest text in view as it streams',
  'panel.followOff': 'Stop following — scroll wherever you like',

  'tabs.queued': 'queued',
  'tabs.failed': 'failed',

  'mode.medium.tagline': 'Sonnet 5 · the everyday answer',
  'mode.fine.tagline': 'Opus 5 · same format, stronger model',

  'locale.switch': '中文',
} as const;

export type StringKey = keyof typeof EN;

/**
 * Traditional Chinese. Interview vocabulary deliberately stays in English —
 * the same rule the model is given for the answer body.
 */
const ZH: Record<StringKey, string> = {
  'app.tagline': '拍下題目，在任何登入的裝置上看答案。',
  'app.signOut': '登出',
  'app.newProblem': '新題目',

  'login.placeholder': '密碼',
  'login.unlock': '解鎖',
  'login.unlocking': '解鎖中…',
  'login.wrong': '密碼錯誤。',
  'login.network': '連不到伺服器，確認網路後再試一次。',
  'login.notConfigured': '這份部署沒有設定 APP_EMAIL，沒有可以登入的帳號。',
  'login.hint': '每台裝置只需要輸入一次，之後 session 會自動續期。手機和電腦都解鎖，結果就會同時出現在兩邊。',

  'capture.heading': '新題目',
  'capture.choose': '選擇照片',
  'capture.addMore': '再加照片',
  'capture.takePhoto': '拍照',
  'capture.ready': '已選 {n} 張',
  'capture.max': ' · 上限 {n} 張',
  'capture.clear': '清空',
  'capture.solveWith': '用 {mode} 解',

  'capture.uploading': '上傳中…',
  'capture.hintMulti': '所有照片會被當成同一題一起讀 — 長題目可以分幾個畫面拍。',
  'capture.hintSingle':
    '同一題最多可加 {n} 張照片，選完再決定用哪個模型。按哪個就跑哪個，另一個會在它的分頁上等你。',
  'capture.removePhoto': '移除第 {n} 張',

  'history.heading': '歷史紀錄',
  'history.reading': '讀取照片中…',
  'history.justNow': '剛剛',
  'history.minutes': '{n} 分鐘前',
  'history.hours': '{n} 小時前',

  'problem.reading': '讀取照片中…',
  'problem.loading': '載入中…',
  'problem.none': '尚未拍攝任何題目',
  'problem.showPhoto': '顯示原始照片',
  'problem.showPhotos': '顯示全部 {n} 張照片',
  'problem.rerun': '重跑 {mode}',

  'panel.emptyTitle': '尚未拍攝任何題目',
  'panel.emptyBody':
    '用手機拍下題目，再選一個模型。結果會出現在你所有已登入的裝置上。',
  'panel.queued': '排隊中',
  'panel.onDemandBody': '沒有東西會自己跑。用 {mode} 解這一題：',
  'panel.startMode': '執行 {mode}',
  'panel.estimatedCost': '約 {cost}',
  'panel.tokens': '輸入 {in} / 輸出 {out}',
  'panel.failed': '這次執行失敗',
  'panel.unknownError': '未知錯誤',
  'panel.timeout':
    '已達 {mode} 模式的 {s} 秒上限 — 以上是時限內收到的內容。想看完整答案請切換到較慢的分頁。',
  'panel.follow': '跟隨輸出',
  'panel.following': '跟隨中',
  'panel.jumpToNewest': '跳到最新',
  'panel.followOn': '讓畫面跟著最新的文字走',
  'panel.followOff': '停止跟隨 — 你可以自由捲動',

  'tabs.queued': '排隊中',
  'tabs.failed': '失敗',

  'mode.medium.tagline': 'Sonnet 5 · 日常夠用',
  'mode.fine.tagline': 'Opus 5 · 同樣格式，更強的模型',

  'locale.switch': 'EN',
};

const TABLES: Record<Locale, Record<StringKey, string>> = { en: EN, 'zh-TW': ZH };

function format(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole
  );
}

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: StringKey, vars?: Vars) => string;
}

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Server and first client paint both use the default, so they always match.
  // A stored preference is applied right after mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'zh-TW') setLocaleState(saved);
    } catch {
      // Private mode / blocked storage — the default is fine.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Not persisting is survivable; the session still switches.
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => format(TABLES[locale][key] ?? EN[key] ?? key, vars),
    }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useI18n must be used inside <LocaleProvider>');
  return ctx;
}
