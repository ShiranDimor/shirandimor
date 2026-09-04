'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LESSON_CATEGORIES, LESSON_CATEGORY_ICONS } from '@/lib/lessonsConfig';

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  video_provider: string;
  video_id: string;
  thumbnail_url: string | null;
  duration_minutes: number | null;
  published: boolean;
  sort_order: number;
  created_at: string;
};

const emptyForm = {
  title: '',
  description: '',
  category: LESSON_CATEGORIES[0] as string,
  provider: 'youtube' as 'youtube' | 'gamma',
  videoUrl: '',
  durationMinutes: '',
  published: true,
  sortOrder: '0',
};

export default function AdminLessonsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    if (profile?.role === 'admin') loadLessons();
  }

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function loadLessons() {
    setLoadingLessons(true);
    const res = await fetch('/api/admin/lessons', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setLessons(data.lessons || []);
    }
    setLoadingLessons(false);
  }

  function startEdit(lesson: Lesson) {
    setEditingId(lesson.id);
    const isGamma = lesson.video_provider === 'gamma';
    setForm({
      title: lesson.title,
      description: lesson.description || '',
      category: lesson.category || LESSON_CATEGORIES[0],
      provider: isGamma ? 'gamma' : 'youtube',
      videoUrl: isGamma ? lesson.video_id : `https://www.youtube.com/watch?v=${lesson.video_id}`,
      durationMinutes: lesson.duration_minutes ? String(lesson.duration_minutes) : '',
      published: lesson.published,
      sortOrder: String(lesson.sort_order),
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
    if (!editingId && !form.videoUrl.trim()) { setFormError(form.provider === 'gamma' ? 'חסר לינק למצגת' : 'חסר לינק וידאו'); return; }

    setSaving(true);
    setFormError('');

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      provider: form.provider,
      videoUrl: form.videoUrl.trim() || undefined,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
      published: form.published,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
    };

    const res = await fetch(editingId ? `/api/admin/lessons/${editingId}` : '/api/admin/lessons', {
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
    loadLessons();
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`למחוק לצמיתות את השיעור "${title}"?`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/lessons/${id}`, { method: 'DELETE', headers: await authHeader() });
    setDeletingId(null);
    if (res.ok) {
      setLessons((prev) => prev.filter((l) => l.id !== id));
      if (editingId === id) cancelEdit();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  // מצגות מקבלות תיקייה נפרדת משלהן, בלי חלוקה לפי נושא - אותה חלוקה שיש בעמוד הציבורי
  const presentationLessons = lessons.filter((l) => l.video_provider === 'gamma');
  const videoLessons = lessons.filter((l) => l.video_provider !== 'gamma');

  function renderLessonCard(lesson: Lesson) {
    return (
      <div key={lesson.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', overflow: 'hidden' }}>
        <Link href={`/lessons/${lesson.id}`} target="_blank" className="lesson-card-thumb" style={{ display: 'block', position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
          {lesson.thumbnail_url || lesson.video_provider === 'youtube' ? (
            <>
              <img
                src={lesson.thumbnail_url || `https://img.youtube.com/vi/${lesson.video_id}/hqdefault.jpg`}
                alt={lesson.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div className="lesson-card-play"><span>▶</span></div>
            </>
          ) : (
            <div className="lesson-card-presentation"><span>📊</span>מצגת</div>
          )}
          {!lesson.published && (
            <span style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '10.5px', color: '#E8A33D', background: 'rgba(8,19,26,0.85)', border: '1px solid #E8A33D', borderRadius: '5px', padding: '2px 6px' }}>טיוטה</span>
          )}
        </Link>
        <div style={{ padding: '12px' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, marginBottom: '4px' }}>{lesson.title}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
            {lesson.duration_minutes ? `${lesson.duration_minutes} דק'` : 'ללא משך מוגדר'}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className="btn-outline" style={{ flex: 1, padding: '8px 12px', fontSize: '12.5px' }} onClick={() => startEdit(lesson)}>עריכה</button>
            <button
              className="row-delete-btn"
              onClick={() => handleDelete(lesson.id, lesson.title)}
              disabled={deletingId === lesson.id}
              title="מחיקת שיעור"
            >
              {deletingId === lesson.id ? '…' : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--loss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    );
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

      <div className="section-label"><h2>ניהול ספריית שיעורים</h2><span className="count">{lessons.length}</span></div>

      <div className="tp-question-card">
        <div className="tp-question-title">{editingId ? 'עריכת שיעור' : 'הוספת שיעור חדש'}</div>

        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="כותרת" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="tp-text-input" style={{ marginBottom: '10px' }} placeholder="תיאור קצר" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {LESSON_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button type="button" className={`filter-chip ${form.provider === 'youtube' ? 'active' : ''}`} onClick={() => setForm({ ...form, provider: 'youtube' })}>🎬 סרטון YouTube</button>
          <button type="button" className={`filter-chip ${form.provider === 'gamma' ? 'active' : ''}`} onClick={() => setForm({ ...form, provider: 'gamma' })}>📊 מצגת Gamma</button>
        </div>
        <input
          className="tp-text-input"
          style={{ minHeight: 'auto', marginBottom: '10px' }}
          placeholder={
            form.provider === 'gamma'
              ? (editingId ? 'לינק Gamma חדש (רק אם רוצים להחליף מצגת)' : 'לינק לשיתוף מ-Gamma, או קוד ה-embed')
              : (editingId ? 'לינק YouTube חדש (רק אם רוצים להחליף סרטון)' : 'לינק YouTube')
          }
          value={form.videoUrl}
          onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
        />

        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} type="number" placeholder="אורך בדקות" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
          מפורסם (גלוי באתר)
        </label>

        {formError && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{formError}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? 'שומר...' : editingId ? 'שמירת שינויים' : 'הוספת שיעור'}
          </button>
          {editingId && <button type="button" className="btn-outline" onClick={cancelEdit}>ביטול</button>}
        </div>
      </div>

      {loadingLessons && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingLessons && lessons.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין לא נוספו שיעורים</p>}

      {!loadingLessons && presentationLessons.length > 0 && (
        <div className="lesson-folder">
          <div className="lesson-folder-header">
            <div className="lesson-folder-icon">📊</div>
            <div className="lesson-folder-title">מצגות</div>
            <div className="lesson-folder-count">{presentationLessons.length}</div>
          </div>
          <div className="lesson-grid">{presentationLessons.map(renderLessonCard)}</div>
        </div>
      )}

      {!loadingLessons && [...LESSON_CATEGORIES, 'ללא קטגוריה מוכרת'].map((c) => {
        const inGroup = c === 'ללא קטגוריה מוכרת'
          ? videoLessons.filter((l) => !LESSON_CATEGORIES.includes(l.category as (typeof LESSON_CATEGORIES)[number]))
          : videoLessons.filter((l) => l.category === c);
        if (inGroup.length === 0) return null;

        return (
          <div key={c} className="lesson-folder">
            <div className="lesson-folder-header">
              <div className="lesson-folder-icon">{LESSON_CATEGORY_ICONS[c] || '📁'}</div>
              <div className="lesson-folder-title">{c}</div>
              <div className="lesson-folder-count">{inGroup.length}</div>
            </div>
            <div className="lesson-grid">{inGroup.map(renderLessonCard)}</div>
          </div>
        );
      })}
    </div>
  );
}
