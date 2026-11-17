import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToAdmins } from '@/lib/webPush';

// נקרא דרך pg_cron כמה דקות אחרי הבקרה הלילית: אם נכתב דוח יומי שעוד לא נשלחה עליו התראה,
// שולח לשירן התראה לטלפון (כמו התראות הפרסום) עם הכותרת שלו, ולחיצה פותחת את לשונית הבקרה.
// התראת האפליקציה של Claude לא תמיד מגיעה, ולכן זה הערוץ הקבוע.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: reports, error } = await supabaseAdmin
    .from('marketing_daily_reports')
    .select('id, report_date, headline, needs_shiran')
    .is('notified_at', null)
    .order('report_date', { ascending: false })
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const report = reports?.[0];
  if (!report) return NextResponse.json({ ok: true, sent: false });

  const waiting = report.needs_shiran && String(report.needs_shiran).trim() ? ' · יש משהו שמחכה לך' : '';
  await sendPushToAdmins(
    { title: `📊 הבקרה היומית${waiting}`, body: String(report.headline || 'הדוח מוכן').slice(0, 180), url: '/admin/marketing?tab=report' },
    'announcement',
    String(report.id)
  );
  // מסמנים את כל הדוחות הפתוחים, כדי שדוח ישן לא ייצא בהתראה מאוחרת
  await supabaseAdmin.from('marketing_daily_reports').update({ notified_at: new Date().toISOString() }).is('notified_at', null);
  return NextResponse.json({ ok: true, sent: true, report_date: report.report_date });
}
