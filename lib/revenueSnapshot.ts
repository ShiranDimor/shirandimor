import { supabaseAdmin } from '@/lib/instantLogin';
import { getMondaySubscriberDetails } from '@/lib/tradingPlan/monday';

const DEFAULT_MONTHLY_PRICE = 400;

export type RevenueSnapshotData = {
  count: number;
  totalAmount: number;
  items: { name: string | null; email: string | null; phone: string | null; joinDate: string | null; price: number }[];
  duplicatesRemoved: string[];
  missingMonthlyCost: string[];
};

// מפתח קשר מנורמל - טלפון קודם (רוב המנויים בפועל לא שומרים מייל), עם נפילה חזרה למייל
function contactKeyFor(phone: string | null, email: string | null): string | null {
  if (phone) return `phone:${phone.replace(/\D/g, '').slice(-9)}`;
  if (email) return `email:${email.trim().toLowerCase()}`;
  return null;
}

// מחשב תמונת מצב חדשה: כמות האנשים שנמצאים ממש עכשיו בקבוצת "קבוצת סוחרים" במאנדיי, וסך כל
// "עלות חודשית ששילם" כפי שרשום שם לכל אחד - בדיוק הרגע הזה, לא ניחוש לפי תאריכים
async function computeRevenueNow(): Promise<RevenueSnapshotData> {
  const subscribers = await getMondaySubscriberDetails();

  const byContact = new Map<string, typeof subscribers>();
  const noContact: typeof subscribers = [];
  for (const s of subscribers) {
    const key = contactKeyFor(s.phone, s.email);
    if (!key) {
      noContact.push(s);
      continue;
    }
    const bucket = byContact.get(key) || [];
    bucket.push(s);
    byContact.set(key, bucket);
  }

  const duplicatesRemoved: string[] = [];
  const deduped: typeof subscribers = [...noContact];
  for (const bucket of byContact.values()) {
    if (bucket.length === 1) {
      deduped.push(bucket[0]);
      continue;
    }
    const sorted = [...bucket].sort((a, b) => new Date(b.joinDate || 0).getTime() - new Date(a.joinDate || 0).getTime());
    deduped.push(sorted[0]);
    for (const removed of sorted.slice(1)) {
      duplicatesRemoved.push(`${removed.name || removed.phone || removed.email} (${removed.joinDate || 'ללא תאריך'})`);
    }
  }

  const missingMonthlyCost: string[] = [];
  const items = deduped.map((s) => {
    // חשוב: 0 הוא ערך "falsy" ב-JS - צריך לבדוק במפורש שהערך קיים ומספר תקין, אחרת מי שרשום
    // אצלו עלות חודשית של 0 (למשל מנוי בחינם) יתחלף בטעות בברירת המחדל של 400
    const raw = s.monthlyCost != null && s.monthlyCost !== '' ? Number(s.monthlyCost) : NaN;
    const hasValidCost = !isNaN(raw);
    const price = hasValidCost ? raw : DEFAULT_MONTHLY_PRICE;
    if (!hasValidCost) missingMonthlyCost.push(s.name || s.phone || s.email || 'ללא שם');
    return { name: s.name, email: s.email, phone: s.phone, joinDate: s.joinDate, price };
  });

  items.sort((a, b) => (b.joinDate || '').localeCompare(a.joinDate || ''));

  return {
    count: items.length,
    totalAmount: items.reduce((sum, i) => sum + i.price, 0),
    items,
    duplicatesRemoved,
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
export async function getOrComputeMonthlySnapshot(_forceRecompute = false): Promise<RevenueSnapshotData & { month: string }> {
  const month = firstOfCurrentMonthIsrael();
  const data = await computeRevenueNow();
  await supabaseAdmin.from('monthly_revenue_snapshots').upsert({ month, data, computed_at: new Date().toISOString() });
  return { ...data, month };
}
