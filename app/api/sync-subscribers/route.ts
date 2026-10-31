import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { syncSubscribersBidirectional } from '@/lib/mondaySubscriberSync';

// POST - הרצה ידנית (מכפתור "סנכרון מלא" בפאנל הניהול) של אותו סנכרון דו-כיווני שרץ אוטומטית
// כל יום (ראו lib/mondaySubscriberSync + app/api/cron-sync-monday-subscribers) - שימושי כשרוצים
// שהעדכון יקרה מיד במקום לחכות להרצה היומית הבאה
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

  const mondayToken = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!mondayToken || !boardId) {
    return NextResponse.json({ error: 'Monday.com לא מוגדר' }, { status: 500 });
  }

  const result = await syncSubscribersBidirectional();
  if ('error' in result) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
