'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type UpcomingCharge = {
  name: string | null;
  email: string;
  chargeDate: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

export default function AdminRevenuePage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [pricePerCharge, setPricePerCharge] = useState(400);
  const [upcoming, setUpcoming] = useState<UpcomingCharge[]>([]);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

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
      setCount(data.count || 0);
      setTotalAmount(data.totalAmount || 0);
      setPricePerCharge(data.pricePerCharge || 400);
      setUpcoming(data.upcoming || []);
    }
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage('');
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/admin/sync-monday-subscribers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage('שגיאה: ' + (data.error || 'לא הצלחנו לסנכרן'));
      } else {
        const parts = [`${data.totalInMonday} בקבוצת הסוחרים במאנדיי`, `${data.created} חשבונות חדשים נוצרו`, `${data.updated} שודרגו למנוי`, `${data.alreadyOk} כבר תקינים`];
        if (data.skippedNoEmail?.length) parts.push(`${data.skippedNoEmail.length} בלי מייל (לא ניתן ליצור חשבון): ${data.skippedNoEmail.join(', ')}`);
        if (data.failed?.length) parts.push(`${data.failed.length} נכשלו`);
        setSyncMessage(parts.join(' · '));
        await loadData();
      }
    } catch (e) {
      setSyncMessage('שגיאה בסנכרון');
    }
    setSyncing(false);
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

      <div className="section-label"><h2>צפי הכנסה עד סוף החודש</h2></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        חיובים שעדיין אמורים לקרות מהיום ועד סוף החודש (לא כולל היום עצמו - זה כבר נראה ישירות מול Grow). זה צפי בלבד, לא הבטחה - תלוי שהחיוב בפועל יעבור. החישוב מבוסס על מנויים שקיימים באתר - מנוי שקיים רק במאנדיי (מעולם לא נכנס לאתר) יסונכרן אוטומטית פעם ביום, או מיד עם לחיצה על הכפתור למטה.
      </p>

      <button className="btn-outline" style={{ width: '100%', marginBottom: '10px' }} onClick={handleSync} disabled={syncing}>
        {syncing ? 'מסנכרנים מול Monday.com...' : '🔄 סנכרון מנויים ממאנדיי עכשיו'}
      </button>
      {syncMessage && (
        <p style={{ fontSize: '12px', color: syncMessage.startsWith('שגיאה') ? 'var(--loss)' : 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.6 }}>
          {syncMessage}
        </p>
      )}

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      {!loading && (
        <>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRight: '3px solid var(--profit)', borderRadius: '12px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--profit)' }}>₪{totalAmount.toLocaleString('he-IL')}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{count} חיובים צפויים · ₪{pricePerCharge} לחיוב</div>
          </div>

          {upcoming.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>אין חיובים צפויים נוספים החודש</p>
          )}

          {upcoming.map((u, i) => (
            <div key={i} className="admin-row">
              <div>
                <div className="name">{u.name || '—'}</div>
                <div className="email">{u.email}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-secondary)' }}>{formatDate(u.chargeDate)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
