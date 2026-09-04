import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { extractYoutubeId, extractGammaEmbedSrc, fetchOgImage } from '@/lib/lessonMedia';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
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
  const { title, description, category, tier, provider, videoUrl, thumbnailUrl: manualThumbnailUrl, durationMinutes, published, sortOrder } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'חסרה כותרת' }, { status: 400 });
  }
  if (!videoUrl || typeof videoUrl !== 'string') {
    return NextResponse.json({ error: provider === 'gamma' ? 'חסר לינק למצגת' : 'חסר לינק וידאו' }, { status: 400 });
  }

  const isGamma = provider === 'gamma';
  const videoId = isGamma ? extractGammaEmbedSrc(videoUrl) : extractYoutubeId(videoUrl);
  if (!videoId) {
    return NextResponse.json({
      error: isGamma
        ? 'לא הצלחתי לזהות לינק תקין ל-Gamma - הדביקו את הלינק לשיתוף, או את קוד ה-embed המלא'
        : 'לא הצלחתי לזהות מזהה סרטון מהלינק - ודאי שזה לינק YouTube תקין',
    }, { status: 400 });
  }

  // עדיפות לתמונה שהוזנה ידנית. רק אם לא הוזנה - מנסים best-effort לשלוף og:image מהמצגת עצמה
  // (אם זה נכשל - השיעור עדיין נשמר כרגיל, פשוט עם פלייסהולדר "מצגת" גנרי)
  const manualThumbnail = typeof manualThumbnailUrl === 'string' && manualThumbnailUrl.trim() ? manualThumbnailUrl.trim() : null;
  const thumbnailUrl = manualThumbnail || (isGamma ? await fetchOgImage(videoId) : null);

  const { data, error } = await supabaseAdmin
    .from('lessons')
    .insert({
      title,
      description: description || null,
      category: category || null,
      tier: tier === 'registered' || tier === 'subscriber' ? tier : 'public',
      video_provider: isGamma ? 'gamma' : 'youtube',
      video_id: videoId,
      thumbnail_url: thumbnailUrl,
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
