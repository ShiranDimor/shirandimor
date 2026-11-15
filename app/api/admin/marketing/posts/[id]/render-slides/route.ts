import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { renderSlidesIfNeeded } from '@/lib/marketingPublisher';

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

// POST - יוצר עכשיו את התמונות של פוסט מחבילת תוכן (slides_html), בלי לחכות לסבב התזמון הבא
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  try {
    await renderSlidesIfNeeded(params.id);
    const { data: post, error } = await supabaseAdmin.from('marketing_posts').select('*').eq('id', params.id).single();
    if (error || !post) return NextResponse.json({ error: 'הפוסט לא נמצא' }, { status: 404 });
    return NextResponse.json({ post });
  } catch (e) {
    console.error('שגיאה ביצירת תמונות מהשקפים', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת התמונות' }, { status: 500 });
  }
}
