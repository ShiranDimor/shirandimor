'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type PendingLead = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [pendingLeads, setPendingLeads] = useState<PendingLead[]>([]);
  const [approving, setApproving] = useState<string | null>(null);

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

  async function approveSubscriber(id: string) {
    setApproving(id);
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'subscriber', subscription_status: 'active', subscription_started_at: new Date().toISOString() })
      .eq('id', id);
    setApproving(null);
    if (!error) loadPendingLeads();
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
    if (profile?.role === 'admin') loadPendingLeads();
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
    }
  }

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקת הרשאות...</p></div>;
  }

  if (!userEmail) {
    return (
      <div className="wrap">
        <header><div className="brand">מסחר <span>אחראי</span> במניות</div></header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>צריך להתחבר קודם. <a href="/login" style={{ color: 'var(--teal)' }}>כניסה</a></p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="wrap">
        <header><div className="brand">מסחר <span>אחראי</span> במניות</div></header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>אין לך הרשאת ניהול (מחוברת כ-{userEmail})</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header><div className="brand">מסחר <span>אחראי</span> במניות</div></header>

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
