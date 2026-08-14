import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.NOTIFY_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, full_name } = await request.json();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח מייל התראה');
    return NextResponse.json({ ok: true, sent: false });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'התראות האתר <onboarding@resend.dev>',
        to: 'shiran@shirandimor.com',
        subject: 'בקשת הצטרפות חדשה לאתר',
        text: `התקבלה בקשת הצטרפות חדשה.\n\nשם: ${full_name || 'ללא שם'}\nאימייל: ${email}\n\nלאישור: https://www.shirandimor.com/admin/pending`,
      }),
    });

    if (!res.ok) {
      console.error('שגיאה בשליחת מייל ההתראה', await res.text());
      return NextResponse.json({ ok: true, sent: false });
    }

    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    console.error('שגיאה בשליחת מייל ההתראה', e);
    return NextResponse.json({ ok: true, sent: false });
  }
}
