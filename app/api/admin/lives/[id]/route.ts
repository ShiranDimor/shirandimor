import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// PATCH - עדכון לייב קיים
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { title, description, scheduledAt, joinInfo, published } = body as Record<string, unknown>;

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof title === 'string') fields.title = title;
  if (typeof description === 'string' || description === null) fields.description = description;
  if (typeof joinInfo === 'string' || joinInfo === null) fields.join_info = joinInfo;
  if (typeof published === 'boolean') fields.published = published;

  if (typeof scheduledAt === 'string') {
    if (isNaN(Date.parse(scheduledAt))) {
      return NextResponse.json({ error: 'תאריך/שעה לא תקינים' }, { status: 400 });
    }
    fields.scheduled_at = new Date(scheduledAt).toISOString();
  }

  const { data, error } = await supabaseAdmin.from('lives').update(fields).eq('id', params.id).select('*').maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });
  }

  return NextResponse.json({ live: data });
}

// DELETE - מחיקת לייב (וכל ההרשמות שלו, בזכות on delete cascade)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { error } = await supabaseAdmin.from('lives').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'שגיאה במחיקה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
