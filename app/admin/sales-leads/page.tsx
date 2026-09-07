'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ClearableInput from '@/components/ClearableInput';
import LeadRow from '@/components/salesLeads/LeadRow';
import LeadDrawer from '@/components/salesLeads/LeadDrawer';
import { SalesLead } from '@/lib/salesLeads/types';
import { fetchLeads, fetchStats, syncNow, SalesLeadsStats } from '@/lib/salesLeads/apiClient';
import { jerusalemLocalInputToUtcIso } from '@/lib/salesLeads/time';

type Stage = 'in_progress' | 'registered' | 'not_relevant';

const STAGE_TABS: { value: Stage; label: string }[] = [
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'registered', label: 'טופל ונרשם' },
  { value: 'not_relevant', label: 'טופל ולא רלוונטי' },
];

const FILTER_CHIPS: { id: string; label: string; dim: 'status' | 'priority' | 'followup'; value: string }[] = [
  { id: 'not_handled', label: 'לא טופלו עדיין', dim: 'status', value: 'not_handled' },
  { id: 'no_answer', label: 'לא ענו', dim: 'status', value: 'no_answer' },
  { id: 'interested', label: 'מתעניינים', dim: 'status', value: 'interested' },
  { id: 'followup_any', label: 'יש Follow-up', dim: 'followup', value: 'any' },
  { id: 'followup_today', label: 'Follow-up היום', dim: 'followup', value: 'today' },
  { id: 'followup_overdue', label: 'Follow-up באיחור', dim: 'followup', value: 'overdue' },
  { id: 'hot', label: 'חמים', dim: 'priority', value: 'hot' },
  { id: 'very_hot', label: 'חמים מאוד', dim: 'priority', value: 'very_hot' },
];

const SORT_OPTIONS = [
  { value: 'smart', label: 'חכם (ברירת מחדל)' },
  { value: 'newest', label: 'החדשים ביותר' },
  { value: 'oldest', label: 'הישנים ביותר' },
  { value: 'followup_soonest', label: 'Follow-up הקרוב ביותר' },
  { value: 'longest_untouched', label: 'לא טופל הכי הרבה זמן' },
  { value: 'priority_level', label: 'לפי עדיפות' },
  { value: 'last_contact', label: 'תאריך טיפול אחרון' },
];

const PAGE_SIZE = 30;

