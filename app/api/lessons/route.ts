import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

const TIER_RANK = { public: 0, registered: 1, subscriber: 2 } as const;

// GET - רשימת השיעורים המפורסמים, מסוננת לפי הרשאת הצופה (אורח/מחובר/מנוי).
// שיעורים שהצופה לא מורשה לצפות בהם עדיין מוחזרים (עם thumbnail/כותרת/תיאור) כדי לפתות להצטרפות,
// אבל בלי video_id - כדי שאי אפשר יהיה לצפות בהם בלי ההרשאה המתאימה.
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const cookieHeader = request.headers.get('cookie') || '';
  const hasRegisteredCookie = /(?:^|;\s*)sd_registered=1(?:;|$)/.test(cookieHeader);

  let viewerTier: 'public' | 'registered' | 'subscriber' = hasRegisteredCookie ? 'registered' : 'public';

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      viewerTier = 'registered';
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role === 'subscriber' || profile?.role === 'admin') {
        viewerTier = 'subscriber';
      }
    }
  }

  const { searchParams } = new URL(request.url);
  const singleId = searchParams.get('id');

  let query = supabaseAdmin
    .from('lessons')
    .select('id, title, description, category, tier, video_id, duration_minutes, sort_order')
    .eq('published', true);

  query = singleId ? query.eq('id', singleId) : query.order('sort_order', { ascending: true }).order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });
  }

  const viewerRank = TIER_RANK[viewerTier];

  const lessons = (data || []).map((l) => {
    const accessible = TIER_RANK[l.tier as keyof typeof TIER_RANK] <= viewerRank;
    return {
      id: l.id,
      title: l.title,
      description: l.description,
      category: l.category,
      tier: l.tier,
      durationMinutes: l.duration_minutes,
      thumbnailUrl: `https://img.youtube.com/vi/${l.video_id}/hqdefault.jpg`,
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
