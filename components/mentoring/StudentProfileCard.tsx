'use client';

import { useEffect, useState } from 'react';
import type { MentoringStudent } from '@/lib/mentoring';

// "נקודת הפתיחה" - מה שסוכם בשיעור הראשון: ברוקר, תיק לסווינג (₪ ובדולרים לפי שער עדכני),
// מטרה, סיכון לעסקה ועל מה עובדים. השער נטען בדפדפן; אם נכשל - מוצג רק בשקלים
function useUsdIlsRate() {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const v = d?.rates?.ILS; if (!cancelled && typeof v === 'number' && v > 0) setRate(v); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return rate;
}

export default function StudentProfileCard({ student }: { student: MentoringStudent }) {
  const rate = useUsdIlsRate();
  const capital = student.capital_ils != null ? Number(student.capital_ils) : null;
  const usd = capital != null && rate ? Math.round(capital / rate / 10) * 10 : null;

  const items: { icon: string; label: string; value: React.ReactNode; sub?: string }[] = [];
  if (student.broker || student.planned_broker) {
    items.push({
      icon: '🏦', label: 'ברוקר',
      value: student.planned_broker && student.broker ? <>{student.broker} ← <b>{student.planned_broker}</b></> : (student.planned_broker || student.broker),
      sub: student.planned_broker ? `פותחים חשבון ב${student.planned_broker}` : undefined,
    });
  }
  if (capital != null) {
    items.push({ icon: '💰', label: 'תיק לסווינג', value: <span className="num">₪{capital.toLocaleString('he-IL')}</span>, sub: usd ? `≈ $${usd.toLocaleString('en-US')} לפי השער היום` : undefined });
  }
  if (student.risk_usd != null) {
    items.push({ icon: '🛡️', label: 'סיכון לעסקה', value: <span className="num">${Number(student.risk_usd)}</span>, sub: 'קבוע, לא משנה גודל התיק' });
  }
  if (student.goal_monthly_usd != null || student.goal) {
    items.push({ icon: '🎯', label: 'המטרה', value: student.goal_monthly_usd != null ? <><span className="num">${Number(student.goal_monthly_usd).toLocaleString('en-US')}</span> בחודש</> : student.goal });
  }
  if (!items.length && !student.concerns) return null;

  return (
    <div className="mt-profile">
      <div className="mj-label">נקודת הפתיחה</div>
      <div className="mt-profile-grid">
        {items.map((it) => (
          <div key={it.label} className="mt-profile-item">
            <span className="mt-profile-ic" aria-hidden>{it.icon}</span>
            <div>
              <span>{it.label}</span>
              <b>{it.value}</b>
              {it.sub && <small>{it.sub}</small>}
            </div>
          </div>
        ))}
      </div>
      {student.concerns && (
        <div className="mt-profile-focus"><span>על מה עובדים</span>{student.concerns}</div>
      )}
    </div>
  );
}
