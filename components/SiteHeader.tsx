'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, getResilientUser } from '@/lib/supabase';

// הכותרת העליונה של האתר (מותג + כניסה לסוחרים + שורת הקישורים המהירים) - אותה כותרת בדף הבית
// ובעמודי השיווק, כדי שקישור חדש בניווט יתווסף במקום אחד בלבד
const QUICK_LINKS = [
  { href: '/trading-plan', label: 'תוכנית מסחר' },
  { href: '/lives', label: 'מפגשים קרובים' },
  { href: '/portfolio', label: 'תיק מסחר' },
  { href: '/lessons', label: 'ספריית שיעורים' },
  { href: '/mentoring', label: 'ליווי אישי' },
  { href: '/business', label: 'לארגונים' },
];

// לפני הבדיקה (או למי שלא מחובר/ת בכלל) - אותו "כניסה לסוחרים" כמו תמיד, בלי שינוי התנהגות
const DEFAULT_CTA = { label: 'כניסה לסוחרים', href: '/login' };

// כפתור הכניסה בכותרת הציג תמיד "כניסה לסוחרים", גם למי שכבר מחובר/ת בפועל - וזה בדיוק מה שגרם
// לתחושת "זה מתנתק אותי כל פעם שלוחצים על בית": הסשן נשאר תקין, אבל שום דבר בדף הבית לא הראה
// את זה, אז מי שכבר מחובר/ת לחץ/ה שוב על "כניסה" וקיבל/ה טופס כניסה ריק מההתחלה. בודקים כאן
// (לא בכל עמוד בנפרד) כדי שהתיקון יחול בכל מקום שמשתמשים בכותרת הזו
export default function SiteHeader({ current }: { current?: string }) {
  const [cta, setCta] = useState(DEFAULT_CTA);

  useEffect(() => {
    (async () => {
      try {
        const user = await getResilientUser();
        if (!user) return;

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

        if (profile?.role === 'admin') setCta({ label: 'לאזור הניהול', href: '/admin' });
        else if (profile?.role === 'subscriber') setCta({ label: 'לתיק שלי', href: '/journal' });
      } catch (e) {
        // כישלון בדיקה שקט - נשאר על ברירת המחדל (כניסה לסוחרים), בדיוק כמו ההתנהגות הקודמת
      }
    })();
  }, []);

  return (
    <div className="sticky-top-group">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ gap: '8px' }}>
          <Link href={cta.href} className="nav-cta-profit">{cta.label}</Link>
        </div>
      </header>
      <nav className="quick-link-row" aria-label="ניווט ראשי">
        {QUICK_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="quick-link-pill" aria-current={current === l.href ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
