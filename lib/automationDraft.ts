import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToUsers } from '@/lib/webPush';

// נקודת כניסה משותפת לכל האוטומציות (סיכום שוק, תזכורות שבועיות, תזכורות לייב וכו') - כל אחת
// רק מכינה כותרת+תוכן, והפונקציה הזו דואגת לשלושת הדברים המשותפים לכולן: לבדוק שהכלל מופעל
// (כפתור בעמוד /admin/automations), לשמור כטיוטה (published=false - אף פעם לא מתפרסם לבד),
// ולהתריע למנהלות שיש טיוטה חדשה לבדיקה. בלי זה היינו צריכים לשכפל את שלושת הדברים האלה
// בכל אחד מ-7+ ה-cron-ים בנפרד
export async function draftAutomatedAnnouncement(
  ruleKey: string,
  title: string,
  content: string
): Promise<{ drafted: boolean; reason?: string }> {
  const { data: rule } = await supabaseAdmin.from('automation_rules').select('enabled').eq('key', ruleKey).maybeSingle();
  if (rule && rule.enabled === false) {
    return { drafted: false, reason: 'disabled' };
  }

  const { error } = await supabaseAdmin.from('announcements').insert({ title, content, published: false });
  if (error) {
    console.error(`אוטומציה ${ruleKey}: שגיאה בשמירת הטיוטה`, error);
    return { drafted: false, reason: 'save_error' };
  }

  await supabaseAdmin.from('automation_rules').update({ last_run_at: new Date().toISOString() }).eq('key', ruleKey);

  const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
  await sendPushToUsers(
    (admins || []).map((a) => a.id),
    { title: '📰 טיוטה חדשה מוכנה לאישור', body: title, url: '/admin/announcements' }
  );

  return { drafted: true };
}
