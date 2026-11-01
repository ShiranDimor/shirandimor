import Link from 'next/link';

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

export default function SiteHeader({ current }: { current?: string }) {
  return (
    <div className="sticky-top-group">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ gap: '8px' }}>
          <Link href="/login" className="nav-cta-profit">כניסה לסוחרים</Link>
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
