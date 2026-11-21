'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TradeDetail, tradeTone } from '@/components/mentoring/TradeCard';
import { VERDICT_META, fmtDate, fmtR, fmtUsd, isOpenTrade, isOverRisk, journalStats, type MentoringTrade } from '@/lib/mentoring';

// היומן כדשבורד: שורת נתונים, עקומת R מצטברת, תובנות אוטומטיות, סינון, ורשימה קומפקטית לפי
// חודשים. לחיצה על עסקה פותחת חלון עם כל הפרטים והמשוב. בנוי לעשרות ומאות עסקאות.

type Filter = 'all' | 'new' | 'pending' | 'open' | 'win' | 'loss';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function rValue(t: MentoringTrade): number | null {
  return t.r_multiple != null ? Number(t.r_multiple) : null;
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function rTxt(v: number | null) {
  if (v == null) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;
}

type Insight = { tone: 'g' | 'b' | 'w' | 'n'; text: ReactNode };

function buildInsights(real: MentoringTrade[]): Insight[] {
  const closed = real.filter((t) => !isOpenTrade(t) && rValue(t) != null);
  if (closed.length < 3) return [];
  const out: Insight[] = [];

  const inPlan = closed.filter((t) => t.followed_plan === true).map((t) => rValue(t) as number);
  const offPlan = closed.filter((t) => t.followed_plan === false).map((t) => rValue(t) as number);
  if (inPlan.length && offPlan.length) {
    const a = avg(inPlan) as number;
    const b = avg(offPlan) as number;
    out.push({ tone: a > b ? 'g' : 'w', text: <>לפי התוכנית: <b className="num">{rTxt(a)}</b> לעסקה בממוצע · מחוץ לתוכנית: <b className="num">{rTxt(b)}</b></> });
  } else if (offPlan.length === 0 && inPlan.length >= 3) {
    out.push({ tone: 'g', text: <>כל {inPlan.length} העסקאות האחרונות היו לפי התוכנית</> });
  }

  const group = (key: (t: MentoringTrade) => string | null) => {
    const m = new Map<string, number[]>();
    closed.forEach((t) => { const k = key(t); if (!k) return; m.set(k, [...(m.get(k) || []), rValue(t) as number]); });
    return Array.from(m.entries()).filter(([, v]) => v.length >= 2).map(([k, v]) => ({ k, n: v.length, a: avg(v) as number }));
  };

  const setups = group((t) => t.setup).sort((x, y) => y.a - x.a);
  if (setups.length) {
    const best = setups[0];
    if (best.a > 0) out.push({ tone: 'g', text: <>הסטאפ הכי חזק: <b>{best.k}</b> · <span className="num">{rTxt(best.a)}</span> ב-{best.n} עסקאות</> });
    const worst = setups[setups.length - 1];
    if (setups.length > 1 && worst.a < 0) out.push({ tone: 'b', text: <>הסטאפ החלש: <b>{worst.k}</b> · <span className="num">{rTxt(worst.a)}</span> ב-{worst.n} עסקאות</> });
  }

  const emos = group((t) => t.emotion).sort((x, y) => x.a - y.a);
  if (emos.length && emos[0].a < 0) out.push({ tone: 'w', text: <>כשההרגשה היא <b>{emos[0].k}</b>: <span className="num">{rTxt(emos[0].a)}</span> בממוצע ({emos[0].n} עסקאות)</> });

  const dirs = group((t) => (t.direction === 'long' ? 'לונג' : 'שורט'));
  if (dirs.length === 2) {
    const [x, y] = dirs[0].a >= dirs[1].a ? [dirs[0], dirs[1]] : [dirs[1], dirs[0]];
    out.push({ tone: 'n', text: <>{x.k} <span className="num">{rTxt(x.a)}</span> מול {y.k} <span className="num">{rTxt(y.a)}</span></> });
  }

  let streak = 0;
  for (const t of [...real].sort((a, b) => b.traded_at.localeCompare(a.traded_at))) {
    if (t.followed_plan) streak++; else break;
  }
  if (streak >= 3) out.push({ tone: 'g', text: <>רצף של <b>{streak}</b> עסקאות ברצף לפי התוכנית</> });

  return out.slice(0, 5);
}

function EquityCurve({ trades }: { trades: MentoringTrade[] }) {
  const pts = trades
    .filter((t) => !isOpenTrade(t) && rValue(t) != null)
    .sort((a, b) => (a.closed_at || a.traded_at).localeCompare(b.closed_at || b.traded_at) || a.created_at.localeCompare(b.created_at));
  if (pts.length < 2) return null;
  let cum = 0;
  const vals = [0, ...pts.map((t) => (cum += rValue(t) as number))];
  const W = 320; const H = 90; const P = 6;
  const min = Math.min(0, ...vals); const max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (vals.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - min) / span) * (H - P * 2);
  const line = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${x(0)},${y(0)} ${line} ${x(vals.length - 1)},${y(0)}`;
  const up = vals[vals.length - 1] >= 0;
  return (
    <div className="mj-curve">
      <div className="mj-curve-h"><span>R מצטבר</span><b className={`num ${up ? 'up' : 'down'}`}>{rTxt(vals[vals.length - 1])}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="mjArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={up ? '#3DDC84' : '#FF5C5C'} stopOpacity=".28" />
            <stop offset="1" stopColor={up ? '#3DDC84' : '#FF5C5C'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--border-hairline-strong)" strokeDasharray="3 4" />
        <polygon points={area} fill="url(#mjArea)" />
        <polyline points={line} fill="none" stroke={up ? 'var(--profit)' : 'var(--loss)'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function TradeSheet({ trade, onClose, footer, riskLimit }: { trade: MentoringTrade; onClose: () => void; footer?: ReactNode; riskLimit?: number | null }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  const symbol = trade.instrument === 'STOCK' ? 'מניה' : trade.instrument;
  const open = isOpenTrade(trade);
  const tone = tradeTone(trade);
  // פורטל ל-body: ה-.wrap יוצר stacking context (z-index:1), ובלעדיו החלון נשאר מתחת לכפתורים הצפים
  return createPortal(
    <div className="mj-modal" role="dialog" aria-modal="true" aria-label={`עסקה ${symbol}`}>
      <div className="mj-backdrop" onClick={onClose} />
      <div className="mj-sheet">
        <div className="mj-sheet-head">
          <div>
            <div className="mj-sheet-title">
              <span className={`mj-side ${trade.direction}`}>{trade.direction === 'long' ? 'לונג' : 'שורט'}</span>
              <b className="num">{symbol}</b>
              {trade.is_example && <span className="mj-pill lv">דוגמה</span>}
            </div>
            <div className="mj-sub">{fmtDate(trade.traded_at)}{trade.closed_at && trade.closed_at !== trade.traded_at ? ` – ${fmtDate(trade.closed_at)}` : ''}{trade.setup ? ` · ${trade.setup}` : ''} · {trade.contracts} {['MNQ', 'NQ', 'MES', 'ES', 'MGC'].includes(trade.instrument) ? 'חוזים' : 'מניות'}</div>
          </div>
          <div className={`mj-sheet-res tone-${tone}`}>
            {open ? <b>פתוחה</b> : <><b className="num">{fmtUsd(trade.pnl_usd)}</b><span className="num">{fmtR(trade.r_multiple)}</span></>}
          </div>
          <button className="mj-close" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <div className="mj-sheet-body">
          <TradeDetail trade={trade} footer={footer} riskLimit={riskLimit} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function JournalView({
  trades, newIds, onOpenTrade, renderFooter, top, riskLimit, goalMonthly,
}: {
  trades: MentoringTrade[];
  riskLimit?: number | null;
  goalMonthly?: number | null;
  newIds?: Set<string>;
  onOpenTrade?: (t: MentoringTrade) => void;
  renderFooter?: (t: MentoringTrade, close: () => void) => ReactNode;
  top?: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const real = useMemo(() => trades.filter((t) => !t.is_example), [trades]);
  const stats = useMemo(() => journalStats(trades), [trades]);
  const totalR = useMemo(() => real.reduce((s, t) => s + (rValue(t) || 0), 0), [real]);
  const insights = useMemo(() => buildInsights(real), [real]);
  const pendingCount = real.filter((t) => !t.reviewed_at).length;
  // התקדמות החודש מול המטרה - לפי עסקאות שנסגרו החודש
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthNet = Math.round(real.filter((t) => !isOpenTrade(t) && (t.closed_at || t.traded_at).startsWith(monthKey)).reduce((s, t) => s + (t.pnl_usd || 0), 0));
  const goalPct = goalMonthly ? Math.max(0, Math.min(100, Math.round((monthNet / goalMonthly) * 100))) : 0;
  const overRiskCount = riskLimit ? real.filter((t) => isOverRisk(t, riskLimit)).length : 0;
  const openCount = trades.filter((t) => isOpenTrade(t)).length;

  const counts: Record<Filter, number> = {
    all: trades.length,
    new: trades.filter((t) => !!newIds?.has(t.id)).length,
    pending: trades.filter((t) => !t.reviewed_at).length,
    open: openCount,
    win: trades.filter((t) => (t.pnl_usd || 0) > 0).length,
    loss: trades.filter((t) => (t.pnl_usd || 0) < 0).length,
  };
  const FILTERS: [Filter, string][] = [['all', 'הכל'], ['new', 'משוב חדש'], ['pending', 'ממתינות לניתוח'], ['open', 'פתוחות'], ['win', 'רווח'], ['loss', 'הפסד']];

  const visible = trades.filter((t) => {
    switch (filter) {
      case 'new': return !!newIds?.has(t.id);
      case 'pending': return !t.reviewed_at;
      case 'open': return isOpenTrade(t);
      case 'win': return (t.pnl_usd || 0) > 0;
      case 'loss': return (t.pnl_usd || 0) < 0;
      default: return true;
    }
  });

  const groups = useMemo(() => {
    const m = new Map<string, MentoringTrade[]>();
    [...visible].sort((a, b) => b.traded_at.localeCompare(a.traded_at) || b.created_at.localeCompare(a.created_at))
      .forEach((t) => { const k = t.traded_at.slice(0, 7); m.set(k, [...(m.get(k) || []), t]); });
    return Array.from(m.entries());
  }, [visible]);

  const openTrade = trades.find((t) => t.id === openId) || null;

  function open(t: MentoringTrade) {
    setOpenId(t.id);
    onOpenTrade?.(t);
  }

  return (
    <div className="mj">
      <div className="mj-hero">
        <div className="mj-hero-main">
          <span>רווח נטו</span>
          <b className={`num ${stats.net > 0 ? 'up' : stats.net < 0 ? 'down' : ''}`}>{real.length ? fmtUsd(stats.net) : '—'}</b>
          <small>{stats.count} עסקאות · {rTxt(real.length ? totalR : null)}</small>
        </div>
        <div><span>הצלחה</span><b className="num">{stats.winRate == null ? '—' : `${stats.winRate}%`}</b></div>
        <div><span>ממוצע לעסקה</span><b className="num">{rTxt(stats.avgR)}</b></div>
        <div><span>לפי התוכנית</span><b className={`num ${(stats.planPct ?? 0) >= 80 ? 'up' : ''}`}>{stats.planPct == null ? '—' : `${stats.planPct}%`}</b></div>
      </div>

      {goalMonthly ? (
        <div className="mj-goal">
          <div className="mj-goal-top">
            <span>המטרה החודשית · {MONTHS[new Date().getMonth()]}</span>
            <span><b className={`num ${monthNet > 0 ? 'up' : monthNet < 0 ? 'down' : ''}`}>{fmtUsd(monthNet)}</b> מתוך <span className="num">${goalMonthly.toLocaleString('en-US')}</span></span>
          </div>
          <div className="mj-goal-bar" role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${goalPct}%` }} /></div>
          {overRiskCount > 0 && <div className="mj-sub" style={{ marginTop: 8, color: 'var(--loss)' }}>⚠️ {overRiskCount} {overRiskCount === 1 ? 'עסקה חרגה' : 'עסקאות חרגו'} מהסיכון של ${riskLimit} לעסקה</div>}
        </div>
      ) : null}

      {(real.length >= 2 || insights.length > 0) && (
        <div className="mj-analytics">
          <EquityCurve trades={real} />
          <div className="mj-insights">
            <div className="mj-label">תובנות</div>
            {insights.length ? (
              <ul>{insights.map((i, k) => <li key={k} className={i.tone}><span>{i.text}</span></li>)}</ul>
            ) : (
              <p className="mj-sub">התובנות מתחילות להופיע אחרי 3 עסקאות סגורות.</p>
            )}
          </div>
        </div>
      )}

      {top}

      {trades.length > 0 && (
        <div className="mj-filters" role="tablist" aria-label="סינון עסקאות">
          {FILTERS.filter(([k]) => k === 'all' || counts[k] > 0).map(([k, label]) => (
            <button key={k} className={`mj-chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>
              {label}<span className="num">{counts[k]}</span>
            </button>
          ))}
          {pendingCount > 0 && filter === 'all' && <span className="mj-sub" style={{ marginInlineStart: 'auto' }}>⏳ {pendingCount} ממתינות לניתוח</span>}
        </div>
      )}

      {groups.map(([month, list]) => {
        const [y, m] = month.split('-');
        const monthReal = list.filter((t) => !t.is_example);
        const net = monthReal.reduce((s, t) => s + (t.pnl_usd || 0), 0);
        return (
          <section key={month} className="mj-month">
            <div className="mj-month-h">
              <b>{MONTHS[parseInt(m, 10) - 1]} {y}</b>
              <span className="mj-sub">{list.length} עסקאות</span>
              {monthReal.length > 0 && <b className={`num ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`} style={{ marginInlineStart: 'auto' }}>{fmtUsd(Math.round(net))}</b>}
            </div>
            <div className="mj-rows">
              {list.map((t) => {
                const tone = tradeTone(t);
                const isNew = !!newIds?.has(t.id);
                const verdict = t.coach_verdict ? VERDICT_META[t.coach_verdict] : null;
                const symbol = t.instrument === 'STOCK' ? 'מניה' : t.instrument;
                return (
                  <button key={t.id} className={`mj-row tone-${tone}${isNew ? ' new' : ''}`} onClick={() => open(t)}>
                    <span className="mj-date num">{fmtDate(t.traded_at)}</span>
                    <span className={`mj-side ${t.direction}`}>{t.direction === 'long' ? 'L' : 'S'}</span>
                    <span className="mj-main">
                      <span className="mj-sym num">{symbol}</span>
                      <span className="mj-meta">
                        {t.setup && <span>{t.setup}</span>}
                        {t.followed_plan === false && <span className="bad">מחוץ לתוכנית</span>}
                        {isOverRisk(t, riskLimit) && <span className="risk">סיכון חורג</span>}
                        {t.emotion && ['FOMO', 'נקמה', 'לחוץ/ה', 'בטוח/ה מדי'].includes(t.emotion) && <span className="warn">{t.emotion}</span>}
                        {t.is_example && <span className="lv">דוגמה</span>}
                      </span>
                    </span>
                    <span className="mj-status" title={verdict ? verdict.label : t.reviewed_at ? 'נבדקה' : 'ממתינה לניתוח'}>
                      {isNew ? <i className="mj-newdot" aria-label="משוב חדש" /> : null}
                      {verdict ? verdict.icon : t.reviewed_at ? '💬' : '⏳'}
                    </span>
                    <span className="mj-res">
                      {isOpenTrade(t) ? <b className="open">פתוחה</b> : <><b className="num">{fmtUsd(t.pnl_usd)}</b><small className="num">{fmtR(t.r_multiple)}</small></>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {trades.length > 0 && visible.length === 0 && <div className="mt-empty">אין עסקאות בסינון הזה.</div>}

      {openTrade && <TradeSheet trade={openTrade} riskLimit={riskLimit} onClose={() => setOpenId(null)} footer={renderFooter?.(openTrade, () => setOpenId(null))} />}
    </div>
  );
}
