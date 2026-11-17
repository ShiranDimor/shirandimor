import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { entitlementOrFilter } from '@/lib/entitlement';
import { sendPushToAdmins, normalizePhone, normalizeEmail } from '@/lib/webPush';

// קרון יומי - מוצא מנויים/לידים שהתראות הפוש שלהם "נשברו" ב-25 השעות האחרונות (ר' webPush.ts:
// invalid_at מסומן כשהדפדפן/המכשיר מחזיר 404/410 - בד"כ אייפון ש"שוכח" את ההרשמה אחרי כמה ימים
// בלי לפתוח את האתר, לא תקלה אצלנו) ושולח לשירן פוש מרוכז אחד עם השמות, מתועד גם ב-
// /admin/notifications (sendPushToAdmins) - כדי שתוכל לפנות אליהם לפני שהם מרגישים "מנותקים".
//
// קריטי: בודקים לפי אדם, לא לפי שורת-מכשיר בודדת - מישהו עם 2 מכשירים שרק אחד מהם נשבר
// (למשל נרשם מחדש במכשיר/דפדפן אחר) עדיין מקבל פוש דרך המכשיר השני, ולכן הוא לא "מנותק"
// בפועל ולא אמור להופיע ברשימה. בלי הבדיקה הזו הייתה כאן התראת שווא.
//
// 25 שעות (לא 24) כדי שחפיפה קטנה בין ריצות לא תפספס אף שבירה בגלל סטיית זמן קלה בקרון -
// חפיפה כפולה נדירה לא נורא (אותו שם מופיע פעמיים בשני ימים), בעוד שפער בלתי-מכוסה כן בעייתי
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: subscribers } = await supabaseAdmin.from('profiles').select('id, full_name').or(entitlementOrFilter());
  const nameById = new Map((subscribers || []).map((p) => [p.id, p.full_name || 'ללא שם']));

  const sinceIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

  // מנויים: שולפים את כל שורות המינוי (לא רק אלו שנשברו לאחרונה) כדי לבדוק אם יש לאותו
  // user_id מכשיר אחר שעדיין תקף (invalid_at null) - לא רק את מה שנשבר בטווח הזמן האחרון
  let brokenNames: string[] = [];
  if (nameById.size > 0) {
    const { data: subRows, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('user_id, invalid_at')
      .in('user_id', Array.from(nameById.keys()));

    if (error) {
      console.error('push-health-check: שגיאה באיתור הרשמות שנשברו', error);
      return NextResponse.json({ error: 'שגיאה באיתור הרשמות שנשברו' }, { status: 500 });
    }

    const hasValidByUserId = new Map<string, boolean>();
    for (const r of subRows || []) {
      const uid = r.user_id as string;
      hasValidByUserId.set(uid, (hasValidByUserId.get(uid) ?? false) || r.invalid_at === null);
    }

    const recentlyBrokenUserIds = new Set(
      (subRows || [])
        .filter((r) => r.invalid_at && new Date(r.invalid_at) >= new Date(sinceIso))
        .map((r) => r.user_id as string)
    );

    brokenNames = Array.from(recentlyBrokenUserIds)
      .filter((uid) => !hasValidByUserId.get(uid))
      .map((uid) => nameById.get(uid))
      .filter(Boolean) as string[];
  }

  // לידים (user_id ריק) - אותו עיקרון, אבל מקובצים לפי טלפון/אימייל מנורמלים (אין להם
  // user_id יציב) כדי לזהות את אותו איש קשר בין כמה שורות. בלי הבדיקה הזו ליד שהפעיל
  // עדכונים בלי להיות מנוי/ה פשוט "נעלם" בלי שום סימן - הם לא מכוסים ע"י entitlementOrFilter
  const { data: leadRows, error: leadError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('name, phone, email, invalid_at')
    .is('user_id', null);

  if (leadError) console.error('push-health-check: שגיאה באיתור לידים שנשברו', leadError);

  const leadKey = (r: { phone: string | null; email: string | null }) => `${normalizePhone(r.phone)}|${normalizeEmail(r.email)}`;

  const hasValidByLeadKey = new Map<string, boolean>();
  const labelByLeadKey = new Map<string, string>();
  for (const r of leadRows || []) {
    const key = leadKey(r);
    hasValidByLeadKey.set(key, (hasValidByLeadKey.get(key) ?? false) || r.invalid_at === null);
    if (!labelByLeadKey.has(key)) labelByLeadKey.set(key, r.name || r.phone || 'ליד ללא שם');
  }

  const recentlyBrokenLeadKeys = new Set(
    (leadRows || [])
      .filter((r) => r.invalid_at && new Date(r.invalid_at) >= new Date(sinceIso))
      .map(leadKey)
  );

  const brokenLeadNames = Array.from(recentlyBrokenLeadKeys)
    .filter((key) => !hasValidByLeadKey.get(key))
    .map((key) => labelByLeadKey.get(key))
    .filter(Boolean) as string[];

  if (brokenNames.length === 0 && brokenLeadNames.length === 0) {
    return NextResponse.json({ ok: true, broken: 0 });
  }

  const bodyParts: string[] = [];
  if (brokenNames.length > 0) bodyParts.push(`מנויים: ${brokenNames.join(', ')}`);
  if (brokenLeadNames.length > 0) bodyParts.push(`לידים: ${brokenLeadNames.join(', ')}`);

  await sendPushToAdmins(
    {
      title: '🔕 התראות נשברו',
      body: bodyParts.join(' · '),
      url: '/admin/subscribers',
    },
    'announcement'
  );

  return NextResponse.json({ ok: true, broken: brokenNames.length, names: brokenNames, brokenLeads: brokenLeadNames.length, leadNames: brokenLeadNames });
}
