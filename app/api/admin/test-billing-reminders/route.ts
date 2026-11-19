import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { createTrialBillingReminders } from '@/lib/googleCalendar';

async function requireAdmin(request: Request): Promise<unknown> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (process.env.AGENT_ADMIN_SECRET && token === process.env.AGENT_ADMIN_SECRET) return true;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return adminProfile?.role === 'admin' ? user : null;
}

// POST - בדיקה ידנית: יוצר בפועל את שתי תזכורות החיוב (ר' lib/googleCalendar.ts) ביומן של שירן,
// בלי ליצור/לגעת בשום חשבון מנוי/ה אמיתי - לשימוש חד-פעמי לוודא שהחיבור ליומן עובד נכון
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'בדיקה';

  const result = await createTrialBillingReminders(name, new Date());
  return NextResponse.json({ ok: true, ...result });
}
