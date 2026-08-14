'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type PendingLead = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

type ApprovedSub = {
  id: string;
  email: string;
  full_name: string | null;
  subscription_status: string | null;
};

type OpenTrade = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  shares_calculated: number;
};

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [pendingLeads, setPendingLeads] = useState<PendingLead[]>([]);
  const [approvedSubs, setApprovedSubs] = useState<ApprovedSub[]>([]);
  const [approving, setApproving] = useState<string | null>(null);

  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [closing, setClosing] = useState(false);

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

  async function loadPendingLeads() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .eq('role', 'lead')
      .order('created_at', { ascending: false });
    if (data) setPendingLeads(data);
  }

  async function loadApprovedSubs() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, subscription_status')
      .eq('role', 'subscriber')
      .order('subscription_started_at', { ascending: false });
    if (data) setApprovedSubs(data);
  }

  async function loadOpenTrades() {
    const { data } = await supabase
      .from('trades')
      .select('id, direction, symbol, entry_price, stop_loss, shares_calculated')
      .eq('status', 'open')
      .order('opened_at', { ascending: false });
    if (data) setOpenTrades(data);
  }

  async function handleCloseTrade(trade: OpenTrade) {
    if (!exitPrice) return;
    setClosing(true);

    const exit = parseFloat(exitPrice);
    const dirFactor = trade.direction === 'short' ? -1 : 1;
    const realizedPnl = (exit - trade.entry_price) * trade.shares_calculated * dirFactor;

    const { error } = await supabase
      .from('trades')
      .update({
        status: 'closed',
        exit_price: exit,
        closed_at: exitDate ? new Date(exitDate).toISOString() : new Date().toISOString(),
        realized_pnl_usd: realizedPnl,
      })
      .eq('id', trade.id);

    setClosing(false);

    if (!error) {
      setClosingId(null);
      setExitPrice('');
      setExitDate('');
      loadOpenTrades();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  async function approveSubscriber(id: string) {
    setApproving(id);
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'subscriber', subscription_status: 'active', subscription_started_at: new Date().toISOString() })
      .eq('id', id);
    setApproving(null);
    if (!error) {
      loadPendingLeads();
      loadApprovedSubs();
    }
  }

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
      loadPendingLeads();
      loadApprovedSubs();
      loadOpenTrades();
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
      loadOpenTrades();
    }
  }

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקת הרשאות...</p></div>;
  }

  if (!userEmail) {
    return (
      <div className="wrap">
        <header><a href="/" className="brand">מסחר <span>אחראי</span> במניות</a></header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <a href="/login" style={{ color: 'var(--teal)' }}>כניסה</a></p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>אין לך הרשאת ניהול (מחוברת כ-{userEmail})</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <a href="/account" className="nav-link">הגדרת סיסמה</a>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>ממתינים לאישור</h2><span className="count">{pendingLeads.length}</span></div>
      {pendingLeads.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>אין כרגע ממתינים</p>}
      {pendingLeads.map((lead) => (
        <div className="admin-row" key={lead.id}>
          <div>
            <div className="name">{lead.full_name || 'ללא שם'}</div>
            <div className="email">{lead.email}</div>
          </div>
          <button className="approve-btn" onClick={() => approveSubscriber(lead.id)} disabled={approving === lead.id}>
            {approving === lead.id ? 'מאשרת...' : 'אישור כמנוי'}
          </button>
        </div>
      ))}

      <div className="section-label" style={{ marginTop: '28px' }}><h2>מנויים מאושרים</h2><span className="count">{approvedSubs.length}</span></div>
      {approvedSubs.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>עדיין אין מנויים מאושרים</p>}
      {approvedSubs.map((sub) => (
        <div className="admin-row" key={sub.id}>
          <div>
            <div className="name">{sub.full_name || 'ללא שם'}</div>
            <div className="email">{sub.email}</div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--profit)', fontWeight: 700 }}>{sub.subscription_status === 'active' ? 'פעיל' : sub.subscription_status}</span>
        </div>
      ))}

      <div className="section-label" style={{ marginTop: '28px' }}><h2>עסקאות פתוחות בתיק</h2><span className="count">{openTrades.length}</span></div>
      {openTrades.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>אין כרגע עסקאות פתוחות</p>}
      {openTrades.map((trade) => (
        <div className="trade-card" key={trade.id} style={{ marginBottom: '10px' }}>
          <div className="trade-top">
            <div className="trade-symbol-group">
              <div className={`direction-mark ${trade.direction}`}>{trade.direction === 'long' ? 'L' : 'S'}</div>
              <div className="trade-symbol">{trade.symbol}</div>
            </div>
          </div>
          <div className="trade-details">
            <div className="detail-item"><div className="label">כניסה</div><div className="value">${trade.entry_price}</div></div>
            <div className="detail-item"><div className="label">סטופ</div><div className="value">${trade.stop_loss}</div></div>
            <div className="detail-item"><div className="label">מניות</div><div className="value">{trade.shares_calculated}</div></div>
          </div>

          {closingId === trade.id ? (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-hairline)' }}>
              <div className="form-row" style={{ marginBottom: '10px' }}>
                <div className="field" style={{ marginBottom: 0 }}><label>מחיר סגירה</label><input type="number" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} placeholder="130.50" /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>תאריך סגירה</label><input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleCloseTrade(trade)} disabled={closing || !exitPrice}>{closing ? 'סוגרת...' : 'אישור סגירה'}</button>
                <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setClosingId(null); setExitPrice(''); setExitDate(''); }}>ביטול</button>
              </div>
            </div>
          ) : (
            <button
              className="btn-outline"
              style={{ marginTop: '10px', padding: '8px', fontSize: '13px' }}
              onClick={() => { setClosingId(trade.id); setExitPrice(''); setExitDate(''); }}
            >
              סגירת עסקה
            </button>
          )}
        </div>
      ))}

      <div className="section-label" style={{ marginTop: '28px' }}><h2>הוספת עסקה חדשה לתיק</h2></div>
      <div className="journal-form">
        <div className="toggle-row">
          <div className={`toggle-opt ${direction === 'long' ? 'long-active' : ''}`} onClick={() => setDirection('long')} style={{ cursor: 'pointer' }}>לונג</div>
          <div className={`toggle-opt ${direction === 'short' ? 'short-active' : ''}`} onClick={() => setDirection('short')} style={{ cursor: 'pointer' }}>שורט</div>
        </div>
        <div className="field"><label>סימבול</label><input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MSFT" /></div>
        <div className="form-row">
          <div className="field"><label>מחיר כניסה</label><input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="410.00" /></div>
          <div className="field"><label>סטופ לוס</label><input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="398.00" /></div>
        </div>
        <div className="field"><label>סיכון כספי ($)</label><input type="number" value={riskAmount} onChange={(e) => setRiskAmount(e.target.value)} placeholder="500" /></div>
        <button className="btn-primary" onClick={handleAddTrade} disabled={saving}>{saving ? 'שומרת...' : 'פרסום לתיק'}</button>
        {message && <p style={{ marginTop: '10px', fontSize: '13px', color: message.includes('שגיאה') ? 'var(--loss)' : 'var(--profit)' }}>{message}</p>}
      </div>
    </div>
  );
}
