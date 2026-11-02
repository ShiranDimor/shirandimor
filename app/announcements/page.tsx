'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FormattedText } from '@/lib/formatText';

type Announcement = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  function loadAnnouncements() {
    fetch('/api/announcements', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setAnnouncements(data.announcements || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAnnouncements();

    // רענון כשחוזרים לדף - אחרת מי שכבר היה לו הדף הזה פתוח (למשל ברקע, או שהגיע אליו קודם
    // ועבר לאפליקציה אחרת) ולוחץ על התראת פוש שרק מחזירה פוקוס לטאב הקיים, ימשיך לראות את
    // הרשימה הישנה שנטענה לפני שההודעה החדשה פורסמה. שלושה אירועים שונים כי לכל דפדפן/מצב
    // (החזרת פוקוס לטאב, שחזור מ-bfcache בניווט אחורה/קדימה, מעבר אפליקציות בנייד) יש התנהגות
    // קצת שונה - ולא תמיד רק אחד מהם נורה בפועל
    function refreshIfVisible() {
      if (document.visibilityState === 'visible') loadAnnouncements();
    }
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    window.addEventListener('pageshow', refreshIfVisible);

    // איתות מפורש מה-Service Worker בלחיצה על התראה (ר' public/sw.js) - לא סומכים רק על
    // אירועי focus/visibility, כי הם לא תמיד נורים באופן אמין בכל דפדפן/מערכת כשחוזרים מהתראה
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'refresh-data') loadAnnouncements();
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener('pageshow', refreshIfVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  // התראת פוש/פעמון על הודעה ספציפית מגיעה עם #ann-<id> - פותחים אותה (היא קפלית, סגורה
  // כברירת מחדל), גוללים אליה ומדגישים אותה לרגע, כדי שמי שלחץ כדי "לקרוא את ההודעה הזו"
  // לא ייחת סתם בראש הרשימה ויצטרך לפתוח ולחפש אותה בעצמו
  useEffect(() => {
    if (loading || announcements.length === 0) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#ann-')) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('attention-pulse');
    setTimeout(() => el.classList.remove('attention-pulse'), 2000);
  }, [loading, announcements]);

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <Link href="/" className="nav-link">בית</Link>
      </header>

      <div className="form-title">לוח מודעות</div>
      <div className="form-sub">כל העדכונים שלי - מהאחרון לישן ביותר</div>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '20px' }}>טוענים...</p>}
      {!loading && announcements.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '20px' }}>אין עדיין הודעות</p>
      )}

      {!loading && announcements.map((a) => (
        <details key={a.id} id={`ann-${a.id}`} className="section-collapse" style={{ scrollMarginTop: '90px' }}>
          <summary>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--teal)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{formatDateTime(a.created_at)}</div>
            </div>
            <span className="collapse-chevron">▾</span>
          </summary>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line' }}><FormattedText text={a.content} /></p>
          </div>
        </details>
      ))}

    </div>
  );
}
