'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [showMagicLink, setShowMagicLink] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handlePasswordLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authError || !data.user) {
      setError('מייל או סיסמה שגויים.');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profile?.role === 'admin') {
      router.push('/admin');
    } else if (profile?.role === 'subscriber') {
      router.push('/portfolio');
    } else {
      router.push('/subscribe');
    }
  }

  async function handleMagicLink() {
    if (!email) return;
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError('משהו השתבש. כדאי לנסות שוב בעוד רגע.');
      return;
    }

    setSent(true);
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('צריך להקליד קודם את כתובת המייל למעלה');
      return;
    }
    setResetLoading(true);
    setError('');

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account`,
    });

    setResetLoading(false);
    setResetSent(true);
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      <div className="form-title" style={{ color: 'var(--lavender)' }}>כניסה לסוחרים</div>
      <div className="form-sub">התיק שלי, היומן שלך, בלי דרמות</div>

      {!sent && !resetSent ? (
        <>
          <div className="field">
            <label>אימייל</label>
            <ClearableInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onClear={() => setEmail('')}
              placeholder="name@example.com"
              style={{ borderColor: 'var(--lavender-dim)' }}
            />
          </div>

          {!showMagicLink && (
            <div className="field">
              <label>סיסמה</label>
              <div className="pw-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ borderColor: 'var(--lavender-dim)' }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4 4.7M6.3 6.3C3.6 8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.6-.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {!showMagicLink ? (
            <>
              <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handlePasswordLogin} disabled={loading}>
                {loading ? 'מתבצעת כניסה...' : 'כניסה'}
              </button>
              <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); handleForgotPassword(); }} style={{ color: 'var(--lavender)' }}>
                  {resetLoading ? 'שולחים קישור...' : 'שכחתי סיסמה'}
                </a>
              </p>
              <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowMagicLink(true); setError(''); }} style={{ color: 'var(--lavender)' }}>
                  ← חזרה לכניסה עם קישור למייל
                </a>
              </p>
            </>
          ) : (
            <>
              <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleMagicLink} disabled={loading}>
                {loading ? 'שולחים...' : 'שליחת קישור כניסה'}
              </button>
              <p style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                אם יש לך מנוי פעיל, יישלח אליך קישור כניסה מאובטח תוך דקה - בלי צורך בסיסמה בכלל
              </p>
              <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowMagicLink(false); setError(''); }} style={{ color: 'var(--lavender)' }}>
                  יש לך סיסמה? כניסה איתה
                </a>
              </p>
            </>
          )}

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      ) : resetSent ? (
        <div style={{ background: 'rgba(156,143,217,0.1)', border: '1px solid var(--lavender)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✉️</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>אם האימייל הזה רשום אצלנו</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            נשלח אליו קישור לאיפוס סיסמה. לחיצה על הקישור תוביל למסך הגדרת סיסמה חדשה.
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(156,143,217,0.1)', border: '1px solid var(--lavender)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✉️</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>כדאי לבדוק את תיבת המייל</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            שלחנו קישור כניסה מאובטח - לחיצה עליו תכניס אותך ישירות לאזור האישי, ושם תוכלי להגדיר סיסמה קבועה לפעם הבאה
          </div>
        </div>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
