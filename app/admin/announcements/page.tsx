'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FormattedText } from '@/lib/formatText';

type Announcement = {
  id: string;
  title: string;
  content: string;
  published: boolean;
  created_at: string;
  notification_sent_at: string | null;
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
  const [brief, setBrief] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [notifyingId, setNotifyingId] = useState('');
  const [testNotifyingId, setTestNotifyingId] = useState('');

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

  async function handleDraft() {
    if (!brief.trim()) return;
    setDrafting(true);
    setDraftError('');
    try {
      const res = await fetch('/api/admin/announcements/draft', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ brief: brief.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data.error || 'שגיאה בניסוח');
        return;
      }
      setTitle(data.title || '');
      setContent(data.content || '');
    } catch (e) {
      setDraftError('משהו השתבש - כדאי לנסות שוב');
    }
    setDrafting(false);
  }

  async function handlePublish() {
    if (!title.trim() || !content.trim()) { setError('חסרים כותרת או תוכן'); return; }

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

  async function handleNotify(id: string) {
    if (!window.confirm('לשלוח התראת פוש על ההודעה הזו לכל מי שהפעיל עדכונים - מנויים ולא-מנויים כאחד?')) return;
    setNotifyingId(id);
    const res = await fetch(`/api/admin/announcements/${id}/notify`, { method: 'POST', headers: await authHeader() });
    setNotifyingId('');
    if (res.ok) {
      const data = await res.json();
      setAnnouncements((prev) => prev.map((a) => (a.id === id ? data.announcement : a)));
    }
  }

  // שליחת התראה רק אלי, בלי לגעת בסטטוס "נשלח" של ההודעה - כדי לראות איך זה ייראה בפועל
  // לפני ששולחים לכולם
  async function handleTestNotify(id: string) {
    setTestNotifyingId(id);
    const res = await fetch(`/api/admin/announcements/${id}/notify?test=1`, { method: 'POST', headers: await authHeader() });
    setTestNotifyingId('');
    if (!res.ok) window.alert('השליחה נכשלה - יש לוודא שההתראות מופעלות אצלך במכשיר הזה');
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
        פרסום הודעה רק שומר אותה בעמוד הציבורי /announcements (מהחדשה לישנה) - שליחת ההתראה היא כפתור נפרד, כדי שאפשר יהיה לערוך לפני ששולחים. ההתראה יוצאת לכולם - מנויים ולא-מנויים כאחד, בלי טשטוש.
      </p>

      <div className="tp-question-card" style={{ marginBottom: '14px' }}>
        <div className="tp-question-title">✍️ ניסוח עם AI</div>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
          כותבים במשפט חופשי מה רוצים להגיד, ומקבלים כותרת ותוכן מנוסחים למטה - אפשר ואפילו כדאי לערוך לפני שמירה.
        </p>
        <textarea
          className="tp-text-input"
          style={{ marginBottom: '8px', minHeight: '60px' }}
          placeholder="לדוגמה: תזכורת ללייב של מחר ב-16:30, ושיש השבוע הרבה דוחות מעניינים"
          rows={2}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        {draftError && <p style={{ color: 'var(--loss)', fontSize: '12px', marginBottom: '8px' }}>{draftError}</p>}
        <button className="btn-outline" onClick={handleDraft} disabled={drafting || !brief.trim()}>
          {drafting ? 'מנסח/ת...' : '✍️ ניסוח'}
        </button>
      </div>

      <div className="tp-question-card">
        <div className="tp-question-title">הודעה חדשה</div>
        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="tp-text-input" style={{ marginBottom: '6px' }} placeholder="תוכן ההודעה" rows={12} value={content} onChange={(e) => setContent(e.target.value)} />
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
          טיפ: *מילה או משפט בין כוכביות* יוצג <strong>מודגש</strong> (כמו בוואטסאפ) · קישור (https://...) הופך ללחיץ אוטומטית · אימוג׳ים - מהמקלדת של הטלפון/המחשב כרגיל
        </p>
        {error && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{error}</p>}
        <button className="btn-primary" onClick={handlePublish} disabled={saving}>{saving ? 'שומר...' : '📌 שמירת הודעה'}</button>
      </div>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loading && announcements.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין עדיין הודעות</p>}

      {announcements.map((a) => (
        <details key={a.id} className="section-collapse">
          <summary>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                {formatDateTime(a.created_at)}
                {a.notification_sent_at && <span style={{ color: 'var(--profit)' }}> · ✓ התראה נשלחה</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {/* עצירת ה-click שלא יגלוש ל-summary ויפתח/יסגור בטעות כשלוחצים על כפתור פעולה */}
              <span style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleTestNotify(a.id)} disabled={testNotifyingId === a.id} className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }} title="שליחת בדיקה רק אלי, לפני שליחה לכולם">
                  {testNotifyingId === a.id ? '…' : '🔔 בדיקה לעצמי'}
                </button>
                <button onClick={() => handleNotify(a.id)} disabled={notifyingId === a.id} className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }}>
                  {notifyingId === a.id ? '…' : a.notification_sent_at ? '📣 שליחה שוב' : '📣 שליחת התראה'}
                </button>
                <button onClick={() => handleDelete(a.id)} disabled={deletingId === a.id} className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }}>
                  {deletingId === a.id ? '…' : 'מחיקה'}
                </button>
              </span>
              <span className="collapse-chevron">▾</span>
            </div>
          </summary>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}><FormattedText text={a.content} /></p>
          </div>
        </details>
      ))}
    </div>
  );
}
