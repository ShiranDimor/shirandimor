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

// GET - כל הלייבים (כולל טיוטות ולא-מפורסמים) - לתצוגת ניהול
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('lives').select('*').order('scheduled_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ lives: data });
}

// POST - יצירת לייב חדש
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { title, description, scheduledAt, joinInfo, published } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'חסרה כותרת' }, { status: 400 });
  }
  if (!scheduledAt || typeof scheduledAt !== 'string' || isNaN(Date.parse(scheduledAt))) {
    return NextResponse.json({ error: 'חסר תאריך/שעה תקינים' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('lives')
    .insert({
      title,
      description: description || null,
      scheduled_at: new Date(scheduledAt).toISOString(),
      join_info: joinInfo || null,
      published: published !== false,
    })
    .select('*')
    .single();

  if (error) {
    console.error('שגיאה ביצירת לייב', error);
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
  }

  return NextResponse.json({ live: data });
}
