'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type PendingLead = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export default function AdminPendingPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [pendingLeads, setPendingLeads] = useState<PendingLead[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

    if (!error) {
      const { data: { session } } = await supabase.auth.getSession();
      fetch('/api/admin/notify-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ userId: id }),
      }).catch(() => {});
      loadPendingLeads();
    }
    setApproving(null);
  }

  async function rejectLead(id: string, name: string) {
    if (!window.confirm(`למחוק לצמיתות את הבקשה של ${name}?`)) return;
    setDeleting(id);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ userId: id }),
    });

    setDeleting(null);
    if (res.ok) {
      loadPendingLeads();
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
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const sortedLeads = [...pendingLeads].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name') {
      return dir * (a.full_name || a.email).localeCompare(b.full_name || b.email, 'he');
    }
    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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

      <div className="section-label"><h2>מנויים לאישור</h2><span className="count">{pendingLeads.length}</span></div>

      <div className="sort-header">
        <div className={`sort-col ${sortBy === 'name' ? 'active' : ''}`} onClick={() => toggleSort('name')}>
          שם <span className="sort-arrow">{sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </div>
        <div className={`sort-col ${sortBy === 'date' ? 'active' : ''}`} onClick={() => toggleSort('date')}>
          תאריך הצטרפות <span className="sort-arrow">{sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </div>
      </div>

      {pendingLeads.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>אין כרגע ממתינים</p>}
      {sortedLeads.map((lead) => (
        <div className="admin-row" key={lead.id}>
          <div>
            <div className="name">{lead.full_name || 'ללא שם'}</div>
            <div className="email">{lead.email}</div>
            <div className="email" style={{ marginTop: '2px' }}>תאריך הצטרפות: {new Date(lead.created_at).toLocaleDateString('he-IL')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button className="approve-btn" onClick={() => approveSubscriber(lead.id)} disabled={approving === lead.id || deleting === lead.id}>
              {approving === lead.id ? 'מאשרים...' : 'אישור כמנוי'}
            </button>
            <button
              className="row-delete-btn"
              style={{ fontSize: '17px' }}
              onClick={() => rejectLead(lead.id, lead.full_name || lead.email)}
              disabled={approving === lead.id || deleting === lead.id}
              title="מחיקת בקשה"
            >
              {deleting === lead.id ? '…' : '🗑'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
