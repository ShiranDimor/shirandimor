import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'שירן דימור | מסחר אחראי במניות',
  description: 'קהילת המסחר של שירן דימור, בלי הבטחות ובלי גורואים. בניית תיק אמיתית, שיטתית וישרה.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
