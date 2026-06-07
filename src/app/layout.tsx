import type { Metadata } from 'next';
import { publicImportsOrigin } from '@/lib/shared/resource-hints.mjs';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_SITE_URL || 'https://cuontruyen.vercel.app'),
  title: {
    default: 'Cuộn Truyện - Đọc truyện tranh liền mạch',
    template: '%s | Cuộn Truyện'
  },
  description: 'Đọc truyện tranh manhwa, manhua, manga online liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const importsOrigin = publicImportsOrigin();

  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href={importsOrigin} crossOrigin="" />
        <link rel="dns-prefetch" href={importsOrigin} />
      </head>
      <body>{children}</body>
    </html>
  );
}
