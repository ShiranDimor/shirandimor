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

// PATCH - אישור ופרסום טיוטה (כרגע רק סיכום השוק היומי האוטומטי נוצר כטיוטה, published=false -
// ממתין שתבדקי ותאשרי לפני שהוא מופיע בלוח הציבורי)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { published } = await request.json().catch(() => ({}));
  if (typeof published !== 'boolean') return NextResponse.json({ error: 'חסר published' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('announcements').update({ published }).eq('id', params.id).select('*').single();
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
