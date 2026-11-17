import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { captureSitePageScreenshot } from '@/lib/siteScreenshot';
import { wrapImageAsStory } from '@/lib/marketingCardImage';

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

// POST - יוצר פוסט "סטורי בלבד" מצילום מסך אמיתי של עמוד קיים באתר (shirandimor.com בלבד) -
// שירן נותנת לינק לאזור שהיא כבר עיצבה באתר, ובמקום לבנות תבנית גרפית נפרדת בקוד, פשוט
// מצלמים את מה שכבר קיים שם ועוטפים בתבנית הסטורי הממותגת
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { topic, url } = body as Record<string, unknown>;

  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'חסר לינק לצילום' }, { status: 400 });
  }
  const topicLabel = typeof topic === 'string' && topic.trim() ? topic.trim() : `סטורי מהאתר: ${url.trim()}`;

  try {
    const screenshotBase64 = await captureSitePageScreenshot(url.trim());
    const storyImageBase64 = await wrapImageAsStory(screenshotBase64);

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .insert([{
        platform: 'facebook',
        content_type: 'story',
        topic: topicLabel,
        hook: '',
        caption: '',
        hashtags: '',
        video_script: '',
        visual_idea: `צילום מסך אוטומטי מהעמוד: ${url.trim()}`,
        status: 'draft',
        source_type: 'manual',
        story_image_base64: storyImageBase64,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת הסטורי' }, { status: 500 });

    return NextResponse.json({ post: data });
  } catch (e) {
    console.error('שגיאה ביצירת סטורי מהאתר', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת הסטורי' }, { status: 500 });
  }
}
