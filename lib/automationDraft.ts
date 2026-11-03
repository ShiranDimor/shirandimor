import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToUsers } from '@/lib/webPush';

// שבת (כל היום) ויום שישי אחרי 15:00 - אף פעם לא יוצרים טיוטה ולא שולחים התראת פוש (גם לא
// אליה), בלי קשר לשעון קיץ/חורף של השרת - תמיד לפי שעון ישראל
function isShabbatWindow(): boolean {
  // טריק מוכר בקוד הזה (ר' lib/revenueSnapshot.ts) - בונים תאריך "מוזז" לשעון ישראל, כדי
  // שגם getDay() וגם getHours() יחזירו את היום/השעה הנכונים בישראל, לא בשרת (UTC)
  const israelNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const dayOfWeek = israelNow.getDay(); // 0=ראשון ... 5=שישי, 6=שבת
  if (dayOfWeek === 6) return true; // שבת
  if (dayOfWeek === 5 && israelNow.getHours() >= 15) return true; // שישי אחרי 15:00
  return false;
}

// נקודת כניסה משותפת לכל האוטומציות (סיכום שוק, תזכורות שבועיות, תזכורות לייב וכו') - כל אחת
// רק מכינה כותרת+תוכן, והפונקציה הזו דואגת לדברים המשותפים לכולן: לבדוק שלא שבת (ר' למעלה),
// לבדוק שהכלל מופעל (כפתור בעמוד /admin/automations), לשמור כטיוטה (published=false - אף פעם
// לא מתפרסם לבד), ולהתריע למנהלות שיש טיוטה חדשה לבדיקה. בלי זה היינו צריכים לשכפל את זה
// בכל אחד מ-7+ ה-cron-ים בנפרד
export async function draftAutomatedAnnouncement(
  ruleKey: string,
  title: string,
  content: string
): Promise<{ drafted: boolean; reason?: string }> {
  if (isShabbatWindow()) {
    return { drafted: false, reason: 'shabbat' };
  }

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
