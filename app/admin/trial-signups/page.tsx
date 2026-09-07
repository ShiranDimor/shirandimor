'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type TrialSignup = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  handled: boolean;
};

export default function AdminTrialSignupsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [signups, setSignups] = useState<TrialSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  async function loadSignups() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/trial-signups', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSignups(data.signups || []);
    }
    setLoading(false);
  }

  async function toggleHandled(id: string, handled: boolean) {
    setUpdatingId(id);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/trial-signups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id, handled }),
    });
    if (res.ok) {
      setSignups((prev) => prev.map((s) => (s.id === id ? { ...s, handled } : s)));
    }
    setUpdatingId(null);
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
      loadSignups();
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

  const pending = signups.filter((s) => !s.handled).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const handled = signups.filter((s) => s.handled).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  function renderRow(s: TrialSignup) {
    return (
      <div className="admin-row" key={s.id}>
        <div>
          <div className="name">{s.name}</div>
          <div className="email">{s.phone}</div>
          <div className="email" style={{ marginTop: '2px' }}>נרשם/ה: {new Date(s.created_at).toLocaleDateString('he-IL')} {new Date(s.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a href={`https://wa.me/972${s.phone.replace(/\D/g, '').replace(/^0/, '')}`} target="_blank" rel="noopener noreferrer" className="btn-outline" style={{ width: 'auto', padding: '8px 14px' }}>
            וואטסאפ
          </a>
          <button
            className="btn-outline"
            style={{ width: 'auto', padding: '8px 14px' }}
            onClick={() => toggleHandled(s.id, !s.handled)}
            disabled={updatingId === s.id}
          >
            {updatingId === s.id ? '...' : s.handled ? '↩ החזרה לממתינים' : '✔ סימון כטופל'}
          </button>
        </div>
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

      <div className="section-label"><h2>ממתינים לטיפול</h2><span className="count">{pending.length}</span></div>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loading && pending.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>אין כרגע ממתינים</p>}
      {pending.map(renderRow)}

      <div className="section-label" style={{ marginTop: '28px' }}><h2>טופלו</h2><span className="count">{handled.length}</span></div>

      {!loading && handled.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין אין מטופלים</p>}
      {handled.map(renderRow)}
    </div>
  );
}
