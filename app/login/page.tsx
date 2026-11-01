'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, setRememberPreference } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

type Step = 'email' | 'sent' | 'code' | 'phone' | 'rejected' | 'password';

// לאן מגיעים אחרי התחברות מוצלחת (קוד/סיסמה) - אם הגענו הנה כי ניסו לגשת לתוכן מסוים
// ונזרקנו לכניסה קודם, חוזרים בדיוק לשם במקום לדף גנרי לפי תפקיד
function getReturnTo(): string | null {
  if (typeof window === 'undefined') return null;
  const to = new URLSearchParams(window.location.search).get('returnTo');
  return to && to.startsWith('/') ? to : null;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  // דיבאג זמני - עוזר לאבחן למה מישהו מגיע לעמוד הכניסה הזה שוב אחרי שכבר היה מחובר.
  // מוריד אחרי שהבעיה נמצאת
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const lsKeys = Object.keys(window.localStorage).filter((k) => k.startsWith('sb-'));
        const ssKeys = Object.keys(window.sessionStorage).filter((k) => k.startsWith('sb-'));
        const remember = window.localStorage.getItem('sd_remember_me');
        setDebugInfo(
          `session: ${session ? `YES (${session.user.email})` : 'NO'} | remember: ${remember} | localStorage sb- keys: ${lsKeys.length ? lsKeys.join(',') : 'none'} | sessionStorage sb- keys: ${ssKeys.length ? ssKeys.join(',') : 'none'}`
        );
      } catch (e) {
        setDebugInfo(`debug error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, []);

  async function routeAfterLogin(userId: string) {
    const returnTo = getReturnTo();
    if (returnTo) { router.push(returnTo); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profile?.role === 'admin') {
      router.push('/admin');
    } else if (profile?.role === 'subscriber') {
      router.push('/journal');
    } else {
      router.push('/subscribe');
    }
  }

  async function handlePasswordLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    setRememberPreference(remember);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (authError || !data.user) {
      // מציגים את הודעת השגיאה האמיתית מ-Supabase (למשל rate limit, בעיית רשת) ולא רק
      // "מייל או סיסמה שגויים" גורף - כדי שאפשר יהיה לאבחן תקלות אמיתיות ולא לנחש בעיוורון
      setError(authError?.message ? `שגיאה: ${authError.message}` : 'מייל או סיסמה שגויים.');
      return;
    }

    routeAfterLogin(data.user.id);
  }

  async function handleEmailSubmit() {
    if (!email) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/request-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.granted) {
        setCode('');
        setStep(data.otp ? 'code' : 'sent');
      } else {
        setStep('phone');
      }
    } catch (e) {
      setError('משהו השתבש. כדאי לנסות שוב בעוד רגע.');
    }

    setLoading(false);
  }

  async function handleResendCode() {
    setResending(true);
    setError('');
    try {
      await fetch('/api/request-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch (e) {
      // שגיאת רשת בשליחה חוזרת - לא חוסמים, אפשר לנסות שוב
    }
    setResending(false);
  }

  async function handleVerifyCode() {
    if (!/^\d{6}$/.test(code)) {
      setError('הקוד צריך להיות 6 ספרות');
      return;
    }
    setLoading(true);
    setError('');
    // נקבע *לפני* setSession - כדי שברגע שה-session נכתב לאחסון, ההעדפה הנוכחית כבר
    // תקבע אם זה הולך ל-localStorage או ל-sessionStorage
    setRememberPreference(remember);

    // הקוד מאומת בשרת (לא ישירות מול supabase.auth.verifyOtp בדפדפן) - ר' הערה ב-
    // app/api/verify-login-code/route.ts על הסיבה. מקבלים בחזרה session אמיתי ושומרים
    // אותו בעצמנו עם setSession, כדי שהוא ייכתב דרך ה-storage המותאם שלנו (lib/supabase.ts)
    let userId: string | undefined;
    try {
      const res = await fetch('/api/verify-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        setError(data.error || 'הקוד שגוי');
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setSessionError) {
        setLoading(false);
        setError(`שגיאה: ${setSessionError.message}`);
        return;
      }
      userId = data.user_id;
    } catch (e) {
      setLoading(false);
      setError('משהו השתבש - כדאי לנסות שוב בעוד רגע');
      return;
    }

    setLoading(false);

    if (!userId) {
      setError('הקוד שגוי');
      return;
    }

    routeAfterLogin(userId);
  }

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/\D/g, '').slice(0, 10));
  }

  function filterHebrew(value: string) {
    return value.replace(/[^א-ת\s'-]/g, '');
  }

  async function handlePhoneSubmit() {
    if (!firstName || !lastName || !phone) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verify-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email, firstName, lastName }),
      });
      const data = await res.json();

      if (data.verified) {
        setCode('');
        setStep(data.otp ? 'code' : 'sent');
      } else {
        setStep('rejected');
      }
    } catch (e) {
      setError('משהו השתבש. כדאי לנסות שוב בעוד רגע.');
    }

    setLoading(false);
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      {debugInfo && (
        <div style={{ fontSize: '10px', color: '#FFB648', background: '#1A181C', border: '1px solid #332E35', borderRadius: '6px', padding: '8px', marginBottom: '10px', direction: 'ltr', textAlign: 'left', wordBreak: 'break-all' }}>
          DEBUG: {debugInfo}
        </div>
      )}

      <div className="form-title" style={{ color: 'var(--lavender)' }}>כניסה לסוחרים</div>
      <div className="form-sub">מקלידים אימייל ומקבלים קוד כניסה - בלי סיסמה</div>

      {step === 'email' && (
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

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', margin: '10px 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            השאר אותי מחובר/ת במכשיר הזה
          </label>

          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleEmailSubmit} disabled={loading || !email}>
            {loading ? 'בודקים...' : 'המשך'}
          </button>
          <p style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            מי שעדיין לא מזוהה כמנוי מאושר - נבקש אימות נייד
          </p>
          <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep('password'); setError(''); }} style={{ color: 'var(--lavender)' }}>
              יש לך סיסמה? כניסה איתה
            </a>
          </p>

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      )}

      {step === 'sent' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--lavender)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>שלחנו קישור כניסה למייל</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            נשלח קישור לכתובת {email} - לחיצה עליו פותחת גישה ישר, בלי סיסמה. אם אין סימן תוך כמה דקות, כדאי לבדוק גם בספאם.
          </div>
          <a href="#" onClick={(e) => { e.preventDefault(); setStep('email'); setError(''); }} style={{ color: 'var(--lavender)', fontSize: '12px' }}>
            ← חזרה
          </a>
        </div>
      )}

      {step === 'code' && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
            שלחנו קוד בן 6 ספרות לכתובת {email} - מקלידים אותו כאן, בלי לצאת מהאתר. בתוקף לשעה.
          </p>
          <div className="field">
            <label>קוד כניסה</label>
            <ClearableInput
              type="tel"
              inputMode="numeric"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              onClear={() => setCode('')}
              placeholder="123456"
              maxLength={6}
              style={{ borderColor: 'var(--lavender-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '20px', letterSpacing: '4px' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            השאר אותי מחובר/ת במכשיר הזה
          </label>

          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleVerifyCode} disabled={loading || code.length !== 6}>
            {loading ? 'בודקים...' : 'כניסה'}
          </button>

          <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            אפשר גם ללחוץ על הקישור שבאותו מייל, אם נוח יותר.
          </p>
          <p style={{ marginTop: '6px', fontSize: '12px', textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); if (!resending) handleResendCode(); }} style={{ color: 'var(--lavender)' }}>
              {resending ? 'שולחים קוד חדש...' : 'לא קיבלתי קוד - שליחה חוזרת'}
            </a>
          </p>
          <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep('email'); setCode(''); setError(''); }} style={{ color: 'var(--lavender)' }}>
              ← כתובת מייל אחרת
            </a>
          </p>

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      )}

      {step === 'password' && (
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

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            השאר אותי מחובר/ת במכשיר הזה
          </label>

          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handlePasswordLogin} disabled={loading || !email || !password}>
            {loading ? 'מתבצעת כניסה...' : 'כניסה'}
          </button>
          <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep('email'); setError(''); }} style={{ color: 'var(--lavender)' }}>
              ← חזרה לכניסה עם קישור למייל
            </a>
          </p>

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      )}

      {step === 'phone' && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
            לא זיהינו את המייל הזה אצלנו - כדי לוודא שמדובר במנוי פעיל, אפשר למלא את הפרטים
          </p>
          <div className="form-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>שם פרטי</label>
              <ClearableInput
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(filterHebrew(e.target.value))}
                onClear={() => setFirstName('')}
                placeholder="ישראל"
                style={{ borderColor: 'var(--lavender-dim)' }}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>שם משפחה</label>
              <ClearableInput
                type="text"
                value={lastName}
                onChange={(e) => setLastName(filterHebrew(e.target.value))}
                onClear={() => setLastName('')}
                placeholder="ישראלי"
                style={{ borderColor: 'var(--lavender-dim)' }}
              />
            </div>
          </div>
          <div className="field">
            <label>נייד</label>
            <ClearableInput
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onClear={() => setPhone('')}
              placeholder="0501234567"
              maxLength={10}
              style={{ borderColor: 'var(--lavender-dim)' }}
            />
          </div>

          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handlePhoneSubmit} disabled={loading || !firstName || !lastName || !phone}>
            {loading ? 'בודקים...' : 'אימות והמשך'}
          </button>
          <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setStep('email'); setError(''); }} style={{ color: 'var(--lavender)' }}>
              ← חזרה
            </a>
          </p>

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      )}

      {step === 'rejected' && (
        <div style={{ background: 'rgba(255, 92, 92,0.1)', border: '1px solid var(--loss)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>לא זיהינו מנוי פעיל עם הפרטים האלה</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            אפשר לבדוק שוב את הפרטים, או להצטרף ל&quot;מדברים עסקאות&quot;
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setStep('email'); setError(''); }}>ניסיון נוסף</button>
            <Link href="/subscribe" className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>הצטרפות</Link>
          </div>
        </div>
      )}

    </div>
  );
}
