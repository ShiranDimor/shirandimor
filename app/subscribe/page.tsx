'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trackFunnelEvent } from '@/lib/trackEvent';
import { captureSourceFromUrl } from '@/lib/attribution';
import { supabase } from '@/lib/supabase';

const GROW_LINK = 'https://pay.grow.link/ODUwNDc~e1145301cbce2cc9d1e0395611428e83-NDIxNTkxMw';

// 'checking' - עוד בודקים; 'eligible' - מי שעוד לא ניצל את מחיר החודש הראשון (ברירת המחדל,
// כולל כל מי שלא מחובר בכלל); 'already-active' - מנוי/ת פעיל/ה כרגע; 'used-trial' - ניצל/ה
// בעבר את ה-₪1 אבל כרגע לא מנוי/ת פעיל/ה (למשל ביטל/ה) - לא מציעים את ה-₪1 שוב, רק חזרה ב-₪400
// ישירות מולי, כדי למנוע ניצול חוזר של מחיר האימות הסמלי. הבדיקה הזו עובדת רק למי שמחובר/ת -
// מי שלא מחובר/ת ומנסה לנצל שוב מחיר מוזל לא ניתן לזיהוי בצד שלנו לפני התשלום בפועל ב-Grow
type EligibilityStatus = 'checking' | 'eligible' | 'already-active' | 'used-trial';

export default function SubscribePage() {
  const [status, setStatus] = useState<EligibilityStatus>('checking');

  useEffect(() => {
    captureSourceFromUrl();
    checkEligibility();
  }, []);

  async function checkEligibility() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStatus('eligible'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, subscription_status, trial_price_used')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'admin' || (profile?.role === 'subscriber' && profile?.subscription_status === 'active')) {
        setStatus('already-active');
      } else if (profile?.trial_price_used) {
        setStatus('used-trial');
      } else {
        setStatus('eligible');
      }
    } catch (e) {
      console.error('subscribe eligibility check failed', e);
      setStatus('eligible');
    }
  }

  if (status === 'checking') {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>רגע...</p></div>;
  }

  if (status === 'already-active') {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/" className="nav-link">בית</Link>
        </header>
        <div className="form-title">כבר יש לך גישה מלאה 🎉</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, marginBottom: '20px' }}>
          את/ה כבר מנוי/ה פעיל/ה ב&quot;מדברים עסקאות&quot; - אין צורך להירשם שוב.
        </p>
        <Link href="/portfolio" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>לתיק המסחר שלי ←</Link>
      </div>
    );
  }

  if (status === 'used-trial') {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/" className="nav-link">בית</Link>
        </header>
        <div className="form-title">ברוך/ה השב/ה</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, marginBottom: '20px' }}>
          כבר ניצלת בעבר את מחיר החודש הראשון ב-₪1 (הוא חד-פעמי, לאימות בלבד) - אבל אשמח לחדש אישית ב-₪400 לחודש, בלי בירוקרטיה.
        </p>
        <a
          href="https://wa.me/972547167419?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A0%D7%99%20%D7%A8%D7%95%D7%A6%D7%94%20%D7%9C%D7%97%D7%96%D7%95%D7%A8%20%D7%9C%D7%94%D7%99%D7%95%D7%AA%20%D7%9E%D7%A0%D7%95%D7%99%20%D7%91%D7%9E%D7%93%D7%91%D7%A8%D7%99%D7%9D%20%D7%A2%D7%A1%D7%A7%D7%90%D7%95%D7%AA"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', textAlign: 'center', background: '#25D366', color: '#fff', textDecoration: 'none', fontWeight: 700, padding: '13px', borderRadius: '10px' }}
        >
          💬 לחידוש המנוי בוואטסאפ
        </a>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      <div className="form-title">הצטרפות ל&quot;מדברים עסקאות&quot;</div>
      <div className="form-sub">מנוי חודשי · ללא התחייבות</div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, marginBottom: '20px' }}>
        <strong style={{ color: 'var(--lavender)' }}>סוחרים ביחד איתי, בונים תיק השקעות, בלי ידע מוקדם</strong> - בקצב שלך.
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
          <strong style={{ color: 'var(--text-primary)' }}>למה ₪1, ולא ₪0 או ₪400 ישר?</strong> כי בחינם (₪0) נרשמים גם בוטים, גם מי שסוגר טאב אחרי חמש שניות, וגם אותו בחור מאיראן שבטוח רוצה ללמוד ניהול סיכונים. ₪1 מוכיח שיש בן אדם אמיתי מהצד השני, עם כרטיס אשראי אמיתי - ובתמורה מקבלים גישה מלאה וזהה לכל מנוי אחר, לחודש שלם, לא גרסה מצומצמת. בסוף החודש, אם לא בוטל - ממשיכים אוטומטית ב-₪400, בדיוק כמו כל מנוי חודשי רגיל. ביטול בלחיצה אחת, בכל רגע לפני החיוב הבא - בלי שיחת מכירות, בלי שאלות, בלי דרמה.
        </p>

        <a href={GROW_LINK} target="_blank" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} onClick={() => trackFunnelEvent('payment_link_click')}>
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
