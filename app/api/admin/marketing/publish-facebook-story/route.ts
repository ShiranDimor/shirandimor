import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { publishPhotoStoryToFacebookPage } from '@/lib/metaPublish';

export const maxDuration = 30;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// POST - פרסום ידני בפועל כסטורי לעמוד הפייסבוק - נלחץ רק על ידי שירן עצמה, בנפרד מפרסום
// לפיד (אפשר לפרסם לפיד, לסטורי, או לשניהם על אותו פוסט - זה לא סטטוס אחד "פורסם/לא")
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { postId } = body as Record<string, unknown>;
  if (typeof postId !== 'string' || !postId) {
    return NextResponse.json({ error: 'חסר מזהה פוסט' }, { status: 400 });
  }

  const { data: post, error: postError } = await supabaseAdmin.from('marketing_posts').select('*').eq('id', postId).single();
  if (postError || !post) return NextResponse.json({ error: 'הפוסט לא נמצא' }, { status: 404 });
  if (post.story_published_at) return NextResponse.json({ error: 'הסטורי הזה כבר פורסם' }, { status: 409 });
  if (!post.story_image_base64) return NextResponse.json({ error: 'לפוסט הזה אין עדיין גרסת סטורי ליצור' }, { status: 400 });

  try {
    const { postId: externalStoryId } = await publishPhotoStoryToFacebookPage({ storyImageBase64: post.story_image_base64 });

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .update({ story_published_at: new Date().toISOString(), story_external_post_id: externalStoryId, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'הסטורי פורסם בפועל, אך שמירת הסטטוס נכשלה' }, { status: 500 });

    return NextResponse.json({ post: data });
  } catch (e) {
    console.error('שגיאה בפרסום הסטורי לפייסבוק', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בפרסום הסטורי' }, { status: 500 });
  }
}
