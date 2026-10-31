import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';

// POST - הפעלה מחדש של מנוי/ה שבוטל/ה (subscription_status חוזר ל-"active"), בלי לדרוש
// מהאדמין להקליד מחדש שם/טלפון/מייל - קוראים אותם מהפרופיל הקיים. משתמש באותה
// ensureActiveSubscriberAccount שכל שאר האתר משתמש בה, כדי שהתנהגות ההפעלה תהיה זהה בכל מקום
// body: { userId: string }
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'חסר מזהה משתמש' }, { status: 400 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('email, phone, full_name').eq('id', userId).single();
  if (!profile?.email) return NextResponse.json({ error: 'לא נמצא פרופיל עם מייל' }, { status: 404 });

  try {
    await ensureActiveSubscriberAccount(profile.email, profile.phone || '', profile.full_name || profile.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בהפעלה מחדש' }, { status: 500 });
  }
}
