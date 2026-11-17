import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// POST - נקרא מה-Service Worker (public/sw.js) ברגע שהתראת פוש באמת הוצגה במכשיר - לא רק
// ששירות הפוש של גוגל/אפל הסכים לקבל אותה לשליחה (ר' lib/webPush.ts: עד עכשיו sent_count
// מדד רק את זה). בלי אימות משתמש/ת בכוונה - זה נקרא מהקשר אנונימי לגמרי (ה-SW, לא עמוד מחובר),
// בדיוק כמו /api/push/subscribe. upsert-לפי-זוג (unique constraint) כדי שניסיון כפול מה-SW
// (רשת לא יציבה, ניסיון חוזר) לא ייכשל ולא ייצור כפילות
export async function POST(request: Request) {
  const { logId, endpoint } = await request.json().catch(() => ({}));
  if (!logId || !endpoint) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const { data: sub } = await supabaseAdmin.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle();
  if (!sub) {
    // ה-endpoint לא קיים אצלנו (מחיקה/שינוי בינתיים) - אין למי לייחס את האישור, לא שגיאה אמיתית
    return NextResponse.json({ ok: true, recorded: false });
  }

  const { error } = await supabaseAdmin
    .from('notification_receipts')
    .upsert({ notification_log_id: logId, push_subscription_id: sub.id }, { onConflict: 'notification_log_id,push_subscription_id' });

  if (error) {
    console.error('push/receipt: שגיאה בשמירת אישור קבלה', error);
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recorded: true });
}
