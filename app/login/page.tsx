'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

type Step = 'email' | 'sent' | 'phone' | 'rejected' | 'password';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        setStep('sent');
      } else {
        setStep('phone');
      }
    } catch (e) {
      setError('משהו השתבש. כדאי לנסות שוב בעוד רגע.');
    }

    setLoading(false);
  }

  function handlePhoneChange(value: string) {
    setPhone(value.replace(/\D/g, '').slice(0, 10));
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
        setStep('sent');
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

      <div className="form-title" style={{ color: 'var(--lavender)' }}>כניסה לסוחרים</div>
      <div className="form-sub">מקלידים אימייל ומקבלים קישור כניסה - בלי סיסמה</div>

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

          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleEmailSubmit} disabled={loading || !email}>
            {loading ? 'בודקים...' : 'שליחת קישור כניסה'}
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
            נשלח קישור לכתובת {email} - לחיצה עליו תכניס אתכם ישר, בלי סיסמה. אם אין סימן תוך כמה דקות, כדאי לבדוק גם בספאם.
          </div>
          <a href="#" onClick={(e) => { e.preventDefault(); setStep('email'); setError(''); }} style={{ color: 'var(--lavender)', fontSize: '12px' }}>
            ← חזרה
          </a>
        </div>
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
            לא זיהינו את המייל הזה אצלנו - כדי לוודא שמדובר במנוי/ה פעיל/ה, אפשר למלא את הפרטים
          </p>
          <div className="form-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>שם פרטי</label>
              <ClearableInput
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
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
                onChange={(e) => setLastName(e.target.value)}
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
        <div style={{ background: 'rgba(201,99,94,0.1)', border: '1px solid var(--loss)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>לא זיהינו מנוי פעיל עם הפרטים האלה</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            אפשר לבדוק שוב את הפרטים, או להצטרף לקבוצת הסוחרים
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setStep('email'); setError(''); }}>ניסיון נוסף</button>
            <Link href="/subscribe" className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>הצטרפות</Link>
          </div>
        </div>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
