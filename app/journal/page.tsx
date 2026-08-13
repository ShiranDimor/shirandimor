'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type JournalEntry = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  status: string;
  exit_price: number | null;
  shares: number;
  realized_pnl_usd: number | null;
  opened_at: string;
};

export default function JournalPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [symbol, setSymbol] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [portfolioSize, setPortfolioSize] = useState('');
  const [riskAmount, setRiskAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('opened_at', { ascending: false });

    if (data) setEntries(data);
    setLoading(false);
  }

  const calcShares = entryPrice && stopLoss && riskAmount
    ? Math.floor(parseFloat(riskAmount) / Math.abs(parseFloat(entryPrice) - parseFloat(stopLoss)))
    : 0;

  async function handleAdd() {
    if (!userId || !symbol || !entryPrice || !stopLoss || !riskAmount) return;
    setSaving(true);

    const { error } = await supabase.from('journal_entries').insert({
      user_id: userId,
      direction,
      symbol: symbol.toUpperCase(),
      entry_price: parseFloat(entryPrice),
      stop_loss: parseFloat(stopLoss),
      starting_portfolio_usd: portfolioSize ? parseFloat(portfolioSize) : null,
      risk_amount_usd: parseFloat(riskAmount),
      shares: calcShares,
      status: 'open',
    });

    setSaving(false);

    if (!error) {
      setSymbol(''); setEntryPrice(''); setStopLoss(''); setRiskAmount('');
      setShowForm(false);
      load();
    }
  }

  if (loading) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענת...</p></div>;
  }

  if (!userId) {
    return (
      <div className="wrap">
        <header><div className="brand">מסחר <span>אחראי</span> במניות</div></header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <Link href="/login" style={{ color: 'var(--teal)' }}>כניסה</Link></p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <div className="brand">מסחר <span>אחראי</span> במניות</div>
        <Link href="/portfolio" className="nav-link">← חזרה</Link>
      </header>

      <div className="section-label"><h2>יומן המסחר שלי</h2><span className="count">פרטי - רק את/ה ואני</span></div>

      <button className="add-btn" onClick={() => setShowForm(!showForm)}>+ עסקה חדשה</button>

      {showForm && (
        <div className="journal-form">
          <div className="toggle-row">
            <div className={`toggle-opt ${direction === 'long' ? 'long-active' : ''}`} onClick={() => setDirection('long')} style={{ cursor: 'pointer' }}>לונג</div>
            <div className={`toggle-opt ${direction === 'short' ? 'short-active' : ''}`} onClick={() => setDirection('short')} style={{ cursor: 'pointer' }}>שורט</div>
          </div>
          <div className="field"><label>סימבול</label><input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" /></div>
          <div className="form-row">
            <div className="field"><label>מחיר כניסה</label><input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="127.32" /></div>
            <div className="field"><label>סטופ לוס</label><input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="121.00" /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>גודל תיק ($)</label><input type="number" value={portfolioSize} onChange={(e) => setPortfolioSize(e.target.value)} placeholder="10000" /></div>
            <div className="field"><label>סיכון כספי ($)</label><input type="number" value={riskAmount} onChange={(e) => setRiskAmount(e.target.value)} placeholder="500" /></div>
          </div>
          <div style={{ background: 'var(--bg-void)', border: '1px solid var(--border-hairline)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>כמות מניות מחושבת</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--teal)' }}>{calcShares || '—'}</span>
          </div>
          <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'שומרת...' : 'שמירת עסקה'}</button>
        </div>
      )}

      <div className="trades-list">
        {entries.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין לא הזנת עסקאות</p>}
        {entries.map((e) => (
          <div className="trade-card" key={e.id}>
            <div className="trade-top">
              <div className="trade-symbol-group">
                <div className={`direction-mark ${e.direction}`}>{e.direction === 'long' ? 'L' : 'S'}</div>
                <div className="trade-symbol">{e.symbol}</div>
              </div>
              <div className="trade-pnl">
                <div className="pct" style={{ color: 'var(--text-secondary)' }}>{e.status === 'open' ? 'פתוחה' : 'סגורה'}</div>
              </div>
            </div>
            <div className="trade-details">
              <div className="detail-item"><div className="label">כניסה</div><div className="value">${e.entry_price}</div></div>
              <div className="detail-item"><div className="label">סטופ</div><div className="value">${e.stop_loss}</div></div>
              <div className="detail-item"><div className="label">מניות</div><div className="value">{e.shares}</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
