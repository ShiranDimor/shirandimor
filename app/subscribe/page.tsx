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
          חודש ראשון מלא
        </div>
        <div className="amount">₪1<span>/חודש ראשון</span></div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>לא הנחה - אימות בלבד</div>
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
          <strong style={{ color: 'var(--text-primary)' }}>למה ₪1 ולא ₪400 ישר?</strong> זה לא המחיר של החודש - זה אימות שמדובר במישהו רציני באמת, לא בוט ולא סתם סקרנות. בתמורה מקבלים גישה מלאה לחודש שלם, לא גרסה מצומצמת. בסוף החודש, אם לא בוטל - ממשיכים אוטומטית ב-₪400 לחודש. ביטול בלחיצה אחת, בכל רגע, לפני החיוב הבא.
        </p>

        {/* TODO לפני merge ל-main: להחליף לקישור Grow האמיתי של "₪1 עכשיו, 400₪ אוטומטי לאחר מכן" (סליקה בטוקן/חיוב מתחדש) - זה עדיין הקישור הישן של תשלום חד-פעמי */}
        <a href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA" target="_blank" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} onClick={() => trackFunnelEvent('payment_link_click')}>
          התחלה - חודש ראשון ב-₪1 ←
        </a>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginTop: '10px' }}>
          <span style={{ fontSize: '10px' }}>🔒</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>תשלום מאובטח ע"י Grow</span>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
        אפשר לבטל בכל רגע נתון, בלי קנס ובלי שאלות - ביטול לפני מועד החיוב הבא מונע את החיוב. הגישה המלאה נפתחת מיד אחרי אימות הכרטיס.
      </p>

    </div>
  );
}
