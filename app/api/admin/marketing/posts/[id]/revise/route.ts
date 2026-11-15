import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { revisePostFromNote } from '@/lib/marketingRevise';

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

// POST - "תקן לפי ההערה": מתקן טקסט ו/או עיצוב של פוסט לפי הערה חופשית של שירן
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!note) return NextResponse.json({ error: 'צריך לכתוב הערה מה לתקן' }, { status: 400 });
  if (note.length > 2000) return NextResponse.json({ error: 'ההערה ארוכה מדי' }, { status: 400 });

  try {
    const { summary } = await revisePostFromNote(params.id, note);
    const { data: post } = await supabaseAdmin.from('marketing_posts').select('*').eq('id', params.id).single();
    return NextResponse.json({ post, summary });
  } catch (e) {
    console.error('שגיאה בתיקון פוסט לפי הערה', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בתיקון' }, { status: 500 });
  }
}
