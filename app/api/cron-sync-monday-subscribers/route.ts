import { NextResponse } from 'next/server';
import { syncMondaySubscribersToSite } from '@/lib/mondaySubscriberSync';

// GET - מופעל ע"י Vercel Cron פעם ביום, כדי שמנוי שקיים רק במאנדיי (למשל שולב ידנית, או
// מעולם לא נכנס לאתר בעצמו) ייספר אוטומטית כמנוי פעיל באתר בלי שיצטרך לעשות שום דבר
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const providedToken = authHeader?.replace('Bearer ', '') || searchParams.get('token');

  if (providedToken !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncMondaySubscribersToSite();
  return NextResponse.json(result);
}
