'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { trackFunnelEvent } from '@/lib/trackEvent';
import { captureSourceFromUrl } from '@/lib/attribution';

export default function SubscribePage() {
  useEffect(() => {
    captureSourceFromUrl();
  }, []);

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      <div className="form-title">הצטרפות ל&quot;מדברים עסקאות&quot;</div>
      <div className="form-sub">מנוי חודשי · ללא התחייבות</div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, marginBottom: '20px' }}>
        <strong style={{ color: 'var(--lavender)' }}>סוחרים ביחד איתי, בונים תיק השקעות</strong>. בלי ידע מוקדם, בקצב שלך.
      </p>

      <div className="price-card">
        <div style={{ display: 'inline-block', background: 'var(--profit-bg)', color: 'var(--profit)', fontSize: '11.5px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', marginBottom: '14px' }}>
          חודש ראשון ב-50% הנחה
        </div>
        <div className="amount">₪200<span>/חודש ראשון</span></div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px', textDecoration: 'line-through' }}>₪400 לחודש</div>
        <div className="period">לאחר מכן ₪400/חודש · ללא התחייבות וללא תקופת מינימום</div>

        <div className="perk-list">
          <div><strong>מסחר תוך-יומי לייב</strong> - כניסות ויציאות בזמן אמת</div>
          <div><strong>מסחר סווינג</strong> - עסקאות Short Squeeze עם הנימוק המלא</div>
          <div><strong>השקעות לטווח ארוך</strong> - בניית תיק שיטתית, לא "טיפים"</div>
          <div><strong>ליווי אישי ממני</strong> - לצד קהילה סגורה לדיון מעמיק</div>
          <div><strong>יומן מסחר שקוף</strong> - כולל עסקאות מפסידות</div>
          <div><strong>תיק מסחר אישי</strong> וניתוח העסקאות שלך איתי</div>
        </div>

        <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', lineHeight: 1.6, textAlign: 'center', marginBottom: '14px' }}>
          לא קורס יקר שאין דרך לדעת מראש אם הוא מתאים לך. חודש ניסיון אחד ב-₪200 מראה מבפנים איך זה עובד בפועל.
        </p>

        <a href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA" target="_blank" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} onClick={() => trackFunnelEvent('payment_link_click')}>
          מעבר לדף התשלום המאובטח ←
        </a>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginTop: '10px' }}>
          <span style={{ fontSize: '10px' }}>🔒</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>תשלום מאובטח ע"י Grow</span>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
        אפשר לבטל בכל רגע נתון, בלי קנס ובלי שאלות - ביטול עד יום לפני מועד החיוב הבא מונע את החיוב הבא. לאחר התשלום, החשבון עובר לאישור ידני והגישה מתקבלת תוך זמן קצר.
      </p>

    </div>
  );
}
