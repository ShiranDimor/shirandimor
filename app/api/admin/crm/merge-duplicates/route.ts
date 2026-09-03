import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { findPotentialDuplicates, mergeContacts } from '@/lib/crm';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;
  return user;
}

// GET - קבוצות אנשי קשר שחשודים ככפילות (אותו שם מלא)
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const groups = await findPotentialDuplicates();
  return NextResponse.json({ groups });
}

// POST - מיזוג בפועל: { keepId, mergeId }
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { keepId, mergeId } = await request.json().catch(() => ({}));
  if (!keepId || !mergeId) return NextResponse.json({ error: 'חסרים מזהים' }, { status: 400 });

  try {
    await mergeContacts(keepId, mergeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('שגיאה במיזוג אנשי קשר', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה במיזוג' }, { status: 500 });
  }
}
