import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { requireAdmin } from '@/lib/salesLeads/auth';
import { getJerusalemTodayBoundsUtc } from '@/lib/salesLeads/time';

// GET - המספרים ל-Dashboard הקטן שבראש מסך הלידים
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { startIso, endIso } = getJerusalemTodayBoundsUtc();
  const nowIso = new Date().toISOString();

  const count = (q: any) => q.then((r: any) => r.count || 0);
  const base = () => supabaseAdmin.from('sales_leads').select('id', { count: 'exact', head: true });

  const [inProgress, notHandled, followupsToday, followupsOverdue, hot, registered, notRelevant] = await Promise.all([
    count(base().eq('stage', 'in_progress')),
    count(base().eq('stage', 'in_progress').eq('sales_status', 'not_handled')),
    count(base().eq('stage', 'in_progress').gte('next_followup_at', startIso).lt('next_followup_at', endIso)),
    count(base().eq('stage', 'in_progress').not('next_followup_at', 'is', null).lt('next_followup_at', nowIso)),
    count(base().eq('stage', 'in_progress').in('priority', ['hot', 'very_hot'])),
    count(base().eq('stage', 'registered')),
    count(base().eq('stage', 'not_relevant')),
  ]);

  const handledTotal = registered + notRelevant;
  const conversionPct = handledTotal > 0 ? Math.round((registered / handledTotal) * 1000) / 10 : null;

  return NextResponse.json({
    inProgress,
    notHandled,
    followupsToday,
    followupsOverdue,
    hot,
    registered,
    notRelevant,
    conversionPct,
  });
}
