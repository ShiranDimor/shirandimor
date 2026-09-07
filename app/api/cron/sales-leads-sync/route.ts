import { NextResponse } from 'next/server';
import { syncSalesLeadsFromMonday } from '@/lib/salesLeads/mondaySync';

// GET - קרון יומי (Vercel, 05:00) שמסנכרן את קבוצת העדכונים ממאנדיי, כדי שלידים חדשים ייכנסו
// למערכת גם בלי לחיצה ידנית על "סנכרן עכשיו". תדירות יומית - כמו שאר ה-cron jobs הקיימים
// בפרויקט (מגבלת תוכנית Vercel) - לסנכרון מיידי יש את כפתור "סנכרן עכשיו" באדמין, ואפשר גם
// לחבר Webhook של מאנדיי (app/api/webhooks/monday-sales-leads) לעדכון בזמן אמת
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncSalesLeadsFromMonday();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('שגיאה בסנכרון תקופתי של לידי מכירות ממאנדיי', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בסנכרון' }, { status: 500 });
  }
}
