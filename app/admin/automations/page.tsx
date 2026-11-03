'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type AutomationRule = {
  key: string;
  name: string;
  schedule_label: string;
  enabled: boolean;
  last_run_at: string | null;
};

function formatDateTime(iso: string | null) {
  if (!iso) return 'עוד לא רץ';
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAutomationsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState('');

  useEffect(() => {
    checkAdmin();
  }, []);

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }

    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') loadRules();
  }

  async function loadRules() {
    setLoading(true);
    const res = await fetch('/api/admin/automations', { headers: await authHeader() });
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules || []);
    }
    setLoading(false);
  }

  async function toggleRule(key: string, enabled: boolean) {
    setTogglingKey(key);
    const res = await fetch(`/api/admin/automations/${key}`, { method: 'PATCH', headers: await authHeader(), body: JSON.stringify({ enabled }) });
    setTogglingKey('');
    if (res.ok) {
      const data = await res.json();
      setRules((prev) => prev.map((r) => (r.key === key ? data.rule : r)));
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

      <div className="section-label"><h2>אוטומציות</h2><span className="count">{rules.length}</span></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        כל אוטומציה מכינה טיוטה בלוח המודעות ושולחת לך התראת פוש לבדיקה - שום דבר לא מתפרסם או נשלח לבד, בלי אישור שלך ב-/admin/announcements.
      </p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      {!loading && rules.map((rule) => (
        <div className="admin-row" key={rule.key} style={{ gap: '10px' }}>
          <div>
            <div className="name">{rule.name}</div>
            <div className="email">{rule.schedule_label}</div>
            <div className="email" style={{ marginTop: '2px' }}>רץ לאחרונה: {formatDateTime(rule.last_run_at)}</div>
          </div>
          <button
            className="btn-outline"
            style={{ padding: '6px 14px', fontSize: '12.5px', flexShrink: 0, color: rule.enabled ? 'var(--profit)' : 'var(--text-tertiary)' }}
            onClick={() => toggleRule(rule.key, !rule.enabled)}
            disabled={togglingKey === rule.key}
          >
            {togglingKey === rule.key ? '…' : rule.enabled ? '✅ מופעל' : '⛔ כבוי'}
          </button>
        </div>
      ))}
    </div>
  );
}
