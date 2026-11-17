'use client';

import { supabase } from '@/lib/supabase';
import { SalesLead, SalesLeadActivity } from './types';
import { LeadAction } from './activities';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
}

export type LeadsQuery = {
  stage: string;
  search?: string;
  status?: string;
  priority?: string;
  followup?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export async function fetchLeads(q: LeadsQuery): Promise<{ leads: SalesLead[]; total: number; page: number; pageSize: number }> {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const res = await fetch(`/api/admin/sales-leads?${params.toString()}`, { headers });
  if (!res.ok) throw new Error('שגיאה בטעינת הלידים');
  return res.json();
}

export type SalesLeadsStats = {
  inProgress: number;
  notHandled: number;
  followupsToday: number;
  followupsOverdue: number;
  hot: number;
  registered: number;
  notRelevant: number;
  conversionPct: number | null;
};

export async function fetchStats(): Promise<SalesLeadsStats> {
  const headers = await authHeaders();
  const res = await fetch('/api/admin/sales-leads/stats', { headers });
  if (!res.ok) throw new Error('שגיאה בטעינת נתונים');
  return res.json();
}

export async function fetchLeadDetail(id: string): Promise<{ lead: SalesLead; activities: SalesLeadActivity[] }> {
  const headers = await authHeaders();
  const res = await fetch(`/api/admin/sales-leads/${id}`, { headers });
  if (!res.ok) throw new Error('שגיאה בטעינת הליד');
  return res.json();
}

export async function applyAction(id: string, action: LeadAction): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`/api/admin/sales-leads/${id}`, { method: 'PATCH', headers, body: JSON.stringify(action) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'שגיאה בשמירה');
  }
}

export async function syncNow(): Promise<{ totalInMondayGroup: number; created: number; updated: number; skippedNoPhone: string[] }> {
  const headers = await authHeaders();
  const res = await fetch('/api/admin/sales-leads/sync', { method: 'POST', headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'שגיאה בסנכרון');
  }
  return res.json();
}

export type FollowupsSummary = {
  todayCount: number;
  overdueCount: number;
  dueNow: { id: string; name: string; phone_normalized: string; next_followup_at: string; next_followup_note: string | null }[];
  serverNow: string;
};

export async function fetchFollowupsSummary(): Promise<FollowupsSummary> {
  const headers = await authHeaders();
  const res = await fetch('/api/admin/sales-leads/followups-summary', { headers });
  if (!res.ok) throw new Error('שגיאה');
  return res.json();
}
