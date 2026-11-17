import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { nextBillingDateOnOrAfter } from '@/lib/entitlement';

// POST - ביטול חידוש מנוי ידני: לא חותך גישה מיידית - הגישה נשארת מלאה עד תום התקופה
// ששולמה כבר (אותו יום-בחודש כמו ההצטרפות, בדיוק כמו שמוסבר ב-FAQ של האתר), ורק בתאריך
// הזה cron יומי נפרד (api/cron/expire-cancelled-subscriptions) מוריד בפועל role ל-"lead"
// ומסמן subscription_status="cancelled". subscription_status="cancelling" בינתיים מסמן
// שהביטול בתהליך בלי לקצר את מה ששולם כבר - שירן ביקשה מפורשות שביטול לא יקצר תקופה
// ששולמה. לא מוחק חשבון/נתונים - למחיקה מלאה יש כפתור נפרד
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

  const { data: subscriber } = await supabaseAdmin.from('profiles').select('subscription_started_at').eq('id', userId).maybeSingle();

  // בלי תאריך הצטרפות שמור (לא אמור לקרות למנוי אמיתי שכבר שילם) - אין על מה לשמור גרייס,
  // מבטלים מיידית בדיוק כמו ההתנהגות הישנה
  const paidUntil = subscriber?.subscription_started_at
    ? nextBillingDateOnOrAfter(new Date(subscriber.subscription_started_at))
    : new Date();

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'cancelling',
      subscription_cancelled_at: new Date().toISOString(),
      subscription_paid_until: paidUntil.toISOString(),
    })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: 'שגיאה בביטול המנוי' }, { status: 500 });

  return NextResponse.json({ ok: true, paidUntil: paidUntil.toISOString() });
}
