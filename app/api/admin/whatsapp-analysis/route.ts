import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { analyzeWhatsappExport, truncateForAnalysis } from '@/lib/whatsappAnalysis';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - רשימת ניתוחים קודמים (בלי הטקסט הגולמי - כדי לשמור את התגובה קלה)
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('whatsapp_analyses')
    .select('id, group_type, message_count, truncated, analysis, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analyses: data || [] });
}

// POST - מקבל ייצוא צ'אט גולמי, שולח לניתוח, ושומר את התוצאה
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const groupType = body?.groupType;
  const rawText = body?.rawText;

  if (groupType !== 'סוחרים' && groupType !== 'עדכונים') {
    return NextResponse.json({ error: 'קבוצה לא תקינה' }, { status: 400 });
  }
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 20) {
    return NextResponse.json({ error: 'קובץ הייצוא ריק מדי או חסר' }, { status: 400 });
  }

  const { text, truncated } = truncateForAnalysis(rawText);
  const messageCount = (rawText.match(/^\[?\d{1,2}\/\d{1,2}\/\d{2,4},/gm) || []).length;

  try {
    const analysis = await analyzeWhatsappExport(text, groupType);

    const { data, error } = await supabaseAdmin
      .from('whatsapp_analyses')
      .insert({ group_type: groupType, raw_text: rawText, analysis, truncated, message_count: messageCount || null })
      .select('id, group_type, message_count, truncated, analysis, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ analysis: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בניתוח' }, { status: 500 });
  }
}
