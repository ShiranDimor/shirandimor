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

// POST - יוצר (או יוצר מחדש) גרסת סטורי (1080x1920) מתוך הכרטיס הראשי הקיים של הפוסט,
// עם רקע ממותג במקום פסים ריקים כשמעלים אותה כסטורי
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: post, error: postError } = await supabaseAdmin.from('marketing_posts').select('id, image_base64').eq('id', params.id).single();
  if (postError || !post) return NextResponse.json({ error: 'הפוסט לא נמצא' }, { status: 404 });
  if (!post.image_base64) return NextResponse.json({ error: 'לפוסט הזה עדיין אין כרטיס גרפי ראשי ליצור ממנו סטורי' }, { status: 400 });

  try {
    const storyImageBase64 = await wrapImageAsStory(post.image_base64);

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .update({ story_image_base64: storyImageBase64, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת תמונת הסטורי' }, { status: 500 });

    return NextResponse.json({ post: data });
  } catch (e) {
    console.error('שגיאה ביצירת תמונת סטורי', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת תמונת הסטורי' }, { status: 500 });
  }
}
