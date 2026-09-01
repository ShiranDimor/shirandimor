'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type LessonDetail = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  durationMinutes: number | null;
  thumbnailUrl: string;
  videoId: string | null;
  locked: boolean;
};

export default function LessonDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [entering, setEntering] = useState(false);
  const [gateError, setGateError] = useState('');

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/lessons?id=${encodeURIComponent(id)}`, {
      credentials: 'include',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      setLesson(data.lesson);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }

  function isValidPhone(v: string) {
    return /^05\d{8}$/.test(v.replace(/\D/g, ''));
  }

  async function handleEnter() {
    if (!name.trim() || !isValidPhone(phone)) {
      setGateError('צריך שם ומספר נייד תקין (לדוגמה 0501234567)');
      return;
    }
    setEntering(true);
    setGateError('');

    try {
      await fetch('/api/lead', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), source: 'ספריית שיעורים' }),
      });
    } catch {}

    await load();
    setEntering(false);
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/lessons" className="nav-link">← לספריית השיעורים</Link>
        </div>
      </header>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {notFound && !loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>השיעור לא נמצא</p>}

      {lesson && !loading && (
        <>
          <div className="form-title" style={{ fontSize: '22px' }}>{lesson.title}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>
            {lesson.category && <span style={{ color: '#E8A33D', fontWeight: 600 }}>{lesson.category}</span>}
            {lesson.category && lesson.durationMinutes ? ' · ' : ''}
            {lesson.durationMinutes ? `${lesson.durationMinutes} דק'` : ''}
          </div>

          {!lesson.locked && lesson.videoId && (
            <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: '12px', overflow: 'hidden', marginBottom: '18px' }}>
              <iframe
                src={`https://www.youtube.com/embed/${lesson.videoId}`}
                title={lesson.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          )}

          {lesson.locked && (
            <div className="tp-question-card">
              <div className="tp-question-title">כמה פרטים ונכנסים</div>
              <div className="tp-step-intro" style={{ marginBottom: '14px' }}>
                הספרייה פתוחה לחברי הקהילה - אם כבר קיימים אצלנו (מנויים או קבוצת העדכונים) תיכנסו ישר, ואם לא, ההצטרפות חינמית ולוקחת רגע.
              </div>

              <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="שם" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} type="tel" placeholder="נייד" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />

              {gateError && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{gateError}</p>}

              <button type="button" className="btn-primary" onClick={handleEnter} disabled={entering}>
                {entering ? 'נכנסים...' : 'כניסה לספרייה'}
              </button>
            </div>
          )}

          {lesson.description && (
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: '20px' }}>{lesson.description}</p>
          )}
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
