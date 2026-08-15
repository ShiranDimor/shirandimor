'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';
import EquityCurve from '@/components/EquityCurve';
import StatsRing from '@/components/StatsRing';
import CalendarHeatmap from '@/components/CalendarHeatmap';

type Trade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  shares_calculated: number;
  exit_price: number | null;
  current_price: number | null;
  realized_pnl_usd: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  parent_trade_id: string | null;
};

function pctPnl(trade: Trade, isClosed: boolean) {
  const dirFactor = trade.direction === 'short' ? -1 : 1;
  const refPrice = isClosed ? trade.exit_price : (trade.current_price ?? trade.entry_price);
  if (refPrice == null) return null;
  return ((refPrice - trade.entry_price) / trade.entry_price) * 100 * dirFactor;
}

function usdPnl(trade: Trade, isClosed: boolean) {
  if (isClosed) return trade.realized_pnl_usd ?? null;
  const dirFactor = trade.direction === 'short' ? -1 : 1;
  const refPrice = trade.current_price ?? trade.entry_price;
  return (refPrice - trade.entry_price) * trade.shares_calculated * dirFactor;
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

const MONTH_LABELS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split('-');
  return `${MONTH_LABELS[parseInt(month, 10) - 1]} ${year}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AdminTradesPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const [profitMonthFilter, setProfitMonthFilter] = useState(currentMonthKey);
  const [lossMonthFilter, setLossMonthFilter] = useState(currentMonthKey);

  const [closingId, setClosingId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [closing, setClosing] = useState(false);

  function closeAllPopovers() {
    setClosingId(null);
    setEditingId(null);
    setAddQtyId(null);
    setSellQtyId(null);
  }

  function openEditPopover(trade: Trade, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const popW = 260;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - popW - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < 320 ? Math.max(8, rect.top - 8 - 320) : rect.bottom + 8;
    setPopoverPos({ top, left });
    closeAllPopovers();
    startEdit(trade);
  }

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

  const [showAddForm, setShowAddForm] = useState(false);
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
      .select('id, direction, symbol, entry_price, stop_loss, shares_calculated, exit_price, current_price, realized_pnl_usd, notes, opened_at, closed_at, parent_trade_id')
      .eq('status', 'open')
      .order('opened_at', { ascending: false });
    if (open) setOpenTrades(open);

    const { data: closed } = await supabase
      .from('trades')
      .select('id, direction, symbol, entry_price, stop_loss, shares_calculated, exit_price, current_price, realized_pnl_usd, notes, opened_at, closed_at, parent_trade_id')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });
    if (closed) setClosedTrades(closed);

    const { data: settings } = await supabase
      .from('portfolio_settings')
      .select('initial_balance')
      .eq('id', 1)
      .single();
    if (settings) setInitialBalance(Number(settings.initial_balance));
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
      setSellQtyError('למכירת כל הכמות יש להשתמש בכפתור "⚡ סגירה"');
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
      setShowAddForm(false);
      loadTrades();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const closedProfitTrades_ = closedTrades.filter((t) => (pctPnl(t, true) ?? 0) >= 0);
  const closedLossTrades_ = closedTrades.filter((t) => (pctPnl(t, true) ?? 0) < 0);

  const availableClosedMonths = Array.from(
    new Set([currentMonthKey(), ...closedTrades.filter((t) => t.closed_at).map((t) => monthKey(t.closed_at as string))])
  ).sort().reverse();

  const closedProfitTrades = profitMonthFilter === 'all'
    ? closedProfitTrades_
    : closedProfitTrades_.filter((t) => t.closed_at && monthKey(t.closed_at) === profitMonthFilter);

  const closedLossTrades = lossMonthFilter === 'all'
    ? closedLossTrades_
    : closedLossTrades_.filter((t) => t.closed_at && monthKey(t.closed_at) === lossMonthFilter);

  const winRate = closedTrades.length > 0 ? (closedProfitTrades_.length / closedTrades.length) * 100 : null;

  const closedPcts = closedTrades.map((t) => pctPnl(t, true) ?? 0);
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

  const now = new Date();
  const calResults = closedTrades
    .filter((t) => {
      if (!t.closed_at) return false;
      const d = new Date(t.closed_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((map, t) => {
      const day = new Date(t.closed_at as string).getDate();
      map.set(day, (map.get(day) ?? 0) + (t.realized_pnl_usd ?? 0));
      return map;
    }, new Map<number, number>());
  const calDayResults = Array.from(calResults.entries()).map(([day, pnl]) => ({ day, pnl }));

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

  function renderPopoverContent() {
    const trade = [...openTrades, ...closedTrades].find(
      (t) => t.id === closingId || t.id === editingId || t.id === addQtyId || t.id === sellQtyId
    );
    if (!trade) return null;
    const isClosed = trade.closed_at !== null;

    if (closingId === trade.id) {
      return (
        <>
          <div className="qp-title">⚡ סגירה מהירה · {trade.symbol}</div>
          <div className="qp-field"><label>מחיר סגירה</label><ClearableInput type="number" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} onClear={() => setExitPrice('')} placeholder="130.50" /></div>
          <div className="qp-field"><label>תאריך סגירה</label><input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} /></div>
          <div className="qp-row">
            <button className="qp-confirm" onClick={() => handleCloseTrade(trade)} disabled={closing || !exitPrice}>{closing ? 'סוגרים...' : 'אישור סגירה'}</button>
            <button className="qp-cancel" onClick={() => startEdit(trade)}>← חזרה</button>
          </div>
        </>
      );
    }

    if (editingId === trade.id) {
      return (
        <>
          <div className="qp-title">✎ עריכה · {trade.symbol}</div>
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
            <button className="qp-confirm" onClick={() => saveEdit(trade, isClosed)} disabled={savingEdit}>{savingEdit ? 'שומרים...' : 'שמירת שינויים'}</button>
            <button className="qp-cancel" onClick={cancelEdit}>ביטול</button>
          </div>
          <div className="qp-secondary">
            {!isClosed && <button onClick={() => { setEditingId(null); setClosingId(trade.id); setExitPrice(''); setExitDate(''); }}>⚡ סגירה</button>}
            {!isClosed && <button onClick={() => startAddQty(trade)}>הוספת כמות</button>}
            {!isClosed && <button onClick={() => startSellQty(trade)}>מכירה חלקית</button>}
            <button className="qp-danger" onClick={() => { handleDeleteTrade(trade); closeAllPopovers(); }}>מחיקת עסקה</button>
          </div>
        </>
      );
    }

    if (addQtyId === trade.id) {
      return (
        <>
          <div className="qp-title">+ הוספת כמות · {trade.symbol}</div>
          <div className="qp-field"><label>מחיר כניסה נוסף</label><ClearableInput type="number" value={addQtyPrice} onChange={(e) => setAddQtyPrice(e.target.value)} onClear={() => setAddQtyPrice('')} placeholder="132.00" /></div>
          <div className="qp-field"><label>כמות נוספת</label><ClearableInput type="number" value={addQtyShares} onChange={(e) => setAddQtyShares(e.target.value)} onClear={() => setAddQtyShares('')} placeholder="20" /></div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', margin: '4px 0 10px' }}>מחיר הכניסה יתעדכן לממוצע המשוקלל, והכמות תתווסף לעסקה הקיימת</p>
          <div className="qp-row">
            <button className="qp-confirm" onClick={() => handleAddQuantity(trade)} disabled={addingQty || !addQtyPrice || !addQtyShares}>{addingQty ? 'מוסיפים...' : 'אישור הוספה'}</button>
            <button className="qp-cancel" onClick={() => startEdit(trade)}>← חזרה</button>
          </div>
        </>
      );
    }

    if (sellQtyId === trade.id) {
      return (
        <>
          <div className="qp-title">− מכירה חלקית · {trade.symbol}</div>
          <div className="qp-field"><label>מחיר מכירה</label><ClearableInput type="number" value={sellQtyPrice} onChange={(e) => setSellQtyPrice(e.target.value)} onClear={() => setSellQtyPrice('')} placeholder="135.00" /></div>
          <div className="qp-field"><label>כמות למכירה (מתוך {trade.shares_calculated})</label><ClearableInput type="number" value={sellQtyShares} onChange={(e) => setSellQtyShares(e.target.value)} onClear={() => setSellQtyShares('')} placeholder="10" /></div>
          {sellQtyError && <p style={{ color: 'var(--loss)', fontSize: '12px', margin: '4px 0 10px' }}>{sellQtyError}</p>}
          <div className="qp-row">
            <button className="qp-confirm" onClick={() => handlePartialSell(trade)} disabled={sellingQty || !sellQtyPrice || !sellQtyShares}>{sellingQty ? 'מוכרים...' : 'אישור מכירה'}</button>
            <button className="qp-cancel" onClick={() => startEdit(trade)}>← חזרה</button>
          </div>
        </>
      );
    }

    return null;
  }

  function renderTradeTable(list: Trade[], isClosed: boolean, emptyText: string) {
    if (list.length === 0) return <p className="trade-table-empty">{emptyText}</p>;
    return (
      <div className="trade-table-wrap">
        <table className="trade-table">
          <thead>
            <tr>
              <th>סימבול</th>
              <th>נפתחה ב-</th>
              {isClosed && <th>נסגרה ב-</th>}
              <th>כניסה</th>
              <th>סטופ/יציאה</th>
              {!isClosed && <th>נוכחי</th>}
              <th>אחוז</th>
              <th>דולר</th>
              <th>מניות</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((trade) => {
              const pct = pctPnl(trade, isClosed);
              const usd = usdPnl(trade, isClosed);
              return (
                <tr key={trade.id}>
                  <td className="sym-cell">
                    <span className="sym-cell-inner">
                      <span className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</span>
                      <span>{trade.symbol}</span>
                    </span>
                  </td>
                  <td>{formatDate(trade.opened_at)}</td>
                  {isClosed && <td>{formatDate(trade.closed_at)}</td>}
                  <td>${trade.entry_price.toFixed(2)}</td>
                  <td>{isClosed ? `$${trade.exit_price?.toFixed(2)}` : `$${trade.stop_loss}`}</td>
                  {!isClosed && <td>${trade.current_price ?? trade.entry_price}</td>}
                  <td style={{ color: pct === null ? undefined : pct >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                  </td>
                  <td style={{ color: usd === null ? undefined : usd >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                    {usd === null ? '—' : `${usd >= 0 ? '+' : '-'}$${Math.abs(usd).toFixed(0)}`}
                  </td>
                  <td>{trade.shares_calculated}</td>
                  <td>
                    <button className="qa-btn edit" onClick={(e) => openEditPopover(trade, e)}>✎ עריכה</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

      <button className="add-btn" onClick={() => setShowAddForm(!showAddForm)}>+ עסקה חדשה</button>

      {showAddForm && (
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
      )}

      <div className="section-label"><h2>צמיחת התיק</h2></div>
      <div className="equity-card">
        <EquityCurve points={equityPoints} />
      </div>

      <div className="section-label"><h2>{now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</h2></div>
      <div className="equity-card" style={{ marginBottom: '28px' }}>
        <CalendarHeatmap year={now.getFullYear()} month={now.getMonth()} results={calDayResults} />
      </div>

      <div className="section-label"><h2>תובנות התיק</h2></div>
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

      <details className="section-collapse" open>
        <summary>
          <h2>עסקאות פתוחות בתיק</h2>
          <div className="summary-right"><span className="count">{openTrades.length}</span><span className="collapse-chevron">▾</span></div>
        </summary>
        {renderTradeTable(openTrades, false, 'אין כרגע עסקאות פתוחות')}
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
        {renderTradeTable(closedProfitTrades, true, 'אין עסקאות שנסגרו ברווח בטווח הזה')}
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
        {renderTradeTable(closedLossTrades, true, 'אין עסקאות שנסגרו בהפסד בטווח הזה')}
      </details>

      {(closingId || editingId || addQtyId || sellQtyId) && popoverPos && (
        <>
          <div className="qa-popover-backdrop" onClick={closeAllPopovers} />
          <div className="qa-popover" style={{ top: popoverPos.top, left: popoverPos.left }}>
            {renderPopoverContent()}
          </div>
        </>
      )}
    </div>
  );
}
