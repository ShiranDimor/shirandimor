import type { Metadata } from 'next';
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
        <a href="https://wa.me/972547167419" target="_blank" rel="noopener noreferrer" className="wa-float-btn">
          <img src="/whatsapp-icon.svg" alt="וואטסאפ" width="26" height="26" />
        </a>
      </body>
    </html>
  );
}
