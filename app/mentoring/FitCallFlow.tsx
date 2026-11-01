'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trackFunnelEvent } from '@/lib/trackEvent';
import { EXPERIENCE_OPTIONS, TRACK_OPTIONS } from '@/lib/mentoringOptions';

type Slot = { start: string; day: string; dayLabel: string; time: string };
type Step = 'form' | 'schedule' | 'booked' | 'no-calendar';
type Lead = { name: string; phone: string; email: string; experience: string; goal: string; track: string; readDetails: boolean };

const EMPTY: Lead = { name: '', phone: '', email: '', experience: '', goal: '', track: '', readDetails: false };

// שאלון קצר לפני שיחת ההתאמה, ומיד אחריו בחירת זמן ביומן של שירן (אותו יומן כמו בעמוד לארגונים).
// השאלון נשמר כליד כבר בשלב הראשון, כך שגם מי שלא בחר/ה זמן לא הולך/ת לאיבוד. אם היומן לא מחובר - מוצגת הודעה
// ששירן תחזור לתאם, ולינק לוואטסאפ.
export default function FitCallFlow({ whatsappUrl }: { whatsappUrl: string }) {
  const [step, setStep] = useState<Step>('form');
  const [lead, setLead] = useState<Lead>(EMPTY);
  const [leadId, setLeadId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [when, setWhen] = useState('');
  const started = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // כפתורי "לקביעת שיחת התאמה" בכרטיסי המחיר בוחרים מראש את המסלול בשאלון
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-pick-track]');
      const value = el?.dataset.pickTrack;
      if (value && (TRACK_OPTIONS as readonly string[]).includes(value)) setLead((l) => ({ ...l, track: value }));
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackFunnelEvent('mentoring_form_started');
  }

  function update<K extends keyof Lead>(key: K, value: Lead[K]) {
    markStarted();
    setLead((l) => ({ ...l, [key]: value }));
  }

  function scrollIntoFlow() {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadSlots(keepDay?: string) {
    setLoadingSlots(true);
    try {
      const res = await fetch('/api/mentoring-call/slots', { cache: 'no-store' });
      const json = await res.json();
      const list: Slot[] = json.slots || [];
      if (!json.available || list.length === 0) {
        setStep('no-calendar');
        return;
      }
      setSlots(list);
      const days = Array.from(new Set(list.map((s) => s.day)));
      setDay(keepDay && days.includes(keepDay) ? keepDay : days[0] || '');
      setStep('schedule');
      trackFunnelEvent('mentoring_calendar_opened');
    } catch {
      setStep('no-calendar');
    } finally {
      setLoadingSlots(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const website = String(new FormData(e.currentTarget).get('website') || '');
    if (!lead.name.trim()) return setError('נשאר רק למלא שם');
    if (lead.phone.replace(/\D/g, '').length < 9) return setError('נראה שמספר הנייד חסר או לא מלא');
    if (!lead.email.includes('@')) return setError('צריך מייל - אליו יישלח הזימון ליומן');
    if (!lead.experience) return setError('נשאר לבחור רמת ניסיון');
    if (!lead.track) return setError('נשאר לבחור מסלול (אפשר גם "עדיין לא בטוח/ה")');

    setError('');
    setSending(true);
    try {
      const res = await fetch('/api/mentoring-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, website }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(res.status));
      setLeadId(String(json.leadId || ''));
      trackFunnelEvent('mentoring_form_completed', { phone: lead.phone, email: lead.email });
      await loadSlots();
      scrollIntoFlow();
    } catch {
      setError('send');
    } finally {
      setSending(false);
    }
  }

  async function book() {
    if (!slot) return;
    setError('');
    setSending(true);
    try {
      const res = await fetch('/api/mentoring-call/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, leadId, start: slot.start }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setSlot(null);
        setError('הזמן שבחרת נתפס הרגע. אפשר לבחור זמן אחר.');
        await loadSlots(day);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setWhen(String(json.when || `${slot.dayLabel} בשעה ${slot.time}`));
      setStep('booked');
      trackFunnelEvent('mentoring_call_booked', { phone: lead.phone, email: lead.email });
      scrollIntoFlow();
    } catch {
      setError('send');
    } finally {
      setSending(false);
    }
  }

  const days = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of slots) if (!seen.has(s.day)) seen.set(s.day, s.dayLabel);
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [slots]);
  const daySlots = slots.filter((s) => s.day === day);
  const dayLabel = days.find((d) => d.key === day)?.label;
  const firstName = lead.name.trim().split(/\s+/)[0] || '';

  const sendError =
    error === 'send' ? (
      <p className="mt-form-error" role="alert">
        משהו השתבש בשליחה. אפשר לנסות שוב, או לכתוב לי ישירות{' '}
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">בוואטסאפ</a>.
      </p>
    ) : error ? (
      <p className="mt-form-error" role="alert">{error}</p>
    ) : null;

  return (
    <div ref={rootRef} className="mt-flow">
      <ol className="mt-flow-steps" aria-label="שלבי קביעת השיחה">
        <li className={step === 'form' ? 'is-current' : 'is-done'}>שאלון קצר</li>
        <li className={step === 'schedule' ? 'is-current' : step === 'form' ? '' : 'is-done'}>בוחרים זמן</li>
        <li className={step === 'booked' || step === 'no-calendar' ? 'is-current' : ''}>מדברים</li>
      </ol>

      {step === 'form' && (
        <form className="mt-form" onSubmit={onSubmit} noValidate onFocus={markStarted}>
          <div className="mt-form-grid">
            <div className="field">
              <label htmlFor="mt-name">שם מלא</label>
              <input id="mt-name" value={lead.name} onChange={(e) => update('name', e.target.value)} maxLength={80} autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="mt-phone">טלפון</label>
              <input id="mt-phone" type="tel" inputMode="tel" dir="ltr" value={lead.phone} onChange={(e) => update('phone', e.target.value)} maxLength={20} autoComplete="tel" required />
            </div>
            <div className="field mt-field-wide">
              <label htmlFor="mt-email">אימייל (לזימון ליומן)</label>
              <input id="mt-email" type="email" dir="ltr" value={lead.email} onChange={(e) => update('email', e.target.value)} maxLength={120} autoComplete="email" required />
            </div>
            {/* שדה מלכודת לבוטים - מוסתר מבני אדם ומקוראי מסך */}
            <label className="mt-hp" aria-hidden="true">
              אתר
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <fieldset className="mt-q">
            <legend className="tp-question-title">מה רמת הניסיון שלך בשוק ההון?</legend>
            <div className="tp-options mt-options-2">
              {EXPERIENCE_OPTIONS.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={lead.experience === o} className={`tp-option-btn${lead.experience === o ? ' selected' : ''}`} onClick={() => update('experience', o)}>
                  {o}
                  <span className="tp-option-check" aria-hidden="true">{lead.experience === o ? '✓' : ''}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-q">
            <label htmlFor="mt-goal" className="tp-question-title" style={{ display: 'block' }}>מה היית רוצה לדעת לעשות טוב יותר בעוד כמה חודשים?</label>
            <textarea
              id="mt-goal"
              className="tp-text-input"
              style={{ marginTop: 10, minHeight: 72 }}
              rows={2}
              maxLength={600}
              placeholder="משפט או שניים זה מספיק"
              value={lead.goal}
              onChange={(e) => update('goal', e.target.value)}
            />
          </div>

          <fieldset className="mt-q">
            <legend className="tp-question-title">איזה מסלול כרגע מרגיש לך מתאים יותר?</legend>
            <div className="tp-options mt-options-3">
              {TRACK_OPTIONS.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={lead.track === o} className={`tp-option-btn${lead.track === o ? ' selected' : ''}`} onClick={() => update('track', o)}>
                  {o}
                  <span className="tp-option-check" aria-hidden="true">{lead.track === o ? '✓' : ''}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-check">
            <input type="checkbox" checked={lead.readDetails} onChange={(e) => update('readDetails', e.target.checked)} />
            <span>עברתי על פרטי הליווי והמחירים שמופיעים בעמוד</span>
          </label>

          {sendError}

          <button type="submit" className="btn-primary mt-submit" disabled={sending}>
            {sending ? 'רגע...' : 'המשך לבחירת זמן ביומן ←'}
          </button>
          <p className="mt-form-note">השיחה אינה התחייבות להצטרף. הפרטים נשארים אצלי בלבד.</p>
        </form>
      )}

      {step === 'schedule' && (
        <div className="mt-sched">
          <p className="mt-sched-hello">{firstName ? `תודה ${firstName}, ` : 'תודה, '}קיבלתי את התשובות. עכשיו נשאר לבחור זמן.</p>
          {!slot ? (
            <>
              <p className="mt-sched-step">בוחרים יום</p>
              <div className="mt-chips">
                {days.map((d) => (
                  <button key={d.key} type="button" className="mt-chip" aria-pressed={d.key === day} onClick={() => setDay(d.key)}>
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-sched-step is-active">{dayLabel ? `ועכשיו שעה ב${dayLabel}` : 'ועכשיו שעה'} (שיחת טלפון של כ-20 דקות)</p>
              {loadingSlots ? (
                <p className="mt-form-note">טוען זמנים פנויים...</p>
              ) : daySlots.length > 0 ? (
                <div className="mt-chips">
                  {daySlots.map((s) => (
                    <button key={s.start} type="button" className="mt-chip mt-chip-time" onClick={() => { setSlot(s); setError(''); }}>
                      {s.time}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-form-error" role="alert">אין שעות פנויות ביום הזה - אפשר לבחור יום אחר למעלה</p>
              )}
              {sendError}
              <p className="mt-form-note" style={{ marginTop: 16 }}>
                אף זמן לא מתאים? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">כתבו לי בוואטסאפ</a> ונמצא זמן אחר.
              </p>
            </>
          ) : (
            <>
              <div className="mt-chosen">
                <span>שיחת התאמה ב{slot.dayLabel}, בשעה {slot.time}</span>
                <button type="button" className="mt-link-btn" onClick={() => setSlot(null)}>שינוי זמן</button>
              </div>
              {sendError}
              <button type="button" className="btn-primary mt-submit" onClick={book} disabled={sending}>
                {sending ? 'קובעים...' : 'קביעת השיחה'}
              </button>
            </>
          )}
        </div>
      )}

      {step === 'booked' && (
        <div className="mt-done" role="status">
          <p className="mt-done-title">השיחה נקבעה</p>
          <p>אתקשר אלייך ב{when}. זימון ליומן כבר בדרך למייל.</p>
          <p>עד אז, אפשר לחשוב על שאלה אחת: מה הדבר שהכי מפריע לך היום כשאת/ה פותח/ת גרף?</p>
        </div>
      )}

      {step === 'no-calendar' && (
        <div className="mt-done" role="status">
          <p className="mt-done-title">תודה, התשובות התקבלו</p>
          <p>היומן לא זמין כאן כרגע, אז אחזור אלייך בעצמי לתיאום שיחה. רוצה לזרז? אפשר לכתוב לי:</p>
          <a className="mt-wa-link" href={whatsappUrl} target="_blank" rel="noopener noreferrer">לכתוב לשירן בוואטסאפ ←</a>
        </div>
      )}
    </div>
  );
}
