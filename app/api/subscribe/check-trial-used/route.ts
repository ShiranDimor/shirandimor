import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { normalizePhone } from '@/lib/subscriberStatus';

// POST - בודק לפי נייד (לפני מעבר לתשלום ב-/subscribe) אם מישהו כבר ניצל בעבר את הטבת
// "חודש ראשון ב-1 ש"ח" - כולל מי שלא מחובר/ת בכלל, כי שם אי אפשר לבדוק לפי session. זו
// הבדיקה היחידה שבאמת סוגרת את הפרצה למי שלא מחובר/ת (ר' lib/subscriberStatus.ts - חסימת
// ניצול חוזר בפועל קורית רק אחרי התשלום בפועל, כשה-webhook מגיע). לא חושף שום מידע מעבר
// ל-true/false - בלי שם/פרטים, כדי שלא יהיה אפשר "לדוג" מידע על מי שרשום אצלנו
export async function POST(request: Request) {
  const { phone } = await request.json().catch(() => ({ phone: '' }));
  const targetPhone = normalizePhone(typeof phone === 'string' ? phone : '');
  if (!targetPhone) return NextResponse.json({ usedTrialBefore: false });

  const { data } = await supabaseAdmin.from('profiles').select('phone').eq('trial_price_used', true).not('phone', 'is', null);
  const usedTrialBefore = (data || []).some((p) => normalizePhone(p.phone) === targetPhone);

  return NextResponse.json({ usedTrialBefore });
}
