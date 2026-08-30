'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [openTradesCount, setOpenTradesCount] = useState(0);
  const [abandonedTotal, setAbandonedTotal] = useState(0);
  const [abandonedUnread, setAbandonedUnread] = useState(0);
  const [livesCount, setLivesCount] = useState(0);
  const [liveRegistrationsTotal, setLiveRegistrationsTotal] = useState(0);
  const [lessonsCount, setLessonsCount] = useState(0);
  const [revenueCount, setRevenueCount] = useState(0);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [crmCount, setCrmCount] = useState(0);
  const [crmFollowupDue, setCrmFollowupDue] = useState(0);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');

  async function handleRefreshAllPrices() {
    setRefreshing(true);
    setRefreshMessage('');

    const { data: { session } } = await supabase.auth.getSession();

    try {
      const res = await fetch('/api/refresh-all-prices', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        setRefreshMessage('שגיאה: ' + (data.error || 'לא הצלחנו לעדכן'));
      } else {
        setRefreshMessage(`עודכנו מחירים ל-${data.symbolsFetched} מניות · ${data.tradesUpdated} עסקאות בתיק · ${data.entriesUpdated} עסקאות ביומנים של מנויים`);
      }
    } catch (e) {
      setRefreshMessage('שגיאה בעדכון המחירים');
    }

    setRefreshing(false);
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
      loadCounts();
    }
  }

  async function loadCounts() {
    const { data: { session } } = await supabase.auth.getSession();

    const [pending, approved, openTrades, abandonedRes, livesRes, lessonsRes, revenueRes, crmContacts] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lead'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'subscriber'),
      supabase.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      fetch('/api/admin/trading-plan-abandoned/count', { headers: { Authorization: `Bearer ${session?.access_token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/lives', { headers: { Authorization: `Bearer ${session?.access_token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/lessons', { headers: { Authorization: `Bearer ${session?.access_token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/admin/revenue-projection', { headers: { Authorization: `Bearer ${session?.access_token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      supabase.from('crm_contacts').select('id, follow_up_at'),
    ]);

    setPendingCount(pending.count || 0);
    setApprovedCount(approved.count || 0);
    setOpenTradesCount(openTrades.count || 0);
    setAbandonedTotal(abandonedRes?.total || 0);
    setAbandonedUnread(abandonedRes?.unread || 0);
    const lives: { registrationsCount: number }[] = livesRes?.lives || [];
    setLivesCount(lives.length);
    setLiveRegistrationsTotal(lives.reduce((sum, l) => sum + (l.registrationsCount || 0), 0));
    setLessonsCount((lessonsRes?.lessons || []).length);
    setRevenueCount((revenueRes?.alreadyCharged?.count || 0) + (revenueRes?.upcoming?.count || 0));
    setRevenueTotal(revenueRes?.monthTotal || 0);
    const crmRows: { follow_up_at: string | null }[] = crmContacts.data || [];
    const today = new Date().toISOString().slice(0, 10);
    setCrmCount(crmRows.length);
    setCrmFollowupDue(crmRows.filter((r) => r.follow_up_at && r.follow_up_at <= today).length);
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
        <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <a href="/" className="nav-link">בית</a>
          <a href="/account" className="nav-link">הגדרת סיסמה</a>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>אזור הניהול</h2></div>

      <div className="admin-tiles">
        <Link href="/admin/crm" className={`admin-tile ${crmFollowupDue > 0 ? 'attention' : ''}`}>
          <div className="at-icon">🗂️</div>
          <div className="at-title">CRM - לידים ומנויים</div>
          <div className="at-count">{crmFollowupDue > 0 ? `${crmFollowupDue} פולואפ להיום · ` : ''}{crmCount} אנשי קשר</div>
        </Link>

        <Link href="/admin/trades" className="admin-tile">
          <div className="at-icon">📊</div>
          <div className="at-title">תיק מסחר</div>
          <div className="at-count">{openTradesCount} עסקאות פתוחות</div>
        </Link>

        <Link href="/admin/pending" className={`admin-tile ${pendingCount > 0 ? 'attention' : ''}`}>
          <div className="at-icon">🕒</div>
          <div className="at-title">מנויים לאישור</div>
          <div className="at-count">{pendingCount} ממתינים</div>
        </Link>

        <Link href="/admin/subscribers" className="admin-tile">
          <div className="at-icon">✅</div>
          <div className="at-title">מנויים מאושרים</div>
          <div className="at-count">{approvedCount} פעילים</div>
        </Link>

        <Link href="/admin/trading-plan" className={`admin-tile ${abandonedUnread > 0 ? 'attention' : ''}`}>
          <div className="at-icon">📝</div>
          <div className="at-title">לידים - תוכנית מסחר</div>
          <div className="at-count">{abandonedUnread > 0 ? `${abandonedUnread} חדשים · ` : ''}{abandonedTotal} סה״כ</div>
        </Link>

        <Link href="/admin/lessons" className="admin-tile">
          <div className="at-icon">🎥</div>
          <div className="at-title">ספריית שיעורים</div>
          <div className="at-count">{lessonsCount} שיעורים</div>
        </Link>

        <Link href="/admin/lives" className="admin-tile">
          <div className="at-icon">📡</div>
          <div className="at-title">לייבים</div>
          <div className="at-count">{liveRegistrationsTotal} נרשמים · {livesCount} לייבים</div>
        </Link>

        <Link href="/admin/analytics" className="admin-tile">
          <div className="at-icon">📈</div>
          <div className="at-title">משפך המרה</div>
          <div className="at-count">אנליטיקס</div>
        </Link>

        <Link href="/admin/revenue" className="admin-tile">
          <div className="at-icon">💰</div>
          <div className="at-title">צפי הכנסה החודש</div>
          <div className="at-count">₪{revenueTotal.toLocaleString('he-IL')} · {revenueCount} חיובים</div>
        </Link>

        <Link href="/admin/support-bot" className="admin-tile">
          <div className="at-icon">🤖</div>
          <div className="at-title">בוט תמיכה - בדיקה</div>
          <div className="at-count">כלי פנימי</div>
        </Link>
      </div>

      <button className="btn-outline" style={{ width: '100%', marginTop: '8px' }} onClick={handleRefreshAllPrices} disabled={refreshing}>
        {refreshing ? 'מעדכנים מחירים בכל האתר...' : '🔄 עדכון מחירים בכל האתר'}
      </button>
      {refreshMessage && (
        <p style={{ fontSize: '12px', color: refreshMessage.startsWith('שגיאה') ? 'var(--loss)' : 'var(--profit)', marginTop: '10px', textAlign: 'center' }}>
          {refreshMessage}
        </p>
      )}
    </div>
  );
}
