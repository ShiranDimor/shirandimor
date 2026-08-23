import { NextResponse } from 'next/server';
import { createSubscriptionInvoice } from '@/lib/greenInvoice';

// שמות השדות כאן הם ניחוש סביר לפי מוסכמות נפוצות ב-webhooks של Grow - לא תיעוד רשמי שאומת
// (הגישה לתיעוד של Grow חסומה מהסביבה הזו). יש לבדוק webhook אמיתי אחד ולעדכן את הרשימות
// לפי השמות שמתקבלים בפועל לפני הפעלה בפרודקשן
function extractField(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

// מקבל webhook מ-Grow על תשלום שהתקבל, ומפיק אוטומטית חשבונית בחשבונית ירוקה ללקוח -
// כדי לא להצטרך להפיק חשבוניות ידנית לכל מנוי חדש
export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret');
  if (!process.env.GROW_WEBHOOK_SECRET || secret !== process.env.GROW_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const name = extractField(payload, ['customerName', 'fullName', 'name']);
  const email = extractField(payload, ['customerEmail', 'email']);
  const phone = extractField(payload, ['customerPhone', 'phone', 'tel']);
  const amount = extractField(payload, ['sum', 'amount', 'price', 'total']);

  if (!name || !email || !amount) {
    console.error('Grow webhook: חסרים שדות נדרשים ליצירת חשבונית', payload);
    return NextResponse.json({ error: 'missing required fields', received: payload }, { status: 400 });
  }

  try {
    await createSubscriptionInvoice({
      name,
      email,
      phone,
      amount: Number(amount),
      description: 'מנוי חודשי – קבוצת סוחרים',
    });
  } catch (e) {
    console.error('שגיאה ביצירת חשבונית בחשבונית ירוקה', e);
    return NextResponse.json({ error: 'green invoice failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
