'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type LessonSummary = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tier: 'public' | 'registered' | 'subscriber';
  durationMinutes: number | null;
  thumbnailUrl: string;
  locked: boolean;
};

const TIER_BADGE: Record<'registered' | 'subscriber', string> = {
  registered: 'להצטרפות חינם',
  subscriber: 'למנויים',
};

export default function LessonsLibraryPage() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/lessons', {
      credentials: 'include',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      setLessons(data.lessons || []);
    }
    setLoading(false);
  }

  const categories = Array.from(new Set(lessons.map((l) => l.category).filter(Boolean))) as string[];
  const visibleLessons = activeCategory ? lessons.filter((l) => l.category === activeCategory) : lessons;

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/" className="nav-link">בית</Link>
          <Link href="/login" className="nav-link">כניסה לסוחרים</Link>
        </div>
      </header>

      <div className="section-label"><h2>ספריית שיעורים</h2></div>
      <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>
        וובינרים, הרצאות ומצגות על מסחר - חלק פתוח לכולם, חלק לחברי קבוצת העדכונים, וחלק שמור למנויים.
      </p>

      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button type="button" className={`filter-chip ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>הכל</button>
          {categories.map((c) => (
            <button key={c} type="button" className={`filter-chip ${activeCategory === c ? 'active' : ''}`} onClick={() => setActiveCategory(c)}>{c}</button>
          ))}
        </div>
      )}

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loading && visibleLessons.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין אין כאן שיעורים</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
        {visibleLessons.map((lesson) => (
          <Link key={lesson.id} href={`/lessons/${lesson.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
                <img src={lesson.thumbnailUrl} alt={lesson.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: lesson.locked ? 'blur(3px) brightness(0.6)' : 'none' }} />
                {lesson.locked ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '22px' }}>🔒</span>
                    <span className="locked-tag">{TIER_BADGE[lesson.tier as 'registered' | 'subscriber']}</span>
                  </div>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(79,201,196,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#08131a', fontSize: '16px' }}>▶</span>
                  </div>
                )}
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, marginBottom: '4px' }}>{lesson.title}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                  {[lesson.category, lesson.durationMinutes ? `${lesson.durationMinutes} דק'` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
