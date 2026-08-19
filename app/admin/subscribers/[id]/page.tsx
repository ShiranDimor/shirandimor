'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import StatsRing from '@/components/StatsRing';
import EquityCurve from '@/components/EquityCurve';
import CalendarHeatmap from '@/components/CalendarHeatmap';
import ClearableInput from '@/components/ClearableInput';

type JournalEntry = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  status: string;
  exit_price: number | null;
  current_price: number | null;
  shares: number;
  realized_pnl_usd: number | null;
  opened_at: string;
  closed_at: string | null;
  parent_entry_id: string | null;
};

function unrealizedUsd(e: JournalEntry) {
  if (!e.current_price) return null;
  return (e.current_price - e.entry_price) * e.shares * (e.direction === 'short' ? -1 : 1);
}

function unrealizedPct(e: JournalEntry) {
  if (!e.current_price) return null;
  return ((e.current_price - e.entry_price) / e.entry_price) * 100 * (e.direction === 'short' ? -1 : 1);
}

type Profile = {
  full_name: string | null;
  email: string;
  phone: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

export default function AdminViewSubscriberJournal() {
  const params = useParams();
  const subscriberId = params.id as string;

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [subscriber, setSubscriber] = useState<Profile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [tradingPlanId, setTradingPlanId] = useState<string | null | undefined>(undefined);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonthIdx, setCalMonthIdx] = useState(() => new Date().getMonth());

  const [showAddForm, setShowAddForm] = useState(false);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [symbol, setSymbol] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [riskAmount, setRiskAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const [closingId, setClosingId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
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

  function closeAllPopovers() {
    setClosingId(null);
    setEditingId(null);
    setAddQtyId(null);
    setSellQtyId(null);
  }

  function openEditPopover(entry: JournalEntry, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const popW = 260;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - popW - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < 320 ? Math.max(8, rect.top - 8 - 320) : rect.bottom + 8;
    setPopoverPos({ top, left });
    closeAllPopovers();
    startEdit(entry);
  }

  function goPrevMonth() {
    if (calMonthIdx === 0) { setCalYear((y) => y - 1); setCalMonthIdx(11); }
    else setCalMonthIdx((m) => m - 1);
  }

  function goNextMonth() {
    if (calMonthIdx === 11) { setCalYear((y) => y + 1); setCalMonthIdx(0); }
    else setCalMonthIdx((m) => m + 1);
  }

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setChecking(false);
      return;
    }

    setUserEmail(user.email || '');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') {
      loadData();
    }
  }

  async function loadData() {
    const [{ data: sub }, { data: journalEntries }] = await Promise.all([
      supabase.from('profiles').select('full_name, email, phone').eq('id', subscriberId).single(),
      supabase.from('journal_entries').select('*').eq('user_id', subscriberId).order('opened_at', { ascending: false }),
    ]);

    if (sub) setSubscriber(sub);
    if (journalEntries) setEntries(journalEntries);
    setLoadingData(false);

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      fetch(`/api/admin/subscriber-trading-plan?subscriberId=${subscriberId}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setTradingPlanId(data?.id ?? null))
        .catch(() => setTradingPlanId(null));
    } else {
      setTradingPlanId(null);
    }
  }

  const calcShares = entryPrice && stopLoss && riskAmount
    ? Math.floor(parseFloat(riskAmount) / Math.abs(parseFloat(entryPrice) - parseFloat(stopLoss)))
    : 0;

  async function handleAdd() {
    if (!symbol || !entryPrice || !stopLoss || !riskAmount) return;
    setSaving(true);

    const { error } = await supabase.from('journal_entries').insert({
      user_id: subscriberId,
      direction,
      symbol: symbol.toUpperCase(),
      entry_price: parseFloat(entryPrice),
      stop_loss: parseFloat(stopLoss),
      risk_amount_usd: parseFloat(riskAmount),
      shares: calcShares,
      status: 'open',
    });

    setSaving(false);

    if (!error) {
      setSymbol(''); setEntryPrice(''); setStopLoss(''); setRiskAmount('');
      setShowAddForm(false);
      loadData();
    }
  }

  // ממזג עסקה למניה יחידה: מכירה חלקית יוצרת שבר "סגור" נפרד; כשהיתרה מתאפסת כל השברים מתאחדים לעסקה סגורה אחת עם מחיר יציאה וכניסה ממוצעים
  async function realizeShares(entry: JournalEntry, sellShares: number, sellPrice: number, closedAtIso: string) {
    const dirFactor = entry.direction === 'short' ? -1 : 1;
    const realizedForSlice = (sellPrice - entry.entry_price) * sellShares * dirFactor;
    const remaining = entry.shares - sellShares;

    if (remaining > 0) {
      await supabase.from('journal_entries').insert({
        user_id: subscriberId,
        direction: entry.direction,
        symbol: entry.symbol,
        entry_price: entry.entry_price,
        stop_loss: entry.stop_loss,
        status: 'closed',
        exit_price: sellPrice,
        shares: sellShares,
        realized_pnl_usd: realizedForSlice,
        parent_entry_id: entry.parent_entry_id || entry.id,
        opened_at: entry.opened_at,
        closed_at: closedAtIso,
      });
      await supabase.from('journal_entries').update({ shares: remaining }).eq('id', entry.id);
      return;
    }

    const rootId = entry.parent_entry_id || entry.id;
    const { data: siblings } = await supabase
      .from('journal_entries')
      .select('id, shares, exit_price, realized_pnl_usd')
      .eq('parent_entry_id', rootId)
      .neq('id', entry.id);

    const allSiblings = siblings || [];
    const totalShares = allSiblings.reduce((s, x) => s + x.shares, 0) + sellShares;
    const weightedExit = (allSiblings.reduce((s, x) => s + x.shares * (x.exit_price ?? 0), 0) + sellShares * sellPrice) / totalShares;
    const totalPnl = allSiblings.reduce((s, x) => s + (x.realized_pnl_usd ?? 0), 0) + realizedForSlice;

    await supabase.from('journal_entries').update({
      status: 'closed',
      shares: totalShares,
      exit_price: weightedExit,
      realized_pnl_usd: totalPnl,
      closed_at: closedAtIso,
    }).eq('id', entry.id);

    if (allSiblings.length > 0) {
      await supabase.from('journal_entries').delete().in('id', allSiblings.map((s) => s.id));
    }
  }

  async function handleClose(entry: JournalEntry) {
    if (!exitPrice) return;
    setClosing(true);

    await realizeShares(entry, entry.shares, parseFloat(exitPrice), exitDate ? new Date(exitDate).toISOString() : new Date().toISOString());

    setClosing(false);
    setClosingId(null);
    setExitPrice('');
    setExitDate('');
    loadData();
  }

  function startAddQty(entry: JournalEntry) {
    setAddQtyId(entry.id);
    setAddQtyPrice('');
    setAddQtyShares('');
  }

  async function handleAddQuantity(entry: JournalEntry) {
    const price = parseFloat(addQtyPrice);
    const shares = parseFloat(addQtyShares);
    if (!price || !shares) return;
    setAddingQty(true);

    const newShares = entry.shares + shares;
    const newEntryPrice = (entry.entry_price * entry.shares + price * shares) / newShares;

    const { error } = await supabase
      .from('journal_entries')
      .update({ entry_price: newEntryPrice, shares: newShares })
      .eq('id', entry.id);

    setAddingQty(false);

    if (!error) {
      setAddQtyId(null);
      loadData();
    }
  }

  function startSellQty(entry: JournalEntry) {
    setSellQtyId(entry.id);
    setSellQtyPrice('');
    setSellQtyShares('');
    setSellQtyError('');
  }

  async function handlePartialSell(entry: JournalEntry) {
    const price = parseFloat(sellQtyPrice);
    const shares = parseFloat(sellQtyShares);

    if (!price || !shares) return;
    if (shares >= entry.shares) {
      setSellQtyError('למכירת כל הכמות יש להשתמש בכפתור "⚡ סגירה"');
      return;
    }

    setSellingQty(true);
    await realizeShares(entry, shares, price, new Date().toISOString());
    setSellingQty(false);
    setSellQtyId(null);
    loadData();
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
      loadData();
    }
  }

  async function handleDelete(entry: JournalEntry) {
    if (!window.confirm(`למחוק לצמיתות את העסקה ${entry.symbol}?`)) return;
    const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id);
    if (!error) loadData();
  }

  function startEditName() {
    setNameInput(subscriber?.full_name || '');
    setEditingName(true);
  }

  async function saveName() {
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ full_name: nameInput.trim() || null }).eq('id', subscriberId);
    setSavingName(false);
    if (!error) {
      setSubscriber((prev) => (prev ? { ...prev, full_name: nameInput.trim() || null } : prev));
      setEditingName(false);
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

  if (loadingData) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>;
  }

  const openEntries = entries.filter((e) => e.status === 'open');
  const closedEntries = entries.filter((e) => e.status === 'closed');
  const closedProfit = closedEntries.filter((e) => (e.realized_pnl_usd ?? 0) >= 0);
  const closedLoss = closedEntries.filter((e) => (e.realized_pnl_usd ?? 0) < 0);

  const winRate = closedEntries.length > 0 ? (closedProfit.length / closedEntries.length) * 100 : null;
  const avgPnl = closedEntries.length > 0
    ? closedEntries.reduce((s, e) => s + (e.realized_pnl_usd ?? 0), 0) / closedEntries.length
    : null;
  const avgWin = closedProfit.length > 0
    ? closedProfit.reduce((s, e) => s + (e.realized_pnl_usd ?? 0), 0) / closedProfit.length
    : 0;
  const avgLoss = closedLoss.length > 0
    ? Math.abs(closedLoss.reduce((s, e) => s + (e.realized_pnl_usd ?? 0), 0) / closedLoss.length)
    : 0;
  const riskReward = avgLoss > 0 ? avgWin / avgLoss : null;
  const daysToClose = closedEntries
    .filter((e) => e.closed_at)
    .map((e) => (new Date(e.closed_at as string).getTime() - new Date(e.opened_at).getTime()) / 86400000);
  const avgDaysToClose = daysToClose.length > 0 ? daysToClose.reduce((s, x) => s + x, 0) / daysToClose.length : null;

  const equityPoints = (() => {
    const chronological = closedEntries
      .filter((e) => e.closed_at)
      .slice()
      .sort((a, b) => new Date(a.closed_at as string).getTime() - new Date(b.closed_at as string).getTime());
    let running = 0;
    const points = [{ date: 'התחלה', value: 0 }];
    for (const e of chronological) {
      running += e.realized_pnl_usd ?? 0;
      points.push({ date: formatDate(e.closed_at), value: Math.round(running) });
    }
    return points;
  })();

  const calItems = closedEntries
    .filter((e) => {
      if (!e.closed_at) return false;
      const d = new Date(e.closed_at);
      return d.getFullYear() === calYear && d.getMonth() === calMonthIdx;
    })
    .map((e) => {
      const cost = e.entry_price * e.shares;
      const usd = e.realized_pnl_usd ?? 0;
      return {
        day: new Date(e.closed_at as string).getDate(),
        symbol: e.symbol,
        direction: e.direction,
        usd,
        pct: cost > 0 ? (usd / cost) * 100 : 0,
      };
    });

  function renderPopoverContent() {
    const entry = entries.find((en) => en.id === closingId || en.id === editingId || en.id === addQtyId || en.id === sellQtyId);
    if (!entry) return null;

    if (closingId === entry.id) {
      return (
        <>
          <div className="qp-title">⚡ סגירה מהירה · {entry.symbol}</div>
          <div className="qp-field"><label>מחיר סגירה</label><ClearableInput type="number" value={exitPrice} onChange={(ev) => setExitPrice(ev.target.value)} onClear={() => setExitPrice('')} placeholder="130.50" /></div>
          <div className="qp-field"><label>תאריך סגירה</label><input type="date" value={exitDate} onChange={(ev) => setExitDate(ev.target.value)} /></div>
          <div className="qp-row">
            <button className="qp-confirm" onClick={() => handleClose(entry)} disabled={closing || !exitPrice}>{closing ? 'סוגרים...' : 'אישור סגירה'}</button>
            <button className="qp-cancel" onClick={() => startEdit(entry)}>← חזרה</button>
          </div>
        </>
      );
    }

    if (editingId === entry.id) {
      return (
        <>
          <div className="qp-title">✎ עריכה · {entry.symbol}</div>
          <div className="form-row" style={{ marginBottom: '10px' }}>
            <div className="field" style={{ marginBottom: 0 }}><label>סימבול</label><ClearableInput type="text" value={editSymbol} onChange={(ev) => setEditSymbol(ev.target.value)} onClear={() => setEditSymbol('')} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>מניות</label><ClearableInput type="number" value={editShares} onChange={(ev) => setEditShares(ev.target.value)} onClear={() => setEditShares('')} /></div>
          </div>
          <div className="form-row" style={{ marginBottom: entry.status === 'closed' ? '10px' : 0 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>מחיר כניסה</label><ClearableInput type="number" value={editEntry} onChange={(ev) => setEditEntry(ev.target.value)} onClear={() => setEditEntry('')} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>סטופ לוס</label><ClearableInput type="number" value={editStop} onChange={(ev) => setEditStop(ev.target.value)} onClear={() => setEditStop('')} /></div>
          </div>
          {entry.status === 'closed' && (
            <div className="field"><label>מחיר יציאה</label><ClearableInput type="number" value={editExitPrice} onChange={(ev) => setEditExitPrice(ev.target.value)} onClear={() => setEditExitPrice('')} /></div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button className="qp-confirm" onClick={() => saveEdit(entry)} disabled={savingEdit}>{savingEdit ? 'שומרים...' : 'שמירת שינויים'}</button>
            <button className="qp-cancel" onClick={cancelEdit}>ביטול</button>
          </div>
          <div className="qp-secondary">
            {entry.status === 'open' && <button onClick={() => { setEditingId(null); setClosingId(entry.id); setExitPrice(''); setExitDate(''); }}>⚡ סגירה</button>}
            {entry.status === 'open' && <button onClick={() => startAddQty(entry)}>הוספת כמות</button>}
            {entry.status === 'open' && <button onClick={() => startSellQty(entry)}>מכירה חלקית</button>}
            <button className="qp-danger" onClick={() => { handleDelete(entry); closeAllPopovers(); }}>מחיקת עסקה</button>
          </div>
        </>
      );
    }

    if (addQtyId === entry.id) {
      return (
        <>
          <div className="qp-title">+ הוספת כמות · {entry.symbol}</div>
          <div className="qp-field"><label>מחיר כניסה נוסף</label><ClearableInput type="number" value={addQtyPrice} onChange={(ev) => setAddQtyPrice(ev.target.value)} onClear={() => setAddQtyPrice('')} placeholder="132.00" /></div>
          <div className="qp-field"><label>כמות נוספת</label><ClearableInput type="number" value={addQtyShares} onChange={(ev) => setAddQtyShares(ev.target.value)} onClear={() => setAddQtyShares('')} placeholder="20" /></div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', margin: '4px 0 10px' }}>מחיר הכניסה יתעדכן לממוצע המשוקלל, והכמות תתווסף לעסקה הקיימת</p>
          <div className="qp-row">
            <button className="qp-confirm" onClick={() => handleAddQuantity(entry)} disabled={addingQty || !addQtyPrice || !addQtyShares}>{addingQty ? 'מוסיפים...' : 'אישור הוספה'}</button>
            <button className="qp-cancel" onClick={() => startEdit(entry)}>← חזרה</button>
          </div>
        </>
      );
    }

    if (sellQtyId === entry.id) {
      return (
        <>
          <div className="qp-title">− מכירה חלקית · {entry.symbol}</div>
          <div className="qp-field"><label>מחיר מכירה</label><ClearableInput type="number" value={sellQtyPrice} onChange={(ev) => setSellQtyPrice(ev.target.value)} onClear={() => setSellQtyPrice('')} placeholder="135.00" /></div>
          <div className="qp-field"><label>כמות למכירה (מתוך {entry.shares})</label><ClearableInput type="number" value={sellQtyShares} onChange={(ev) => setSellQtyShares(ev.target.value)} onClear={() => setSellQtyShares('')} placeholder="10" /></div>
          {sellQtyError && <p style={{ color: 'var(--loss)', fontSize: '12px', margin: '4px 0 10px' }}>{sellQtyError}</p>}
          <div className="qp-row">
            <button className="qp-confirm" onClick={() => handlePartialSell(entry)} disabled={sellingQty || !sellQtyPrice || !sellQtyShares}>{sellingQty ? 'מוכרים...' : 'אישור מכירה'}</button>
            <button className="qp-cancel" onClick={() => startEdit(entry)}>← חזרה</button>
          </div>
        </>
      );
    }

    return null;
  }

  function renderTable(list: JournalEntry[], emptyText: string) {
    if (list.length === 0) return <p className="trade-table-empty">{emptyText}</p>;
    return (
      <div className="trade-table-wrap">
        <table className="trade-table">
          <thead>
            <tr>
              <th>סימבול</th>
              <th>נפתחה ב-</th>
              <th>נסגרה ב-</th>
              <th>כניסה</th>
              <th>סטופ/יציאה</th>
              <th>מניות</th>
              <th>תוצאה</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td className="sym-cell">
                  <span className="sym-cell-inner">
                    <span className={`direction-mark ${e.direction}`}>{e.direction === 'long' ? 'L' : 'S'}</span>
                    <span>{e.symbol}</span>
                  </span>
                </td>
                <td>{formatDate(e.opened_at)}</td>
                <td>{e.status === 'closed' ? formatDate(e.closed_at) : '—'}</td>
                <td>${e.entry_price.toFixed(2)}</td>
                <td>{e.status === 'closed' ? `$${e.exit_price?.toFixed(2)}` : `$${e.stop_loss}`}</td>
                <td>{e.shares}</td>
                <td className="pnl-cell" style={{ color: e.status === 'open' ? (unrealizedUsd(e) !== null ? (unrealizedUsd(e)! >= 0 ? 'var(--profit)' : 'var(--loss)') : 'var(--text-secondary)') : (e.realized_pnl_usd ?? 0) >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                  {e.status === 'open'
                    ? unrealizedUsd(e) !== null
                      ? <>{unrealizedPct(e)! >= 0 ? '+' : ''}{unrealizedPct(e)!.toFixed(2)}%<span className="usd-sub">{unrealizedUsd(e)! >= 0 ? '+' : '-'}${Math.abs(unrealizedUsd(e)!).toFixed(0)}</span></>
                      : 'פתוחה'
                    : `${(e.realized_pnl_usd ?? 0) >= 0 ? '+' : ''}$${(e.realized_pnl_usd ?? 0).toFixed(2)}`}
                </td>
                <td>
                  <button className="qa-btn edit" onClick={(ev) => openEditPopover(e, ev)}>✎ עריכה</button>
                </td>
              </tr>
            ))}
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
          <Link href="/admin/subscribers" className="nav-link">← למנויים</Link>
          {tradingPlanId && (
            <Link href={`/my-plan/${tradingPlanId}`} target="_blank" rel="noopener noreferrer" className="nav-link" style={{ color: '#E8A33D' }}>
              תוכנית מסחר ←
            </Link>
          )}
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label">
        {editingName ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
            <ClearableInput
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onClear={() => setNameInput('')}
              placeholder="שם מלא"
              style={{ flex: 1 }}
            />
            <button className="qp-confirm" style={{ padding: '8px 14px' }} onClick={saveName} disabled={savingName}>{savingName ? 'שומרים...' : 'שמירה'}</button>
            <button className="qp-cancel" style={{ padding: '8px 14px' }} onClick={() => setEditingName(false)}>ביטול</button>
          </div>
        ) : (
          <>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {subscriber?.full_name || 'ללא שם'}
              <button onClick={startEditName} title="עריכת שם" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                </svg>
              </button>
            </h2>
            <span className="count">עריכה כאדמין</span>
          </>
        )}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '10px', fontFamily: 'var(--font-mono)' }}>{subscriber?.email}</p>

      {tradingPlanId === null && (
        <p style={{ marginBottom: '20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px' }}>עדיין לא מילא/ה תוכנית מסחר</span>
          {subscriber?.phone && (
            <a
              href={`https://wa.me/972${subscriber.phone.replace(/\D/g, '').replace(/^0/, '')}?text=${encodeURIComponent(
                `היי${subscriber.full_name ? ` ${subscriber.full_name.split(' ')[0]}` : ''}, שמתי לב שעוד לא בנית תוכנית מסחר אישית באתר - זה לוקח רק כמה דקות וממש שווה את זה: https://www.shirandimor.com/trading-plan`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', fontSize: '12.5px', fontWeight: 700, color: '#fff', background: '#25D366', borderRadius: '8px', padding: '7px 12px', textDecoration: 'none' }}
            >
              שליחת תזכורת בוואטסאפ ←
            </a>
          )}
        </p>
      )}

      <button className="add-btn" onClick={() => setShowAddForm(!showAddForm)}>+ עסקה חדשה</button>

      {showAddForm && (
        <div className="journal-form">
          <div className="toggle-row">
            <div className={`toggle-opt ${direction === 'long' ? 'long-active' : ''}`} onClick={() => setDirection('long')} style={{ cursor: 'pointer' }}>לונג</div>
            <div className={`toggle-opt ${direction === 'short' ? 'short-active' : ''}`} onClick={() => setDirection('short')} style={{ cursor: 'pointer' }}>שורט</div>
          </div>
          <div className="field"><label>סימבול</label><ClearableInput type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} onClear={() => setSymbol('')} placeholder="AAPL" /></div>
          <div className="form-row">
            <div className="field"><label>מחיר כניסה</label><ClearableInput type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} onClear={() => setEntryPrice('')} placeholder="127.32" /></div>
            <div className="field"><label>סטופ לוס</label><ClearableInput type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} onClear={() => setStopLoss('')} placeholder="121.00" /></div>
          </div>
          <div className="field"><label>סיכון כספי ($)</label><ClearableInput type="number" value={riskAmount} onChange={(e) => setRiskAmount(e.target.value)} onClear={() => setRiskAmount('')} placeholder="500" /></div>
          <div style={{ background: 'var(--bg-void)', border: '1px solid var(--border-hairline)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>כמות מניות מחושבת</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--teal)' }}>{calcShares || '—'}</span>
          </div>
          <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'שומרים...' : 'שמירת עסקה'}</button>
        </div>
      )}

      {entries.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>המנוי עדיין לא הזין עסקאות ביומן שלו</p>
      ) : (
        <>
          <div className="section-label"><h2>צמיחת היומן</h2></div>
          <div className="equity-card">
            <EquityCurve points={equityPoints} />
          </div>

          <div className="section-label"><h2>לוח שנה</h2></div>
          <div className="equity-card" style={{ marginBottom: '28px' }}>
            <CalendarHeatmap year={calYear} month={calMonthIdx} items={calItems} onPrevMonth={goPrevMonth} onNextMonth={goNextMonth} />
          </div>

          <details className="section-collapse" open>
            <summary>
              <h2>עסקאות פתוחות</h2>
              <div className="summary-right"><span className="count">{openEntries.length}</span><span className="collapse-chevron">▾</span></div>
            </summary>
            {renderTable(openEntries, 'אין כרגע עסקאות פתוחות')}
          </details>

          <details className="section-collapse">
            <summary>
              <h2>נסגרו ברווח</h2>
              <div className="summary-right"><span className="count">{closedProfit.length}</span><span className="collapse-chevron">▾</span></div>
            </summary>
            {renderTable(closedProfit, 'אין עדיין עסקאות שנסגרו ברווח')}
          </details>

          <details className="section-collapse">
            <summary>
              <h2>נסגרו בהפסד</h2>
              <div className="summary-right"><span className="count">{closedLoss.length}</span><span className="collapse-chevron">▾</span></div>
            </summary>
            {renderTable(closedLoss, 'אין עדיין עסקאות שנסגרו בהפסד')}
          </details>

          <div className="section-label" style={{ marginTop: '28px' }}><h2>תובנות</h2></div>
          <div className="insights-panel">
            <div className="insights-ring-row">
              <StatsRing
                percent={winRate ?? 0}
                label={`${closedEntries.length} עסקאות סגורות`}
                sublabel="ביומן של המנוי"
              />
            </div>
            <div className="insight-grid">
              <div className="insight-tile">
                <div className="iv">{avgDaysToClose !== null ? avgDaysToClose.toFixed(1) : '—'}</div>
                <div className="il">ימי החזקה בממוצע</div>
              </div>
              <div className="insight-tile">
                <div className="iv" style={{ color: avgPnl !== null ? (avgPnl >= 0 ? 'var(--profit)' : 'var(--loss)') : undefined }}>
                  {avgPnl !== null ? `${avgPnl >= 0 ? '+' : ''}$${avgPnl.toFixed(0)}` : '—'}
                </div>
                <div className="il">רווח/הפסד ממוצע לעסקה</div>
              </div>
              <div className="insight-tile">
                <div className="iv">{riskReward !== null ? `1:${riskReward.toFixed(1)}` : '—'}</div>
                <div className="il">יחס סיכון-סיכוי</div>
              </div>
              <div className="insight-tile">
                <div className="iv">{openEntries.length}</div>
                <div className="il">עסקאות פתוחות</div>
              </div>
            </div>
          </div>
        </>
      )}

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
