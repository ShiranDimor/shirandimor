import { NextResponse } from 'next/server';
import { sendLoginEmail } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';
import { findContact } from '@/lib/crm';

// אימות עבור מי שכבר בשלב "מנוי" ב-CRM (למשל סומן ידנית שם) אבל עדיין אין לו חשבון באתר -
// יוצר לו חשבון ושולח קישור כניסה
export async function POST(request: Request) {
  const { phone, email, firstName, lastName } = await request.json();

  if (!phone || !email || !firstName || !lastName) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const hebrewNamePattern = /^[א-ת\s'-]+$/;
  if (!hebrewNamePattern.test(firstName) || !hebrewNamePattern.test(lastName)) {
    return NextResponse.json({ error: 'שם פרטי ושם משפחה חייבים להיות בעברית' }, { status: 400 });
  }

  const fullName = `${firstName} ${lastName}`.trim();

  try {
    const contact = await findContact(phone, email);
    if (!contact || contact.stage !== 'subscriber') {
      return NextResponse.json({ verified: false, configured: true });
    }

    await ensureActiveSubscriberAccount(email, phone, fullName);
    await sendLoginEmail(email);

    return NextResponse.json({ verified: true, configured: true });
  } catch (e) {
    console.error('שגיאה באימות מנוי מול ה-CRM', e);
    return NextResponse.json({ verified: false, configured: false });
  }
}
