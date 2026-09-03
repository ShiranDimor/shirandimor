'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';
import StatsRing from '@/components/StatsRing';
import EquityCurve from '@/components/EquityCurve';
import CalendarHeatmap from '@/components/CalendarHeatmap';

type Trade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  max_entry_price: number | null;
  current_price: number | null;
  exit_price: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  shares_calculated: number | null;
  realized_pnl_usd: number | null;
};

const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split('-');
  return `${MONTH_LABELS[parseInt(month, 10) - 1]} ${year}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [openMonthFilter, setOpenMonthFilter] = useState('all');
  const [profitMonthFilter, setProfitMonthFilter] = useState(currentMonthKey);
  const [lossMonthFilter, setLossMonthFilter] = useState(currentMonthKey);
  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonthIdx, setCalMonthIdx] = useState(() => new Date().getMonth());

  const [risk, setRisk] = useState('');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [tradingPlanHref, setTradingPlanHref] = useState('/trading-plan');

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function onScroll() {
      setShowStickyCta(window.scrollY > 400);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function load() {
    fetch('/api/refresh-prices').catch(() => {});

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      setLoggedIn(true);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, phone, email')
        .eq('id', user.id)
        .single();
      setHasFullAccess(profile?.role === 'admin' || profile?.role === 'subscriber');
      setIsAdmin(profile?.role === 'admin');

      const prefillParams = new URLSearchParams();
      if (profile?.full_name) prefillParams.set('prefillName', profile.full_name);
      if (profile?.phone) prefillParams.set('prefillPhone', profile.phone);
      if (profile?.email) prefillParams.set('prefillEmail', profile.email);
      setTradingPlanHref(`/trading-plan?${prefillParams.toString()}`);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch('/api/trading-plan/my-link', { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => { if (data?.id) setTradingPlanHref(`/my-plan/${data.id}`); })
          .catch(() => {});
      }
    }

    const { data: open } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false });

    const { data: closed } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });

    const { data: settings } = await supabase
      .from('portfolio_settings')
      .select('initial_balance')
      .eq('id', 1)
      .single();

    if (open) setOpenTrades(open);
    if (closed) setClosedTrades(closed);
    if (settings) setInitialBalance(Number(settings.initial_balance));
    setLoading(false);
  }

  function pct(trade: Trade) {
    const current = trade.status === 'open' ? trade.current_price : trade.exit_price;
    if (!current) return 0;
    return ((current - trade.entry_price) / trade.entry_price) * 100 * (trade.direction === 'short' ? -1 : 1);
  }

  function unrealizedUsd(trade: Trade) {
    if (!trade.current_price || !trade.shares_calculated) return null;
    return (trade.current_price - trade.entry_price) * trade.shares_calculated * (trade.direction === 'short' ? -1 : 1);
  }

  const availableOpenMonths = Array.from(
    new Set(openTrades.map((t) => monthKey(t.opened_at)))
  ).sort().reverse();

  const availableClosedMonths = Array.from(
    new Set([currentMonthKey(), ...closedTrades.filter((t) => t.closed_at).map((t) => monthKey(t.closed_at as string))])
  ).sort().reverse();

  const filteredOpenTrades = openMonthFilter === 'all'
    ? openTrades
    : openTrades.filter((t) => monthKey(t.opened_at) === openMonthFilter);

  const allClosedProfit_ = closedTrades.filter((t) => pct(t) >= 0);
  const allClosedLoss_ = closedTrades.filter((t) => pct(t) < 0);

  const closedProfitTrades = profitMonthFilter === 'all'
    ? allClosedProfit_
    : allClosedProfit_.filter((t) => t.closed_at && monthKey(t.closed_at) === profitMonthFilter);

  const closedLossTrades = lossMonthFilter === 'all'
    ? allClosedLoss_
    : allClosedLoss_.filter((t) => t.closed_at && monthKey(t.closed_at) === lossMonthFilter);

  const allClosedProfit = closedTrades.filter((t) => pct(t) >= 0).length;
  const winRate = closedTrades.length > 0 ? (allClosedProfit / closedTrades.length) * 100 : null;

  const closedPcts = closedTrades.map((t) => pct(t));
  const avgPnlPct = closedPcts.length > 0 ? closedPcts.reduce((s, x) => s + x, 0) / closedPcts.length : null;

  const winPcts = closedPcts.filter((p) => p >= 0);
  const lossPcts = closedPcts.filter((p) => p < 0);
  const avgWinPct = winPcts.length > 0 ? winPcts.reduce((s, x) => s + x, 0) / winPcts.length : 0;
  const avgLossPct = lossPcts.length > 0 ? Math.abs(lossPcts.reduce((s, x) => s + x, 0) / lossPcts.length) : 0;
  const riskReward = avgLossPct > 0 ? avgWinPct / avgLossPct : null;

  const daysToClose = closedTrades
    .filter((t) => t.closed_at)
    .map((t) => (new Date(t.closed_at as string).getTime() - new Date(t.opened_at).getTime()) / 86400000);
  const avgDaysToClose = daysToClose.length > 0 ? daysToClose.reduce((s, x) => s + x, 0) / daysToClose.length : null;

  const tradesThisMonth = [...openTrades, ...closedTrades].filter((t) => monthKey(t.opened_at) === currentMonthKey()).length;

  const equityPoints = (() => {
    if (initialBalance === null) return [];
    const chronological = closedTrades
      .filter((t) => t.closed_at)
      .slice()
      .sort((a, b) => new Date(a.closed_at as string).getTime() - new Date(b.closed_at as string).getTime());
    let running = initialBalance;
    const points = [{ date: 'התחלה', value: Math.round(running) }];
    for (const t of chronological) {
      running += t.realized_pnl_usd ?? 0;
      points.push({ date: formatDate(t.closed_at), value: Math.round(running) });
    }
    return points;
  })();

  const calItems = closedTrades
    .filter((t) => {
      if (!t.closed_at) return false;
      const d = new Date(t.closed_at);
      return d.getFullYear() === calYear && d.getMonth() === calMonthIdx;
    })
    .map((t) => {
      const cost = t.entry_price * (t.shares_calculated ?? 0);
      const usd = t.realized_pnl_usd ?? 0;
      return {
        day: new Date(t.closed_at as string).getDate(),
        symbol: t.symbol,
        direction: t.direction,
        usd,
        pct: cost > 0 ? (usd / cost) * 100 : 0,
      };
    });

  function goPrevMonth() {
    if (calMonthIdx === 0) { setCalYear((y) => y - 1); setCalMonthIdx(11); }
    else setCalMonthIdx((m) => m - 1);
  }

  function goNextMonth() {
    if (calMonthIdx === 11) { setCalYear((y) => y + 1); setCalMonthIdx(0); }
    else setCalMonthIdx((m) => m + 1);
  }

  const shares = risk && entry && stop
    ? Math.floor(parseFloat(risk) / Math.abs(parseFloat(entry) - parseFloat(stop)))
    : null;

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>;
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        {loggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href="/" className="nav-link">בית</Link>
            {hasFullAccess && !isAdmin && <Link href="/journal" className="nav-link">היומן האישי שלי</Link>}
            {hasFullAccess && !isAdmin && <Link href={tradingPlanHref} className="nav-link" style={{ color: '#E8A33D' }}>תוכנית המסחר שלי</Link>}
            <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href="/" className="nav-link">בית</Link>
            <Link href="/login" className="nav-link">כניסה לסוחרים</Link>
          </div>
        )}
      </header>

      <div className="section-label"><h2>התיק של שירן</h2></div>

      {!hasFullAccess && (
        <div className="lock-banner">
          <div className="lb-icon">🔒</div>
          <div className="lb-text">
            <p className="lb-title">יש כאן עסקאות אמיתיות, אבל הן שמורות למנויים</p>
            <p className="lb-sub">הסימבולים מוסתרים כדי לשמור על פרטיות חברי הקבוצה - ההצטרפות פותחת גישה לתמונה המלאה: מספרים אמיתיים, כולל הפסדים.</p>
          </div>
          <div className="lb-cta-row">
            <Link href="/subscribe" className="lb-cta">לגישה מלאה ←</Link>
            <Link href="/?join=1" className="lb-cta-secondary">הצטרפות חינם לעדכונים ←</Link>
          </div>
        </div>
      )}

      {hasFullAccess && (
        <>
          <div className="section-label"><h2>מחשבון גודל פוזיציה</h2></div>
          <div className="calc-panel" style={{ padding: '18px 16px', marginBottom: '28px' }}>
            <div className="form-row" style={{ marginBottom: '10px' }}>
              <div className="field" style={{ marginBottom: 0 }}><label>סיכון כספי ($)</label><ClearableInput type="number" value={risk} onChange={(e) => setRisk(e.target.value)} onClear={() => setRisk('')} placeholder="500" /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>מחיר כניסה ($)</label><ClearableInput type="number" value={entry} onChange={(e) => setEntry(e.target.value)} onClear={() => setEntry('')} placeholder="127.32" /></div>
            </div>
            <div className="field"><label>מחיר סטופ לוס ($)</label><ClearableInput type="number" value={stop} onChange={(e) => setStop(e.target.value)} onClear={() => setStop('')} placeholder="121.00" /></div>
            <div className="calc-result">
              <span className="rlabel">כמות מניות מקסימלית</span>
              <span className="rvalue">{shares !== null && !isNaN(shares) ? shares : '—'}</span>
            </div>
          </div>
        </>
      )}

      <div className="section-label"><h2>צמיחת התיק של שירן</h2></div>
      <div className="equity-card">
        <EquityCurve points={equityPoints} />
      </div>

      <div className="section-label"><h2>לוח שנה</h2></div>
      <div className="equity-card" style={{ marginBottom: '28px' }}>
        <CalendarHeatmap year={calYear} month={calMonthIdx} items={calItems} onPrevMonth={goPrevMonth} onNextMonth={goNextMonth} />
      </div>

      <div className="section-label"><h2>תובנות התיק של שירן</h2></div>
      <div className="insights-panel" style={{ marginBottom: '28px' }}>
        <div className="insights-ring-row">
          <StatsRing
            percent={winRate ?? 0}
            label={`${closedTrades.length} עסקאות סגורות`}
            sublabel={`תיק התחלתי $${initialBalance !== null ? initialBalance.toLocaleString() : '—'}`}
          />
        </div>
        <div className="insight-grid">
          <div className="insight-tile">
            <div className="iv">{avgDaysToClose !== null ? avgDaysToClose.toFixed(1) : '—'}</div>
            <div className="il">ימי החזקה בממוצע</div>
          </div>
          <div className="insight-tile">
            <div className="iv" style={{ color: avgPnlPct !== null ? (avgPnlPct >= 0 ? 'var(--profit)' : 'var(--loss)') : undefined }}>
              {avgPnlPct !== null ? `${avgPnlPct >= 0 ? '+' : ''}${avgPnlPct.toFixed(2)}%` : '—'}
            </div>
            <div className="il">רווח/הפסד ממוצע לעסקה</div>
          </div>
          <div className="insight-tile">
            <div className="iv">{riskReward !== null ? `1:${riskReward.toFixed(1)}` : '—'}</div>
            <div className="il">יחס סיכון-סיכוי</div>
          </div>
          <div className="insight-tile">
            <div className="iv">{tradesThisMonth}</div>
            <div className="il">עסקאות החודש</div>
          </div>
        </div>
      </div>

      <details className="section-collapse">
        <summary>
          <h2>עסקאות פתוחות</h2>
          <div className="summary-right"><span className="count">{filteredOpenTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {availableOpenMonths.length > 0 && (
          <div className="month-select-wrap">
            <select className="month-select" value={openMonthFilter} onChange={(e) => setOpenMonthFilter(e.target.value)}>
              <option value="all">כל החודשים</option>
              {availableOpenMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        )}
        {filteredOpenTrades.length === 0 ? (
          <p className="trade-table-empty">אין עסקאות פתוחות בטווח הזה</p>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>סימבול</th>
                  <th>נכנסה ב-</th>
                  <th>כניסה</th>
                  <th>נוכחי</th>
                  <th>סטופ</th>
                  <th style={{ whiteSpace: 'normal', maxWidth: '80px', lineHeight: 1.3 }}>עד איזה מחיר אפשר להיכנס לעסקה</th>
                  <th>רווח/הפסד</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpenTrades.map((trade) => {
                  const p = pct(trade);
                  const u = unrealizedUsd(trade);
                  return (
                    <tr key={trade.id}>
                      <td className="sym-cell">
                        <span className="sym-cell-inner">
                          <span className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</span>
                          <span className={!hasFullAccess ? 'trade-symbol blurred' : ''}>{trade.symbol}</span>
                          {!hasFullAccess && <span className="locked-tag">למנויים</span>}
                        </span>
                      </td>
                      <td>{formatDate(trade.opened_at)}</td>
                      <td>${trade.entry_price}</td>
                      <td>${trade.current_price ?? trade.entry_price}</td>
                      <td>${trade.stop_loss}</td>
                      <td>{trade.max_entry_price !== null ? `עד $${trade.max_entry_price}` : '—'}</td>
                      <td className="pnl-cell" style={{ color: p >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                        {p >= 0 ? '+' : ''}{p.toFixed(2)}%
                        {u !== null && <span className="usd-sub">{u >= 0 ? '+' : '-'}${Math.abs(u).toFixed(0)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <div className="section-label" style={{ marginTop: '28px' }}><h2>עסקאות סגורות</h2></div>

      <details className="section-collapse">
        <summary>
          <h2>נסגרו ברווח</h2>
          <div className="summary-right"><span className="count">{closedProfitTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {availableClosedMonths.length > 0 && (
          <div className="month-select-wrap">
            <select className="month-select" value={profitMonthFilter} onChange={(e) => setProfitMonthFilter(e.target.value)}>
              <option value="all">כל החודשים</option>
              {availableClosedMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        )}
        {closedProfitTrades.length === 0 ? (
          <p className="trade-table-empty">אין עסקאות שנסגרו ברווח בטווח הזה</p>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>סימבול</th>
                  <th>נפתחה ב-</th>
                  <th>נסגרה ב-</th>
                  <th>כניסה</th>
                  <th>יציאה</th>
                  <th>רווח</th>
                </tr>
              </thead>
              <tbody>
                {closedProfitTrades.map((trade) => {
                  const p = pct(trade);
                  return (
                    <tr key={trade.id}>
                      <td className="sym-cell">
                        <span className="sym-cell-inner">
                          <span className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</span>
                          <span>{trade.symbol}</span>
                        </span>
                      </td>
                      <td>{formatDate(trade.opened_at)}</td>
                      <td>{formatDate(trade.closed_at)}</td>
                      <td>${trade.entry_price}</td>
                      <td>${trade.exit_price}</td>
                      <td className="pnl-cell" style={{ color: 'var(--profit)' }}>{p >= 0 ? '+' : ''}{p.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="section-collapse">
        <summary>
          <h2>נסגרו בהפסד</h2>
          <div className="summary-right"><span className="count">{closedLossTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {availableClosedMonths.length > 0 && (
          <div className="month-select-wrap">
            <select className="month-select" value={lossMonthFilter} onChange={(e) => setLossMonthFilter(e.target.value)}>
              <option value="all">כל החודשים</option>
              {availableClosedMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        )}
        {closedLossTrades.length === 0 ? (
          <p className="trade-table-empty">אין עסקאות שנסגרו בהפסד בטווח הזה</p>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>סימבול</th>
                  <th>נפתחה ב-</th>
                  <th>נסגרה ב-</th>
                  <th>כניסה</th>
                  <th>יציאה</th>
                  <th>הפסד</th>
                </tr>
              </thead>
              <tbody>
                {closedLossTrades.map((trade) => {
                  const p = pct(trade);
                  return (
                    <tr key={trade.id}>
                      <td className="sym-cell">
                        <span className="sym-cell-inner">
                          <span className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</span>
                          <span>{trade.symbol}</span>
                        </span>
                      </td>
                      <td>{formatDate(trade.opened_at)}</td>
                      <td>{formatDate(trade.closed_at)}</td>
                      <td>${trade.entry_price}</td>
                      <td>${trade.exit_price}</td>
                      <td className="pnl-cell" style={{ color: 'var(--loss)' }}>{p.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {!hasFullAccess && showStickyCta && (
        <div className="sticky-cta">
          <Link href="/?join=1">הצטרפות לקבוצת העדכונים - ללא עלות</Link>
        </div>
      )}
    </div>
  );
}
