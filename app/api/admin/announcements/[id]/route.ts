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

// PATCH - אישור ופרסום טיוטה (published), ועריכת כותרת/תוכן - שימושי בעיקר לסיכום השוק היומי
// שנכתב ע"י AI: לפעמים נשארת בטעות שארית "מחשבה" של המודל עצמו בתוך הטקסט (למשל "לא הצלחתי
// לאמת X") שלא אמורה לצאת למנויים - בלי יכולת עריכה כאן, הדרך היחידה הייתה למחוק את ההודעה
// ולהתחיל מאפס. אפשר לשלוח published ו/או title+content יחד או בנפרד
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { published, title, content, image_url } = body as { published?: unknown; title?: unknown; content?: unknown; image_url?: unknown };

  const updates: Record<string, unknown> = {};
  if (published !== undefined) {
    if (typeof published !== 'boolean') return NextResponse.json({ error: 'published לא תקין' }, { status: 400 });
    updates.published = published;
  }
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) return NextResponse.json({ error: 'חסרה כותרת' }, { status: 400 });
    updates.title = title.trim();
  }
  if (content !== undefined) {
    if (typeof content !== 'string' || !content.trim()) return NextResponse.json({ error: 'חסר תוכן' }, { status: 400 });
    updates.content = content.trim();
  }
  if (image_url !== undefined) {
    if (image_url !== null && typeof image_url !== 'string') return NextResponse.json({ error: 'image_url לא תקין' }, { status: 400 });
    updates.image_url = image_url || null;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('announcements').update(updates).eq('id', params.id).select('*').single();
  if (error) return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });

  return NextResponse.json({ announcement: data });
}

// DELETE - מחיקת הודעה מלוח המודעות, וגם רשומת ההתראה שנשלחה עליה (אם נשלחה) - כדי שלא תישאר
// "רפאים" בפעמון ההתראות אחרי שהתוכן המקורי כבר לא קיים
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { error } = await supabaseAdmin.from('announcements').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: 'שגיאה במחיקה' }, { status: 500 });

  await supabaseAdmin.from('notification_log').delete().eq('source_id', params.id);

  return NextResponse.json({ ok: true });
}
