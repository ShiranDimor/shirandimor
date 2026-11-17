'use client';

import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

type Props = {
  whatsappUrl: string;
  endpoint?: string;
  extraData?: Record<string, string>;
  submitLabel?: string;
  // מחזיר את תוכן מסך ההצלחה לפי תשובת השרת
  renderSuccess?: (response: Record<string, unknown>) => React.ReactNode;
  // מאפשר לרכיב העוטף לטפל בשגיאות מיוחדות (למשל זמן שכבר נתפס). מחזיר true אם טופל.
  onServerError?: (status: number, response: Record<string, unknown>) => boolean;
  compact?: boolean;
};

export default function BusinessLeadForm({
  whatsappUrl,
  endpoint = '/api/business-lead',
  extraData,
  submitLabel = 'שליחה, ואחזור אליכם',
  renderSuccess,
  onServerError,
  compact = false,
}: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [response, setResponse] = useState<Record<string, unknown>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = { ...Object.fromEntries(new FormData(form).entries()), ...extraData };

    if (String(data.phone || '').replace(/\D/g, '').length < 9) {
      setError('נראה שמספר הנייד חסר או לא מלא');
      return;
    }

    setError('');
    setStatus('sending');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (onServerError?.(res.status, json)) {
          setStatus('idle');
          return;
        }
        throw new Error(String(res.status));
      }
      setResponse(json);
      setStatus('sent');
      form.reset();
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="biz-form-done" role="status">
        {renderSuccess ? (
          renderSuccess(response)
        ) : (
          <>
            <p className="biz-form-done-title">תודה, הפרטים התקבלו</p>
            <p>אחזור אליכם בהקדם לשיחת היכרות קצרה.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <form className="biz-form" onSubmit={onSubmit}>
      <div className="biz-form-grid">
        <label className="biz-field">
          <span>שם מלא *</span>
          <input name="name" required maxLength={80} autoComplete="name" />
        </label>
        <label className="biz-field">
          <span>שם החברה *</span>
          <input name="org" required maxLength={120} autoComplete="organization" />
        </label>
        <label className="biz-field">
          <span>נייד *</span>
          <input name="phone" type="tel" required maxLength={20} inputMode="tel" autoComplete="tel" dir="ltr" />
        </label>
        <label className="biz-field">
          <span>{compact ? 'מייל (לקבלת זימון ליומן)' : 'מייל'}</span>
          <input name="email" type="email" maxLength={120} autoComplete="email" dir="ltr" />
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
        {status === 'sending' ? 'שולחים...' : submitLabel}
      </button>
    </form>
  );
}
