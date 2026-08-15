'use client';

import { useState } from 'react';

type ClosedItem = { day: number; symbol: string; direction: string; pct: number; usd: number };

type Props = {
  year: number;
  month: number; // 0-indexed
  items: ClosedItem[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

const DOW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export default function CalendarHeatmap({ year, month, items, onPrevMonth, onNextMonth }: Props) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map<number, ClosedItem[]>();
  for (const it of items) {
    const arr = byDay.get(it.day) ?? [];
    arr.push(it);
    byDay.set(it.day, arr);
  }

  const dayTotals = new Map<number, number>();
  byDay.forEach((arr, day) => dayTotals.set(day, arr.reduce((s, it) => s + it.usd, 0)));
  const maxAbs = Math.max(1, ...Array.from(dayTotals.values()).map((v) => Math.abs(v)));
  const monthTotal = items.reduce((s, it) => s + it.usd, 0);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`pad-${i}`} style={{ visibility: 'hidden' }} />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dayItems = byDay.get(day);
    const dayPnl = dayTotals.get(day);
    let bg = 'var(--bg-surface-raised)';
    let color = 'var(--text-tertiary)';
    if (dayPnl !== undefined) {
      const intensity = 0.18 + (Math.abs(dayPnl) / maxAbs) * 0.5;
      bg = dayPnl >= 0 ? `rgba(79,184,118,${intensity})` : `rgba(201,99,94,${intensity})`;
      color = intensity > 0.55 ? (dayPnl >= 0 ? '#0a1f14' : '#2a0f0d') : dayPnl >= 0 ? 'var(--profit)' : 'var(--loss)';
    }
    cells.push(
      <div
        key={day}
        onClick={() => dayItems && setSelectedDay(selectedDay === day ? null : day)}
        style={{
          minHeight: '40px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, background: bg, color,
          cursor: dayItems ? 'pointer' : 'default',
          boxShadow: selectedDay === day ? 'inset 0 0 0 2px var(--lavender)' : 'none',
        }}
      >
        {pad2(day)}/{pad2(month + 1)}
      </div>
    );
  }

  const selectedItems = selectedDay !== null ? byDay.get(selectedDay) : undefined;

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
            color: items.length === 0 ? 'var(--text-tertiary)' : monthTotal >= 0 ? 'var(--profit)' : 'var(--loss)',
          }}>
            {items.length === 0 ? 'אין עסקאות סגורות' : `סה"כ ${monthTotal >= 0 ? '+' : '-'}$${Math.abs(monthTotal).toFixed(0)}`}
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
        <span>עוצמת הצבע = גודל הרווח או ההפסד באותו יום · לחיצה על יום מציגה פירוט</span>
      </div>

      {selectedItems && selectedDay !== null && (
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-hairline)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px' }}>
              {pad2(selectedDay)}/{pad2(month + 1)}/{year} · {selectedItems.length} עסקאות
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              aria-label="סגירה"
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
            >×</button>
          </div>
          {selectedItems.map((it, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0',
                borderBottom: idx < selectedItems.length - 1 ? '1px solid var(--border-hairline)' : 'none', fontSize: '12.5px',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={`direction-mark ${it.direction}`}>{it.direction === 'long' ? 'L' : 'S'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{it.symbol}</span>
              </span>
              <span style={{ display: 'flex', gap: '10px', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: it.pct >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{it.pct >= 0 ? '+' : ''}{it.pct.toFixed(2)}%</span>
                <span style={{ color: it.usd >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{it.usd >= 0 ? '+' : '-'}${Math.abs(it.usd).toFixed(0)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
