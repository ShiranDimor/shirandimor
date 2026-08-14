'use client';

import { useRef, useState } from 'react';

type Point = { date: string; value: number };

type Props = {
  points: Point[];
  prefix?: string;
};

const W = 640;
const H = 190;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const PAD_SIDE = 4;

export default function EquityCurve({ points, prefix = '$' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '20px 0' }}>אין עדיין מספיק נתונים להצגת עקומה</p>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = W - PAD_SIDE * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const x = (i: number) => PAD_SIDE + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD_TOP + innerH - ((v - min) / range) * innerH;

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const areaD = `${d} L${x(points.length - 1).toFixed(1)},${H - PAD_BOTTOM} L${x(0).toFixed(1)},${H - PAD_BOTTOM} Z`;

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.value - first.value;
  const deltaColor = delta >= 0 ? 'var(--profit)' : 'var(--loss)';
  const gradId = 'eq-grad-' + Math.round(min) + '-' + Math.round(max);

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((relX - PAD_SIDE) / innerW) * (points.length - 1));
    idx = Math.max(0, Math.min(points.length - 1, idx));
    setHoverIdx(idx);
  }

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 700 }}>
          {prefix}{last.value.toLocaleString('he-IL')}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: deltaColor }}>
          {delta >= 0 ? '+' : '-'}{prefix}{Math.abs(delta).toLocaleString('he-IL')}
        </div>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--teal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={PAD_SIDE} y1={PAD_TOP + innerH / 2} x2={W - PAD_SIDE} y2={PAD_TOP + innerH / 2}
          stroke="var(--border-hairline)" strokeWidth="1" strokeDasharray="3,4"
        />
        <path d={areaD} fill={`url(#${gradId})`} stroke="none" />
        <path d={d} fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="4" fill="var(--teal)" stroke="var(--bg-surface)" strokeWidth="2" />
        {hoverPoint && (
          <>
            <line x1={x(hoverIdx!)} y1={PAD_TOP} x2={x(hoverIdx!)} y2={H - PAD_BOTTOM} stroke="var(--border-hairline-strong)" strokeWidth="1" />
            <circle cx={x(hoverIdx!)} cy={y(hoverPoint.value)} r="4" fill="var(--teal)" stroke="var(--bg-surface)" strokeWidth="2" />
          </>
        )}
        <rect
          x="0" y="0" width={W} height={H} fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        />
      </svg>
      {hoverPoint && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none',
            left: `${(x(hoverIdx!) / W) * 100}%`,
            top: `${(y(hoverPoint.value) / H) * 100}%`,
            transform: 'translate(-50%, -110%)',
            background: 'var(--bg-surface-raised)', border: '1px solid var(--border-hairline-strong)',
            borderRadius: '8px', padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: '11.5px',
            whiteSpace: 'nowrap', zIndex: 5,
          }}
        >
          <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginBottom: '2px' }}>{hoverPoint.date}</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{prefix}{hoverPoint.value.toLocaleString('he-IL')}</div>
        </div>
      )}
    </div>
  );
}
