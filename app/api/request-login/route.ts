import { NextResponse } from 'next/server';
import { supabaseAdmin, generateInstantLoginToken } from '@/lib/instantLogin';

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: 'חסר אימייל' }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'subscriber')) {
    return NextResponse.json({ granted: false });
  }

  try {
    const token = await generateInstantLoginToken(email);
    return NextResponse.json({ granted: true, token });
  } catch (e) {
    return NextResponse.json({ granted: false, error: 'שגיאה ביצירת כניסה' });
  }
}
