'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Live = {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  join_info: string | null;
  published: boolean;
  created_at: string;
};

type Registration = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  is_subscriber: boolean;
  created_at: string;
};

const emptyForm = {
  title: '',
  description: '',
  scheduledAt: '',
  joinInfo: '',
  published: true,
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'long' });
  return `${weekday}, ${d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`;
}

// input[type=datetime-local] מייצג שעון-קיר בלי אזור זמן. new Date(iso).toISOString() תמיד מחזיר UTC,
// אז ממירים לפי הפרש שעון הזמן המקומי של הדפדפן כדי שהשדה יציג את השעה המקומית הנכונה בעריכה
function isoToLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const localMs = d.getTime() - d.getTimezoneOffset() * 60000;
  return new Date(localMs).toISOString().slice(0, 16);
}

export default function AdminLivesPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [lives, setLives] = useState<Live[]>([]);
  const [loadingLives, setLoadingLives] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, Registration[]>>({});
  const [loadingRegsId, setLoadingRegsId] = useState<string | null>(null);

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
    if (profile?.role === 'admin') loadLives();
  }

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function loadLives() {
    setLoadingLives(true);
    const res = await fetch('/api/admin/lives', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setLives(data.lives || []);
    }
    setLoadingLives(false);
  }

  function startEdit(live: Live) {
    setEditingId(live.id);
    setForm({
      title: live.title,
      description: live.description || '',
      scheduledAt: isoToLocalInputValue(live.scheduled_at),
      joinInfo: live.join_info || '',
      published: live.published,
    });
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  }

  async function handleSubmit() {
    if (!form.title.trim()) { setFormError('חסרה כותרת'); return; }
    if (!form.scheduledAt) { setFormError('חסר תאריך/שעה'); return; }

    setSaving(true);
    setFormError('');

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      // form.scheduledAt הוא שעון-קיר בלי אזור זמן (מה-input) - new Date(...) כאן רץ בדפדפן ומפרש
      // אותו לפי אזור הזמן המקומי (ישראל), ואז toISOString() נותן UTC נכון לשמירה בשרת
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      joinInfo: form.joinInfo.trim() || null,
      published: form.published,
    };

    const res = await fetch(editingId ? `/api/admin/lives/${editingId}` : '/api/admin/lives', {
      method: editingId ? 'PATCH' : 'POST',
      headers: await authHeader(),
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error || 'שגיאה בשמירה');
      return;
    }

    cancelEdit();
    loadLives();
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`למחוק לצמיתות את הלייב "${title}"? גם כל ההרשמות אליו יימחקו.`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/lives/${id}`, { method: 'DELETE', headers: await authHeader() });
    setDeletingId(null);
    if (res.ok) {
      setLives((prev) => prev.filter((l) => l.id !== id));
      if (editingId === id) cancelEdit();
    }
  }

  async function toggleRegistrations(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!registrations[id]) {
      setLoadingRegsId(id);
      const res = await fetch(`/api/admin/lives/${id}/registrations`, { headers: await authHeader() });
      if (res.ok) {
        const data = await res.json();
        setRegistrations((prev) => ({ ...prev, [id]: data.registrations || [] }));
      }
      setLoadingRegsId(null);
    }
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

      <div className="section-label"><h2>ניהול לייבים</h2><span className="count">{lives.length}</span></div>

      <div className="tp-question-card">
        <div className="tp-question-title">{editingId ? 'עריכת לייב' : 'הוספת לייב חדש'}</div>

        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="כותרת" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="tp-text-input" style={{ marginBottom: '10px' }} placeholder="תיאור קצר" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input className="tp-text-input" style={{ minHeight: 'auto' }} type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
        {form.scheduledAt && !isNaN(Date.parse(form.scheduledAt)) && (
          <p style={{ fontSize: '12px', color: 'var(--teal)', marginTop: '4px', marginBottom: '10px' }}>
            {new Date(form.scheduledAt).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}
          </p>
        )}
        <textarea className="tp-text-input" style={{ marginBottom: '10px' }} placeholder="פרטי הצטרפות (קישור Zoom/וואטסאפ וכו') - נחשף רק למי שנרשם" rows={2} value={form.joinInfo} onChange={(e) => setForm({ ...form, joinInfo: e.target.value })} />

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
          מפורסם (גלוי באתר)
        </label>

        {formError && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{formError}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? 'שומר...' : editingId ? 'שמירת שינויים' : 'הוספת לייב'}
          </button>
          {editingId && <button type="button" className="btn-outline" onClick={cancelEdit}>ביטול</button>}
        </div>
      </div>

      {loadingLives && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingLives && lives.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין לא נוספו לייבים</p>}

      {lives.map((live) => (
        <div key={live.id} style={{ marginBottom: '10px' }}>
          <div className="admin-row">
            <div>
              <div className="name">
                {live.title}
                {!live.published && <span style={{ marginRight: '8px', fontSize: '10.5px', color: '#E8A33D', border: '1px solid #E8A33D', borderRadius: '5px', padding: '2px 6px' }}>טיוטה</span>}
              </div>
              <div className="email">{formatDateTime(live.scheduled_at)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button type="button" className="btn-outline" style={{ padding: '8px 12px', fontSize: '12.5px' }} onClick={() => toggleRegistrations(live.id)}>
                {expandedId === live.id ? 'הסתרת נרשמים' : 'נרשמים'}
              </button>
              <button type="button" className="btn-outline" style={{ padding: '8px 12px', fontSize: '12.5px' }} onClick={() => startEdit(live)}>עריכה</button>
              <button
                className="row-delete-btn"
                onClick={() => handleDelete(live.id, live.title)}
                disabled={deletingId === live.id}
                title="מחיקת לייב"
              >
                {deletingId === live.id ? '…' : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--loss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {expandedId === live.id && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '12px 14px', marginTop: '6px' }}>
              {loadingRegsId === live.id && <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
              {loadingRegsId !== live.id && (registrations[live.id] || []).length === 0 && (
                <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>עדיין אין נרשמים</p>
              )}
              {(registrations[live.id] || []).map((r) => (
                <div key={r.id} style={{ fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--border-hairline)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.name || '—'} · {r.phone || '—'} · {r.email || '—'}</span>
                  <span style={{ color: r.is_subscriber ? 'var(--profit)' : 'var(--text-tertiary)', fontSize: '11.5px' }}>{r.is_subscriber ? 'מנוי' : 'ליד'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
