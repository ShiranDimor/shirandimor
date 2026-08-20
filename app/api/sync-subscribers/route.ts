import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { getMondaySubscriberContacts } from '@/lib/tradingPlan/monday';
import { normalizePhone, normalizeEmail } from '@/lib/subscriberStatus';

// עובר על כל המנויים המאושרים, ובודק שהם עדיין נמצאים בקבוצת "קבוצת סוחרים" במאנדיי -
// לפי טלפון או מייל (לרוב המנויים בפועל אין טלפון שמור, רק מייל) - מי שכבר לא שם מורד
// מ"מנוי" ל"ליד", ומאבד את הכניסה המיידית
export async function POST(request: Request) {
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

  const mondayToken = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!mondayToken || !boardId) {
    return NextResponse.json({ error: 'Monday.com לא מוגדר' }, { status: 500 });
  }

  const { data: subscribers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone')
    .eq('role', 'subscriber');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withContact = (subscribers || []).filter((s) => s.phone || s.email);
  const skippedNoPhone = (subscribers || []).length - withContact.length;

  if (withContact.length === 0) {
    return NextResponse.json({ checked: 0, removed: 0, removedNames: [], skippedNoPhone });
  }

  const { phones: activePhones, emails: activeEmails } = await getMondaySubscriberContacts();

  if (activePhones.size === 0 && activeEmails.size === 0) {
    return NextResponse.json({ error: 'לא נמצאו נתונים בקבוצת "קבוצת סוחרים" במאנדיי' }, { status: 500 });
  }

  const toRemove = withContact.filter(
    (s) =>
      !(s.phone && activePhones.has(normalizePhone(s.phone))) &&
      !(s.email && activeEmails.has(normalizeEmail(s.email)))
  );

  if (toRemove.length > 0) {
    await supabaseAdmin
      .from('profiles')
      .update({ role: 'lead' })
      .in('id', toRemove.map((s) => s.id));
  }

  return NextResponse.json({
    checked: withContact.length,
    removed: toRemove.length,
    removedNames: toRemove.map((s) => s.full_name || s.email),
    skippedNoPhone,
  });
}
