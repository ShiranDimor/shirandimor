'use client';

type DayResult = { day: number; pnl: number; pct: number };

type Props = {
  year: number;
  month: number; // 0-indexed
  results: DayResult[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

const DOW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export default function CalendarHeatmap({ year, month, results, onPrevMonth, onNextMonth }: Props) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = new Map(results.map((r) => [r.day, r]));
  const maxAbs = Math.max(1, ...results.map((r) => Math.abs(r.pnl)));
  const monthTotal = results.reduce((s, r) => s + r.pnl, 0);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`pad-${i}`} style={{ visibility: 'hidden' }} />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const r = byDay.get(day);
    let bg = 'var(--bg-surface-raised)';
    let color = 'var(--text-tertiary)';
    if (r) {
      const intensity = 0.18 + (Math.abs(r.pnl) / maxAbs) * 0.5;
      bg = r.pnl >= 0 ? `rgba(79,184,118,${intensity})` : `rgba(201,99,94,${intensity})`;
      color = intensity > 0.55 ? (r.pnl >= 0 ? '#0a1f14' : '#2a0f0d') : r.pnl >= 0 ? 'var(--profit)' : 'var(--loss)';
    }
    cells.push(
      <div
        key={day}
        style={{
          minHeight: '48px', borderRadius: '7px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
          fontFamily: 'var(--font-mono)', background: bg, color, padding: '2px 0',
        }}
      >
        <span style={{ fontSize: '9px', fontWeight: 700, opacity: 0.8 }}>{day}</span>
        {r && (
          <>
            <span style={{ fontSize: '8.5px', fontWeight: 700, lineHeight: 1 }}>{r.pct >= 0 ? '+' : ''}{r.pct.toFixed(1)}%</span>
            <span style={{ fontSize: '7.5px', lineHeight: 1, opacity: 0.85 }}>{r.pnl >= 0 ? '+' : '-'}${Math.abs(r.pnl).toFixed(0)}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <button
          onClick={onPrevMonth}
          aria-label="חודש קודם"
          style={{ background: 'none', border: '1px solid var(--border-hairline-strong)', borderRadius: '7px', width: '28px', height: '28px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
        >→</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '13px' }}>{MONTH_LABELS[month]} {year}</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '11.5px', fontWeight: 600, marginTop: '2px',
            color: results.length === 0 ? 'var(--text-tertiary)' : monthTotal >= 0 ? 'var(--profit)' : 'var(--loss)',
          }}>
            {results.length === 0 ? 'אין עסקאות סגורות' : `סה"כ ${monthTotal >= 0 ? '+' : '-'}$${Math.abs(monthTotal).toFixed(0)}`}
          </div>
        </div>
        <button
          onClick={onNextMonth}
          aria-label="חודש הבא"
          style={{ background: 'none', border: '1px solid var(--border-hairline-strong)', borderRadius: '7px', width: '28px', height: '28px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
        >←</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
        {DOW.map((d) => (
          <div key={d} style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center', paddingBottom: '4px' }}>{d}</div>
        ))}
        {cells}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
        <span>עוצמת הצבע = גודל הרווח או ההפסד באותו יום</span>
      </div>
    </div>
  );
}
