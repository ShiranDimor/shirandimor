'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type CrmStage = 'lead_new' | 'updates_group' | 'subscriber' | 'churned';

const STAGE_LABEL: Record<CrmStage, string> = {
  lead_new: 'ליד חדש',
  updates_group: 'קבוצת עדכונים',
  subscriber: 'מנוי',
  churned: 'נטש',
};

const EVENT_LABELS: { key: string; label: string }[] = [
  { key: 'free_group_lead_submitted', label: 'ליד לקבוצת העדכונים' },
  { key: 'whatsapp_group_open_click', label: 'פתיחת קבוצת הוואטסאפ' },
  { key: 'trading_plan_started', label: 'התחלת שאלון תוכנית מסחר' },
  { key: 'trading_plan_completed', label: 'השלמת שאלון תוכנית מסחר' },
  { key: 'payment_link_click', label: 'לחיצה על קישור תשלום' },
  { key: 'live_registered', label: 'הרשמת מנוי ללייב' },
  { key: 'live_registration_lead', label: 'ליד מהרשמה ללייב' },
];

type ActivityRow = { id: string; body: string; author: string | null; created_at: string; crm_contacts: { full_name: string | null } | null };

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  return `לפני ${days} ימים`;
}

export default function AdminCrmDashboardPage() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [stageCounts, setStageCounts] = useState<Record<CrmStage, number>>({ lead_new: 0, updates_group: 0, subscriber: 0, churned: 0 });
  const [mrr, setMrr] = useState(0);
  const [followupToday, setFollowupToday] = useState(0);
  const [newLeadsThisWeek, setNewLeadsThisWeek] = useState(0);
  const [tagCounts, setTagCounts] = useState<{ tag: string; count: number }[]>([]);
  const [funnelCounts, setFunnelCounts] = useState<Record<string, number>>({});
  const [activity, setActivity] = useState<ActivityRow[]>([]);

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
    if (profile?.role === 'admin') loadData();
  }

  async function loadData() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: { session } } = await supabase.auth.getSession();

    const [contactsRes, activityRes, funnelRes] = await Promise.all([
      supabase.from('crm_contacts').select('stage, monthly_cost_paid, follow_up_at, created_at, tags'),
      supabase.from('crm_notes').select('id, body, author, created_at, crm_contacts(full_name)').order('created_at', { ascending: false }).limit(15),
      fetch(`/api/admin/funnel-stats?since=${encodeURIComponent(monthAgo)}`, { headers: { Authorization: `Bearer ${session?.access_token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const contacts = contactsRes.data || [];
    const counts: Record<CrmStage, number> = { lead_new: 0, updates_group: 0, subscriber: 0, churned: 0 };
    let mrrSum = 0;
    let followupTodayCount = 0;
    let newLeadsCount = 0;
    const tagMap: Record<string, number> = {};

    for (const c of contacts) {
      const stage = c.stage as CrmStage;
      if (stage in counts) counts[stage]++;
      if (stage === 'subscriber') mrrSum += c.monthly_cost_paid || 0;
      if (c.follow_up_at && c.follow_up_at <= today) followupTodayCount++;
      if (c.created_at >= weekAgo) newLeadsCount++;
      for (const t of c.tags || []) tagMap[t] = (tagMap[t] || 0) + 1;
    }

    setStageCounts(counts);
    setMrr(mrrSum);
    setFollowupToday(followupTodayCount);
    setNewLeadsThisWeek(newLeadsCount);
    setTagCounts(Object.entries(tagMap).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
    setActivity((activityRes.data as unknown as ActivityRow[]) || []);
    setFunnelCounts(funnelRes?.counts || {});
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (checking) return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;

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

  const totalContacts = stageCounts.lead_new + stageCounts.updates_group + stageCounts.subscriber + stageCounts.churned;

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/admin/crm" className="nav-link">← ל-CRM</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>לוח בקרה עסקי</h2></div>
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>
        פיילוט עצמאי - הנתונים כאן מבוססים על ה-CRM הפנימי בלבד (ולא על מאנדיי, שממשיך לרוץ בזרימות האמיתיות באתר).
      </p>

      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>טוענים...</p>}

      <div className="insights-panel">
        <div className="insight-grid">
          <div className="insight-tile"><div className="iv">₪{mrr.toLocaleString('he-IL')}</div><div className="il">MRR (הכנסה חודשית חוזרת)</div></div>
          <div className="insight-tile"><div className="iv">{stageCounts.subscriber}</div><div className="il">מנויים פעילים</div></div>
          <div className="insight-tile" style={{ borderColor: followupToday > 0 ? 'var(--loss)' : undefined }}>
            <div className="iv" style={{ color: followupToday > 0 ? 'var(--loss)' : undefined }}>{followupToday}</div>
            <div className="il">פולואפים דחופים היום</div>
          </div>
          <div className="insight-tile"><div className="iv">{newLeadsThisWeek}</div><div className="il">לידים חדשים השבוע</div></div>
        </div>
      </div>

      <div className="section-label"><h2>פילוח שלבים</h2><span className="count">{totalContacts} סה״כ</span></div>
      <div className="insights-panel">
        <div className="insight-grid">
          {(Object.keys(STAGE_LABEL) as CrmStage[]).map((s) => (
            <div className="insight-tile" key={s}>
              <div className="iv">{stageCounts[s]}</div>
              <div className="il">{STAGE_LABEL[s]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-label"><h2>משפך המרה (30 יום אחרונים)</h2></div>
      <div className="insights-panel">
        <div className="insight-grid">
          {EVENT_LABELS.map((e) => (
            <div className="insight-tile" key={e.key}>
              <div className="iv">{funnelCounts[e.key] ?? 0}</div>
              <div className="il">{e.label}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '10px', textAlign: 'center' }}>
          נתונים מלאים ומסוננים יותר - ב<Link href="/admin/analytics" style={{ color: 'var(--teal)' }}>עמוד משפך ההמרה</Link>
        </p>
      </div>

      {tagCounts.length > 0 && (
        <>
          <div className="section-label"><h2>תגיות נפוצות</h2></div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {tagCounts.map(({ tag, count }) => (
              <span key={tag} style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '12px', border: '1px solid var(--border-hairline-strong)', color: 'var(--text-secondary)' }}>
                #{tag} · {count}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="section-label"><h2>פעילות אחרונה</h2></div>
      {activity.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>אין עדיין פעילות</p>}
      {activity.map((a) => (
        <div key={a.id} style={{ borderBottom: '1px solid var(--border-hairline)', padding: '10px 0', fontSize: '13px' }}>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '3px', fontFamily: 'var(--font-mono)' }}>
            {a.crm_contacts?.full_name || 'ללא שם'} · {a.author || 'system'} · {timeAgo(a.created_at)}
          </div>
          <div style={{ whiteSpace: 'pre-line' }}>{a.body}</div>
        </div>
      ))}
    </div>
  );
}
