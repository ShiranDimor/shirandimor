import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { entitlementOrFilter } from '@/lib/entitlement';
import { sendPushToUsers } from '@/lib/webPush';

// קרון יומי - מוצא מנויים (לא לידים) שההתראות שלהם "נשברו" ב-25 השעות האחרונות (ר' webPush.ts:
// invalid_at מסומן כשהדפדפן/המכשיר מחזיר 404/410 - בד"כ אייפון ש"שוכח" את ההרשמה אחרי כמה ימים
// בלי לפתוח את האתר, לא תקלה אצלנו) ושולח לשירן פוש אחד מרוכז עם השמות - כדי שתוכל לפנות אליהם
// (תזכורת/בדיקה ב-/admin/subscribers) לפני שהם מרגישים "מנותקים" ושוקלים לבטל. 25 שעות (לא 24)
// כדי שחפיפה קטנה בין ריצות לא תפספס אף שבירה בגלל סטיית זמן קלה בקרון - חפיפה כפולה נדירה
// לא נורא (באותו שם מופיע פעמיים בשני ימים), בעוד שפער בלתי-מכוסה כן היה בעייתי
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: subscribers } = await supabaseAdmin.from('profiles').select('id, full_name').or(entitlementOrFilter());
  const nameById = new Map((subscribers || []).map((p) => [p.id, p.full_name || 'ללא שם']));

  if (nameById.size === 0) {
    return NextResponse.json({ ok: true, broken: 0 });
  }

  const sinceIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { data: brokenRows, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id')
    .in('user_id', Array.from(nameById.keys()))
    .not('invalid_at', 'is', null)
    .gte('invalid_at', sinceIso);

  if (error) {
    console.error('push-health-check: שגיאה באיתור הרשמות שנשברו', error);
    return NextResponse.json({ error: 'שגיאה באיתור הרשמות שנשברו' }, { status: 500 });
  }

  const brokenNames = Array.from(new Set((brokenRows || []).map((r) => nameById.get(r.user_id as string)).filter(Boolean))) as string[];

  // לידים (user_id ריק) שההתראות שלהם נשברו - בלי הבדיקה הזו ליד שהפעיל עדכונים בלי להיות
  // מנוי/ה פשוט "נעלם" בלי שום סימן, כי הם לא מכוסים ע"י entitlementOrFilter למעלה בכלל
  const { data: brokenLeadRows, error: leadError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('name, phone')
    .is('user_id', null)
    .not('invalid_at', 'is', null)
    .gte('invalid_at', sinceIso);

  if (leadError) console.error('push-health-check: שגיאה באיתור לידים שנשברו', leadError);

  const brokenLeadNames = Array.from(
    new Set((brokenLeadRows || []).map((r) => r.name || r.phone || 'ליד ללא שם'))
  );

  if (brokenNames.length === 0 && brokenLeadNames.length === 0) {
    return NextResponse.json({ ok: true, broken: 0 });
  }

  const bodyParts: string[] = [];
  if (brokenNames.length > 0) bodyParts.push(`מנויים: ${brokenNames.join(', ')}`);
  if (brokenLeadNames.length > 0) bodyParts.push(`לידים: ${brokenLeadNames.join(', ')}`);

  const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
  await sendPushToUsers(
    (admins || []).map((a) => a.id),
    {
      title: '🔕 התראות נשברו',
      body: bodyParts.join(' · '),
      url: '/admin/subscribers',
    }
  );

  return NextResponse.json({ ok: true, broken: brokenNames.length, names: brokenNames, brokenLeads: brokenLeadNames.length, leadNames: brokenLeadNames });
}
