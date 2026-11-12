'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string;
  kind: string;
  audience: string;
  title: string;
  body: string;
  created_at: string;
  sent_count: number | null;
  failed_count: number | null;
  removed_stale_count: number | null;
  configured: boolean | null;
  confirmedCount: number;
};

const KIND_ICON: Record<string, string> = { trade: '📈', lesson: '📚', live: '🎥', announcement: '📣' };
const AUDIENCE_LABEL: Record<string, string> = { subscribers: 'מנויים', non_subscribers: 'לא-מנויים', everyone: 'כולם', admin: 'התראת מערכת (אלייך)' };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// מקבצת לפי שבוע קלנדרי (ראשון-שבת) כדי שההיסטוריה תהיה ניתנת לסריקה - בלי זה רשימה שמצטברת
// עם כל התראה חדשה הופכת לגלילה ארוכה ובלתי-ניתנת לשימוש אחרי כמה שבועות
function weekStart(d: Date): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function weekKey(d: Date): string {
  return weekStart(d).toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  const start = new Date(key);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  return `${fmt(start)} - ${fmt(end)}`;
}

function groupByWeek(rows: Row[]): [string, Row[]][] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = weekKey(new Date(r.created_at));
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export default function AdminNotificationsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

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

  async function loadRows() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/notifications', { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows || []);
    }
    setLoading(false);
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

      <div className="section-label"><h2>היסטוריית התראות</h2><span className="count">{rows.length}</span></div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
        &quot;נשלח&quot; = שירות הפוש (גוגל/אפל) הסכים לקבל את הבקשה. &quot;אושר&quot; = המכשיר בפועל הציג את ההתראה - אישור אמיתי, לא רק שליחה. פער בין השניים לא תמיד תקלה (יכול להיות מכשיר כבוי/בלי רשת כרגע), אבל פער חוזר אצל אותו מנוי/ה לאורך כמה התראות שווה בדיקה.
      </p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      {!loading && rows.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>עדיין אין היסטוריית התראות</p>}

      {!loading && groupByWeek(rows).map(([key, weekRows], i) => (
        <details key={key} className="section-collapse" open={i === 0}>
          <summary>
            <div><h2>{weekLabel(key)}</h2></div>
            <div className="summary-right">
              <span className="count">{weekRows.length}</span>
              <span className="collapse-chevron">▾</span>
            </div>
          </summary>
          <div style={{ marginTop: '10px' }}>
            {weekRows.map((r) => {
              const sent = r.sent_count ?? 0;
              const confirmed = r.confirmedCount;
              const gap = sent - confirmed;
              return (
                <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{KIND_ICON[r.kind] || '🔔'} {r.title}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        {AUDIENCE_LABEL[r.audience] || r.audience} · {formatDateTime(r.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'left', flexShrink: 0, fontSize: '12px' }}>
                      {r.configured === false ? (
                        <span style={{ color: 'var(--loss)', fontWeight: 700 }}>לא הוגדר</span>
                      ) : (
                        <>
                          <div>נשלח: <b>{sent}</b></div>
                          <div style={{ color: gap > 0 && sent > 0 ? 'var(--orange)' : 'var(--profit)' }}>אושר: <b>{confirmed}</b></div>
                          {(r.failed_count ?? 0) > 0 && <div style={{ color: 'var(--loss)' }}>נכשל: {r.failed_count}</div>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
