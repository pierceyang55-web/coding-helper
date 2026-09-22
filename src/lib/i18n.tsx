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

  'capture.heading': 'New problem',
  'capture.choose': 'Choose photos',
  'capture.addMore': 'Add more photos',
  'capture.takePhoto': 'Take a photo',
  'capture.ready': '{n} photo{s} ready',
  'capture.max': ' · max {n}',
  'capture.clear': 'Clear',
  'capture.solveOne': 'Solve this problem →',
  'capture.solveMany': 'Solve these {n} pages →',
  'capture.uploading': 'Uploading…',
  'capture.hintMulti':
    'All the photos are read together as one problem — shoot a long question across several screens.',
  'capture.hintSingle':
    'Add up to {n} photos of the same problem, then hit Solve. Medium runs straight away; Fine is the expensive one, so you start it from its tab when you want it.',
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
    'Add a photo of a question on your phone. Both modes start at once and land here on every device you are signed in on.',
  'panel.queued': 'Queued',
  'panel.onDemandBody':
    '{mode} runs on the most capable model and costs several times a Medium pass, so it only runs when you ask.',
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

  'mode.medium.tagline': 'Explained solution in ~30s',
  'mode.fine.tagline': 'Deep analysis · no time limit',

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

  'capture.heading': '新題目',
  'capture.choose': '選擇照片',
  'capture.addMore': '再加照片',
  'capture.takePhoto': '拍照',
  'capture.ready': '已選 {n} 張',
  'capture.max': ' · 上限 {n} 張',
  'capture.clear': '清空',
  'capture.solveOne': '開始解題 →',
  'capture.solveMany': '解這 {n} 頁 →',
  'capture.uploading': '上傳中…',
  'capture.hintMulti': '所有照片會被當成同一題一起讀 — 長題目可以分幾個畫面拍。',
  'capture.hintSingle':
    '同一題最多可加 {n} 張照片，選完再按開始解題。Medium 會立刻跑；Fine 比較貴，需要時再到它的分頁手動啟動。',
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
    '用手機拍下題目。兩個模式會同時開始，結果會出現在你所有已登入的裝置上。',
  'panel.queued': '排隊中',
  'panel.onDemandBody': '{mode} 使用最強的模型，費用是 Medium 的好幾倍，所以只在你要求時才會跑。',
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

  'mode.medium.tagline': '約 30 秒，附解說',
  'mode.fine.tagline': '深入分析 · 不限時',

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
