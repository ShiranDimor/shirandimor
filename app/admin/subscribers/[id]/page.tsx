'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import StatsRing from '@/components/StatsRing';
import EquityCurve from '@/components/EquityCurve';
import CalendarHeatmap from '@/components/CalendarHeatmap';

type JournalEntry = {
  id: string;
  direction: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  status: string;
  exit_price: number | null;
  shares: number;
  realized_pnl_usd: number | null;
  opened_at: string;
  closed_at: string | null;
};

type Profile = {
  full_name: string | null;
  email: string;
};

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

export default function AdminViewSubscriberJournal() {
  const params = useParams();
  const subscriberId = params.id as string;

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [subscriber, setSubscriber] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setIsAdmin(profile?.role === 'admin');
    setChecking(false);
    if (profile?.role === 'admin') {
      loadData();
    }
  }

  async function loadData() {
    const [{ data: sub }, { data: journalEntries }] = await Promise.all([
      supabase.from('profiles').select('full_name, email').eq('id', subscriberId).single(),
      supabase.from('journal_entries').select('*').eq('user_id', subscriberId).order('opened_at', { ascending: false }),
    ]);

    if (sub) setSubscriber(sub);
    if (journalEntries) setEntries(journalEntries);
    setLoadingData(false);
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

  if (loadingData) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>;
  }

  const openEntries = entries.filter((e) => e.status === 'open');
  const closedEntries = entries.filter((e) => e.status === 'closed');
  const closedProfit = closedEntries.filter((e) => (e.realized_pnl_usd ?? 0) >= 0);
  const closedLoss = closedEntries.filter((e) => (e.realized_pnl_usd ?? 0) < 0);

  const winRate = closedEntries.length > 0 ? (closedProfit.length / closedEntries.length) * 100 : null;
  const avgPnl = closedEntries.length > 0
    ? closedEntries.reduce((s, e) => s + (e.realized_pnl_usd ?? 0), 0) / closedEntries.length
    : null;
  const avgWin = closedProfit.length > 0
    ? closedProfit.reduce((s, e) => s + (e.realized_pnl_usd ?? 0), 0) / closedProfit.length
    : 0;
  const avgLoss = closedLoss.length > 0
    ? Math.abs(closedLoss.reduce((s, e) => s + (e.realized_pnl_usd ?? 0), 0) / closedLoss.length)
    : 0;
  const riskReward = avgLoss > 0 ? avgWin / avgLoss : null;
  const daysToClose = closedEntries
    .filter((e) => e.closed_at)
    .map((e) => (new Date(e.closed_at as string).getTime() - new Date(e.opened_at).getTime()) / 86400000);
  const avgDaysToClose = daysToClose.length > 0 ? daysToClose.reduce((s, x) => s + x, 0) / daysToClose.length : null;

  const equityPoints = (() => {
    const chronological = closedEntries
      .filter((e) => e.closed_at)
      .slice()
      .sort((a, b) => new Date(a.closed_at as string).getTime() - new Date(b.closed_at as string).getTime());
    let running = 0;
    const points = [{ date: 'התחלה', value: 0 }];
    for (const e of chronological) {
      running += e.realized_pnl_usd ?? 0;
      points.push({ date: formatDate(e.closed_at), value: Math.round(running) });
    }
    return points;
  })();

  const now = new Date();
  const calResults = closedEntries
    .filter((e) => {
      if (!e.closed_at) return false;
      const d = new Date(e.closed_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((map, e) => {
      const day = new Date(e.closed_at as string).getDate();
      map.set(day, (map.get(day) ?? 0) + (e.realized_pnl_usd ?? 0));
      return map;
    }, new Map<number, number>());
  const calDayResults = Array.from(calResults.entries()).map(([day, pnl]) => ({ day, pnl }));

  function renderTable(list: JournalEntry[], emptyText: string) {
    if (list.length === 0) return <p className="trade-table-empty">{emptyText}</p>;
    return (
      <div className="trade-table-wrap">
        <table className="trade-table">
          <thead>
            <tr>
              <th>סימבול</th>
              <th>נפתחה ב-</th>
              <th>נסגרה ב-</th>
              <th>כניסה</th>
              <th>סטופ/יציאה</th>
              <th>מניות</th>
              <th>תוצאה</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td className="sym-cell">
                  <span className="sym-cell-inner">
                    <span className={`direction-mark ${e.direction}`}>{e.direction === 'long' ? 'L' : 'S'}</span>
                    <span>{e.symbol}</span>
                  </span>
                </td>
                <td>{formatDate(e.opened_at)}</td>
                <td>{e.status === 'closed' ? formatDate(e.closed_at) : '—'}</td>
                <td>${e.entry_price.toFixed(2)}</td>
                <td>{e.status === 'closed' ? `$${e.exit_price?.toFixed(2)}` : `$${e.stop_loss}`}</td>
                <td>{e.shares}</td>
                <td className="pnl-cell" style={{ color: e.status === 'open' ? 'var(--text-secondary)' : (e.realized_pnl_usd ?? 0) >= 0 ? 'var(--profit)' : 'var(--loss)' }}>
                  {e.status === 'open' ? 'פתוחה' : `${(e.realized_pnl_usd ?? 0) >= 0 ? '+' : ''}$${(e.realized_pnl_usd ?? 0).toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/admin/subscribers" className="nav-link">← למנויים</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label">
        <h2>{subscriber?.full_name || 'ללא שם'}</h2>
        <span className="count">צפייה בלבד</span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px', fontFamily: 'var(--font-mono)' }}>{subscriber?.email}</p>

      {entries.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>המנוי עדיין לא הזין עסקאות ביומן שלו</p>
      ) : (
        <>
          <div className="section-label"><h2>צמיחת היומן</h2></div>
          <div className="equity-card">
            <EquityCurve points={equityPoints} />
          </div>

          <div className="section-label"><h2>{now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</h2></div>
          <div className="equity-card" style={{ marginBottom: '28px' }}>
            <CalendarHeatmap year={now.getFullYear()} month={now.getMonth()} results={calDayResults} />
          </div>

          <details className="section-collapse" open>
            <summary>
              <h2>עסקאות פתוחות</h2>
              <div className="summary-right"><span className="count">{openEntries.length}</span><span className="collapse-chevron">▾</span></div>
            </summary>
            {renderTable(openEntries, 'אין כרגע עסקאות פתוחות')}
          </details>

          <details className="section-collapse">
            <summary>
              <h2>נסגרו ברווח</h2>
              <div className="summary-right"><span className="count">{closedProfit.length}</span><span className="collapse-chevron">▾</span></div>
            </summary>
            {renderTable(closedProfit, 'אין עדיין עסקאות שנסגרו ברווח')}
          </details>

          <details className="section-collapse">
            <summary>
              <h2>נסגרו בהפסד</h2>
              <div className="summary-right"><span className="count">{closedLoss.length}</span><span className="collapse-chevron">▾</span></div>
            </summary>
            {renderTable(closedLoss, 'אין עדיין עסקאות שנסגרו בהפסד')}
          </details>

          <div className="section-label" style={{ marginTop: '28px' }}><h2>תובנות</h2></div>
          <div className="insights-panel">
            <div className="insights-ring-row">
              <StatsRing
                percent={winRate ?? 0}
                label={`${closedEntries.length} עסקאות סגורות`}
                sublabel="ביומן של המנוי"
              />
            </div>
            <div className="insight-grid">
              <div className="insight-tile">
                <div className="iv">{avgDaysToClose !== null ? avgDaysToClose.toFixed(1) : '—'}</div>
                <div className="il">ימי החזקה בממוצע</div>
              </div>
              <div className="insight-tile">
                <div className="iv" style={{ color: avgPnl !== null ? (avgPnl >= 0 ? 'var(--profit)' : 'var(--loss)') : undefined }}>
                  {avgPnl !== null ? `${avgPnl >= 0 ? '+' : ''}$${avgPnl.toFixed(0)}` : '—'}
                </div>
                <div className="il">רווח/הפסד ממוצע לעסקה</div>
              </div>
              <div className="insight-tile">
                <div className="iv">{riskReward !== null ? `1:${riskReward.toFixed(1)}` : '—'}</div>
                <div className="il">יחס סיכון-סיכוי</div>
              </div>
              <div className="insight-tile">
                <div className="iv">{openEntries.length}</div>
                <div className="il">עסקאות פתוחות</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
