import { NextResponse } from 'next/server';

// Webhook לחיבור המספר של וואטסאפ עסקי (Meta Cloud API) - שלב ראשון בהקמת "דור" כסוכנת יזומה
// בוואטסאפ. בשלב זה הוא רק מאמת את הכתובת מול מטא ומקבל הודעות נכנסות ללוג - הלוגיקה של
// המענה האוטומטי/דור תתווסף בשלב הבא, אחרי שהחיבור למספר האמיתי מאושר ועובד.

// מטא שולח בקשת GET חד-פעמית עם hub.verify_token כדי לאמת את הכתובת בזמן הגדרת ה-Webhook -
// חייבים להחזיר בדיוק את hub.challenge בחזרה (כטקסט רגיל) אם הטוקן תואם
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'אימות נכשל' }, { status: 403 });
}

// מטא דורש תגובת 200 מהירה על כל הודעה נכנסת, אחרת ה-Webhook מושבת אוטומטית -
// כרגע רק רושמים ללוג לצורך אימות שהחיבור עובד
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  console.log('התקבלה הודעת Webhook מוואטסאפ', JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
