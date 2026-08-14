'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

type Step = 'email' | 'phone' | 'sent' | 'rejected';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendMagicLink() {
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError('משהו השתבש. כדאי לנסות שוב בעוד רגע.');
      return;
    }

    setStep('sent');
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

      if (data.isKnown) {
        await sendMagicLink();
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
    if (!phone) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verify-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();

      if (data.verified) {
        await sendMagicLink();
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
      <div className="form-sub">מקלידים אימייל, מקבלים קישור כניסה - בלי סיסמאות</div>

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
            מי שעדיין לא מנוי מאושר - נבקש אימות נייד לפני שליחת הקישור
          </p>

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      )}

      {step === 'phone' && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
            לא זיהינו את המייל הזה אצלנו - כדי לוודא שמדובר במנוי/ה פעיל/ה, אפשר להזין את מספר הנייד הרשום
          </p>
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

          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handlePhoneSubmit} disabled={loading || !phone}>
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

      {step === 'sent' && (
        <div style={{ background: 'rgba(156,143,217,0.1)', border: '1px solid var(--lavender)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✉️</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>כדאי לבדוק את תיבת המייל</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            שלחנו קישור כניסה מאובטח - לחיצה עליו תכניס ישירות לאזור האישי
          </div>
        </div>
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
