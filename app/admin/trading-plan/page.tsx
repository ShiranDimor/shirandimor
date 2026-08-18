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
  created_at: string;
  updated_at: string;
  stepsReached: number;
  totalSteps: number;
};

function stepLabel(r: AbandonedRow) {
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

  const contactable = rows.filter((r) => r.phone || r.email);
  const noContact = rows.filter((r) => !r.phone && !r.email);

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

      <div className="section-label"><h2>ננטשו באמצע תוכנית מסחר</h2><span className="count">{rows.length}</span></div>
      <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
        מי שהתחיל למלא את השאלון ועדיין לא סיים. מי שהשאיר נייד או מייל אפשר ליצור איתו קשר ישירות.
      </p>

      {loadingRows && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}
      {!loadingRows && rows.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין כרגע אף אחד באמצע</p>}

      {contactable.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '8px' }}><h2 style={{ fontSize: '15px' }}>יש פרטי קשר</h2></div>
          {contactable.map((r) => {
            const waLink = r.phone ? `https://wa.me/972${r.phone.replace(/\D/g, '').replace(/^0/, '')}` : null;
            return (
              <div className="admin-row" key={r.id}>
                <div>
                  <div className="name">{r.name || 'ללא שם'}</div>
                  {r.phone && <div className="email">{r.phone}</div>}
                  {r.email && <div className="email">{r.email}</div>}
                  <div className="email" style={{ marginTop: '2px' }}>
                    עצר/ה {stepLabel(r)} · {r.source ? `מקור: ${r.source} · ` : ''}עדכון אחרון: {timeAgo(r.updated_at)}
                  </div>
                </div>
                {waLink && (
                  <a href={waLink} target="_blank" rel="noopener noreferrer" className="approve-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
                    וואטסאפ ←
                  </a>
                )}
              </div>
            );
          })}
        </>
      )}

      {noContact.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: '24px' }}><h2 style={{ fontSize: '15px' }}>בלי פרטי קשר (עצרו בדיוק בטופס הפרטים עצמו)</h2></div>
          {noContact.map((r) => (
            <div className="admin-row" key={r.id}>
              <div>
                <div className="name">ללא פרטי קשר</div>
                <div className="email">
                  עצר/ה {stepLabel(r)} · {r.source ? `מקור: ${r.source} · ` : ''}עדכון אחרון: {timeAgo(r.updated_at)}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
