'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type BlockedContact = {
  id: string;
  phone_normalized: string;
  name: string | null;
  reason: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export default function AdminBlockedContactsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [contacts, setContacts] = useState<BlockedContact[]>([]);
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
    if (profile?.role === 'admin') loadContacts();
  }

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function loadContacts() {
    setLoading(true);
    const res = await fetch('/api/admin/blocked-contacts', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setContacts(data.contacts || []);
    }
    setLoading(false);
  }

  async function handleAdd() {
    if (!phone.trim()) { setError('חסר מספר טלפון'); return; }
    setSaving(true);
    setError('');
    const res = await fetch('/api/admin/blocked-contacts', {
      method: 'POST',
      headers: await authHeader(),
      body: JSON.stringify({ phone: phone.trim(), name: name.trim() || null, reason: reason.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'שגיאה בהוספה');
      return;
    }
    setPhone(''); setName(''); setReason('');
    loadContacts();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('להסיר את החסימה?')) return;
    setDeletingId(id);
    const res = await fetch('/api/admin/blocked-contacts', { method: 'DELETE', headers: await authHeader(), body: JSON.stringify({ id }) });
    setDeletingId('');
    if (res.ok) setContacts((prev) => prev.filter((c) => c.id !== id));
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

      <div className="section-label"><h2>אנשי קשר חסומים</h2><span className="count">{contacts.length}</span></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        מספר חסום לא יכול להירשם לקבוצת עדכונים, ל-7 ימי ניסיון, ללייבים, ולא יקבל מענה משיחה עם דור. זה לא נוגע במנויים פעילים קיימים.
      </p>

      <div className="tp-question-card">
        <div className="tp-question-title">חסימת מספר חדש</div>
        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="מספר טלפון" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="שם (לא חובה)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="tp-text-input" style={{ minHeight: 'auto', marginBottom: '10px' }} placeholder="סיבה (לא חובה, רק לזכרונך)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p style={{ color: 'var(--loss)', fontSize: '13px', marginBottom: '10px' }}>{error}</p>}
        <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? 'חוסם...' : 'חסימה'}</button>
      </div>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loading && contacts.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין כרגע אנשי קשר חסומים</p>}

      {contacts.map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{c.name || 'ללא שם'} · {c.phone_normalized}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
              {c.reason ? `${c.reason} · ` : ''}נחסם ב-{formatDate(c.created_at)}
            </div>
          </div>
          <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} className="btn-outline" style={{ padding: '6px 12px', fontSize: '12.5px' }}>
            {deletingId === c.id ? '…' : 'הסרת חסימה'}
          </button>
        </div>
      ))}
    </div>
  );
}
