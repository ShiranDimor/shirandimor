import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// מוחק חשבון לגמרי - ליד שממתין לאישור (דחייה) או מנוי מאושר (הסרה) - כולל כל הנתונים התלויים ואת חשבון ההתחברות עצמו
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
  if (userId === user.id) {
    return NextResponse.json({ error: 'אי אפשר למחוק את החשבון של עצמך' }, { status: 400 });
  }

  await supabaseAdmin.from('journal_entries').delete().eq('user_id', userId);
  await supabaseAdmin.from('referrals').delete().eq('referrer_user_id', userId);
  await supabaseAdmin.from('portfolio_notes').delete().or(`user_id.eq.${userId},author_id.eq.${userId}`);
  await supabaseAdmin.from('trades').delete().eq('created_by', userId);
  await supabaseAdmin.from('profiles').delete().eq('id', userId);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
