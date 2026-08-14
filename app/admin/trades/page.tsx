'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';

type Trade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  shares_calculated: number;
  exit_price: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  parent_trade_id: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

export default function AdminTradesPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);

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

  const [addQtyId, setAddQtyId] = useState<string | null>(null);
  const [addQtyPrice, setAddQtyPrice] = useState('');
  const [addQtyShares, setAddQtyShares] = useState('');
  const [addingQty, setAddingQty] = useState(false);

  const [sellQtyId, setSellQtyId] = useState<string | null>(null);
  const [sellQtyPrice, setSellQtyPrice] = useState('');
  const [sellQtyShares, setSellQtyShares] = useState('');
  const [sellingQty, setSellingQty] = useState(false);
  const [sellQtyError, setSellQtyError] = useState('');

  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [symbol, setSymbol] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [riskAmount, setRiskAmount] = useState('500');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkAdmin();
  }, []);

  async function loadTrades() {
    const { data: open } = await supabase
      .from('trades')
      .select('id, direction, symbol, entry_price, stop_loss, shares_calculated, exit_price, notes, opened_at, closed_at, parent_trade_id')
      .eq('status', 'open')
      .order('opened_at', { ascending: false });
    if (open) setOpenTrades(open);

    const { data: closed } = await supabase
      .from('trades')
      .select('id, direction, symbol, entry_price, stop_loss, shares_calculated, exit_price, notes, opened_at, closed_at, parent_trade_id')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });
    if (closed) setClosedTrades(closed);
  }

  // ממזג עסקה למניה יחידה: מכירה חלקית יוצרת שבר "סגור" נפרד; כשהיתרה מתאפסת כל השברים מתאחדים לעסקה סגורה אחת עם מחיר יציאה וכניסה ממוצעים
  async function realizeShares(trade: Trade, sellShares: number, sellPrice: number, closedAtIso: string) {
    const dirFactor = trade.direction === 'short' ? -1 : 1;
    const realizedForSlice = (sellPrice - trade.entry_price) * sellShares * dirFactor;
    const remaining = trade.shares_calculated - sellShares;

    if (remaining > 0) {
      await supabase.from('trades').insert({
        created_by: userId,
        direction: trade.direction,
        symbol: trade.symbol,
        entry_price: trade.entry_price,
        stop_loss: trade.stop_loss,
        risk_amount_usd: 0,
        status: 'closed',
        exit_price: sellPrice,
        shares_calculated: sellShares,
        realized_pnl_usd: realizedForSlice,
        parent_trade_id: trade.parent_trade_id || trade.id,
        opened_at: trade.opened_at,
        closed_at: closedAtIso,
      });
      await supabase.from('trades').update({ shares_calculated: remaining }).eq('id', trade.id);
      return;
    }

    const rootId = trade.parent_trade_id || trade.id;
    const { data: siblings } = await supabase
      .from('trades')
      .select('id, shares_calculated, exit_price, realized_pnl_usd')
      .eq('parent_trade_id', rootId)
      .neq('id', trade.id);

    const allSiblings = siblings || [];
    const totalShares = allSiblings.reduce((s, x) => s + x.shares_calculated, 0) + sellShares;
    const weightedExit = (allSiblings.reduce((s, x) => s + x.shares_calculated * (x.exit_price ?? 0), 0) + sellShares * sellPrice) / totalShares;
    const totalPnl = allSiblings.reduce((s, x) => s + (x.realized_pnl_usd ?? 0), 0) + realizedForSlice;

    await supabase.from('trades').update({
      status: 'closed',
      shares_calculated: totalShares,
      exit_price: weightedExit,
      realized_pnl_usd: totalPnl,
      closed_at: closedAtIso,
    }).eq('id', trade.id);

    if (allSiblings.length > 0) {
      await supabase.from('trades').delete().in('id', allSiblings.map((s) => s.id));
    }
  }

  async function handleCloseTrade(trade: Trade) {
    if (!exitPrice) return;
    setClosing(true);

    await realizeShares(trade, trade.shares_calculated, parseFloat(exitPrice), exitDate ? new Date(exitDate).toISOString() : new Date().toISOString());

    setClosing(false);
    setClosingId(null);
    setExitPrice('');
    setExitDate('');
    loadTrades();
  }

  function startAddQty(trade: Trade) {
    setAddQtyId(trade.id);
    setAddQtyPrice('');
    setAddQtyShares('');
  }

  async function handleAddQuantity(trade: Trade) {
    const price = parseFloat(addQtyPrice);
    const shares = parseFloat(addQtyShares);
    if (!price || !shares) return;
    setAddingQty(true);

    const newShares = trade.shares_calculated + shares;
    const newEntryPrice = (trade.entry_price * trade.shares_calculated + price * shares) / newShares;

    const { error } = await supabase
      .from('trades')
      .update({ entry_price: newEntryPrice, shares_calculated: newShares })
      .eq('id', trade.id);

    setAddingQty(false);

    if (!error) {
      setAddQtyId(null);
      loadTrades();
    }
  }

  function startSellQty(trade: Trade) {
    setSellQtyId(trade.id);
    setSellQtyPrice('');
    setSellQtyShares('');
    setSellQtyError('');
  }

  async function handlePartialSell(trade: Trade) {
    const price = parseFloat(sellQtyPrice);
    const shares = parseFloat(sellQtyShares);

    if (!price || !shares) return;
    if (shares >= trade.shares_calculated) {
      setSellQtyError('למכירת כל הכמות יש להשתמש בכפתור "סגירת עסקה"');
      return;
    }

    setSellingQty(true);
    await realizeShares(trade, shares, price, new Date().toISOString());
    setSellingQty(false);
    setSellQtyId(null);
    loadTrades();
  }

  function startEdit(trade: Trade) {
    setEditingId(trade.id);
    setEditSymbol(trade.symbol);
    setEditEntry(String(trade.entry_price));
    setEditStop(String(trade.stop_loss));
    setEditShares(String(trade.shares_calculated));
    setEditExitPrice(trade.exit_price !== null ? String(trade.exit_price) : '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(trade: Trade, isClosed: boolean) {
    setSavingEdit(true);

    const entry = parseFloat(editEntry);
    const stop = parseFloat(editStop);
    const shares = parseFloat(editShares);
    const dirFactor = trade.direction === 'short' ? -1 : 1;

    const updates: Record<string, unknown> = {
      symbol: editSymbol.toUpperCase(),
      entry_price: entry,
      stop_loss: stop,
      shares_calculated: shares,
    };

    if (isClosed && editExitPrice) {
      const exit = parseFloat(editExitPrice);
      updates.exit_price = exit;
      updates.realized_pnl_usd = (exit - entry) * shares * dirFactor;
    }

    const { error } = await supabase.from('trades').update(updates).eq('id', trade.id);

    setSavingEdit(false);

    if (!error) {
      setEditingId(null);
      loadTrades();
    }
  }

  async function handleDeleteTrade(trade: Trade) {
    if (!window.confirm(`למחוק לצמיתות את העסקה ${trade.symbol}?`)) return;
    const { error } = await supabase.from('trades').delete().eq('id', trade.id);
    if (!error) loadTrades();
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setChecking(false);
      return;
    }

    setUserEmail(user.email || '');
    setUserId(user.id);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') {
      loadTrades();
    }
  }

  async function handleAddTrade() {
    if (!symbol || !entryPrice || !stopLoss || !riskAmount) {
      setMessage('חסרים שדות');
      return;
    }

    setSaving(true);
    setMessage('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const entry = parseFloat(entryPrice);
    const stop = parseFloat(stopLoss);
    const risk = parseFloat(riskAmount);
    const shares = Math.floor(risk / Math.abs(entry - stop));

    const { error } = await supabase.from('trades').insert({
      created_by: user.id,
      direction,
      symbol: symbol.toUpperCase(),
      entry_price: entry,
      stop_loss: stop,
      risk_amount_usd: risk,
      shares_calculated: shares,
      current_price: entry,
      status: 'open',
    });

    setSaving(false);

    if (error) {
      setMessage('שגיאה: ' + error.message);
    } else {
      setMessage('העסקה נוספה בהצלחה!');
      setSymbol('');
      setEntryPrice('');
      setStopLoss('');
      loadTrades();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;
  }

  if (!userEmail) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <a href="/" className="nav-link">בית</a>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <a href="/login" style={{ color: 'var(--teal)' }}>כניסה</a></p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <a href="/" className="nav-link">בית</a>
            <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
          </div>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>אין הרשאת ניהול לחשבון המחובר ({userEmail})</p>
      </div>
    );
  }

  function renderActionsPanel(trade: Trade, isClosed: boolean) {
    if (editingId === trade.id) {
      return (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
          <div className="form-row" style={{ marginBottom: '10px' }}>
            <div className="field" style={{ marginBottom: 0 }}><label>סימבול</label><ClearableInput type="text" value={editSymbol} onChange={(e) => setEditSymbol(e.target.value)} onClear={() => setEditSymbol('')} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>מניות</label><ClearableInput type="number" value={editShares} onChange={(e) => setEditShares(e.target.value)} onClear={() => setEditShares('')} /></div>
          </div>
          <div className="form-row" style={{ marginBottom: isClosed ? '10px' : 0 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>מחיר כניסה</label><ClearableInput type="number" value={editEntry} onChange={(e) => setEditEntry(e.target.value)} onClear={() => setEditEntry('')} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>סטופ לוס</label><ClearableInput type="number" value={editStop} onChange={(e) => setEditStop(e.target.value)} onClear={() => setEditStop('')} /></div>
          </div>
          {isClosed && (
            <div className="field"><label>מחיר יציאה</label><ClearableInput type="number" value={editExitPrice} onChange={(e) => setEditExitPrice(e.target.value)} onClear={() => setEditExitPrice('')} /></div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => saveEdit(trade, isClosed)} disabled={savingEdit}>{savingEdit ? 'שומרים...' : 'שמירת שינויים'}</button>
            <button className="btn-outline" style={{ flex: 1 }} onClick={cancelEdit}>ביטול</button>
          </div>
        </div>
      );
    }

    if (!isClosed && closingId === trade.id) {
      return (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
          <div className="form-row" style={{ marginBottom: '10px' }}>
            <div className="field" style={{ marginBottom: 0 }}><label>מחיר סגירה</label><ClearableInput type="number" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} onClear={() => setExitPrice('')} placeholder="130.50" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>תאריך סגירה</label><input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleCloseTrade(trade)} disabled={closing || !exitPrice}>{closing ? 'סוגרים...' : 'אישור סגירה'}</button>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setClosingId(null); setExitPrice(''); setExitDate(''); }}>ביטול</button>
          </div>
        </div>
      );
    }

    if (!isClosed && addQtyId === trade.id) {
      return (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
          <div className="form-row" style={{ marginBottom: '10px' }}>
            <div className="field" style={{ marginBottom: 0 }}><label>מחיר כניסה נוסף</label><ClearableInput type="number" value={addQtyPrice} onChange={(e) => setAddQtyPrice(e.target.value)} onClear={() => setAddQtyPrice('')} placeholder="132.00" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>כמות נוספת</label><ClearableInput type="number" value={addQtyShares} onChange={(e) => setAddQtyShares(e.target.value)} onClear={() => setAddQtyShares('')} placeholder="20" /></div>
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>מחיר הכניסה יתעדכן לממוצע המשוקלל, והכמות תתווסף לעסקה הקיימת</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleAddQuantity(trade)} disabled={addingQty || !addQtyPrice || !addQtyShares}>{addingQty ? 'מוסיפים...' : 'אישור הוספה'}</button>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setAddQtyId(null)}>ביטול</button>
          </div>
        </div>
      );
    }

    if (!isClosed && sellQtyId === trade.id) {
      return (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
          <div className="form-row" style={{ marginBottom: '10px' }}>
            <div className="field" style={{ marginBottom: 0 }}><label>מחיר מכירה</label><ClearableInput type="number" value={sellQtyPrice} onChange={(e) => setSellQtyPrice(e.target.value)} onClear={() => setSellQtyPrice('')} placeholder="135.00" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>כמות למכירה (מתוך {trade.shares_calculated})</label><ClearableInput type="number" value={sellQtyShares} onChange={(e) => setSellQtyShares(e.target.value)} onClear={() => setSellQtyShares('')} placeholder="10" /></div>
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>החלק שנמכר יעבור לעסקאות סגורות, והיתרה תישאר פתוחה באותו מחיר כניסה</p>
          {sellQtyError && <p style={{ color: 'var(--loss)', fontSize: '12px', marginBottom: '10px' }}>{sellQtyError}</p>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => handlePartialSell(trade)} disabled={sellingQty || !sellQtyPrice || !sellQtyShares}>{sellingQty ? 'מוכרים...' : 'אישור מכירה'}</button>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setSellQtyId(null)}>ביטול</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        {!isClosed && (
          <>
            <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => { setClosingId(trade.id); setExitPrice(''); setExitDate(''); }}>
              סגירת עסקה
            </button>
            <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => startAddQty(trade)}>
              הוספת כמות
            </button>
            <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => startSellQty(trade)}>
              מכירה חלקית
            </button>
          </>
        )}
        <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={() => startEdit(trade)}>
          עריכה
        </button>
        <button className="btn-outline" style={{ padding: '8px 14px', fontSize: '13px', color: 'var(--loss)', borderColor: 'var(--loss)' }} onClick={() => handleDeleteTrade(trade)}>
          מחיקה
        </button>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/" className="nav-link">בית</Link>
          <Link href="/admin" className="nav-link">← לניהול</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <details className="section-collapse" open>
        <summary>
          <h2>עסקאות פתוחות בתיק</h2>
          <div className="summary-right"><span className="count">{openTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {openTrades.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>אין כרגע עסקאות פתוחות</p>}
        {openTrades.map((trade) => (
          <div className="trade-card" key={trade.id} style={{ marginBottom: '10px' }}>
            <div className="trade-top">
              <div className="trade-symbol-group">
                <div className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</div>
                <div className="trade-symbol">{trade.symbol}</div>
              </div>
            </div>
            <div className="trade-date-row">נפתחה ב-{formatDate(trade.opened_at)}</div>
            <div className="trade-details">
              <div className="detail-item"><div className="label">כניסה</div><div className="value">${trade.entry_price.toFixed(2)}</div></div>
              <div className="detail-item"><div className="label">סטופ</div><div className="value">${trade.stop_loss}</div></div>
              <div className="detail-item"><div className="label">מניות</div><div className="value">{trade.shares_calculated}</div></div>
            </div>
            {renderActionsPanel(trade, false)}
          </div>
        ))}
      </details>

      <details className="section-collapse" style={{ marginTop: '16px' }}>
        <summary>
          <h2>עסקאות סגורות בתיק</h2>
          <div className="summary-right"><span className="count">{closedTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {closedTrades.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>אין עדיין עסקאות סגורות</p>}
        {closedTrades.map((trade) => (
          <div className="trade-card" key={trade.id} style={{ marginBottom: '10px' }}>
            <div className="trade-top">
              <div className="trade-symbol-group">
                <div className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</div>
                <div className="trade-symbol">{trade.symbol}</div>
              </div>
            </div>
            <div className="trade-date-row">נפתחה ב-{formatDate(trade.opened_at)} · נסגרה ב-{formatDate(trade.closed_at)}</div>
            <div className="trade-details">
              <div className="detail-item"><div className="label">כניסה</div><div className="value">${trade.entry_price.toFixed(2)}</div></div>
              <div className="detail-item"><div className="label">יציאה</div><div className="value">${trade.exit_price?.toFixed(2)}</div></div>
              <div className="detail-item"><div className="label">מניות</div><div className="value">{trade.shares_calculated}</div></div>
            </div>
            {renderActionsPanel(trade, true)}
          </div>
        ))}
      </details>

      <div className="section-label" style={{ marginTop: '28px' }}><h2>הוספת עסקה חדשה לתיק</h2></div>
      <div className="journal-form">
        <div className="toggle-row">
          <div className={`toggle-opt ${direction === 'long' ? 'long-active' : ''}`} onClick={() => setDirection('long')} style={{ cursor: 'pointer' }}>לונג</div>
          <div className={`toggle-opt ${direction === 'short' ? 'short-active' : ''}`} onClick={() => setDirection('short')} style={{ cursor: 'pointer' }}>שורט</div>
        </div>
        <div className="field"><label>סימבול</label><ClearableInput type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} onClear={() => setSymbol('')} placeholder="MSFT" /></div>
        <div className="form-row">
          <div className="field"><label>מחיר כניסה</label><ClearableInput type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} onClear={() => setEntryPrice('')} placeholder="410.00" /></div>
          <div className="field"><label>סטופ לוס</label><ClearableInput type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} onClear={() => setStopLoss('')} placeholder="398.00" /></div>
        </div>
        <div className="field"><label>סיכון כספי ($)</label><ClearableInput type="number" value={riskAmount} onChange={(e) => setRiskAmount(e.target.value)} onClear={() => setRiskAmount('')} placeholder="500" /></div>
        <button className="btn-primary" onClick={handleAddTrade} disabled={saving}>{saving ? 'שומרים...' : 'פרסום לתיק'}</button>
        {message && <p style={{ marginTop: '10px', fontSize: '13px', color: message.includes('שגיאה') ? 'var(--loss)' : 'var(--profit)' }}>{message}</p>}
      </div>
    </div>
  );
}
