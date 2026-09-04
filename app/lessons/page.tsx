'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { LESSONS_LIBRARY_PUBLIC, LESSON_CATEGORIES, LESSON_CATEGORY_ICONS } from '@/lib/lessonsConfig';

type LessonSummary = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  videoProvider: string;
  durationMinutes: number | null;
  thumbnailUrl: string | null;
};

export default function LessonsLibraryPage() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [gateNeeded, setGateNeeded] = useState(false);

  // שער דו-שלבי: קודם רק נייד (מספיק כדי לזהות מנוי/קבוצת עדכונים קיימים - בלי לבקש שם סתם
  // בשביל "לוודא מי זה"), ורק אם התברר שזה ליד חדש שבאמת נרשם ל-Monday מבקשים גם שם.
  const [gateStep, setGateStep] = useState<'phone' | 'name'>('phone');
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

  // אם הטלפון כבר משויך למנוי/חברת עדכונים במאנדיי - /api/lead לא יוצר ליד, ורק מחזיר matched,
  // בלי שהיה צריך בכלל לבקש שם. אם לא - השרת מחזיר needsName, ורק אז עוברים לשלב השם.
  async function handleEnter() {
    if (gateStep === 'phone' && !isValidPhone(phone)) {
      setGateError('צריך מספר נייד תקין (לדוגמה 0501234567)');
      return;
    }
    if (gateStep === 'name' && !name.trim()) {
      setGateError('צריך שם');
      return;
    }

    setEntering(true);
    setGateError('');

    let matched: string | undefined;
    let needsName = false;
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, phone: phone.trim(), source: 'ספריית שיעורים' }),
      });
      const data = await res.json().catch(() => ({}));
      matched = data.matched;
      needsName = Boolean(data.needsName);
    } catch {}

    setEntering(false);

    if (matched === 'subscriber' || matched === 'updates') {
      setEnterResult(matched as 'subscriber' | 'updates');
      return;
    }

    if (needsName) {
      setGateStep('name');
      return;
    }

    await load();
  }

  async function continueToLibrary() {
    setEnterResult(null);
    await load();
  }

  // מצגות מקבלות תיקייה נפרדת משלהן, בלי חלוקה לפי נושא - הן לא משתתפות בסינון/בקיבוץ לפי
  // LESSON_CATEGORIES בכלל, גם אם יש להן ערך category שמור (נשמר רק לצרכי ניהול).
  const presentationLessons = lessons.filter((l) => l.videoProvider === 'gamma');
  const videoLessons = lessons.filter((l) => l.videoProvider !== 'gamma');

  // רק נושאים שיש בהם בפועל שיעורים, בסדר הקבוע מ-LESSON_CATEGORIES (ולא לפי סדר הופעה מקרי)
  const presentCategories = LESSON_CATEGORIES.filter((c) => videoLessons.some((l) => l.category === c));
  const visibleLessons = activeCategory ? videoLessons.filter((l) => l.category === activeCategory) : videoLessons;
  const nothingToShow = activeCategory ? visibleLessons.length === 0 : presentationLessons.length === 0 && presentCategories.length === 0;

  function renderGrid(list: LessonSummary[]) {
    return (
      <div className="lesson-grid">
        {list.map((lesson) => (
          <Link key={lesson.id} href={`/lessons/${lesson.id}`} className="lesson-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="lesson-card-thumb">
              {lesson.thumbnailUrl ? (
                <>
                  <img src={lesson.thumbnailUrl} alt={lesson.title} />
                  <div className="lesson-card-play"><span>▶</span></div>
                </>
              ) : (
                <div className="lesson-card-presentation"><span>📊</span>מצגת</div>
              )}
              {lesson.durationMinutes && <div className="lesson-card-duration">{lesson.durationMinutes} דק'</div>}
            </div>
            <div className="lesson-card-body">
              <div className="lesson-card-title">{lesson.title}</div>
              {lesson.category && <div className="lesson-card-meta"><span className="lesson-card-cat">{lesson.category}</span></div>}
            </div>
          </Link>
        ))}
      </div>
    );
  }

  function renderSkeleton() {
    return (
      <div className="lesson-skeleton-grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="lesson-skeleton" />)}
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

      <div className="lessons-hero">
        <div className="lessons-hero-icon">🎬</div>
        <h1>ספריית שיעורים</h1>
        <p>וובינרים, הרצאות ומצגות על מסחר - פתוחות לצפייה לכל מי שמחובר לקהילה שלנו.</p>
        {!gateNeeded && lessons.length > 0 && (
          <div className="lessons-hero-stats">
            <div className="lessons-hero-stat"><b>{lessons.length}</b><span>שיעורים</span></div>
            <div className="lessons-hero-stat"><b>{presentCategories.length}</b><span>נושאים</span></div>
          </div>
        )}
      </div>

      {gateNeeded && !loading && !enterResult && gateStep === 'phone' && (
        <div className="tp-question-card">
          <div className="tp-question-title">רק נייד, וזה שלך</div>
          <div className="tp-step-intro" style={{ marginBottom: '14px' }}>
            בלי שאלונים, בלי מייל - אם כבר קיימים אצלנו זה כל מה שצריך כדי לזהות אתכם ולפתוח את כל השיעורים.
          </div>

          <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} type="tel" placeholder="נייד" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} autoFocus />

          {gateError && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{gateError}</p>}

          <button type="button" className="btn-primary" onClick={handleEnter} disabled={entering}>
            {entering ? 'בודקים...' : 'כניסה לספרייה'}
          </button>
        </div>
      )}

      {gateNeeded && !loading && !enterResult && gateStep === 'name' && (
        <div className="tp-question-card">
          <div className="tp-question-title">עוד רגע - איך קוראים לך?</div>
          <div className="tp-step-intro" style={{ marginBottom: '14px' }}>
            לא זיהינו אתכם אצלנו - השארת שם פותחת גישה חינמית לספרייה, ומצטרפת אתכם לקבוצת העדכונים.
          </div>

          <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="שם" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

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

          {loading && renderSkeleton()}
          {!loading && nothingToShow && (
            <div className="lessons-empty">
              <div className="lessons-empty-icon">🎬</div>
              עדיין אין כאן שיעורים
            </div>
          )}

          {!loading && activeCategory && renderGrid(visibleLessons)}

          {!loading && !activeCategory && presentationLessons.length > 0 && (
            <div className="lesson-folder">
              <div className="lesson-folder-header">
                <div className="lesson-folder-icon">📊</div>
                <div className="lesson-folder-title">מצגות</div>
                <div className="lesson-folder-count">{presentationLessons.length}</div>
              </div>
              {renderGrid(presentationLessons)}
            </div>
          )}

          {!loading && !activeCategory && presentCategories.map((c) => (
            <div key={c} className="lesson-folder">
              <div className="lesson-folder-header">
                <div className="lesson-folder-icon">{LESSON_CATEGORY_ICONS[c] || '📁'}</div>
                <div className="lesson-folder-title">{c}</div>
                <div className="lesson-folder-count">{videoLessons.filter((l) => l.category === c).length}</div>
              </div>
              {renderGrid(videoLessons.filter((l) => l.category === c))}
            </div>
          ))}
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
