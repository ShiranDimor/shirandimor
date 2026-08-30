import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { getSubscriberContacts } from '@/lib/crm';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

const DEFAULT_MONTHLY_PRICE = 400;

// GET - תמונת מצב פשוטה: כמות האנשים שנמצאים כרגע בשלב "מנוי" ב-CRM, וסך כל "עלות חודשית ששילם"
// כפי שרשום לכל אחד. מי שלא בשלב הזה לא רלוונטי בכלל - אין כאן ניחוש לפי תאריכי הרשמה או חודש
// ראשון/הבא, רק מה שבאמת רשום ב-CRM עכשיו. כל איש קשר הוא שורה אחת יחידה (אין יותר בעיית
// כפילויות בין שני מקורות אמת שהייתה עם מאנדיי).
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const subscribers = await getSubscriberContacts();

  const missingMonthlyCost: string[] = [];
  const items = subscribers.map((s) => {
    const monthlyCost = s.monthlyCost != null ? Number(s.monthlyCost) : null;
    const price = monthlyCost && !isNaN(monthlyCost) ? monthlyCost : DEFAULT_MONTHLY_PRICE;
    if (!monthlyCost || isNaN(monthlyCost)) missingMonthlyCost.push(s.name || s.phone || s.email || 'ללא שם');
    return {
      name: s.name,
      email: s.email,
      phone: s.phone,
      joinDate: s.joinDate,
      price,
    };
  });

  items.sort((a, b) => (b.joinDate || '').localeCompare(a.joinDate || ''));

  return NextResponse.json({
    count: items.length,
    totalAmount: items.reduce((sum, i) => sum + i.price, 0),
    items,
    duplicatesRemoved: [],
    missingMonthlyCost,
  });
}
