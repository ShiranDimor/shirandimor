'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// הערת אי-המלצה גלובלית - מופיעה בתחתית כל עמוד באתר, כדי שלא יישכח ממנה אף עמוד חדש
// שייווסף בעתיד (לעומת שכפול ידני של אותה הערה בכל page.tsx בנפרד)
export default function SiteDisclaimer() {
  const pathname = usePathname();
  if (pathname?.startsWith('/dor-english')) return null;

  return (
    <p className="site-disclaimer">
      מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.
      <br />
      <Link href="/terms" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>תקנון</Link>
      {' · '}
      <Link href="/privacy" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>מדיניות פרטיות</Link>
    </p>
  );
}
