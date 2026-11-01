import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// קרון יומי - מוצא מנויים שביקשו לבטל חידוש (subscription_status='cancelling', ר'
// api/admin/cancel-subscription) שהתקופה ששילמו עליה כבר נגמרה (subscription_paid_until
// עבר), ורק עכשיו באמת מוריד להם role ל-"lead" ומסמן subscription_status="cancelled".
// עד הרגע הזה הגישה שלהם נשארת מלאה - זה בדיוק מה ששומר על ההבטחה שביטול לא מקצר
// תקופה ששולמה
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: expired, error: selectError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('subscription_status', 'cancelling')
    .lt('subscription_paid_until', new Date().toISOString());

  if (selectError) {
    console.error('expire-cancelled-subscriptions: שגיאה באיתור מנויים שפג תוקפם', selectError);
    return NextResponse.json({ error: 'שגיאה באיתור מנויים' }, { status: 500 });
  }

  const ids = (expired || []).map((p) => p.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ role: 'lead', subscription_status: 'cancelled' })
    .in('id', ids);

  if (updateError) {
    console.error('expire-cancelled-subscriptions: שגיאה בעדכון מנויים שפג תוקפם', updateError);
    return NextResponse.json({ error: 'שגיאה בעדכון מנויים' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expired: ids.length });
}
