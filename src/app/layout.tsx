import type { Metadata, Viewport } from 'next';
import { LocaleProvider } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'Coding Helper',
  description: 'Snap a coding problem. Get fast, medium and fine solutions on every device.',
};

export const viewport: Viewport = {
  themeColor: '#0a0b0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `lang` is updated on the client when the locale changes; zh-TW is the
    // default so the server render and the first paint always agree.
    <html lang="zh-TW">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
