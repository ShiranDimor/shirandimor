'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Counts = Record<string, number>;
type RangeKey = 'today' | '7d' | '30d' | 'all';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'היום' },
  { key: '7d', label: '7 ימים' },
  { key: '30d', label: '30 יום' },
  { key: 'all', label: 'הכל' },
];

const EVENT_LABELS: { key: string; label: string; icon: string }[] = [
  { key: 'free_group_lead_submitted', label: 'ליד לקבוצת העדכונים', icon: '📝' },
  { key: 'whatsapp_group_open_click', label: 'פתיחת קבוצת הוואטסאפ', icon: '💬' },
  { key: 'trading_plan_started', label: 'התחלת שאלון תוכנית מסחר', icon: '🚀' },
  { key: 'trading_plan_completed', label: 'השלמת שאלון תוכנית מסחר', icon: '✅' },
  { key: 'payment_link_click', label: 'לחיצה על קישור תשלום', icon: '💳' },
];

function sinceFor(range: RangeKey): string | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  const days = range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export default function AdminAnalyticsPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [range, setRange] = useState<RangeKey>('7d');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const loadCounts = useCallback(async (r: RangeKey) => {
    setLoadingCounts(true);
    const { data: { session } } = await supabase.auth.getSession();
    const since = sinceFor(r);
    const url = since ? `/api/admin/funnel-stats?since=${encodeURIComponent(since)}` : '/api/admin/funnel-stats';

    const res = await fetch(url, { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (res.ok) {
      const data = await res.json();
      setCounts(data.counts || null);
    }
    setLoadingCounts(false);
  }, []);

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }

    setUserEmail(user.email || '');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    setIsAdmin(profile?.role === 'admin');
    setChecking(false);

    if (profile?.role === 'admin') loadCounts(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }

  function handleRangeChange(r: RangeKey) {
    setRange(r);
    loadCounts(r);
  }

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;
  }

  if (!userEmail || !isAdmin) {
    return (
      <div className="wrap">
        <header>
          <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
          <Link href="/" className="nav-link">בית</Link>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>
          {!userEmail ? <>צריך להתחבר קודם. <Link href="/login" style={{ color: 'var(--teal)' }}>כניסה</Link></> : 'אין הרשאת ניהול לחשבון המחובר'}
        </p>
      </div>
    );
  }

  const leads = counts?.free_group_lead_submitted ?? 0;
  const whatsappOpens = counts?.whatsapp_group_open_click ?? 0;
  const started = counts?.trading_plan_started ?? 0;
  const completed = counts?.trading_plan_completed ?? 0;
  const paymentClicks = counts?.payment_link_click ?? 0;

  return (
    <div className="wrap">
      <header>
        <Link href="/" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/admin" className="nav-link">אזור ניהול</Link>
          <Link href="/" className="nav-link">בית</Link>
        </div>
      </header>

      <div className="section-label"><h2>משפך המרה</h2></div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => handleRangeChange(r.key)}
            style={{
              padding: '7px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              cursor: 'pointer',
              border: r.key === range ? '1px solid #E8A33D' : '1px solid var(--border-hairline-strong)',
              background: r.key === range ? 'rgba(232,163,61,0.12)' : 'transparent',
              color: r.key === range ? '#E8A33D' : 'var(--text-secondary)',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loadingCounts && !counts && <p style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>טוענים נתונים...</p>}

      {counts && (
        <>
          <div className="admin-tiles">
            {EVENT_LABELS.map((e) => (
              <div key={e.key} className="admin-tile" style={{ cursor: 'default' }}>
                <div className="at-icon">{e.icon}</div>
                <div className="at-title">{e.label}</div>
                <div className="at-count">{counts[e.key] ?? 0}</div>
              </div>
            ))}
          </div>

          <div className="section-label" style={{ marginTop: '30px' }}><h2>אחוזי המרה בין שלבים</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="stat-callout">
              <div className="sc-num" style={{ color: '#E8A33D' }}>{pct(whatsappOpens, leads)}</div>
              <p>מהלידים שמילאו פרטים לקבוצת העדכונים, פתחו בפועל את קבוצת הוואטסאפ</p>
            </div>
            <div className="stat-callout">
              <div className="sc-num" style={{ color: '#E8A33D' }}>{pct(completed, started)}</div>
              <p>ממי שהתחיל למלא את שאלון תוכנית המסחר, סיים אותו עד הסוף</p>
            </div>
            <div className="stat-callout">
              <div className="sc-num" style={{ color: '#E8A33D' }}>{pct(paymentClicks, completed)}</div>
              <p>ממי שהשלים את שאלון תוכנית המסחר, לחץ על קישור התשלום לקבוצת הסוחרים</p>
            </div>
          </div>

          <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '20px', textAlign: 'center' }}>
            המספרים נאספים החל מהיום שהמעקב הופעל - אירועים מלפני כן לא נכללים.
          </p>
        </>
      )}

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
