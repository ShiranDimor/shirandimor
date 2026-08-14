'use client';

type Props = {
  percent: number;
  label: string;
  sublabel: string;
};

export default function StatsRing({ percent, label, sublabel }: Props) {
  const size = 128;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, percent));
  const dash = (filled / 100) * c;
  const color = filled >= 50 ? 'var(--profit)' : 'var(--loss)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-hairline)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" fontSize="27" fontWeight="700" fill="var(--text-primary)" fontFamily="var(--font-mono)">
          {filled.toFixed(0)}%
        </text>
        <text x="50%" y="66%" textAnchor="middle" dominantBaseline="central" fontSize="10" fill="var(--text-tertiary)" fontFamily="var(--font-body)">
          הצלחה
        </text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{sublabel}</div>
      </div>
    </div>
  );
}
