'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AddToCalendar from '../AddToCalendar';
import SlotPicker, { type Slot } from '../SlotPicker';
import { WHATSAPP_URL } from '../content';

type Info = { status: 'active' | 'past' | 'cancelled' | 'invalid' | 'error'; start?: string; when?: string; name?: string; eventLink?: string };
type Mode = 'view' | 'reschedule' | 'confirm-cancel';

export default function ManageCall() {
  const params = useSearchParams();
  const e = params.get('e') || '';
  const t = params.get('t') || '';

  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!e || !t) return setInfo({ status: 'invalid' });
    fetch(`/api/mentoring-call/manage?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`, { cache: 'no-store' })
      .then(async (r) => (r.status === 403 ? { status: 'invalid' } : r.ok ? r.json() : { status: 'error' }))
      .then((j) => setInfo(j as Info))
      .catch(() => setInfo({ status: 'error' }));
  }, [e, t]);

  async function openReschedule() {
    setMode('reschedule');
    setPicked(null);
    setError('');
    setLoadingSlots(true);
    try {
      const r = await fetch('/api/mentoring-call/slots', { cache: 'no-store' });
      const j = await r.json();
      setSlots(j.available ? j.slots || [] : []);
      if (!j.available) setError('היומן לא זמין כרגע. אפשר לכתוב לי בוואטסאפ ונמצא זמן אחר.');
    } catch {
      setError('לא הצלחנו לטעון זמנים. אפשר לנסות שוב, או לכתוב לי בוואטסאפ.');
    } finally {
      setLoadingSlots(false);
    }
  }

  async function act(action: 'cancel' | 'reschedule') {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/mentoring-call/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ e, t, action, start: picked?.start }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) {
        setError('הזמן הזה נתפס הרגע - אפשר לבחור זמן אחר.');
        await openReschedule();
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      if (action === 'cancel') {
        setInfo({ status: 'cancelled' });
        setDone('השיחה בוטלה. הודעה על הביטול נשלחה גם ליומן.');
      } else {
        setInfo({ status: 'active', start: j.start, when: j.when, name: info?.name, eventLink: j.eventLink || info?.eventLink });
        setDone('המועד עודכן - גם ביומן של שירן וגם בזימון שלך.');
      }
      setMode('view');
    } catch {
      setError('משהו השתבש. אפשר לנסות שוב, או לכתוב לי בוואטסאפ.');
    } finally {
      setBusy(false);
    }
  }

  const wa = (
    <a className="mt-inline-link" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">לכתוב לי בוואטסאפ</a>
  );

  if (!info) return <p className="mt-form-note">טוען את פרטי השיחה...</p>;

  if (info.status === 'invalid' || info.status === 'error') {
    return (
      <div className="mt-done">
        <p className="mt-done-title" style={{ color: 'var(--text-primary)' }}>{info.status === 'invalid' ? 'הקישור לא תקין' : 'לא הצלחנו לטעון את השיחה'}</p>
        <p>אפשר לפתוח שוב את הקישור מהזימון במייל, או פשוט {wa}.</p>
      </div>
    );
  }

  if (info.status === 'cancelled') {
    return (
      <div className="mt-done">
        <p className="mt-done-title">{done || 'השיחה הזו בוטלה'}</p>
        <p>רוצה לקבוע מועד אחר? אפשר בכל זמן.</p>
        <Link className="btn-primary mt-submit" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} href="/mentoring#fit-call">לקביעת שיחה חדשה ←</Link>
      </div>
    );
  }

  return (
    <div className="mt-flow">
      <div className="mt-done">
        <p className="mt-done-title">{done || (info.status === 'past' ? 'מועד השיחה כבר עבר' : 'השיחה קבועה')}</p>
        <p>{info.name ? `${info.name}, ` : ''}שיחת התאמה טלפונית ב{info.when}.</p>
        {info.status === 'active' && <AddToCalendar eventLink={info.eventLink} />}
      </div>

      {info.status === 'active' && mode === 'view' && (
        <div className="mt-manage-actions">
          <button type="button" className="btn-primary mt-submit" onClick={openReschedule}>שינוי תאריך ושעה</button>
          <button type="button" className="mt-cancel-btn" onClick={() => { setMode('confirm-cancel'); setError(''); }}>ביטול השיחה</button>
        </div>
      )}

      {mode === 'confirm-cancel' && (
        <div className="mt-confirm">
          <p>לבטל את השיחה? אפשר תמיד לקבוע מחדש.</p>
          <div className="mt-manage-actions">
            <button type="button" className="mt-cancel-btn is-danger" onClick={() => act('cancel')} disabled={busy}>{busy ? 'מבטלים...' : 'כן, לבטל'}</button>
            <button type="button" className="mt-link-btn" onClick={() => setMode('view')}>לא, להשאיר</button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="mt-sched" style={{ marginTop: 18 }}>
          {!picked ? (
            <SlotPicker slots={slots} loading={loadingSlots} onPick={(s) => { setPicked(s); setError(''); }} />
          ) : (
            <>
              <div className="mt-chosen">
                <span>מועד חדש: {picked.dayLabel}, בשעה {picked.time}</span>
                <button type="button" className="mt-link-btn" onClick={() => setPicked(null)}>זמן אחר</button>
              </div>
              <button type="button" className="btn-primary mt-submit" onClick={() => act('reschedule')} disabled={busy}>{busy ? 'מעדכנים...' : 'לעדכן לזמן הזה ←'}</button>
            </>
          )}
          <button type="button" className="mt-link-btn" style={{ marginTop: 12 }} onClick={() => setMode('view')}>חזרה בלי לשנות</button>
        </div>
      )}

      {error && <p className="mt-form-error" role="alert">{error}</p>}
      <p className="mt-form-note" style={{ marginTop: 18 }}>שאלה או בקשה אחרת? אפשר {wa}.</p>
    </div>
  );
}
