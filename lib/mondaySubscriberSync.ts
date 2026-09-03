import { supabaseAdmin } from '@/lib/instantLogin';
import { getMondaySubscriberDetails } from '@/lib/tradingPlan/monday';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';

export type MondaySubscriberSyncResult = {
  totalInMonday: number;
  created: number;
  updated: number;
  alreadyOk: number;
  skippedNoEmail: string[];
  failed: { name: string | null; error: string }[];
};

// עובר על כל מי שנמצא בקבוצת "קבוצת סוחרים" ב-Monday.com ומוודא שיש לו חשבון מנוי פעיל באתר,
// גם אם הוא מעולם לא נכנס בעצמו. משתמש בתאריך ההצטרפות ממאנדיי (אם קיימת עמודה כזו) כדי שיום
// החיוב החודשי (וחישובים כמו צפי הכנסה) יהיו מדויקים, לא "מהיום" באופן שגוי.
// מי שאין לו מייל במאנדיי לא ניתן ליצור לו חשבון (המערכת מזהה חשבונות לפי מייל) - מדווח בנפרד.
// משותף בין הרצה ידנית מפאנל הניהול לבין ריצה יומית אוטומטית (cron)
export async function syncMondaySubscribersToSite(): Promise<MondaySubscriberSyncResult> {
  const subscribers = await getMondaySubscriberDetails();

  let created = 0;
  let updated = 0;
  let alreadyOk = 0;
  const skippedNoEmail: string[] = [];
  const failed: { name: string | null; error: string }[] = [];

  for (const sub of subscribers) {
    const email = sub.email?.trim().toLowerCase();
    if (!email) {
      skippedNoEmail.push(sub.name || 'ללא שם');
      continue;
    }

    try {
      const { data: existing } = await supabaseAdmin.from('profiles').select('id, role').eq('email', email).maybeSingle();
      const startedAt = sub.joinDate ? new Date(sub.joinDate).toISOString() : undefined;

      await ensureActiveSubscriberAccount(email, sub.phone || '', sub.name || email, startedAt);

      if (!existing) created += 1;
      else if (existing.role !== 'admin' && existing.role !== 'subscriber') updated += 1;
      else alreadyOk += 1;
    } catch (e) {
      failed.push({ name: sub.name, error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
    }
  }

  return { totalInMonday: subscribers.length, created, updated, alreadyOk, skippedNoEmail, failed };
}
