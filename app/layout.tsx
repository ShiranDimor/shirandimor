import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import MetaPixel from '@/components/MetaPixel';
import WhatsAppFloatButton from '@/components/WhatsAppFloatButton';
import './globals.css';

export const metadata: Metadata = {
  title: 'שירן דימור | מסחר אחראי במניות',
  description: 'קהילת המסחר של שירן דימור, בלי הבטחות ובלי גורואים. בניית תיק אמיתית, שיטתית וישרה.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'שירן דימור',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {children}
        <WhatsAppFloatButton />
        <Analytics />
        <MetaPixel />
      </body>
    </html>
  );
}
