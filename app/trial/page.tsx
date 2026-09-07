'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function TrialSignupPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

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
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'שגיאה בשליחה, נסו שוב');
      } else {
        setDone(true);
      }
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

      <div className="form-title" style={{ fontSize: '22px' }}>7 ימי ניסיון בקבוצת הסוחרים - ללא עלות</div>
      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '20px' }}>
        פתחתי סבב חדש של 7 ימי ניסיון לקבוצת הסוחרים "מדברים עסקאות" - בלי עלות ובלי התחייבות. המקום מוגבל, אז כדי לשריין השאירו שם ונייד ואני אחזור אליכם.
      </div>

      {!done && (
        <div className="tp-question-card">
          <input
            className="tp-text-input"
            style={{ minHeight: 'auto', marginBottom: '10px' }}
            placeholder="שם"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="tp-text-input"
            style={{ minHeight: 'auto', marginBottom: '10px' }}
            type="tel"
            placeholder="נייד"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />

          {error && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{error}</p>}

          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'שולחים...' : 'שריינו לי מקום'}
          </button>
        </div>
      )}

      {done && (
        <div className="tp-question-card">
          <div className="tp-question-title">קיבלנו! 🎉</div>
          <div className="tp-step-intro">שיריינו לך מקום ל-7 ימי ניסיון. אני אחזור אליך בהודעה עם כל הפרטים.</div>
        </div>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
