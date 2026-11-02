import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { draftAnnouncement } from '@/lib/announcementDraft';

// POST - מקבל משפט קצר מהאדמין ומחזיר ניסוח מלא (כותרת+תוכן) להודעת לוח מודעות, לעריכה
// לפני שמירה בפועל - לא פועל ישירות, רק מציע ניסוח שממלא את הטופס
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { brief } = await request.json().catch(() => ({}));
  if (!brief || !String(brief).trim()) return NextResponse.json({ error: 'חסר תיאור של ההודעה' }, { status: 400 });

  try {
    const draft = await draftAnnouncement(String(brief).trim());
    return NextResponse.json(draft);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בניסוח' }, { status: 500 });
  }
}
