import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - פרופיל הקול/הטון הנוכחי (שורה יחידה, id קבוע = 1)
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('marketing_brand_voice').select('*').eq('id', 1).single();
  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ brandVoice: data });
}

// PUT - עדכון פרופיל הקול/הטון
export async function PUT(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { toneNotes, samplePosts, avoidNotes } = body as Record<string, unknown>;

  const { data, error } = await supabaseAdmin
    .from('marketing_brand_voice')
    .update({
      tone_notes: typeof toneNotes === 'string' ? toneNotes : '',
      sample_posts: typeof samplePosts === 'string' ? samplePosts : '',
      avoid_notes: typeof avoidNotes === 'string' ? avoidNotes : '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });

  return NextResponse.json({ brandVoice: data });
}
