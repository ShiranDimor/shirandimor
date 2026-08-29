'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type ChargeItem = {
  name: string | null;
  email: string | null;
  phone: string | null;
  contactKey: string | null;
  chargeDate: string;
  price: number;
  manuallySet: boolean;
};

type ChargeGroup = { count: number; totalAmount: number; items: ChargeItem[] };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

export default function AdminRevenuePage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [alreadyCharged, setAlreadyCharged] = useState<ChargeGroup>({ count: 0, totalAmount: 0, items: [] });
  const [upcoming, setUpcoming] = useState<ChargeGroup>({ count: 0, totalAmount: 0, items: [] });
  const [monthTotal, setMonthTotal] = useState(0);
  const [missingJoinDate, setMissingJoinDate] = useState<string[]>([]);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [chargedOpen, setChargedOpen] = useState(true);

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }

    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') loadData();
  }

  async function loadData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/revenue-projection', { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setAlreadyCharged(data.alreadyCharged || { count: 0, totalAmount: 0, items: [] });
      setUpcoming(data.upcoming || { count: 0, totalAmount: 0, items: [] });
      setMonthTotal(data.monthTotal || 0);
      setMissingJoinDate(data.missingJoinDate || []);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  // עדכון ידני של סטטוס חיוב - בנוסף לניחוש האוטומטי לפי תאריך, למקרה שהוא לא תואם את מה שבאמת קרה
  async function toggleCharged(contactKey: string | null, charged: boolean) {
    if (!contactKey) return;
    setUpdatingKey(contactKey);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/admin/revenue-projection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ contactKey, charged }),
    }).catch(() => {});
    await loadData();
    setUpdatingKey(null);
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

      <div className="section-label"><h2>הכנסת החודש</h2></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        מבוסס ישירות על קבוצת "קבוצת סוחרים" במאנדיי (תאריך הרשמה ועלות חודשית לכל מנוי), לא על חשבונות האתר - כך שכל מנוי אמיתי נספר, גם בלי מייל או חשבון באתר. זה תמיד צפי, לא הבטחה - תלוי שהחיוב בפועל יעבור.
      </p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      {!loading && (
        <>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '12px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }}>₪{monthTotal.toLocaleString('he-IL')}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>סך הכל צפי לחודש ({alreadyCharged.count + upcoming.count} חיובים)</div>
          </div>

          <div
            className="section-label"
            style={{ marginTop: '10px', cursor: 'pointer' }}
            onClick={() => setUpcomingOpen((v) => !v)}
          >
            <h2 style={{ fontSize: '15px' }}>
              <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: upcomingOpen ? 'rotate(90deg)' : 'rotate(0deg)', marginLeft: '4px' }}>›</span>
              עוד צפוי עד סוף החודש
            </h2>
            <span className="count">₪{upcoming.totalAmount.toLocaleString('he-IL')}</span>
          </div>
          {upcomingOpen && (
            <>
              {upcoming.items.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>אין חיובים צפויים נוספים החודש</p>
              )}
              {upcoming.items.map((u, i) => (
                <div key={i} className="admin-row">
                  <div>
                    <div className="name">{u.name || '—'}{u.manuallySet && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · עודכן ידנית</span>}</div>
                    <div className="email">{u.phone || u.email || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>{formatDate(u.chargeDate)} · ₪{u.price}</div>
                    <button
                      className="btn-outline"
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
                      onClick={() => toggleCharged(u.contactKey, true)}
                      disabled={!u.contactKey || updatingKey === u.contactKey}
                      title="סמן שכבר חויב בפועל"
                    >
                      {updatingKey === u.contactKey ? '...' : '✓ כבר חויב'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          <div
            className="section-label"
            style={{ marginTop: '26px', cursor: 'pointer' }}
            onClick={() => setChargedOpen((v) => !v)}
          >
            <h2 style={{ fontSize: '15px' }}>
              <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: chargedOpen ? 'rotate(90deg)' : 'rotate(0deg)', marginLeft: '4px' }}>›</span>
              כבר חויב החודש
            </h2>
            <span className="count">₪{alreadyCharged.totalAmount.toLocaleString('he-IL')}</span>
          </div>
          {chargedOpen && (
            <>
              {alreadyCharged.items.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>אין עדיין חיובים החודש</p>
              )}
              {alreadyCharged.items.map((u, i) => (
                <div key={i} className="admin-row">
                  <div>
                    <div className="name">{u.name || '—'}{u.manuallySet && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · עודכן ידנית</span>}</div>
                    <div className="email">{u.phone || u.email || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>{formatDate(u.chargeDate)} · ₪{u.price}</div>
                    <button
                      className="btn-outline"
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '11px' }}
                      onClick={() => toggleCharged(u.contactKey, false)}
                      disabled={!u.contactKey || updatingKey === u.contactKey}
                      title="סמן שעדיין לא חויב בפועל"
                    >
                      {updatingKey === u.contactKey ? '...' : 'לא חויב בפועל'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {missingJoinDate.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--loss)', marginTop: '20px', lineHeight: 1.6 }}>
              לא נכללו בחישוב (אין תאריך הרשמה במאנדיי): {missingJoinDate.join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
