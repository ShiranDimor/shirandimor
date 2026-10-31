import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import MetaPixel from '@/components/MetaPixel';
import WhatsAppFloatButton from '@/components/WhatsAppFloatButton';
import DorChatWidget from '@/components/DorChatWidget';
import NotificationBell from '@/components/NotificationBell';
import SiteDisclaimer from '@/components/SiteDisclaimer';
import './globals.css';

export const metadata: Metadata = {
  title: 'שירן דימור | מסחר אחראי במניות',
  description: 'קהילת המסחר של שירן דימור, בלי הבטחות ובלי גורואים. בניית תיק אמיתית, שיטתית וישרה.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    // 'black-translucent' - סרגל סטטוס עם טקסט/אייקונים בהירים, מתאים לרקע הכהה של הפלטה הנוכחית
    statusBarStyle: 'black-translucent',
    title: 'שירן דימור',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {children}
        <SiteDisclaimer />
        <WhatsAppFloatButton />
        <DorChatWidget />
        <NotificationBell />
        <Analytics />
        <MetaPixel />
      </body>
    </html>
  );
}
