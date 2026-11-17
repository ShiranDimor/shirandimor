import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/salesLeads/auth';
import { syncSalesLeadsFromMonday } from '@/lib/salesLeads/mondaySync';

// סנכרון עובר על כל הפריטים בקבוצת העדכונים - בקבוצה גדולה (מאות לידים) זה יכול לחרוג גם
// מ-60 שניות ולהיכשל ב"שגיאה בסנכרון" (ר' תיקון מקביל ב-lib/salesLeads/mondaySync.ts שגם
// מקביל את העבודה לכל ליד, לא רק מגדיל את הזמן המותר)
export const maxDuration = 300;

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
