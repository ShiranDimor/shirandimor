'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AccountPage() {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSetPassword() {
    if (!password || password.length < 6) {
      setMessage('הסיסמה חייבת להיות לפחות 6 תווים');
      return;
    }

    setSaving(true);
    setMessage('');

    const { error } = await supabase.auth.updateUser({ password });

    setSaving(false);

    if (error) {
      setMessage('שגיאה: ' + error.message);
    } else {
      setMessage('הסיסמה נשמרה! בפעם הבאה אפשר להיכנס איתה ישירות.');
      setPassword('');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/" className="nav-link">בית</Link>
          <Link href="/portfolio" className="nav-link">← לתיק</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="form-title" style={{ color: 'var(--lavender)' }}>הגדרת סיסמה</div>
      <div className="form-sub">אחרי הגדרת סיסמה, אפשר להיכנס איתה ישירות במקום לחכות למייל בכל פעם</div>

      <div className="field">
        <label>סיסמה חדשה</label>
        <div className="pw-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="לפחות 6 תווים"
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

      <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleSetPassword} disabled={saving}>
        {saving ? 'שומרים...' : 'שמירת סיסמה'}
      </button>

      {message && (
        <p style={{ marginTop: '12px', fontSize: '13px', textAlign: 'center', color: message.includes('שגיאה') ? 'var(--loss)' : 'var(--profit)' }}>
          {message}
        </p>
      )}
    </div>
  );
}
