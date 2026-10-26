'use client';

import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function BusinessLeadForm({ whatsappUrl }: { whatsappUrl: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    if (String(data.phone || '').replace(/\D/g, '').length < 9) {
      setError('נראה שמספר הנייד חסר או לא מלא');
      return;
    }

    setError('');
    setStatus('sending');
    try {
      const res = await fetch('/api/business-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('sent');
      form.reset();
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="biz-form-done" role="status">
        <p className="biz-form-done-title">תודה, הפרטים התקבלו</p>
        <p>אחזור אליכם בהקדם לתיאום שיחת ההתאמה, ואחריה תקבלו הצעה מסודרת.</p>
      </div>
    );
  }

  return (
    <form className="biz-form" onSubmit={onSubmit} noValidate={false}>
      <div className="biz-form-grid">
        <label className="biz-field">
          <span>שם מלא *</span>
          <input name="name" required maxLength={80} autoComplete="name" />
        </label>
        <label className="biz-field">
          <span>שם הארגון *</span>
          <input name="org" required maxLength={120} autoComplete="organization" />
        </label>
        <label className="biz-field">
          <span>תפקיד</span>
          <input name="role" maxLength={80} autoComplete="organization-title" />
        </label>
        <label className="biz-field">
          <span>נייד *</span>
          <input name="phone" type="tel" required maxLength={20} inputMode="tel" autoComplete="tel" dir="ltr" />
        </label>
        <label className="biz-field">
          <span>מייל</span>
          <input name="email" type="email" maxLength={120} autoComplete="email" dir="ltr" />
        </label>
        <label className="biz-field">
          <span>כמה עובדים בערך</span>
          <select name="groupSize" defaultValue="">
            <option value="">לא בטוח/ה עדיין</option>
            <option value="עד 20">עד 20</option>
            <option value="20-50">20-50</option>
            <option value="50-100">50-100</option>
            <option value="מעל 100">מעל 100</option>
          </select>
        </label>
        <label className="biz-field biz-field-wide">
          <span>איזה מסלול מעניין אתכם</span>
          <select name="track" defaultValue="">
            <option value="">עוד לא החלטנו</option>
            <option value="מסלול 1 - מפגש השראה">מסלול 1, מפגש השראה</option>
            <option value="מסלול 2 - סדנת יסודות">מסלול 2, סדנת יסודות</option>
            <option value="מסלול 3 - תוכנית מלאה">מסלול 3, תוכנית מלאה</option>
          </select>
        </label>
        <label className="biz-field biz-field-wide">
          <span>משהו שחשוב לדעת? (תאריכים, מיקום, קהל)</span>
          <textarea name="message" rows={3} maxLength={1500} />
        </label>
        {/* שדה מלכודת לבוטים - מוסתר מבני אדם ומקוראי מסך */}
        <label className="biz-hp" aria-hidden="true">
          <span>אתר</span>
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {error && <p className="biz-form-error" role="alert">{error}</p>}
      {status === 'error' && (
        <p className="biz-form-error" role="alert">
          משהו השתבש בשליחה. אפשר לנסות שוב, או לכתוב לי ישירות{' '}
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">בוואטסאפ</a>.
        </p>
      )}

      <button type="submit" className="biz-btn biz-btn-primary biz-form-submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'שולחים...' : 'שליחה ותיאום שיחת התאמה'}
      </button>
    </form>
  );
}
