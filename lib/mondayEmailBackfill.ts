import { supabaseAdmin } from '@/lib/instantLogin';
import { fillMissingEmailsInMonday, type MondayEmailBackfillResult } from '@/lib/tradingPlan/monday';

// כל הטבלאות באתר ששומרות טלפון + מייל, לפי סדר אמינות: פרופיל משתמש קודם (מייל שאיתו נכנסים לאתר),
// ואחריו טפסים שמולאו באתר. כשלאותו טלפון יש כמה מיילים - הראשון לפי הסדר הזה נשמר
const SOURCES = ['profiles', 'trading_plan_responses', 'trial_signups', 'live_registrations', 'sales_leads'];

function normalizePhone(raw: string | null | undefined) {
  return (raw || '').replace(/\D/g, '').slice(-9);
}

async function collectSiteEmailsByPhone(): Promise<Map<string, string>> {
  const byPhone = new Map<string, string>();
  for (const table of SOURCES) {
    const { data, error } = await supabaseAdmin.from(table).select('phone, email');
    if (error) {
      // טבלה בלי עמודות טלפון/מייל - מדלגים
      console.error(`השלמת מיילים במאנדיי: דילוג על ${table}`, error.message);
      continue;
    }
    for (const row of (data || []) as { phone: string | null; email: string | null }[]) {
      const phone = normalizePhone(row.phone);
      const email = (row.email || '').trim().toLowerCase();
      if (phone.length === 9 && email.includes('@') && !byPhone.has(phone)) byPhone.set(phone, email);
    }
  }
  return byPhone;
}

export async function backfillMondayEmails(dryRun: boolean): Promise<MondayEmailBackfillResult & { siteEmailsKnown: number }> {
  const byPhone = await collectSiteEmailsByPhone();
  const result = await fillMissingEmailsInMonday(byPhone, dryRun);
  return { ...result, siteEmailsKnown: byPhone.size };
}
