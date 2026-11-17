import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { publishMarketingPost } from '@/lib/marketingPublisher';

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

// POST - פרסום ידני מיידי לאינסטגרם (פיד או סטורי, לפי סוג הפוסט) - נלחץ רק על ידי שירן
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { postId } = body as Record<string, unknown>;
  if (typeof postId !== 'string' || !postId) {
    return NextResponse.json({ error: 'חסר מזהה פוסט' }, { status: 400 });
  }

  try {
    const { results } = await publishMarketingPost(postId, { only: 'instagram' });
    const { data: post } = await supabaseAdmin.from('marketing_posts').select('*').eq('id', postId).single();
    const failure = results.find((r) => !r.ok);
    if (failure) return NextResponse.json({ error: failure.error, post }, { status: 500 });
    return NextResponse.json({ post, results });
  } catch (e) {
    console.error('שגיאה בפרסום לאינסטגרם', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בפרסום' }, { status: 500 });
  }
}
