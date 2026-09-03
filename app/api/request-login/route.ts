import { NextResponse } from 'next/server';
import { supabaseAdmin, sendLoginEmail } from '@/lib/instantLogin';

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: 'חסר אימייל' }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .ilike('email', email.trim())
    .maybeSingle();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'subscriber')) {
    return NextResponse.json({ granted: false });
  }

  try {
    await sendLoginEmail(email);
    return NextResponse.json({ granted: true });
  } catch (e) {
    return NextResponse.json({ granted: false, error: 'שגיאה בשליחת מייל כניסה' });
  }
}
