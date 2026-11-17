import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { requireAdmin } from '@/lib/salesLeads/auth';
import { applyLeadAction, LeadAction } from '@/lib/salesLeads/activities';

// GET - פרטי הליד המלאים + כל היסטוריית הפעולות שלו. נטען רק כשפותחים את הכרטיס (Drawer),
// לא ברשימה הראשית - כדי לא לטעון היסטוריה של כל האנשים בבת אחת
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: lead, error: leadError } = await supabaseAdmin.from('sales_leads').select('*').eq('id', params.id).single();
  if (leadError || !lead) return NextResponse.json({ error: 'ליד לא נמצא' }, { status: 404 });

  const { data: activities, error: activitiesError } = await supabaseAdmin
    .from('sales_lead_activities')
    .select('*')
    .eq('lead_id', params.id)
    .order('created_at', { ascending: false });

  if (activitiesError) return NextResponse.json({ error: activitiesError.message }, { status: 500 });

  return NextResponse.json({ lead, activities: activities || [] });
}

// PATCH - כל פעולה על הליד (התקשרות, הערה, סטטוס, עדיפות, Follow-up) - ר' lib/salesLeads/activities.ts
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const action = await request.json().catch(() => null) as LeadAction | null;
  if (!action || typeof action.type !== 'string') {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const result = await applyLeadAction(params.id, action);
  if (!result.ok) return NextResponse.json({ error: result.error || 'שגיאה' }, { status: 400 });

  return NextResponse.json({ ok: true });
}
