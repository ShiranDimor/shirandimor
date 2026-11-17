'use client';

import { useEffect, useMemo, useState } from 'react';

export type Slot = { start: string; day: string; dayLabel: string; time: string };

// בחירת יום ושעה מתוך הזמנים הפנויים - משותף לקביעת שיחה ולשינוי מועד
export default function SlotPicker({
  slots,
  loading,
  onPick,
  initialDay,
}: {
  slots: Slot[];
  loading?: boolean;
  onPick: (slot: Slot) => void;
  initialDay?: string;
}) {
  const days = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of slots) if (!seen.has(s.day)) seen.set(s.day, s.dayLabel);
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [slots]);
  const [day, setDay] = useState('');

  useEffect(() => {
    setDay((d) => (days.some((x) => x.key === d) ? d : initialDay && days.some((x) => x.key === initialDay) ? initialDay : days[0]?.key || ''));
  }, [days, initialDay]);

  const daySlots = slots.filter((s) => s.day === day);
  const dayLabel = days.find((d) => d.key === day)?.label;

  return (
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
      {loading ? (
        <p className="mt-form-note">טוען זמנים פנויים...</p>
      ) : daySlots.length > 0 ? (
        <div className="mt-chips">
          {daySlots.map((s) => (
            <button key={s.start} type="button" className="mt-chip mt-chip-time" onClick={() => onPick(s)}>
              {s.time}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-form-error" role="alert">אין שעות פנויות ביום הזה - אפשר לבחור יום אחר למעלה</p>
      )}
    </>
  );
}
