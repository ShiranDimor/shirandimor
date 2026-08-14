'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Trade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  current_price: number | null;
  exit_price: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);

  const [risk, setRisk] = useState('');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      setLoggedIn(true);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      setHasFullAccess(profile?.role === 'admin' || profile?.role === 'subscriber');
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

    if (open) setOpenTrades(open);
    if (closed) setClosedTrades(closed);
    setLoading(false);
  }

  function pct(trade: Trade) {
    const current = trade.status === 'open' ? trade.current_price : trade.exit_price;
    if (!current) return 0;
    return ((current - trade.entry_price) / trade.entry_price) * 100 * (trade.direction === 'short' ? -1 : 1);
  }

  const shares = risk && entry && stop
    ? Math.floor(parseFloat(risk) / Math.abs(parseFloat(entry) - parseFloat(stop)))
    : null;

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענת...</p></div>;
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        {loggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {hasFullAccess && <Link href="/journal" className="nav-link">יומן שלי</Link>}
            <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
          </div>
        ) : (
          <Link href="/login" className="nav-link">כניסה לסוחרים</Link>
        )}
      </header>

      {!hasFullAccess && (
        <div className="lock-banner">
          <div className="lb-icon">🔒</div>
          <div className="lb-text">
            <p className="lb-title">יש כאן עסקאות אמיתיות, אבל הן שמורות למנויים</p>
            <p className="lb-sub">הסימבולים מטושטשים כדי לשמור על הקבוצה - הצטרפי ותראי הכל, מספרים ותוצאות כולל.</p>
          </div>
          <Link href="/subscribe" className="lb-cta">לגישה מלאה ←</Link>
        </div>
      )}

      <div className="section-label"><h2>עסקאות פתוחות</h2><span className="count">{openTrades.length}</span></div>
      <div className="trades-list">
        {openTrades.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין כרגע עסקאות פתוחות</p>}
        {openTrades.map((trade) => {
          const p = pct(trade);
          return (
            <div className="trade-card" key={trade.id}>
              <div className="trade-top">
                <div className="trade-symbol-group">
                  <div className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</div>
                  <div className={`trade-symbol ${!hasFullAccess ? 'blurred' : ''}`}>{trade.symbol}</div>
                  {!hasFullAccess && <div className="locked-tag">למנויים</div>}
                </div>
                <div className="trade-pnl">
                  <div className="pct" style={{ color: p >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{p >= 0 ? '+' : ''}{p.toFixed(2)}%</div>
                </div>
              </div>
              <div className="trade-details">
                <div className="detail-item"><div className="label">כניסה</div><div className="value">${trade.entry_price}</div></div>
                <div className="detail-item"><div className="label">נוכחי</div><div className="value">${trade.current_price ?? trade.entry_price}</div></div>
                <div className="detail-item"><div className="label">סטופ</div><div className="value">${trade.stop_loss}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-label" style={{ marginTop: '28px' }}><h2>עסקאות סגורות</h2><span className="count">{closedTrades.length}</span></div>
      <div className="trades-list">
        {closedTrades.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין עדיין עסקאות סגורות</p>}
        {closedTrades.map((trade) => {
          const p = pct(trade);
          return (
            <div className="trade-card" key={trade.id}>
              <div className="trade-top">
                <div className="trade-symbol-group">
                  <div className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</div>
                  <div className="trade-symbol">{trade.symbol}</div>
                </div>
                <div className="trade-pnl">
                  <div className="pct" style={{ color: p >= 0 ? 'var(--profit)' : 'var(--loss)' }}>{p >= 0 ? '+' : ''}{p.toFixed(2)}%</div>
                </div>
              </div>
              <div className="trade-details">
                <div className="detail-item"><div className="label">כניסה</div><div className="value">${trade.entry_price}</div></div>
                <div className="detail-item"><div className="label">יציאה</div><div className="value">${trade.exit_price}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      {hasFullAccess && (
        <>
          <div className="section-label" style={{ marginTop: '28px' }}><h2>מחשבון גודל פוזיציה</h2></div>
          <div className="calc-panel" style={{ padding: '18px 16px' }}>
            <div className="form-row" style={{ marginBottom: '10px' }}>
              <div className="field" style={{ marginBottom: 0 }}><label>סיכון כספי ($)</label><input type="number" value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="500" /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>מחיר כניסה ($)</label><input type="number" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="127.32" /></div>
            </div>
            <div className="field"><label>מחיר סטופ לוס ($)</label><input type="number" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="121.00" /></div>
            <div className="calc-result">
              <span className="rlabel">כמות מניות מקסימלית</span>
              <span className="rvalue">{shares !== null && !isNaN(shares) ? shares : '—'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
