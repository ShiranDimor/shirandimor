import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/salesLeads/auth';
import { syncSalesLeadsFromMonday } from '@/lib/salesLeads/mondaySync';

// POST - כפתור "סנכרן עכשיו" באדמין - סנכרון ידני מיידי מול קבוצת העדכונים במאנדיי
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  try {
    const result = await syncSalesLeadsFromMonday();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בסנכרון' }, { status: 500 });
  }
}
