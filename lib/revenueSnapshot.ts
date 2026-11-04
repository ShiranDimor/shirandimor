import { supabaseAdmin } from '@/lib/instantLogin';

const DEFAULT_MONTHLY_PRICE = 400;

export type RevenueSnapshotData = {
  count: number;
  totalAmount: number;
  items: { name: string | null; email: string | null; phone: string | null; joinDate: string | null; price: number }[];
  missingMonthlyCost: string[];
};

// מחשב תמונת מצב חדשה: כל מנוי/ה פעיל/ה באתר (אותה אוכלוסייה בדיוק כמו "מנויים מאושרים",
// פחות מנויים שהוענקו ידנית מחוץ למאנדיי - ר' excluded_from_subscriber_list) ו"עלות חודשית"
// כפי שנשמרה על הפרופיל - מתעדכנת אוטומטית בסנכרון היומי מול מאנדיי (lib/mondaySubscriberSync.ts),
// לא נשלפת כאן בזמן אמת ממאנדיי. ככה הצגת ההכנסה לא תלויה בזמינות מאנדיי כל פעם שהעמוד נטען
async function computeRevenueNow(): Promise<RevenueSnapshotData> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email, phone, subscription_started_at, monthly_price')
    .eq('role', 'subscriber')
    .eq('subscription_status', 'active')
    .eq('excluded_from_subscriber_list', false);

  if (error) throw new Error(error.message);

  const missingMonthlyCost: string[] = [];
  const items = (data || []).map((p) => {
    // 0 הוא ערך תקין (מנוי בחינם) - null/undefined בלבד נחשב "עדיין לא נדגם ממאנדיי"
    const hasPrice = p.monthly_price !== null && p.monthly_price !== undefined;
    if (!hasPrice) missingMonthlyCost.push(p.full_name || p.phone || p.email || 'ללא שם');
    return {
      name: p.full_name, email: p.email, phone: p.phone, joinDate: p.subscription_started_at,
      price: hasPrice ? Number(p.monthly_price) : DEFAULT_MONTHLY_PRICE,
    };
  });

  items.sort((a, b) => (b.joinDate || '').localeCompare(a.joinDate || ''));

  return {
    count: items.length,
    totalAmount: items.reduce((sum, i) => sum + i.price, 0),
    items,
    missingMonthlyCost,
  };
}

function firstOfCurrentMonthIsrael(): string {
  // מחושב לפי שעון ישראל ולא UTC - כדי שהמעבר לחודש חדש יקרה באמת בלילה שבין ה-31 ל-1 בזמן מקומי
  const nowIsrael = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return `${nowIsrael.getFullYear()}-${String(nowIsrael.getMonth() + 1).padStart(2, '0')}-01`;
}

// מחזיר את הכנסת החודש הנוכחי: מחושב חי בכל קריאה (כדי שהרשמות חדשות באמצע החודש ייספרו מיד),
// ומשויך לתווית של החודש הנוכחי - כך שברגע שמתחיל חודש חדש, החישוב "מתאפס" ומתחיל להתייחס אליו
// (בדיוק כמו אצל גרו) בלי לנעול מספר אחד לכל החודש. גם נשמר בטבלה כתיעוד של איך נראה כל חודש.
export async function getOrComputeMonthlySnapshot(_forceRecompute = false): Promise<(RevenueSnapshotData & { month: string; ok: true }) | { ok: false; error: string; month: string }> {
  const month = firstOfCurrentMonthIsrael();

  try {
    const data = await computeRevenueNow();
    await supabaseAdmin.from('monthly_revenue_snapshots').upsert({ month, data, computed_at: new Date().toISOString() });
    return { ...data, month, ok: true };
  } catch (e) {
    console.error('שגיאה בחישוב הכנסת החודש', e);
    return { ok: false, error: e instanceof Error ? e.message : 'שגיאה בחישוב ההכנסה', month };
  }
}
