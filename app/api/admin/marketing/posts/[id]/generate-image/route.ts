import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { renderInsightCard } from '@/lib/marketingCardImage';

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

// POST - יוצר כרטיס גרפי אוטומטי (אותה תבנית "תובנה" שמשמשת לפוסטי ווטסאפ) מתוך ה-hook
// הקיים של הפוסט - בעיקר לפוסטים מסוג "manual" (בריף חופשי) שאין להם יצירת כרטיס אוטומטית
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: post, error: postError } = await supabaseAdmin.from('marketing_posts').select('id, hook').eq('id', params.id).single();
  if (postError || !post) return NextResponse.json({ error: 'הפוסט לא נמצא' }, { status: 404 });
  if (!post.hook?.trim()) return NextResponse.json({ error: 'לפוסט הזה אין הוק/כותרת ליצור ממנה כרטיס' }, { status: 400 });

  try {
    const imageBase64 = await renderInsightCard(post.hook);

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .update({ image_base64: imageBase64, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת הכרטיס הגרפי' }, { status: 500 });

    return NextResponse.json({ post: data });
  } catch (e) {
    console.error('שגיאה ביצירת כרטיס גרפי אוטומטי', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת הכרטיס' }, { status: 500 });
  }
}
