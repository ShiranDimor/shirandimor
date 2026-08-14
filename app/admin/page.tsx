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
    const [pending, approved, openTrades] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lead'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'subscriber'),
      supabase.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

    setPendingCount(pending.count || 0);
    setApprovedCount(approved.count || 0);
    setOpenTradesCount(openTrades.count || 0);
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
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>אזור הניהול</h2></div>

      <div className="admin-tiles">
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
      </div>
    </div>
  );
}
