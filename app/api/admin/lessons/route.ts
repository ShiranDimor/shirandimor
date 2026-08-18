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

// מחלץ YouTube video id מכל צורת לינק נפוצה (youtu.be, watch?v=, embed/, shorts/) - או מקבל id גולמי כמו שהוא
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

// GET - כל השיעורים (כולל טיוטות ולא-מפורסמים) - לתצוגת ניהול
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('lessons').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ lessons: data });
}

// POST - יצירת שיעור חדש
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { title, description, category, tier, videoUrl, durationMinutes, published, sortOrder } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'חסרה כותרת' }, { status: 400 });
  }
  if (!videoUrl || typeof videoUrl !== 'string') {
    return NextResponse.json({ error: 'חסר לינק וידאו' }, { status: 400 });
  }

  const videoId = extractYoutubeId(videoUrl);
  if (!videoId) {
    return NextResponse.json({ error: 'לא הצלחתי לזהות מזהה סרטון מהלינק - ודאי שזה לינק YouTube תקין' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('lessons')
    .insert({
      title,
      description: description || null,
      category: category || null,
      tier: tier === 'registered' || tier === 'subscriber' ? tier : 'public',
      video_provider: 'youtube',
      video_id: videoId,
      duration_minutes: typeof durationMinutes === 'number' ? durationMinutes : null,
      published: published !== false,
      sort_order: typeof sortOrder === 'number' ? sortOrder : 0,
    })
    .select('*')
    .single();

  if (error) {
    console.error('שגיאה ביצירת שיעור', error);
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
  }

  return NextResponse.json({ lesson: data });
}
