'use client';

import { useState, type ReactNode } from 'react';
import { fmtDate, videoEmbedSrc, type MentoringSession } from '@/lib/mentoring';

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
          <div className="mt-sub">{fmtDate(session.held_at)}{session.video_url ? ' · 🎬 הקלטה' : ''}{isNew ? ' · חדש' : ''}</div>
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
