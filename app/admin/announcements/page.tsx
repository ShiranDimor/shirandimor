'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Announcement = {
  id: string;
  title: string;
  content: string;
  published: boolean;
  created_at: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAnnouncementsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }

    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') loadAnnouncements();
  }

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function loadAnnouncements() {
    setLoading(true);
    const res = await fetch('/api/admin/announcements', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setAnnouncements(data.announcements || []);
    }
    setLoading(false);
  }

  async function handlePublish() {
    if (!title.trim() || !content.trim()) { setError('חסרים כותרת או תוכן'); return; }
    if (!window.confirm('לפרסם הודעה חדשה? היא תישלח כהתראת פוש לכל מי שהפעיל התראות - מנויים ולא-מנויים כאחד.')) return;

    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ title: title.trim(), content: content.trim() }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'שגיאה בפרסום');
      return;
    }

    setTitle('');
    setContent('');
    loadAnnouncements();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('למחוק את ההודעה הזו לצמיתות?')) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE', headers: await authHeader() });
    setDeletingId('');
    if (res.ok) setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;
  }

  if (!userEmail) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <a href="/" className="nav-link">בית</a>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <a href="/login" style={{ color: 'var(--teal)' }}>כניסה</a></p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <a href="/" className="nav-link">בית</a>
            <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
          </div>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>אין הרשאת ניהול לחשבון המחובר ({userEmail})</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/" className="nav-link">בית</Link>
          <Link href="/admin" className="nav-link">← לניהול</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>לוח מודעות</h2><span className="count">{announcements.length}</span></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        פרסום הודעה שולח אותה מיד כהתראת פוש לכולם - מנויים ולא-מנויים כאחד, בלי טשטוש. כל ההודעות נשמרות בעמוד הציבורי /announcements, מהחדשה לישנה.
      </p>

      <div className="tp-question-card">
        <div className="tp-question-title">הודעה חדשה</div>
        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="tp-text-input" style={{ marginBottom: '10px' }} placeholder="תוכן ההודעה" rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
        {error && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{error}</p>}
        <button className="btn-primary" onClick={handlePublish} disabled={saving}>{saving ? 'מפרסם...' : '📌 פרסום ושליחת התראה'}</button>
      </div>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loading && announcements.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין עדיין הודעות</p>}

      {announcements.map((a) => (
        <div key={a.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{formatDateTime(a.created_at)}</div>
            </div>
            <button onClick={() => handleDelete(a.id)} disabled={deletingId === a.id} className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px', flexShrink: 0 }}>
              {deletingId === a.id ? '…' : 'מחיקה'}
            </button>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px', whiteSpace: 'pre-line' }}>{a.content}</p>
        </div>
      ))}
    </div>
  );
}
