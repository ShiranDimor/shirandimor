'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      <div className="form-title" style={{ color: 'var(--lavender)' }}>כניסה לסוחרים</div>
      <div className="form-sub">מקלידים אימייל, מקבלים קישור כניסה - בלי סיסמאות</div>

      {!sent ? (
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

          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleMagicLink} disabled={loading || !email}>
            {loading ? 'שולחים...' : 'שליחת קישור כניסה'}
          </button>
          <p style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            מי שעדיין לא מנוי מאושר - הקישור ייכנס לבקשת הצטרפות שממתינה לאישור
          </p>

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      ) : (
        <div style={{ background: 'rgba(156,143,217,0.1)', border: '1px solid var(--lavender)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✉️</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>כדאי לבדוק את תיבת המייל</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            שלחנו קישור כניסה מאובטח - לחיצה עליו תכניס ישירות לאזור האישי
          </div>
        </div>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
