import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { generateMarketingVariant, type MarketingPlatform, type MarketingContentType } from '@/lib/marketingStudio';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

const PLATFORMS: MarketingPlatform[] = ['instagram', 'facebook', 'both'];
const CONTENT_TYPES: MarketingContentType[] = ['feed_post', 'reel', 'story'];

// GET - כל הטיוטות/פוסטים, לתצוגת התור בניהול
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('marketing_posts').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ posts: data });
}

// POST - יצירת טיוטה/ות חדשות בעזרת AI לפי בריף + פרופיל הקול השמור
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { platform, contentType, topic, variantCount } = body as Record<string, unknown>;

  if (typeof platform !== 'string' || !PLATFORMS.includes(platform as MarketingPlatform)) {
    return NextResponse.json({ error: 'פלטפורמה לא תקינה' }, { status: 400 });
  }
  if (typeof contentType !== 'string' || !CONTENT_TYPES.includes(contentType as MarketingContentType)) {
    return NextResponse.json({ error: 'סוג תוכן לא תקין' }, { status: 400 });
  }
  if (typeof topic !== 'string' || !topic.trim()) {
    return NextResponse.json({ error: 'חסר נושא/בריף לפוסט' }, { status: 400 });
  }

  const count = typeof variantCount === 'number' && variantCount >= 1 && variantCount <= 3 ? Math.floor(variantCount) : 1;

  const { data: brandVoiceRow, error: brandVoiceError } = await supabaseAdmin.from('marketing_brand_voice').select('*').eq('id', 1).single();
  if (brandVoiceError) return NextResponse.json({ error: 'שגיאה בטעינת פרופיל הקול' }, { status: 500 });

  try {
    const variants = await Promise.all(
      Array.from({ length: count }).map(() =>
        generateMarketingVariant({
          platform: platform as MarketingPlatform,
          contentType: contentType as MarketingContentType,
          topic,
          brandVoice: {
            tone_notes: brandVoiceRow.tone_notes || '',
            sample_posts: brandVoiceRow.sample_posts || '',
            avoid_notes: brandVoiceRow.avoid_notes || '',
          },
        })
      )
    );

    const rowsToInsert = variants.map((v) => ({
      platform,
      content_type: contentType,
      topic: topic.trim(),
      hook: v.hook,
      caption: v.caption,
      hashtags: v.hashtags,
      video_script: v.video_script,
      visual_idea: v.visual_idea,
      status: 'draft' as const,
    }));

    const { data, error } = await supabaseAdmin.from('marketing_posts').insert(rowsToInsert).select();
    if (error) return NextResponse.json({ error: 'שגיאה בשמירת הטיוטה' }, { status: 500 });

    return NextResponse.json({ posts: data });
  } catch (e) {
    console.error('שגיאה ביצירת תוכן שיווקי', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת התוכן' }, { status: 500 });
  }
}
