// רשימת אנשי קשר חסומים (לפי נייד) - לאדם שצריך למנוע ממנו כל אינטראקציה חדשה עם האתר
// (הרשמה לקבוצת עדכונים, ל-7 ימי ניסיון, ללייבים, ושיחה עם דור). לא נוגע בכלום שכבר קיים
// (למשל מנוי פעיל קיים) - זה רק שער למניעת יצירת קשר/ליד חדש.
import { supabaseAdmin } from '@/lib/instantLogin';
import { normalizePhone } from '@/lib/subscriberStatus';

export async function isPhoneBlocked(phone: string | null | undefined): Promise<boolean> {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const { data } = await supabaseAdmin.from('blocked_contacts').select('id').eq('phone_normalized', normalized).maybeSingle();
  return Boolean(data);
}
