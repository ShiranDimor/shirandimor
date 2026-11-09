'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/account', icon: '👤', label: 'פרופיל' },
  { href: '/lessons', icon: '🎬', label: 'שיעורים' },
  { href: '/portfolio', icon: '📈', label: 'עסקאות' },
  { href: '/', icon: '🏠', label: 'ראשי' },
];

// תפריט ניווט תחתון קבוע - מופיע בכל עמוד באתר (לכולם, לא רק למנויים/מחוברים), בדיוק כמו
// שאר הרכיבים הגלובליים (NotificationBell, WhatsAppFloatButton וכו') ב-app/layout.tsx.
// עמוד "עסקאות" מוביל ל-/portfolio (פתוח לכולם, עם טשטוש סימבולים למי שלא מנוי/ה) ו"פרופיל"
// ל-/account (שכבר דואג בעצמו להציג מסך "צריך להתחבר קודם" למי שלא מחובר/ת)
export default function BottomNav() {
  const pathname = usePathname();

  // עמוד המשחק הפרטי של דור ועמודי אדמין - בלי שום רכיב גלובלי צף, כמו שאר הרכיבים הגלובליים
  if (pathname?.startsWith('/dor-english') || pathname?.startsWith('/admin')) return null;

  return (
    <nav className="bottom-nav" aria-label="ניווט תחתון">
      {ITEMS.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`bottom-nav-item${isActive ? ' active' : ''}`}>
            {isActive && <span className="bottom-nav-pill" />}
            <span className="bottom-nav-ic">{item.icon}</span>
            <span className="bottom-nav-lbl">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
