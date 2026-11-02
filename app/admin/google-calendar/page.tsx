'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Status = { ok: true } | { ok: false; step: string; detail: string };

const STEP_TEXT: Record<string, string> = {
  config: 'חסרים משתני החיבור ב-Vercel',
  token: 'גוגל דוחה את ההרשאה הקיימת (בדרך כלל: ההרשאה פגה או בוטלה) - צריך לחבר מחדש',
  list: 'ההרשאה תקינה אבל אין גישה לקריאת היומן - צריך לחבר מחדש עם הרשאה ליומן',
};

// אדמין: מצב החיבור ליומן Google (שיחות התאמה ולייבים) וחיבור מחדש כשההרשאה פגה
export default function GoogleCalendarAdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState<{ status: Status; url: string | null; redirectUri: string; fingerprint?: { clientIdStart: string; secretStartsRight: boolean; secretLength: number; secretEnd: string } } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setChecking(false);
      const res = await fetch('/api/admin/google-calendar/auth-url', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      setChecking(false);
      if (res.status === 403) return;
      setIsAdmin(true);
      if (!res.ok) return setError('לא הצלחנו לבדוק את החיבור');
      setData(await res.json());
    })().catch(() => { setChecking(false); setError('לא הצלחנו לבדוק את החיבור'); });
  }, []);

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/admin" className="nav-link">ניהול</Link>
      </header>
      <div className="form-title">חיבור יומן Google</div>
      <div className="form-sub">משמש לקביעת שיחות התאמה (ליווי אישי וארגונים) וליצירת אירועי לייב</div>

      {checking && <p style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>בודקים...</p>}
      {!checking && !isAdmin && <p style={{ textAlign: 'center' }}>צריך להתחבר כאדמין. <Link href="/login?returnTo=/admin/google-calendar" style={{ color: 'var(--lavender)' }}>כניסה</Link></p>}
      {error && <p style={{ color: 'var(--loss)', textAlign: 'center' }}>{error}</p>}

      {data && (
        <div className="price-card" style={{ textAlign: 'right' }}>
          {data.status.ok ? (
            <p style={{ color: 'var(--profit)', fontWeight: 700, fontSize: 16 }}>✓ היומן מחובר ועובד</p>
          ) : (
            <>
              <p style={{ color: 'var(--loss)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>✕ היומן לא מחובר</p>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>{STEP_TEXT[data.status.step] || 'החיבור נכשל'}</p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', direction: 'ltr', textAlign: 'right' }}>{data.status.step}: {data.status.detail}</p>
            </>
          )}

          {data.fingerprint && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--bg-void)', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>מה שמור כרגע ב-Vercel (להשוואה מול קובץ ה-JSON):</div>
              <div>Client ID מתחיל ב: <span dir="ltr">{data.fingerprint.clientIdStart || '(ריק)'}</span></div>
              <div>Client secret מתחיל ב-GOCSPX-: {data.fingerprint.secretStartsRight ? '✓ כן' : '✕ לא'}</div>
              <div>Client secret - אורך {data.fingerprint.secretLength} תווים, 4 התווים האחרונים: <span dir="ltr">{data.fingerprint.secretEnd || '(ריק)'}</span></div>
            </div>
          )}

          {data.url && (
            <>
              <a href={data.url} className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 18 }}>
                {data.status.ok ? 'חיבור מחדש (לא חובה)' : 'חיבור היומן מחדש ←'}
              </a>
              <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 14, lineHeight: 1.6 }}>
                אם גוגל מציגה שגיאת <code>redirect_uri_mismatch</code>: ב-Google Cloud Console ← APIs &amp; Services ← Credentials ← ה-OAuth Client של האתר ← Authorized redirect URIs ← להוסיף את הכתובת:
              </p>
              <p style={{ fontSize: 12.5, direction: 'ltr', textAlign: 'left', background: 'var(--bg-void)', padding: 8, borderRadius: 8, wordBreak: 'break-all' }}>{data.redirectUri}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