function SalesLeadsPageInner() {
  const searchParams = useSearchParams();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [stage, setStage] = useState<Stage>('in_progress');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dimFilters, setDimFilters] = useState<{ status?: string; priority?: string; followup?: string }>({});
  const [leadDateFrom, setLeadDateFrom] = useState('');
  const [leadDateTo, setLeadDateTo] = useState('');
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [sort, setSort] = useState('smart');
  const [page, setPage] = useState(1);

  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [stats, setStats] = useState<SalesLeadsStats | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    const openId = searchParams?.get('open');
    if (openId) setSelectedLeadId(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [stage, debouncedSearch, dimFilters, leadDateFrom, leadDateTo, sort]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const data = await fetchLeads({
        stage,
        search: debouncedSearch || undefined,
        status: dimFilters.status,
        priority: dimFilters.priority,
        followup: dimFilters.followup,
        sort,
        page,
        pageSize: PAGE_SIZE,
        ...(leadDateFrom ? { leadDateFrom: jerusalemLocalInputToUtcIso(`${leadDateFrom}T00:00`) || undefined } : {}),
        ...(leadDateTo ? { leadDateTo: jerusalemLocalInputToUtcIso(`${leadDateTo}T23:59`) || undefined } : {}),
      } as any);
      setLeads(data.leads);
      setTotal(data.total);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'שגיאה בטעינה');
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, debouncedSearch, dimFilters, sort, page, leadDateFrom, leadDateTo]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchStats());
    } catch {
      // הדשבורד לא קריטי - לא חוסמים את שאר המסך אם נכשל
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadLeads();
  }, [isAdmin, loadLeads]);

  useEffect(() => {
    if (isAdmin) loadStats();
  }, [isAdmin, loadStats]);

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
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  function toggleChip(dim: 'status' | 'priority' | 'followup', value: string) {
    setDimFilters((prev) => (prev[dim] === value ? { ...prev, [dim]: undefined } : { ...prev, [dim]: value }));
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await syncNow();
      setSyncMessage(`נמצאו ${result.totalInMondayGroup} בקבוצת העדכונים · ${result.created} חדשים · ${result.updated} עודכנו${result.skippedNoPhone.length ? ` · ${result.skippedNoPhone.length} בלי טלפון` : ''}`);
      await Promise.all([loadLeads(), loadStats()]);
    } catch (e) {
      setSyncMessage('שגיאה: ' + (e instanceof Error ? e.message : 'לא הצלחנו לסנכרן'));
    }
    setSyncing(false);
  }

  function onChanged() {
    loadLeads();
    loadStats();
  }

  if (checking) {
    return <div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>בודקים הרשאות...</p></div>;
  }

  if (!userEmail || !isAdmin) {
    return (
      <div className="wrap">
        <header>
          <a href="/" className="brand">מסחר <span>אחראי</span> במניות</a>
          <a href="/" className="nav-link">בית</a>
        </header>
        <p style={{ padding: '40px 0', textAlign: 'center' }}>{!userEmail ? <>צריך להתחבר קודם. <a href="/login" style={{ color: 'var(--teal)' }}>כניסה</a></> : `אין הרשאת ניהול לחשבון המחובר (${userEmail})`}</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="wrap">
      <header>
        <Link href="/admin" className="brand">מסחר <span>אחראי</span> במניות</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/admin" className="nav-link">← לניהול</Link>
          <button onClick={handleLogout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>התנתקות</button>
        </div>
      </header>

      <div className="section-label"><h2>שיחות מכירה - קבוצת עדכונים</h2></div>

      {stats && (
        <div className="sl-stats">
          <div className={`sl-stat ${stats.followupsOverdue > 0 ? 'attn' : ''}`}>
            <div className="sl-stat-n">{stats.followupsOverdue}</div>
            <div className="sl-stat-l">Follow-up באיחור</div>
          </div>
          <div className="sl-stat">
            <div className="sl-stat-n">{stats.followupsToday}</div>
            <div className="sl-stat-l">Follow-up היום</div>
          </div>
          <div className="sl-stat">
            <div className="sl-stat-n">{stats.inProgress}</div>
            <div className="sl-stat-l">בטיפול · {stats.notHandled} לא טופלו</div>
          </div>
          <div className="sl-stat">
            <div className="sl-stat-n">{stats.hot}</div>
            <div className="sl-stat-l">לידים חמים</div>
          </div>
          <div className="sl-stat good">
            <div className="sl-stat-n">{stats.registered}</div>
            <div className="sl-stat-l">נרשמו</div>
          </div>
          <div className="sl-stat">
            <div className="sl-stat-n">{stats.conversionPct !== null ? `${stats.conversionPct}%` : '—'}</div>
            <div className="sl-stat-l">אחוז המרה לנרשמים</div>
          </div>
        </div>
      )}

      <div className="sl-toolbar">
        <button className="btn-outline" onClick={handleSyncNow} disabled={syncing}>
          {syncing ? 'מסנכרנת...' : '🔄 סנכרן עכשיו ממאנדיי'}
        </button>
      </div>
      {syncMessage && <p style={{ fontSize: '12px', color: syncMessage.startsWith('שגיאה') ? 'var(--loss)' : 'var(--profit)', marginBottom: '12px' }}>{syncMessage}</p>}

      <div className="sl-tabs">
        {STAGE_TABS.map((t) => (
          <button key={t.value} className={`sl-tab ${stage === t.value ? 'active' : ''}`} onClick={() => setStage(t.value)}>
            {t.label}
            {stats && (
              <span className="sl-tab-count">
                {t.value === 'in_progress' ? stats.inProgress : t.value === 'registered' ? stats.registered : stats.notRelevant}
              </span>
            )}
          </button>
        ))}
      </div>

      <ClearableInput
        type="text"
        placeholder="חיפוש לפי שם או טלפון..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onClear={() => setSearchInput('')}
        style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline-strong)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '13.5px', boxSizing: 'border-box', marginBottom: '12px' }}
      />

      <div className="sl-filters">
        {FILTER_CHIPS.map((chip) => (
          <button key={chip.id} className={`filter-chip ${dimFilters[chip.dim] === chip.value ? 'active' : ''}`} onClick={() => toggleChip(chip.dim, chip.value)}>
            {chip.label}
          </button>
        ))}
        <button className={`filter-chip ${showDateFilters ? 'active' : ''}`} onClick={() => setShowDateFilters((v) => !v)}>
          📅 תאריך כניסה
        </button>
      </div>

      {showDateFilters && (
        <div className="sl-inline-form" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="sl-inline-form-row">
            <input type="date" value={leadDateFrom} onChange={(e) => setLeadDateFrom(e.target.value)} />
            <input type="date" value={leadDateTo} onChange={(e) => setLeadDateTo(e.target.value)} />
          </div>
        </div>
      )}

      <select className="month-select" value={sort} onChange={(e) => setSort(e.target.value)} style={{ marginBottom: '16px' }}>
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>מיון: {s.label}</option>
        ))}
      </select>

      {listError && <p style={{ fontSize: '12.5px', color: 'var(--loss)', marginBottom: '12px' }}>{listError}</p>}
      {loading && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px 0' }}>טוענים...</p>}
      {!loading && leads.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '30px 0' }}>אין לידים להצגה</p>}

      {!loading && leads.map((lead) => (
        <LeadRow key={lead.id} lead={lead} onOpen={setSelectedLeadId} onChanged={onChanged} onError={setListError} />
      ))}

      {!loading && total > PAGE_SIZE && (
        <div className="sl-pagination">
          <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>הקודם</button>
          <span className="sl-page-info">עמוד {page} מתוך {totalPages} · {total} סה״כ</span>
          <button className="btn-outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>הבא</button>
        </div>
      )}

      {selectedLeadId && (
        <LeadDrawer leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onChanged={onChanged} />
      )}
    </div>
  );
}

export default function SalesLeadsPage() {
  return (
    <Suspense fallback={<div className="wrap"><p style={{ padding: '40px', textAlign: 'center' }}>טוענים...</p></div>}>
      <SalesLeadsPageInner />
    </Suspense>
  );
}
