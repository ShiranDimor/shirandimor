'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

// עמודים שבהם הפיקסל לא נטען בכלל - אין שם ערך שיווקי (לא עמודי המרה), ובעמודי ההתחברות
// דווקא קריטי שלא: לפיקסל של פייסבוק יש פיצ'ר "Automatic Advanced Matching" שסורק את תוכן
// העמוד/טפסים ומצרף PII לקריאות המעקב שלו-עצמו, ולפעמים "עוקף" (monkey-patch) את window.fetch
// הגלובלי כדי לעשות את זה. באתר בעברית זה יכול לגרום לפיקסל לנסות לצרף טקסט עברי לתוך header
// של הבקשה שלו - והדפדפן דוחה header כזה (מותר רק ISO-8859-1), מה שהורס את ה-fetch הגלובלי
// עבור *כל* קריאת רשת בעמוד אחריו, כולל ההתחברות מול Supabase. זה בדיוק מה שקרה בפועל.
const EXCLUDED_PATH_PREFIXES = ['/login', '/auth/callback'];

// פיקסל של פייסבוק/מטא - פועל רק אם מוגדר NEXT_PUBLIC_META_PIXEL_ID בסביבה (Vercel).
// בלי המשתנה הזה הקומפוננטה לא מרנדרת כלום, אז אין סיכון שהיא "תישבר" באתר.
export default function MetaPixel() {
  const pathname = usePathname();
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return null;
  if (EXCLUDED_PATH_PREFIXES.some((p) => pathname?.startsWith(p))) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('set', 'autoConfig', false, '${pixelId}');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          alt=""
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
