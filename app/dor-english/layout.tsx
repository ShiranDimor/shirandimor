import type { Metadata, Viewport } from 'next';

// עמוד פרטי (משחק האנגלית של דור) - לא מקושר מהאתר ולא מאונדקס במנועי חיפוש
export const metadata: Metadata = {
  title: "Dor's Pokémon English",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#ffcb05',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DorEnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap" />
      {children}
    </>
  );
}
