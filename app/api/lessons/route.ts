import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { LESSONS_LIBRARY_PUBLIC } from '@/lib/lessonsConfig';
import { hasActiveEntitlement } from '@/lib/entitlement';

const TIER_RANK = { public: 0, registered: 1, subscriber: 2 } as const;

// GET - רשימת השיעורים המפורסמים, מסוננת לפי הרשאת הצופה (אורח/ליד ידוע/מנוי אמיתי).
// שיעורים שהצופה לא מורשה לצפות בהם עדיין מוחזרים (עם thumbnail/כותרת/תיאור) כדי לפתות להצטרפות,
// אבל בלי video_id - כדי שאי אפשר יהיה לצפות בהם בלי ההרשאה המתאימה.
//
// 'subscriber' tier נקבע לפי זכאות אמיתית (hasActiveEntitlement) ולא לפי עצם ההרשמה/זיהוי כליד -
// קודם כל ליד שהשאיר פרטים בשער הכניסה (sd_registered cookie) קיבל לצמיתות גישה לכל השיעורים,
// כולל שיעורים שמתויגים tier='subscriber', בלי קשר אם יש לו בפועל מנוי בתשלום. עכשיו ליד כזה
// נשאר ברמת 'registered' (רואה תוכן ציבורי, אבל שיעורי מנויים מוצגים נעולים עם קריאה להצטרפות)
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const cookieHeader = request.headers.get('cookie') || '';
  const hasRegisteredCookie = /(?:^|;\s*)sd_registered=1(?:;|$)/.test(cookieHeader);

  let viewerTier: 'public' | 'registered' | 'subscriber' = hasRegisteredCookie ? 'registered' : 'public';
  let isAdmin = false;

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      viewerTier = 'registered';
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status, subscription_paid_until').eq('id', user.id).maybeSingle();
      if (hasActiveEntitlement(profile)) {
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
