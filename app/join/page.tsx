'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trackFunnelEvent } from '@/lib/trackEvent';
import { captureSourceFromUrl } from '@/lib/attribution';

// דף הנחיתה של קמפיין "חודש ניסיון" במטא. שני שלבים בכוונה: קודם שם ונייד (נשמר מיד כליד,
// כולל במאנדיי + מייל לשירן), ורק אחר כך מעבר לתשלום ב-Grow. כך גם מי שנטש לפני התשלום
// נשאר ליד שאפשר לחזור אליו, ומטא לומדת מאירוע ה-Lead שקורה הרבה יותר מרכישה.

// המחיר לחודש הראשון - לשנות כאן בלבד אם מחליטים על מחיר אחר
const TRIAL_PRICE = 29;
const FULL_PRICE = 400;

// קישור התשלום ב-Grow לחודש הניסיון. כל עוד ריק - הדף רק אוסף שם ונייד ושירן חוזרת ידנית
const TRIAL_PAYMENT_URL = '';

const PERKS = [
  'עסקאות סווינג עם הנימוק המלא - כניסה, סטופ ויציאה',
  'מסחר תוך-יומי לייב - כניסות ויציאות בזמן אמת',
  'יומן מסחר שקוף - כולל העסקאות המפסידות',
  'תיק מסחר אישי וניתוח העסקאות שלך ע"י שירן',
  'קהילה סגורה לדיון מעמיק, בלי רעש',
];

export default function JoinTrialPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'form' | 'redirecting' | 'done' | 'subscriber'>('form');

  useEffect(() => {
    captureSourceFromUrl();
  }, []);

  function isValidPhone(v: string) {
    return /^05\d{8}$/.test(v.replace(/\D/g, ''));
  }

  async function handleSubmit() {
    if (!name.trim() || !isValidPhone(phone)) {
      setError('צריך שם ומספר נייד תקין (לדוגמה 0501234567)');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/trial-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), offer: 'trial_month' }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'שגיאה בשליחה, נסו שוב');
        setSubmitting(false);
        return;
      }

      if (data.alreadySubscriber) {
        setStatus('subscriber');
        setSubmitting(false);
        return;
      }

      trackFunnelEvent('trial_month_lead', { phone });

      if (TRIAL_PAYMENT_URL) {
        trackFunnelEvent('payment_link_click', { phone });
        setStatus('redirecting');
        window.location.href = TRIAL_PAYMENT_URL;
        return;
      }

      setStatus('done');
    } catch {
      setError('שגיאת רשת, נסו שוב');
    }

    setSubmitting(false);
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      <div className="form-title" style={{ fontSize: '24px' }}>חודש בקבוצת הסוחרים ב-₪{TRIAL_PRICE}</div>
      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '20px', textAlign: 'center' }}>
        14 שנה בשוק, ואני לא מבטיחה לך רווחים. מה שאני כן מבטיחה: לראות מבפנים איך אני באמת סוחרת - כולל ההפסדים - וללמוד לנהל סיכון כמו שצריך.
      </div>

      <div className="price-card">
        <div className="amount">₪{TRIAL_PRICE}<span>/חודש ראשון</span></div>
        <div className="period">לאחר מכן ₪{FULL_PRICE}/חודש · ביטול בכל רגע, בלי התחייבות</div>

        <div className="perk-list">
          {PERKS.map((perk) => (
            <div key={perk}>{perk}</div>
          ))}
        </div>

        {status === 'form' && (
          <div style={{ textAlign: 'right' }}>
            <input
              className="tp-text-input"
              style={{ minHeight: 'auto', marginBottom: '10px' }}
              placeholder="שם"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="tp-text-input"
              style={{ minHeight: 'auto', marginBottom: '10px' }}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="נייד"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />

            {error && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{error}</p>}

            <button type="button" className="btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'שולחים...' : TRIAL_PAYMENT_URL ? 'להמשך לתשלום מאובטח ←' : 'אני רוצה להצטרף'}
            </button>
          </div>
        )}

        {status === 'redirecting' && (
          <div className="tp-step-intro">מעבירים אותך לדף התשלום המאובטח...</div>
        )}

        {status === 'done' && (
          <div>
            <div className="tp-question-title">קיבלתי!</div>
            <div className="tp-step-intro">אחזור אליך בהקדם עם קישור להצטרפות לחודש הניסיון.</div>
          </div>
        )}

        {status === 'subscriber' && (
          <div className="tp-step-intro">נראה שכבר יש לך מנוי פעיל בקבוצה - אין צורך להירשם שוב.</div>
        )}
      </div>

      <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
        החודש הראשון ב-₪{TRIAL_PRICE}, ומהחודש השני החיוב מתחדש אוטומטית ב-₪{FULL_PRICE} לחודש. אפשר לבטל בכל רגע, בלי קנס ובלי שאלות - ביטול עד יום לפני מועד החיוב הבא מונע אותו. אשלח תזכורת לפני שהחודש הראשון מסתיים.
      </p>

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
