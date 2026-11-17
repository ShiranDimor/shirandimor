import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { requireAdmin } from '@/lib/salesLeads/auth';
import { getJerusalemTodayBoundsUtc } from '@/lib/salesLeads/time';
import { SALES_LEADS_LIST_COLUMNS, SalesLead } from '@/lib/salesLeads/types';

const PRIORITY_RANK: Record<string, number> = { very_hot: 2, hot: 1, normal: 0 };
const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 100;
// תקרת בטיחות לשליפה מלאה של תור העבודה לצורך מיון "חכם"/עדיפות בזיכרון - התור הפעיל (בטיפול)
// לא אמור להגיע לגודל הזה בפועל, בניגוד לכלל מאגר הלידים שיכול לגדול הרבה יותר עם הזמן
const SMART_SORT_SAFETY_CAP = 3000;

function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()%*]/g, ' ').trim();
}

type Filters = {
  stage: string;
  search: string | null;
  status: string | null;
  priority: string | null;
  followup: string | null;
  leadDateFrom: string | null;
  leadDateTo: string | null;
};

function applyFilters(query: any, f: Filters, bounds: { startIso: string; endIso: string }) {
  query = query.eq('stage', f.stage);

  if (f.search) {
    const s = sanitizeSearch(f.search);
    if (s) query = query.or(`name.ilike.%${s}%,phone_normalized.ilike.%${s}%,phone_original.ilike.%${s}%`);
  }
  if (f.status) query = query.eq('sales_status', f.status);
  if (f.priority) query = query.eq('priority', f.priority);
  if (f.leadDateFrom) query = query.gte('lead_date', f.leadDateFrom);
  if (f.leadDateTo) query = query.lte('lead_date', f.leadDateTo);

  if (f.followup === 'today') {
    query = query.gte('next_followup_at', bounds.startIso).lt('next_followup_at', bounds.endIso);
  } else if (f.followup === 'overdue') {
    query = query.not('next_followup_at', 'is', null).lt('next_followup_at', new Date().toISOString());
  } else if (f.followup === 'any') {
    query = query.not('next_followup_at', 'is', null);
  }

  return query;
}

function smartBucket(lead: SalesLead, nowMs: number, todayBounds: { startIso: string; endIso: string }): number {
  if (lead.next_followup_at) {
    const t = new Date(lead.next_followup_at).getTime();
    if (t < nowMs) return 0; // overdue
    if (lead.next_followup_at >= todayBounds.startIso && lead.next_followup_at < todayBounds.endIso) return 1; // today
  }
  if (lead.priority === 'very_hot') return 2;
  if (lead.priority === 'hot') return 3;
  if (lead.sales_status === 'not_handled') return 4;
  return 5;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filters: Filters = {
    stage: searchParams.get('stage') || 'in_progress',
    search: searchParams.get('search'),
    status: searchParams.get('status'),
    priority: searchParams.get('priority'),
    followup: searchParams.get('followup'),
    leadDateFrom: searchParams.get('leadDateFrom'),
    leadDateTo: searchParams.get('leadDateTo'),
  };
  const sort = searchParams.get('sort') || 'smart';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(searchParams.get('pageSize')) || PAGE_SIZE_DEFAULT));

  const bounds = getJerusalemTodayBoundsUtc();

  // ספירה כוללת (לפי אותם פילטרים) - זול, בלי לטעון את השורות עצמן
  let countQuery = supabaseAdmin.from('sales_leads').select('id', { count: 'exact', head: true });
  countQuery = applyFilters(countQuery, filters, bounds);
  const { count } = await countQuery;

  if (sort === 'smart' || sort === 'priority_level') {
    let query = supabaseAdmin.from('sales_leads').select(SALES_LEADS_LIST_COLUMNS).limit(SMART_SORT_SAFETY_CAP);
    query = applyFilters(query, filters, bounds);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const nowMs = Date.now();
    const rows = (data || []) as SalesLead[];

    rows.sort((a, b) => {
      if (sort === 'smart') {
        const diff = smartBucket(a, nowMs, bounds) - smartBucket(b, nowMs, bounds);
        if (diff !== 0) return diff;
        if (a.next_followup_at && b.next_followup_at) return a.next_followup_at < b.next_followup_at ? -1 : 1;
        return a.lead_date < b.lead_date ? -1 : 1;
      }
      // priority_level: לפי דירוג עדיפות בלבד
      const diff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (diff !== 0) return diff;
      return a.lead_date < b.lead_date ? -1 : 1;
    });

    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize);
    return NextResponse.json({ leads: paged, total: count || 0, page, pageSize });
  }

  let query = supabaseAdmin.from('sales_leads').select(SALES_LEADS_LIST_COLUMNS);
  query = applyFilters(query, filters, bounds);

  switch (sort) {
    case 'oldest':
      query = query.order('lead_date', { ascending: true });
      break;
    case 'followup_soonest':
      query = query.order('next_followup_at', { ascending: true, nullsFirst: false });
      break;
    case 'longest_untouched':
      query = query.order('last_contact_at', { ascending: true, nullsFirst: true });
      break;
    case 'last_contact':
      query = query.order('last_contact_at', { ascending: false, nullsFirst: false });
      break;
    case 'newest':
    default:
      query = query.order('lead_date', { ascending: false });
      break;
  }

  const start = (page - 1) * pageSize;
  query = query.range(start, start + pageSize - 1);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: data || [], total: count || 0, page, pageSize });
}
