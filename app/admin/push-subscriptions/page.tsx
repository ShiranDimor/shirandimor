'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string;
  deviceIds: string[];
  deviceCount: number;
  createdAt: string;
  isSubscriber: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export default function AdminPushSubscriptionsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [rows, setRows] = useState<Row[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [leadCount, setLeadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState('');

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
    if (profile?.role === 'admin') loadRows();
  }

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function loadRows() {
    setLoading(true);
    const res = await fetch('/api/admin/push-subscriptions', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows || []);
      setSubscriberCount(data.subscriberCount || 0);
      setLeadCount(data.leadCount || 0);
    }
    setLoading(false);
  }

  async function handleDelete(row: Row) {
    if (!window.confirm(row.deviceCount > 1 ? `להסיר את איש הקשר הזה מרשימת ההתראות (${row.deviceCount} מכשירים)?` : 'להסיר את המכשיר הזה מרשימת ההתראות?')) return;
    setDeletingId(row.id);
    const res = await fetch('/api/admin/push-subscriptions', { method: 'DELETE', headers: await authHeader(), body: JSON.stringify({ ids: row.deviceIds }) });
    setDeletingId('');
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
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

  const subscriberRows = rows.filter((r) => r.isSubscriber);
  const leadRows = rows.filter((r) => !r.isSubscriber);

  function renderRow(r: Row) {
    return (
      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{r.name || 'ללא שם'}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {[r.phone, r.email].filter(Boolean).join(' · ') || '—'} · הופעל ב-{formatDate(r.createdAt)}
            {r.deviceCount > 1 && ` · ${r.deviceCount} מכשירים`}
          </div>
        </div>
        <button onClick={() => handleDelete(r)} disabled={deletingId === r.id} className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }}>
          {deletingId === r.id ? '…' : 'הסרה'}
        </button>
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

      <div className="section-label"><h2>ניהול התראות פוש</h2><span className="count">{rows.length}</span></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        כל מי שהפעיל התראות באתר - מנויים (מקבלים פרטים מלאים) ולידים שהגיעו דרך שער ההרשמה (מקבלים גרסה מטושטשת, גם נוצר להם ליד במאנדיי). מחיקה כאן מפסיקה לשלוח להם התראות, אבל לא מוחקת אותם ממאנדיי.
      </p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      {!loading && (
        <>
          <div className="section-label"><h2>מנויים</h2><span className="count">{subscriberCount}</span></div>
          {subscriberRows.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>אין עדיין מנויים עם התראות פעילות</p>}
          {subscriberRows.map(renderRow)}

          <div className="section-label" style={{ marginTop: '24px' }}><h2>לידים (לא מנויים)</h2><span className="count">{leadCount}</span></div>
          {leadRows.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין עדיין לידים עם התראות פעילות</p>}
          {leadRows.map(renderRow)}
        </>
      )}
    </div>
  );
}
