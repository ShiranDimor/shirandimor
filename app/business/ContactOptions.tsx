'use client';

import { useEffect, useMemo, useState } from 'react';
import BusinessLeadForm from './BusinessLeadForm';

type Slot = { start: string; day: string; dayLabel: string; time: string };
type Mode = 'schedule' | 'details';

// שתי דרכים ליצור קשר: לקבוע שיחת היכרות ישירות ביומן של שירן, או להשאיר פרטים ולקבל שיחה חוזרת.
// אם היומן לא מחובר/לא זמין - מוצג רק טופס הפרטים.
export default function ContactOptions({ whatsappUrl }: { whatsappUrl: string }) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [mode, setMode] = useState<Mode>('schedule');
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notice, setNotice] = useState('');

  async function loadSlots(keepDay?: string) {
    try {
      const res = await fetch('/api/business-call/slots', { cache: 'no-store' });
      const json = await res.json();
      const list: Slot[] = json.slots || [];
      setAvailable(Boolean(json.available) && list.length > 0);
      setSlots(list);
      const days = Array.from(new Set(list.map((s) => s.day)));
      setDay(keepDay && days.includes(keepDay) ? keepDay : days[0] || '');
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSlots();
  }, []);

  const days = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of slots) if (!seen.has(s.day)) seen.set(s.day, s.dayLabel);
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [slots]);
  const daySlots = slots.filter((s) => s.day === day);

  const showTabs = !loading && available;
  const activeMode: Mode = showTabs ? mode : 'details';

  return (
    <div className="biz-contact-options">
      {showTabs && (
        <div className="biz-tabs" role="tablist" aria-label="איך נוח לכם להתקדם">
          <button type="button" role="tab" aria-selected={activeMode === 'schedule'} className="biz-tab biz-tab-mint" onClick={() => setMode('schedule')}>
            לקבוע שיחה ביומן
          </button>
          <button type="button" role="tab" aria-selected={activeMode === 'details'} className="biz-tab" onClick={() => setMode('details')}>
            להשאיר פרטים ואחזור אליכם
          </button>
        </div>
      )}

      {loading && <p className="biz-sched-loading">טוען זמנים פנויים...</p>}

      {!loading && activeMode === 'schedule' && (
        <div className="biz-sched" role="tabpanel">
          {!slot ? (
            <>
              <p className="biz-sched-step">בחרו יום</p>
              <div className="biz-days">
                {days.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className="biz-chip"
                    aria-pressed={d.key === day}
                    onClick={() => setDay(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="biz-sched-step">בחרו שעה (שיחת טלפון של כ-15 דקות)</p>
              <div className="biz-times">
                {daySlots.map((s) => (
                  <button key={s.start} type="button" className="biz-chip biz-chip-time" onClick={() => { setSlot(s); setNotice(''); }}>
                    {s.time}
                  </button>
                ))}
              </div>
              {notice && <p className="biz-form-error" role="alert">{notice}</p>}
            </>
          ) : (
            <>
              <div className="biz-chosen">
                <span>
                  שיחת היכרות ב{slot.dayLabel}, בשעה {slot.time}
                </span>
                <button type="button" className="biz-link-btn" onClick={() => setSlot(null)}>
                  שינוי זמן
                </button>
              </div>
              <BusinessLeadForm
                whatsappUrl={whatsappUrl}
                compact
                endpoint="/api/business-call/book"
                extraData={{ start: slot.start }}
                submitLabel="קביעת השיחה"
                onServerError={(status) => {
                  if (status === 409) {
                    setSlot(null);
                    setNotice('הזמן שבחרתם נתפס הרגע. בחרו בבקשה זמן אחר.');
                    setLoading(true);
                    loadSlots(day);
                    return true;
                  }
                  return false;
                }}
                renderSuccess={(r) => (
                  <>
                    <p className="biz-form-done-title">השיחה נקבעה</p>
                    <p>
                      אתקשר אליכם ב{String(r.when || `${slot.dayLabel} בשעה ${slot.time}`)}. אם השארתם מייל, זימון ליומן כבר בדרך.
                    </p>
                  </>
                )}
              />
            </>
          )}
        </div>
      )}

      {!loading && activeMode === 'details' && (
        <div role={showTabs ? 'tabpanel' : undefined}>
          <BusinessLeadForm whatsappUrl={whatsappUrl} />
        </div>
      )}
    </div>
  );
}
