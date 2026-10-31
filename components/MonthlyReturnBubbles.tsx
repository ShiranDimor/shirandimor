'use client';

import Reveal from '@/components/Reveal';
import CountUp from '@/components/CountUp';
import type { MonthlyReturn } from '@/lib/portfolioStats';

// רצועת בועות "רווח על התיק" - רכיב משותף לעמוד הבית ול-/portfolio, כדי ששינוי אחד (נתונים,
// עיצוב) ישפיע על שני המקומות ולא יוכל ליצור מצב שבו הם מראים מספרים סותרים לאותו חודש
export default function MonthlyReturnBubbles({ months }: { months: MonthlyReturn[] }) {
  if (months.length === 0) return null;

  return (
    <div className="month-ring-row">
      {months.map((m, i) => (
        <Reveal key={m.key} delay={80 * i} className="month-ring-tile">
          <div
            className="month-bubble"
            style={{
              background: m.portfolioPct >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)',
              color: m.portfolioPct >= 0 ? 'var(--profit)' : 'var(--loss)',
            }}
          >
            <CountUp value={m.portfolioPct} prefix={m.portfolioPct >= 0 ? '+' : ''} suffix="%" decimals={1} />
          </div>
          <div className="month-ring-label">{m.label}</div>
          <div className="month-ring-sub"><CountUp value={m.count} /> עסקאות</div>
        </Reveal>
      ))}
    </div>
  );
}
