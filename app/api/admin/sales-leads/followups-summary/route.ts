import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { requireAdmin } from '@/lib/salesLeads/auth';
import { getJerusalemTodayBoundsUtc } from '@/lib/salesLeads/time';

// GET - נתון קליל (בלי לטעון רשימות שלמות) ל-Badge שמופיע בכל אזור האדמין, ולהתראות בדפדפן.
// מחזיר גם את רשימת ה-Follow-ups שכבר הגיע זמנם ברגע זה (לצורך הצגת/הפעלת Notification)
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { startIso, endIso } = getJerusalemTodayBoundsUtc();
  const nowIso = new Date().toISOString();

  const count = (q: any) => q.then((r: any) => r.count || 0);
  const base = () => supabaseAdmin.from('sales_leads').select('id', { count: 'exact', head: true }).eq('stage', 'in_progress');

  const [todayCount, overdueCount, dueNow] = await Promise.all([
    count(base().gte('next_followup_at', startIso).lt('next_followup_at', endIso)),
    count(base().not('next_followup_at', 'is', null).lt('next_followup_at', nowIso)),
    supabaseAdmin
      .from('sales_leads')
      .select('id, name, phone_normalized, next_followup_at, next_followup_note')
      .eq('stage', 'in_progress')
      .not('next_followup_at', 'is', null)
      .lt('next_followup_at', nowIso)
      .order('next_followup_at', { ascending: true })
      .limit(20),
  ]);

  return NextResponse.json({
    todayCount,
    overdueCount,
    dueNow: dueNow.data || [],
    serverNow: nowIso,
  });
}
