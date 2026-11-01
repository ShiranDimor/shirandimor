'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

  useEffect(() => {
    fetch('/api/announcements')
      .then((res) => res.json())
      .then((data) => setAnnouncements(data.announcements || []))
      .finally(() => setLoading(false));
  }, []);

  // התראת פוש/פעמון על הודעה ספציפית מגיעה עם #ann-<id> - גוללים אליה ומדגישים אותה לרגע,
  // כדי שמי שלחץ כדי "לקרוא את ההודעה הזו" לא ייחת סתם בראש הרשימה ויצטרך לחפש אותה
  useEffect(() => {
    if (loading || announcements.length === 0) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#ann-')) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
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
        <div key={a.id} id={`ann-${a.id}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--teal)', borderRadius: '10px', padding: '16px', marginBottom: '14px', scrollMarginTop: '90px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{a.title}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--teal)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>{formatDateTime(a.created_at)}</div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{a.content}</p>
        </div>
      ))}

    </div>
  );
}
