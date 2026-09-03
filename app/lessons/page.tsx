'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LESSONS_LIBRARY_PUBLIC, LESSON_CATEGORIES } from '@/lib/lessonsConfig';

type LessonSummary = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  durationMinutes: number | null;
  thumbnailUrl: string;
};

export default function LessonsLibraryPage() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [gateNeeded, setGateNeeded] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [entering, setEntering] = useState(false);
  const [gateError, setGateError] = useState('');
  const [enterResult, setEnterResult] = useState<'subscriber' | 'updates' | null>(null);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    let admin = false;
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      admin = profile?.role === 'admin';
      setIsAdmin(admin);
    }

    setCheckingAccess(false);

    if (!LESSONS_LIBRARY_PUBLIC && !admin) return;
    await load(admin);
  }

  // שער כניסה יחיד לכל הספרייה - אין יותר נעילה לפי שיעור בודד. מי שכבר מנוי או כבר בקבוצת
  // העדכונים (viewerTier חוזר לא 'public') נכנס ישר; מי שלא, מקבל טופס השארת פרטים קצר.
  async function load(adminOverride?: boolean) {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/lessons', {
      credentials: 'include',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      const admin = adminOverride ?? isAdmin;
      if (!admin && data.viewerTier === 'public') {
        setGateNeeded(true);
        setLessons([]);
      } else {
        setGateNeeded(false);
        setLessons(data.lessons || []);
      }
    }
    setLoading(false);
  }

  function isValidPhone(v: string) {
    return /^05\d{8}$/.test(v.replace(/\D/g, ''));
  }

  // אם הטלפון כבר משויך למנוי/חברת עדכונים במאנדיי - /api/lead לא יוצר ליד, ורק מחזיר matched.
  // מציגים לכל אחד מהם הודעה מתאימה במקום לזרוק ישר לתוך הספרייה בלי שום ציון.
  async function handleEnter() {
    if (!name.trim() || !isValidPhone(phone)) {
      setGateError('צריך שם ומספר נייד תקין (לדוגמה 0501234567)');
      return;
    }
    setEntering(true);
    setGateError('');

    let matched: string | undefined;
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), source: 'ספריית שיעורים' }),
      });
      const data = await res.json().catch(() => ({}));
      matched = data.matched;
    } catch {}

    setEntering(false);

    if (matched === 'subscriber' || matched === 'updates') {
      setEnterResult(matched);
      return;
    }

    await load();
  }

  async function continueToLibrary() {
    setEnterResult(null);
    await load();
  }

  // רק נושאים שיש בהם בפועל שיעורים, בסדר הקבוע מ-LESSON_CATEGORIES (ולא לפי סדר הופעה מקרי)
  const presentCategories = LESSON_CATEGORIES.filter((c) => lessons.some((l) => l.category === c));
  const visibleLessons = activeCategory ? lessons.filter((l) => l.category === activeCategory) : lessons;

  function renderGrid(list: LessonSummary[]) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
        {list.map((lesson) => (
          <Link key={lesson.id} href={`/lessons/${lesson.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
                <img src={lesson.thumbnailUrl} alt={lesson.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(79,201,196,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#08131a', fontSize: '16px' }}>▶</span>
                </div>
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, marginBottom: '4px' }}>{lesson.title}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                  {lesson.category && <span style={{ color: '#E8A33D', fontWeight: 600 }}>{lesson.category}</span>}
                  {lesson.category && lesson.durationMinutes ? ' · ' : ''}
                  {lesson.durationMinutes ? `${lesson.durationMinutes} דק'` : ''}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  if (checkingAccess) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>;
  }

  if (!LESSONS_LIBRARY_PUBLIC && !isAdmin) {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/" className="nav-link">בית</Link>
        </header>
        <p style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>בקרוב 🎬</p>
      </div>
    );
  }

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
        וובינרים, הרצאות ומצגות על מסחר - פתוחות לצפייה לכל מי שמחובר לקהילה שלנו.
      </p>

      {gateNeeded && !loading && !enterResult && (
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

      {gateNeeded && enterResult === 'subscriber' && (
        <div className="tp-question-card">
          <div className="tp-question-title">כבר יש לך גישה מלאה 🎉</div>
          <div className="tp-step-intro" style={{ marginBottom: '14px' }}>
            את/ה כבר חלק מקבוצת הסוחרים - אין צורך להשאיר שום פרטים, הכל כבר פתוח לך כמנוי/ה.
          </div>
          <button type="button" className="btn-primary" onClick={continueToLibrary}>כניסה לספרייה</button>
        </div>
      )}

      {gateNeeded && enterResult === 'updates' && (
        <div className="tp-question-card">
          <div className="tp-question-title">כבר את/ה בקבוצת העדכונים 👋</div>
          <div className="tp-step-intro" style={{ marginBottom: '14px' }}>
            הספרייה פתוחה לך. רוצה גישה גם לתוכן הבלעדי ולליווי של קבוצת הסוחרים?
          </div>
          <a
            href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: '10px' }}
          >
            הצטרפות לקבוצת הסוחרים ←
          </a>
          <button type="button" className="btn-primary" onClick={continueToLibrary}>כניסה לספרייה</button>
        </div>
      )}

      {!gateNeeded && (
        <>
          {presentCategories.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <button type="button" className={`filter-chip ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>הכל</button>
              {presentCategories.map((c) => (
                <button key={c} type="button" className={`filter-chip ${activeCategory === c ? 'active' : ''}`} onClick={() => setActiveCategory(c)}>{c}</button>
              ))}
            </div>
          )}

          {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
          {!loading && visibleLessons.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין אין כאן שיעורים</p>}

          {!loading && activeCategory && renderGrid(visibleLessons)}

          {!loading && !activeCategory && presentCategories.map((c) => (
            <div key={c} style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#E8A33D', marginBottom: '10px' }}>{c}</div>
              {renderGrid(lessons.filter((l) => l.category === c))}
            </div>
          ))}
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
