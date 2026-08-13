'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [showMagicLink, setShowMagicLink] = useState(false);

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

          {!showMagicLink && (
            <div className="field">
              <label>סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ borderColor: 'var(--lavender-dim)' }}
              />
            </div>
          )}

          {!showMagicLink ? (
            <>
              <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handlePasswordLogin} disabled={loading}>
                {loading ? 'נכנסת...' : 'כניסה'}
              </button>
              <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowMagicLink(true); setError(''); }} style={{ color: 'var(--lavender)' }}>
                  אין לך סיסמה עדיין? כניסה עם קישור למייל
                </a>
              </p>
            </>
          ) : (
            <>
              <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleMagicLink} disabled={loading}>
                {loading ? 'שולחת...' : 'שליחת קישור כניסה'}
              </button>
              <p style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                אם המייל שלך מזוהה כמנוי/ה פעיל/ה, יישלח אליך קישור כניסה מאובטח תוך דקה
              </p>
              <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); setShowMagicLink(false); setError(''); }} style={{ color: 'var(--lavender)' }}>
                  ← חזרה לכניסה עם סיסמה
                </a>
              </p>
            </>
          )}

          {error && <p style={{ color: 'var(--loss)', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>{error}</p>}
        </>
      ) : (
        <div style={{ background: 'rgba(156,143,217,0.1)', border: '1px solid var(--lavender)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✉️</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>בדקי את תיבת המייל שלך</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            שלחנו קישור כניסה מאובטח - לחיצה עליו תכניס אותך ישירות לאזור האישי, ושם תוכלי להגדיר סיסמה קבועה לפעם הבאה
          </div>
        </div>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
