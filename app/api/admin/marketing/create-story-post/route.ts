import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
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

// POST - יוצר פוסט "סטורי בלבד" מתמונה חופשית שמעלים ידנית (למשל תיק מסחר, לייב, בניית
// תוכנית מסחר) - בלי גנרציית AI ובלי גרסת פיד, רק עטיפה בתבנית הסטורי הממותגת ושמירה כטיוטה
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { topic, imageBase64 } = body as Record<string, unknown>;

  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return NextResponse.json({ error: 'חסרה תמונה להעלאה' }, { status: 400 });
  }
  const topicLabel = typeof topic === 'string' && topic.trim() ? topic.trim() : 'סטורי מתמונה חופשית';

  try {
    const storyImageBase64 = await wrapImageAsStory(imageBase64);

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
        visual_idea: 'תמונה חופשית שהועלתה ידנית',
        status: 'draft',
        source_type: 'manual',
        story_image_base64: storyImageBase64,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת הסטורי' }, { status: 500 });

    return NextResponse.json({ post: data });
  } catch (e) {
    console.error('שגיאה ביצירת סטורי מתמונה חופשית', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת הסטורי' }, { status: 500 });
  }
}
