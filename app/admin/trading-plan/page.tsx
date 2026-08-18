'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type AbandonedRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  computedProfile: string | null;
  stepsReached: number;
  totalSteps: number;
  viewed: boolean;
};

type DetailAnswer = { id: string; title: string; value: string };

function stepLabel(r: AbandonedRow) {
  if (r.status === 'completed') return r.computedProfile ? `השלים/ה - פרופיל: ${r.computedProfile}` : 'השלים/ה את השאלון';
  if (!r.stepsReached) return 'בטופס הפרטים, עדיין לפני תחילת השאלון';
  return `בשלב ${r.stepsReached} מתוך ${r.totalSteps} בשאלון`;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  return `לפני ${days} ימים`;
}

export default function AdminTradingPlanAbandonedPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [rows, setRows] = useState<AbandonedRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailAnswer[]>>({});
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') {
      loadRows();
    }
  }

  async function loadRows() {
    setLoadingRows(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/trading-plan-abandoned', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows || []);
    }
    setLoadingRows(false);
  }

  async function toggleDetails(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!details[id]) {
      setLoadingDetailsId(id);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/trading-plan-abandoned/${id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDetails((prev) => ({ ...prev, [id]: data.answers || [] }));
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, viewed: true } : r)));
      }
      setLoadingDetailsId(null);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`למחוק לצמיתות את הרשומה של ${label}?`)) return;
    setDeletingId(id);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/trading-plan-abandoned/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });

    setDeletingId(null);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (expandedId === id) setExpandedId(null);
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

  const completed = rows.filter((r) => r.status === 'completed');
  const abandoned = rows.filter((r) => r.status === 'in_progress');
  const contactable = abandoned.filter((r) => r.phone || r.email);
  const noContact = abandoned.filter((r) => !r.phone && !r.email);

  function renderRow(r: AbandonedRow) {
    const waLink = r.phone ? `https://wa.me/972${r.phone.replace(/\D/g, '').replace(/^0/, '')}` : null;
    const isExpanded = expandedId === r.id;
    const rowAnswers = details[r.id];

    return (
      <div key={r.id} className="admin-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <div className="name">
              {r.name || 'ללא שם'}
              {!r.viewed && (
                <span style={{ marginRight: '8px', fontSize: '10.5px', fontWeight: 700, color: '#0b0d12', background: 'var(--teal)', borderRadius: '5px', padding: '2px 6px', verticalAlign: 'middle' }}>
                  חדש
                </span>
              )}
            </div>
            {r.phone && <div className="email">{r.phone}</div>}
            {r.email && <div className="email">{r.email}</div>}
            <div className="email" style={{ marginTop: '2px' }}>
              {r.status === 'completed' ? stepLabel(r) : `עצר/ה ${stepLabel(r)}`} · {r.source ? `מקור: ${r.source} · ` : ''}עדכון אחרון: {timeAgo(r.status === 'completed' ? (r.completed_at || r.updated_at) : r.updated_at)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button type="button" className="btn-outline" style={{ padding: '8px 12px', fontSize: '12.5px' }} onClick={() => toggleDetails(r.id)}>
              {isExpanded ? 'סגירה' : 'פרטים מלאים'}
            </button>
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="approve-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
                וואטסאפ ←
              </a>
            )}
            <button
              className="row-delete-btn"
              onClick={() => handleDelete(r.id, r.name || r.phone || r.email || 'ללא שם')}
              disabled={deletingId === r.id}
              title="מחיקת רשומה"
            >
              {deletingId === r.id ? '…' : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--loss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border, #2a2e37)' }}>
            {loadingDetailsId === r.id && <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>טוענים תשובות...</p>}
            {rowAnswers && rowAnswers.length === 0 && <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>עדיין אין תשובות שמורות</p>}
            {rowAnswers && rowAnswers.map((a) => (
              <div key={a.id} style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{a.title}</div>
                <div style={{ fontSize: '13.5px', color: 'var(--text-primary, #fff)' }}>{a.value}</div>
              </div>
            ))}
          </div>
        )}
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

      <div className="section-label"><h2>לידים - תוכנית מסחר</h2><span className="count">{rows.length}</span></div>
      <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
        כל מי שמילא את השאלון - גם מי שהשלים וגם מי שננטש באמצע. {rows.filter((r) => !r.viewed).length > 0 ? `${rows.filter((r) => !r.viewed).length} מהם חדשים - עדיין לא נפתחו. ` : ''}
        "פרטים מלאים" מציג את כל התשובות, ומסמן שנצפה.
      </p>

      {loadingRows && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingRows && rows.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין כרגע אף אחד</p>}

      {completed.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '8px' }}><h2 style={{ fontSize: '15px' }}>השלימו את השאלון</h2></div>
          {completed.map(renderRow)}
        </>
      )}

      {contactable.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '24px' }}><h2 style={{ fontSize: '15px' }}>ננטשו באמצע - יש פרטי קשר</h2></div>
          {contactable.map(renderRow)}
        </>
      )}

      {noContact.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '24px' }}><h2 style={{ fontSize: '15px' }}>ננטשו באמצע - בלי פרטי קשר (עצרו בדיוק בטופס הפרטים עצמו)</h2></div>
          {noContact.map(renderRow)}
        </>
      )}
    </div>
  );
}
