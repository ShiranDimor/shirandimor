import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { backfillMondayEmails } from '@/lib/mondayEmailBackfill';

export const maxDuration = 60;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST { dryRun } - משלים במאנדיי מייל לכל פריט שחסר לו, לפי מספר הנייד והמיילים שידועים באתר.
// dryRun=true מחזיר רק תצוגה מקדימה של מה שיתעדכן
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { dryRun } = await request.json().catch(() => ({ dryRun: true }));
  try {
    const result = await backfillMondayEmails(dryRun !== false);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה לא ידועה' }, { status: 500 });
  }
}
