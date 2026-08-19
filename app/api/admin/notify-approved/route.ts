import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// שולח למנוי שאושר מייל שמודיע לו שהוא מאושר ויכול להיכנס - נקרא מיד אחרי אישור מנוי בעמוד הניהול
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

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: 'חסר מזהה משתמש' }, { status: 400 });
  }

  const { data: subscriber } = await supabaseAdmin.from('profiles').select('email, full_name').eq('id', userId).single();
  if (!subscriber?.email) {
    return NextResponse.json({ error: 'לא נמצא מייל למנוי' }, { status: 404 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח מייל אישור');
    return NextResponse.json({ ok: true, sent: false });
  }

  const firstName = subscriber.full_name ? subscriber.full_name.split(' ')[0] : '';

  const html = `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <div style="color:#4FB876;font-size:26px;margin-bottom:6px;">✔</div>
        <div style="color:#fff;font-size:19px;font-weight:700;">${firstName ? `${firstName}, ` : ''}אושרת!</div>
      </div>
      <div style="padding:24px;text-align:center;">
        <p style="font-size:14.5px;color:#333;line-height:1.7;margin:0 0 20px;">
          החשבון שלך בקבוצת הסוחרים אושר, ואפשר להיכנס לאתר עכשיו - בלי סיסמה, רק עם המייל הזה.
        </p>
        <a href="https://www.shirandimor.com/login" style="display:inline-block;background:#9C8FD9;color:#fff;text-decoration:none;font-weight:700;font-size:14.5px;padding:13px 28px;border-radius:10px;">
          כניסה לאתר
        </a>
      </div>
    </div>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'קבוצת הסוחרים <noreply@shirandimor.com>',
        to: subscriber.email,
        subject: 'אושרת להצטרפות לקבוצת הסוחרים 🎉',
        html,
      }),
    });

    if (!res.ok) {
      console.error('שגיאה בשליחת מייל אישור', await res.text());
      return NextResponse.json({ ok: true, sent: false });
    }

    return NextResponse.json({ ok: true, sent: true });
  } catch (e) {
    console.error('שגיאה בשליחת מייל אישור', e);
    return NextResponse.json({ ok: true, sent: false });
  }
}
