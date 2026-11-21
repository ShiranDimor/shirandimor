'use client';

import { useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtDate, videoEmbedSrc, type MentoringSession } from '@/lib/mentoring';

// מצגת: קובץ שהועלה לאתר ("storage:<path>" ב-bucket הפרטי) נפתח דרך כתובת חתומה; אחרת - לינק רגיל
function SlidesButton({ value }: { value: string }) {
  const [busy, setBusy] = useState(false);
  const isFile = value.startsWith('storage:');
  const cls = 'mt-btn-small';
  const style = { display: 'inline-flex', gap: 6, textDecoration: 'none', marginBottom: 12 } as const;
  if (!isFile) return <a href={value} target="_blank" rel="noopener noreferrer" className={cls} style={style}>📑 המצגת של השיעור</a>;
  async function open() {
    setBusy(true);
    // חלון נפתח מיד (בתוך הלחיצה) כדי שדפדפני נייד לא יחסמו אותו, והכתובת נטענת אליו
    const win = window.open('', '_blank');
    const { data } = await supabase.storage.from('mentoring').createSignedUrl(value.slice('storage:'.length), 3600);
    setBusy(false);
    if (data?.signedUrl) { if (win) win.location.href = data.signedUrl; else window.location.href = data.signedUrl; }
    else win?.close();
  }
  return <button type="button" className={cls} style={style} onClick={open} disabled={busy}>{busy ? 'פותח...' : '📑 המצגת של השיעור (PDF)'}</button>;
}

export default function SessionCard({
  session, isNew, defaultOpen, onOpen, footer,
}: {
  session: MentoringSession;
  isNew?: boolean;
  defaultOpen?: boolean;
  onOpen?: () => void;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const embed = videoEmbedSrc(session.video_url, session.start_seconds);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  return (
    <div className={`mt-card${isNew ? ' new' : ''}`}>
      <button className="mt-card-head" onClick={toggle} aria-expanded={open}>
        <span className="mt-lesson-num done">{session.lesson_number}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{session.title}</div>
          <div className="mt-sub">{fmtDate(session.held_at)}{session.video_url ? ' · 🎬 הקלטה' : ''}{session.slides_url ? ' · 📑 מצגת' : ''}{isNew ? ' · חדש' : ''}</div>
        </div>
        <span className="mt-sub" style={{ marginInlineStart: 'auto' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-card-body">
          {embed ? (
            <div className="mt-video">
              <iframe src={embed} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={`הקלטת שיעור ${session.lesson_number}`} />
            </div>
          ) : session.video_url ? (
            <a href={session.video_url} target="_blank" rel="noopener noreferrer" className="mt-btn-small" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: 12 }}>▶ לצפייה בהקלטה</a>
          ) : (
            <div className="mt-sub" style={{ marginBottom: 10 }}>ההקלטה תעלה בקרוב</div>
          )}

          {session.video_url && embed && (
            <a href={session.video_url} target="_blank" rel="noopener noreferrer" className="mt-sub" style={{ display: 'block', marginTop: -4, marginBottom: 10 }}>הווידאו לא נטען? לפתיחה בחלון חדש ↗</a>
          )}

          {session.slides_url && (
            <SlidesButton value={session.slides_url} />
          )}

          {session.summary && <div className="mt-text" style={{ marginTop: 0 }}>{session.summary}</div>}

          {session.key_points?.length > 0 && (
            <>
              <div className="mt-label">נקודות מפתח מהשיעור</div>
              <ul className="mt-points">
                {session.key_points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </>
          )}

          {footer}
        </div>
      )}
    </div>
  );
}
