import { NextResponse } from 'next/server';

// זמני - בדיקה חד-פעמית האם השולח הישן (onboarding@resend.dev, לפני התיקון) נכשל בשקט
// כששולחים לכתובת שאינה בעלת חשבון ה-Resend. יימחק מיד אחרי הבדיקה.
export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'no api key' }, { status: 500 });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: 'shiran@shirandizi.com',
      subject: 'בדיקת שולח ישן - זמני',
      html: '<p>בדיקה</p>',
    }),
  });

  const text = await res.text();
  return NextResponse.json({ status: res.status, ok: res.ok, body: text });
}
