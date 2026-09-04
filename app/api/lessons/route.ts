import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { LESSONS_LIBRARY_PUBLIC } from '@/lib/lessonsConfig';

const TIER_RANK = { public: 0, registered: 1, subscriber: 2 } as const;

// GET - רשימת השיעורים המפורסמים, מסוננת לפי הרשאת הצופה (אורח/מחובר/מנוי).
// שיעורים שהצופה לא מורשה לצפות בהם עדיין מוחזרים (עם thumbnail/כותרת/תיאור) כדי לפתות להצטרפות,
// אבל בלי video_id - כדי שאי אפשר יהיה לצפות בהם בלי ההרשאה המתאימה.
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const cookieHeader = request.headers.get('cookie') || '';
  const hasRegisteredCookie = /(?:^|;\s*)sd_registered=1(?:;|$)/.test(cookieHeader);

  // אין יותר נעילה לפי שיעור בודד - מי שעבר את שער הכניסה של הספרייה (עזב פרטים, כבר מנוי,
  // או כבר בקבוצת העדכונים) רואה את כל השיעורים, בלי תלות ב-tier שנקבע לשיעור עצמו
  let viewerTier: 'public' | 'registered' | 'subscriber' = hasRegisteredCookie ? 'subscriber' : 'public';
  let isAdmin = false;

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      viewerTier = 'registered';
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role === 'subscriber' || profile?.role === 'admin') {
        viewerTier = 'subscriber';
      }
      isAdmin = profile?.role === 'admin';
    }
  }

  // כל עוד הספרייה עדיין לא פורסמה - גלויה רק לאדמין, גם דרך ה-API עצמו
  if (!LESSONS_LIBRARY_PUBLIC && !isAdmin) {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const singleId = searchParams.get('id');

  let query = supabaseAdmin
    .from('lessons')
    .select('id, title, description, category, tier, video_provider, video_id, thumbnail_url, duration_minutes, sort_order')
    .eq('published', true);

  query = singleId ? query.eq('id', singleId) : query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });
  }

  const viewerRank = TIER_RANK[viewerTier];

  const lessons = (data || []).map((l) => {
    const accessible = TIER_RANK[l.tier as keyof typeof TIER_RANK] <= viewerRank;
    const isYoutube = l.video_provider === 'youtube';
    return {
      id: l.id,
      title: l.title,
      description: l.description,
      category: l.category,
      tier: l.tier,
      videoProvider: l.video_provider,
      durationMinutes: l.duration_minutes,
      thumbnailUrl: l.thumbnail_url || (isYoutube ? `https://img.youtube.com/vi/${l.video_id}/hqdefault.jpg` : null),
      videoId: accessible ? l.video_id : null,
      locked: !accessible,
    };
  });

  if (singleId) {
    if (!lessons[0]) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
    return NextResponse.json({ lesson: lessons[0], viewerTier });
  }

  return NextResponse.json({ lessons, viewerTier });
}
