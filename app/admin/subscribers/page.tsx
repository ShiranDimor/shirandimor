'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type ApprovedSub = {
  id: string;
  email: string;
  full_name: string | null;
  subscription_status: string | null;
  subscription_started_at: string | null;
};

export default function AdminSubscribersPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [approvedSubs, setApprovedSubs] = useState<ApprovedSub[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleSyncSubscribers() {
    setSyncing(true);
    setSyncMessage('');

    const { data: { session } } = await supabase.auth.getSession();

    try {
      const res = await fetch('/api/sync-subscribers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        setSyncMessage('שגיאה: ' + (data.error || 'לא הצלחנו לבדוק'));
      } else {
        const removedText = data.removed > 0 ? ` (${data.removedNames.join(', ')})` : '';
        setSyncMessage(
          `נבדקו ${data.checked} מנויים · ${data.removed} הוסרו${removedText}` +
          (data.skippedNoPhone > 0 ? ` · ${data.skippedNoPhone} לא נבדקו (אין טלפון בכרטיס)` : '')
        );
        loadApprovedSubs();
      }
    } catch (e) {
      setSyncMessage('שגיאה בבדיקה מול מאנדיי');
    }

    setSyncing(false);
  }

  async function removeSubscriber(id: string, name: string) {
    if (!window.confirm(`למחוק לצמיתות את המנוי ${name}? הפעולה תסיר את הגישה שלו ואת כל נתוני היומן שלו.`)) return;
    setRemoving(id);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ userId: id }),
    });

    setRemoving(null);
    if (res.ok) {
      loadApprovedSubs();
    }
  }

  function toggleSort(col: 'date' | 'name') {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  }

  useEffect(() => {
    checkAdmin();
  }, []);

  async function loadApprovedSubs() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, subscription_status, subscription_started_at')
      .eq('role', 'subscriber')
      .order('subscription_started_at', { ascending: false });
    if (data) setApprovedSubs(data);
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
      loadApprovedSubs();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const sortedSubs = [...approvedSubs].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name') {
      return dir * (a.full_name || a.email).localeCompare(b.full_name || b.email, 'he');
    }
    return dir * (new Date(a.subscription_started_at || 0).getTime() - new Date(b.subscription_started_at || 0).getTime());
  });

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

      <div className="section-label"><h2>מנויים מאושרים</h2><span className="count">{approvedSubs.length}</span></div>

      <button className="btn-outline" style={{ width: '100%', marginBottom: '14px' }} onClick={handleSyncSubscribers} disabled={syncing}>
        {syncing ? 'בודקים מול מאנדיי...' : '🔄 בדיקת מנויים מול קבוצת הסוחרים במאנדיי'}
      </button>
      {syncMessage && (
        <p style={{ fontSize: '12px', color: syncMessage.startsWith('שגיאה') ? 'var(--loss)' : 'var(--text-secondary)', marginBottom: '14px', textAlign: 'center' }}>
          {syncMessage}
        </p>
      )}

      <div className="sort-header">
        <div className={`sort-col ${sortBy === 'name' ? 'active' : ''}`} onClick={() => toggleSort('name')}>
          שם <span className="sort-arrow">{sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </div>
        <div className={`sort-col ${sortBy === 'date' ? 'active' : ''}`} onClick={() => toggleSort('date')}>
          תאריך הצטרפות <span className="sort-arrow">{sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </div>
      </div>

      {approvedSubs.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>עדיין אין מנויים מאושרים</p>}
      {sortedSubs.map((sub) => (
        <div className="admin-row" key={sub.id} style={{ gap: '10px' }}>
          <Link href={`/admin/subscribers/${sub.id}`} style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <div>
              <div className="name">{sub.full_name || 'ללא שם'}</div>
              <div className="email">{sub.email}</div>
              <div className="email" style={{ marginTop: '2px' }}>
                תאריך הצטרפות: {sub.subscription_started_at ? new Date(sub.subscription_started_at).toLocaleDateString('he-IL') : '—'}
              </div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--profit)', fontWeight: 700 }}>{sub.subscription_status === 'active' ? 'פעיל' : sub.subscription_status}</span>
          </Link>
          <button
            className="btn-outline"
            style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--loss)', borderColor: 'var(--loss)', flexShrink: 0 }}
            onClick={() => removeSubscriber(sub.id, sub.full_name || sub.email)}
            disabled={removing === sub.id}
          >
            {removing === sub.id ? '...' : 'מחיקה'}
          </button>
        </div>
      ))}
    </div>
  );
}
