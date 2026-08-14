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

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [closing, setClosing] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editEntry, setEditEntry] = useState('');
  const [editStop, setEditStop] = useState('');
  const [editShares, setEditShares] = useState('');
  const [editExitPrice, setEditExitPrice] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleClose(entry: JournalEntry) {
    if (!exitPrice) return;
    setClosing(true);

    const exit = parseFloat(exitPrice);
    const dirFactor = entry.direction === 'short' ? -1 : 1;
    const realizedPnl = (exit - entry.entry_price) * entry.shares * dirFactor;

    const { error } = await supabase
      .from('journal_entries')
      .update({
        status: 'closed',
        exit_price: exit,
        closed_at: exitDate ? new Date(exitDate).toISOString() : new Date().toISOString(),
        realized_pnl_usd: realizedPnl,
      })
      .eq('id', entry.id);

    setClosing(false);

    if (!error) {
      setClosingId(null);
      setExitPrice('');
      setExitDate('');
      load();
    }
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditSymbol(entry.symbol);
    setEditEntry(String(entry.entry_price));
    setEditStop(String(entry.stop_loss));
    setEditShares(String(entry.shares));
    setEditExitPrice(entry.exit_price !== null ? String(entry.exit_price) : '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(entry: JournalEntry) {
    setSavingEdit(true);

    const entryPriceNum = parseFloat(editEntry);
    const stopNum = parseFloat(editStop);
    const sharesNum = parseFloat(editShares);
    const dirFactor = entry.direction === 'short' ? -1 : 1;

    const updates: Record<string, unknown> = {
      symbol: editSymbol.toUpperCase(),
      entry_price: entryPriceNum,
      stop_loss: stopNum,
      shares: sharesNum,
    };

    if (entry.status === 'closed' && editExitPrice) {
      const exit = parseFloat(editExitPrice);
      updates.exit_price = exit;
      updates.realized_pnl_usd = (exit - entryPriceNum) * sharesNum * dirFactor;
    }

    const { error } = await supabase.from('journal_entries').update(updates).eq('id', entry.id);

    setSavingEdit(false);

    if (!error) {
      setEditingId(null);
      load();
    }
  }

  async function handleDelete(entry: JournalEntry) {
    if (!window.confirm(`למחוק לצמיתות את העסקה ${entry.symbol}?`)) return;
    const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id);
    if (!error) load();
  }

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
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>;
  }

  if (!userId) {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/" className="nav-link">בית</Link>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <Link href="/login" style={{ color: 'var(--teal)' }}>כניסה</Link></p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/" className="nav-link">בית</Link>
          <Link href="/portfolio" className="nav-link">← לתיק</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>יומן המסחר שלי</h2><span className="count">פרטי - נשאר בינינו</span></div>

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
          <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'שומרים...' : 'שמירת עסקה'}</button>
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
                {e.status === 'open' ? (
                  <div className="pct" style={{ color: 'var(--text-secondary)' }}>פתוחה</div>
                ) : (
                  <div className="pct" style={{ color: (e.realized_pnl_usd ?? 0) >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {(e.realized_pnl_usd ?? 0) >= 0 ? '+' : ''}${(e.realized_pnl_usd ?? 0).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
            <div className="trade-details">
              <div className="detail-item"><div className="label">כניסה</div><div className="value">${e.entry_price}</div></div>
              {e.status === 'open' ? (
                <div className="detail-item"><div className="label">סטופ</div><div className="value">${e.stop_loss}</div></div>
              ) : (
                <div className="detail-item"><div className="label">יציאה</div><div className="value">${e.exit_price}</div></div>
              )}
              <div className="detail-item"><div className="label">מניות</div><div className="value">{e.shares}</div></div>
            </div>

            {editingId === e.id ? (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
                <div className="form-row" style={{ marginBottom: '10px' }}>
                  <div className="field" style={{ marginBottom: 0 }}><label>סימבול</label><input type="text" value={editSymbol} onChange={(ev) => setEditSymbol(ev.target.value)} /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>מניות</label><input type="number" value={editShares} onChange={(ev) => setEditShares(ev.target.value)} /></div>
                </div>
                <div className="form-row" style={{ marginBottom: e.status === 'closed' ? '10px' : 0 }}>
                  <div className="field" style={{ marginBottom: 0 }}><label>מחיר כניסה</label><input type="number" value={editEntry} onChange={(ev) => setEditEntry(ev.target.value)} /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>סטופ לוס</label><input type="number" value={editStop} onChange={(ev) => setEditStop(ev.target.value)} /></div>
                </div>
                {e.status === 'closed' && (
                  <div className="field"><label>מחיר יציאה</label><input type="number" value={editExitPrice} onChange={(ev) => setEditExitPrice(ev.target.value)} /></div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={() => saveEdit(e)} disabled={savingEdit}>{savingEdit ? 'שומרים...' : 'שמירת שינויים'}</button>
                  <button className="btn-outline" style={{ flex: 1 }} onClick={cancelEdit}>ביטול</button>
                </div>
              </div>
            ) : closingId === e.id ? (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
                <div className="form-row" style={{ marginBottom: '10px' }}>
                  <div className="field" style={{ marginBottom: 0 }}><label>מחיר סגירה</label><input type="number" value={exitPrice} onChange={(ev) => setExitPrice(ev.target.value)} placeholder="130.50" /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>תאריך סגירה</label><input type="date" value={exitDate} onChange={(ev) => setExitDate(ev.target.value)} /></div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleClose(e)} disabled={closing || !exitPrice}>{closing ? 'סוגרים...' : 'אישור סגירה'}</button>
                  <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setClosingId(null); setExitPrice(''); setExitDate(''); }}>ביטול</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                {e.status === 'open' && (
                  <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => { setClosingId(e.id); setExitPrice(''); setExitDate(''); }}>
                    סגירת עסקה
                  </button>
                )}
                <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => startEdit(e)}>
                  עריכה
                </button>
                <button className="btn-outline" style={{ padding: '8px 14px', fontSize: '13px', color: 'var(--loss)', borderColor: 'var(--loss)' }} onClick={() => handleDelete(e)}>
                  מחיקה
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
