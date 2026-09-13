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

// GET - מטא-דאטה בלבד (בלי הטקסט הגולמי) על ניתוח הוואטסאפ העדכני ביותר שהועלה - להצגה
// בסטודיו לפני לחיצה על "צור תוכן", כדי שידעו ממה זה יישאב
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('whatsapp_analyses')
    .select('id, group_type, message_count, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'שגיאה בשליפה' }, { status: 500 });

  return NextResponse.json({ latest: data });
}
