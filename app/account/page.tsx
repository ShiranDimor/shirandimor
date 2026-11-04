'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import PushNotificationButton from '@/components/PushNotificationButton';

type Profile = {
  full_name: string | null;
  email: string | null;
  role: string;
};

const QUICK_LINKS: { href: string; icon: string; title: string; accent: string }[] = [
  { href: '/portfolio', icon: '📈', title: 'תיק המסחר', accent: '--teal' },
  { href: '/journal', icon: '📓', title: 'היומן שלי', accent: '--lavender' },
  { href: '/lessons', icon: '🎬', title: 'ספריית שיעורים', accent: '--profit' },
  { href: '/trading-plan', icon: '🧭', title: 'תוכנית המסחר שלי', accent: '--loss' },
  { href: '/lives', icon: '🎥', title: 'לייבים', accent: '--orange' },
  { href: '/announcements', icon: '📣', title: 'לוח מודעות', accent: '--teal' },
];

export default function AccountPage() {
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [journalCount, setJournalCount] = useState<number | null>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setChecking(false);
      return;
    }

    const [{ data: profileData }, { count }] = await Promise.all([
      supabase.from('profiles').select('full_name, email, role').eq('id', user.id).maybeSingle(),
      supabase.from('journal_entries').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    setProfile(profileData || { full_name: null, email: user.email || null, role: 'subscriber' });
    setJournalCount(count ?? 0);
    setChecking(false);
  }

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
      setMessage('הסיסמה נשמרה! בפעם הבאה אפשר להיכנס איתה ישירות, בלי לחכות למייל.');
      setPassword('');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>;
  }

  if (!profile) {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/" className="nav-link">בית</Link>
        </header>
        <p style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          צריך להתחבר קודם. <Link href="/login" style={{ color: 'var(--teal)' }}>כניסה</Link>
        </p>
      </div>
    );
  }

  const firstName = (profile.full_name || '').trim().split(' ')[0] || '';

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/" className="nav-link">בית</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="lessons-hero">
        <h1>{firstName ? `היי ${firstName} 👋` : 'היי 👋'}</h1>
        <p>האזור האישי שלך - הדברים שחשובים לך, במקום אחד.</p>
        {journalCount !== null && (
          <div className="lessons-hero-stats">
            <div className="lessons-hero-stat"><b>{journalCount}</b><span>רשומות ביומן</span></div>
          </div>
        )}
      </div>

      <PushNotificationButton />

      <div className="lesson-folder-grid" style={{ marginBottom: '28px' }}>
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="lesson-folder-tile" style={{ '--tile-accent': `var(${link.accent})` } as CSSProperties}>
            <div className="lesson-folder-icon">{link.icon}</div>
            <div className="lesson-folder-title">{link.title}</div>
          </Link>
        ))}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRadius: '14px', padding: '18px' }}>
        <div className="form-title" style={{ color: 'var(--lavender)', marginBottom: '4px' }}>הגדרת סיסמה קבועה</div>
        <div className="form-sub" style={{ marginBottom: '14px' }}>אחרי הגדרת סיסמה, אפשר להיכנס איתה ישירות במקום לחכות למייל בכל פעם</div>

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
    </div>
  );
}
