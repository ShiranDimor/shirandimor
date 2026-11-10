'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getResilientUser } from '@/lib/supabase';

function HomeIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function TradesIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function LessonsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </svg>
  );
}

function LoginIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

const PROFILE_ITEM = { href: '/account', Icon: ProfileIcon, label: 'פרופיל' };
const LOGIN_ITEM = { href: '/login', Icon: LoginIcon, label: 'כניסה' };

const BASE_ITEMS = [
  { href: '/lessons', Icon: LessonsIcon, label: 'שיעורים' },
  { href: '/portfolio', Icon: TradesIcon, label: 'עסקאות' },
  { href: '/', Icon: HomeIcon, label: 'ראשי' },
];

// תפריט ניווט תחתון קבוע - מופיע בכל עמוד באתר (לכולם, לא רק למנויים/מחוברים), בדיוק כמו
// שאר הרכיבים הגלובליים (NotificationBell, WhatsAppFloatButton וכו') ב-app/layout.tsx.
// עמוד "עסקאות" מוביל ל-/portfolio (פתוח לכולם, עם טשטוש סימבולים למי שלא מנוי/ה). הכפתור
// הרביעי מתחיל כ"פרופיל" (כברירת מחדל, כדי שלא יהבהב למי שכבר מחובר/ת) ונהפך ל"כניסה" ל-/login
// ברגע שמתברר שאין משתמש/ת מחובר/ת - כדי שלא יגיעו ל"פרופיל" ויינחתו על קיר "צריך להתחבר קודם"
export default function BottomNav() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await getResilientUser();
        setLoggedIn(!!user);
      } catch (e) {
        // כישלון בדיקה שקט - נשאר על "פרופיל", בדיוק כמו ההתנהגות הקודמת
      }
    })();
  }, []);

  // עמוד המשחק הפרטי של דור ועמודי אדמין - בלי שום רכיב גלובלי צף, כמו שאר הרכיבים הגלובליים
  if (pathname?.startsWith('/dor-english') || pathname?.startsWith('/admin')) return null;

  const items = [loggedIn ? PROFILE_ITEM : LOGIN_ITEM, ...BASE_ITEMS];

  return (
    <nav className="bottom-nav" aria-label="ניווט תחתון">
      {items.map(({ href, Icon, label }) => {
        const isActive = href === '/' ? pathname === '/' : pathname?.startsWith(href);
        return (
          <Link key={href} href={href} className={`bottom-nav-item${isActive ? ' active' : ''}`}>
            <span className="bottom-nav-pill">
              <Icon />
              <span className="bottom-nav-lbl">{label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
