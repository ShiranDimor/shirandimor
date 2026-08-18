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

function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null;
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    const match = url.pathname.match(/\/(embed|shorts)\/([\w-]{11})/);
    if (match) return match[2];
  } catch {
    return null;
  }
  return null;
}

// PATCH - עדכון שיעור קיים
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { title, description, category, tier, videoUrl, durationMinutes, published, sortOrder } = body as Record<string, unknown>;

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof title === 'string') fields.title = title;
  if (typeof description === 'string' || description === null) fields.description = description;
  if (typeof category === 'string' || category === null) fields.category = category;
  if (tier === 'public' || tier === 'registered' || tier === 'subscriber') fields.tier = tier;
  if (typeof durationMinutes === 'number' || durationMinutes === null) fields.duration_minutes = durationMinutes;
  if (typeof published === 'boolean') fields.published = published;
  if (typeof sortOrder === 'number') fields.sort_order = sortOrder;

  if (typeof videoUrl === 'string' && videoUrl.trim()) {
    const videoId = extractYoutubeId(videoUrl);
    if (!videoId) {
      return NextResponse.json({ error: 'לא הצלחתי לזהות מזהה סרטון מהלינק - ודאי שזה לינק YouTube תקין' }, { status: 400 });
    }
    fields.video_id = videoId;
  }

  const { data, error } = await supabaseAdmin.from('lessons').update(fields).eq('id', params.id).select('*').maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });
  }

  return NextResponse.json({ lesson: data });
}

// DELETE - מחיקת שיעור
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { error } = await supabaseAdmin.from('lessons').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'שגיאה במחיקה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
