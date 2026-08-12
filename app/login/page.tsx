'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
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
      setError('משהו השתבש. נסי שוב בעוד רגע.');
      return;
    }

    setSent(true);
  }

  return (
    <div className="wrap">
      <header>
        <div className="brand">מסחר <span>אחראי</span> במניות</div>
      </header>

      <div className="form-title" style={{ color: 'var(--lavender)' }}>כניסה לסוחרים</div>
      <div className="form-sub">התיק שלי, היומן שלך, בלי דרמות</div>

      {!sent ? (
        <>
          <div className="field">
            <label>אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={{ borderColor: 'var(--lavender-dim)' }}
            />
          </div>
          <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleLogin} disabled={loading}>
            {loading ? 'שולחת...' : 'שליחת קישור כניסה'}
          </button>
          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
          <p style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            אם המייל שלך מזוהה כמנוי/ה פעיל/ה, יישלח אליך קישור כניסה מאובטח תוך דקה
          </p>
        </>
      ) : (
        <div style={{ background: 'rgba(156,143,217,0.1)', border: '1px solid var(--lavender)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✉️</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>בדקי את תיבת המייל שלך</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            שלחנו קישור כניסה מאובטח - לחיצה עליו תכניס אותך ישירות לאזור האישי
          </div>
        </div>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
