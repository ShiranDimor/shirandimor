import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { AUTOMATION_TEMPLATES, buildAutomationMessage } from '@/lib/automations';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

// GET - פרטי אוטומציה בודדת: התבנית (ערוכה או ברירת מחדל), המשתנים הזמינים, ותצוגה מקדימה
// של ההודעה כפי שהייתה יוצאת עכשיו (עם נתוני דוגמה אם כרגע אין נתונים אמיתיים)
export async function GET(request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const def = AUTOMATION_TEMPLATES[params.key];
  if (!def) {
    // סיכום השוק היומי נכתב מחדש ע"י AI בכל בוקר - אין לו תבנית קבועה לעריכה
    return NextResponse.json({ templated: false });
  }

  const { data: rule } = await supabaseAdmin.from('automation_rules').select('title_template, content_template').eq('key', params.key).maybeSingle();
  const preview = await buildAutomationMessage(params.key, true);

  return NextResponse.json({
    templated: true,
    title_template: rule?.title_template || def.title,
    content_template: rule?.content_template || def.content,
    customized: Boolean(rule?.title_template || rule?.content_template),
    placeholders: def.placeholders,
    preview: 'error' in preview ? null : preview,
  });
}

// PATCH - הפעלה/כיבוי, ו/או שמירת נוסח ערוך (title_template/content_template). null = חזרה
// לנוסח ברירת המחדל מהקוד
export async function PATCH(request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;

  const def = AUTOMATION_TEMPLATES[params.key];
  for (const field of ['title_template', 'content_template'] as const) {
    if (!(field in body)) continue;
    if (!def) return NextResponse.json({ error: 'לאוטומציה הזו אין נוסח קבוע לעריכה' }, { status: 400 });
    const value = body[field];
    if (value !== null && typeof value !== 'string') return NextResponse.json({ error: `ערך לא תקין ל-${field}` }, { status: 400 });
    const trimmed = typeof value === 'string' ? value.trim() : '';
    // שמירה של נוסח זהה לברירת המחדל = לא "ערוך" - שומרים null, כדי ששיפורים עתידיים בקוד ייכנסו
    const defaultValue = field === 'title_template' ? def.title : def.content;
    update[field] = !trimmed || trimmed === defaultValue.trim() ? null : trimmed;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('automation_rules').update(update).eq('key', params.key).select('*').single();
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  return NextResponse.json({ rule: data });
}
