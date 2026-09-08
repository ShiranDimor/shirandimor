import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { createLiveRegistrationLead } from '@/lib/tradingPlan/monday';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// חד-פעמי (אבל בטוח להרצה חוזרת): יוצר למפרע כרטיסי ליד במאנדיי לכל מי שנרשם ללייב "פתוח
// לכולם" ואינו מנוי, מהזמן שבו הרשמות כאלה דילגו על יצירת ליד בטעות (monday_synced=false).
// אם מעבירים liveId - מסנכרן רק את הלייב הספציפי הזה, כדי לא "להעיר" לידים ללייבים ישנים שעברו
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { liveId } = await request.json().catch(() => ({ liveId: undefined }));

  let query = supabaseAdmin
    .from('live_registrations')
    .select('id, name, phone, email, live_id, lives:live_id (title, scheduled_at)')
    .eq('is_subscriber', false)
    .eq('monday_synced', false);

  if (liveId) query = query.eq('live_id', liveId);

  const { data: rows, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let created = 0;
  let failed = 0;
  const failedNames: string[] = [];

  for (const row of rows || []) {
    const live = Array.isArray(row.lives) ? row.lives[0] : row.lives;
    if (!row.name || !row.phone || !live) continue;

    const result = await createLiveRegistrationLead({
      name: row.name,
      phone: row.phone,
      email: row.email,
      liveTitle: live.title,
      liveScheduledAt: live.scheduled_at,
    });

    if (result.ok) {
      created += 1;
      await supabaseAdmin.from('live_registrations').update({ monday_synced: true }).eq('id', row.id);
    } else {
      failed += 1;
      failedNames.push(row.name);
    }
  }

  return NextResponse.json({ ok: true, total: (rows || []).length, created, failed, failedNames });
}
