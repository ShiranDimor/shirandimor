import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { publishPhotoToFacebookPage } from '@/lib/metaPublish';

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

// POST - פרסום ידני בפועל לעמוד הפייסבוק - נלחץ רק על ידי שירן עצמה אחרי שסקרה ואישרה
// את התוכן (אין פרסום אוטומטי בלי לחיצה מפורשת כאן, לפי מה שביקשה)
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
  if (post.status === 'published') return NextResponse.json({ error: 'הפוסט הזה כבר פורסם' }, { status: 409 });
  if (!post.image_base64) return NextResponse.json({ error: 'לפוסט הזה אין כרטיס גרפי לפרסום' }, { status: 400 });

  try {
    const caption = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
    const extraImages: string[] = Array.isArray(post.extra_images) ? post.extra_images : [];
    const { postId: externalPostId } = await publishPhotoToFacebookPage({
      images: [post.image_base64, ...extraImages],
      caption,
    });

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .update({ status: 'published', published_at: new Date().toISOString(), external_post_id: externalPostId, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'פורסם בפועל, אך שמירת הסטטוס נכשלה' }, { status: 500 });

    return NextResponse.json({ post: data, facebookUrl: `https://www.facebook.com/${externalPostId}` });
  } catch (e) {
    console.error('שגיאה בפרסום לפייסבוק', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בפרסום' }, { status: 500 });
  }
}
