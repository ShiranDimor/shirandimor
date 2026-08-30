import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { getActiveSubscriberContacts, normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';
import { getSubscriberContactKeys } from '@/lib/crm';

// GET - סך הכל מילאו את השאלון (השלימו + ננטשו באמצע), וכמה מהם עדיין לא נצפו (לא נלחץ עליהם "פרטים מלאים") - לבאדג' בדף הניהול.
// מנויים פעילים לא נספרים כאן - זו רשימת "לידים" להמרה, ומנוי כבר המיר (ראו הערה ב-route.ts הראשי).
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });
  }

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  }

  const [{ data: rows }, { phones: subscriberPhones, emails: subscriberEmails }, { phones: crmPhones, emails: crmEmails }] = await Promise.all([
    supabaseAdmin.from('trading_plan_responses').select('name, phone, email, admin_viewed_at, admin_handled_at').in('status', ['in_progress', 'completed']),
    getActiveSubscriberContacts(),
    getSubscriberContactKeys(),
  ]);

  const leadsOnly = (rows || []).filter(
    (r) =>
      !subscriberPhones.has(normalizePhone(r.phone)) &&
      !subscriberEmails.has(normalizeEmail(r.email)) &&
      !crmPhones.has(normalizePhone(r.phone)) &&
      !crmEmails.has(normalizeEmail(r.email)) &&
      // אותו סינון כמו ב-route הראשי - מי שאין לו שום פרט קשר לא נחשב "ליד"
      (r.name || r.phone || r.email)
  );
  const total = leadsOnly.length;
  // "חדש" נספר רק מבין לידים שעדיין לא טופלו - ליד שכבר סומן "טופל" לא צריך תשומת לב,
  // גם אם מעולם לא נלחץ עליו "פרטים מלאים" (למשל סומן כטופל ישירות בלי לפתוח קודם)
  const unread = leadsOnly.filter((r) => !r.admin_viewed_at && !r.admin_handled_at).length;

  return NextResponse.json({ total, unread });
}
