'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AccountPage() {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
      setMessage('הסיסמה נשמרה! בפעם הבאה תוכלי להיכנס איתה ישירות.');
      setPassword('');
    }
  }

  return (
    <div className="wrap">
      <header>
        <div className="brand">מסחר <span>אחראי</span> במניות</div>
        <Link href="/portfolio" className="nav-link">← חזרה</Link>
      </header>

      <div className="form-title" style={{ color: 'var(--lavender)' }}>הגדרת סיסמה</div>
      <div className="form-sub">אחרי שתגדירי סיסמה, תוכלי להיכנס איתה ישירות במקום לחכות למייל בכל פעם</div>

      <div className="field">
        <label>סיסמה חדשה</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="לפחות 6 תווים"
          style={{ borderColor: 'var(--lavender-dim)' }}
        />
      </div>

      <button className="btn-primary" style={{ background: 'var(--lavender)' }} onClick={handleSetPassword} disabled={saving}>
        {saving ? 'שומרת...' : 'שמירת סיסמה'}
      </button>

      {message && (
        <p style={{ marginTop: '12px', fontSize: '13px', textAlign: 'center', color: message.includes('שגיאה') ? 'var(--loss)' : 'var(--profit)' }}>
          {message}
        </p>
      )}
    </div>
  );
}
