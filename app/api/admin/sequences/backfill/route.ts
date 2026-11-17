import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { normalizePhone, normalizeEmail } from '@/lib/webPush';
import { hasFullAccessContact } from '@/lib/subscriberStatus';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return adminProfile?.role === 'admin' ? user : null;
}

type StepRule = { step_index: number; day_offset: number };

async function getSteps(sequenceKey: string): Promise<StepRule[]> {
  const { data } = await supabaseAdmin.from('automation_rules').select('step_index, day_offset').eq('sequence_key', sequenceKey).order('step_index');
  return (data || []) as StepRule[];
}

function daysElapsed(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

// כמה צעדים כבר "עברו" כרונולוגית לפי תאריך ההתחלה האמיתי - כדי שמי שהצטרף/ה לפני שהרצף
// נבנה לא יקבל/תקבל מההתחלה (יום 0), אלא ימשיך/תמשיך בדיוק מאיפה שהיה/הייתה אמור/ה להיות
function stepsAlreadyPast(steps: StepRule[], startedAtIso: string): number {
  const elapsed = daysElapsed(startedAtIso);
  return steps.filter((s) => s.day_offset <= elapsed).length;
}

async function insertBackfillRow(sequenceKey: string, contactKey: string, userId: string | null, phone: string | null, email: string | null, startedAtIso: string, steps: StepRule[]) {
  const passed = stepsAlreadyPast(steps, startedAtIso);
  const completed = passed >= steps.length;
  await supabaseAdmin.from('sequence_progress').insert({
    sequence_key: sequenceKey,
    contact_key: contactKey,
    user_id: userId,
    phone,
    email,
    started_at: startedAtIso,
    last_step_sent: passed,
    stopped_at: completed ? new Date().toISOString() : null,
    stopped_reason: completed ? 'completed' : null,
  });
}

// POST - ריצה חד-פעמית: משלים רשומת sequence_progress לכל מי שכבר מנוי/ה פעיל/ה או כבר הפעיל/ה
// התראות בלי מנוי *לפני* שהרצפים האלה נבנו - בלי זה אף אחד מהם לא יקבל אף הודעה אי פעם, כי
// ה-start קורה רק ברגע האירוע (הרשמה/הפעלת התראות), לא רטרואקטיבית. מתחיל כל אחד/ת בדיוק
// מהצעד הכרונולוגי הנכון (לפי מתי שהוא/היא באמת הצטרף/ה) - לא מיום 0, ולא שולח כלום בפועל
// עכשיו, רק ממקם נכון כדי שההודעה הבאה שבאמת מגיעה לו/ה תצא בזמן הנכון מהקרון הרגיל
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const subscriberSteps = await getSteps('welcome-subscriber');
  const leadSteps = await getSteps('nurture-push-no-sub');

  let subscribersAdded = 0;
  let leadsAdded = 0;
  const errors: string[] = [];

  // --- מנויים פעילים קיימים ---
  const { data: subscribers } = await supabaseAdmin
    .from('profiles')
    .select('id, phone, email, subscription_started_at')
    .eq('role', 'subscriber')
    .eq('subscription_status', 'active')
    .not('subscription_started_at', 'is', null);

  for (const sub of subscribers || []) {
    const contactKey = `u:${sub.id}`;
    const { data: existing } = await supabaseAdmin.from('sequence_progress').select('id').eq('sequence_key', 'welcome-subscriber').eq('contact_key', contactKey).maybeSingle();
    if (existing) continue;
    try {
      await insertBackfillRow('welcome-subscriber', contactKey, sub.id, sub.phone, sub.email, sub.subscription_started_at, subscriberSteps);
      subscribersAdded++;
    } catch (e) {
      errors.push(`מנוי ${sub.id}: ${e instanceof Error ? e.message : 'שגיאה'}`);
    }
  }

  // --- לידים קיימים שהפעילו התראות בלי מנוי (מקובצים לפי איש קשר, לא מכשיר) ---
  const { data: pushRows } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id, phone, email, created_at')
    .is('invalid_at', null)
    .order('created_at', { ascending: true });

  const contactsByKey = new Map<string, { userId: string | null; phone: string | null; email: string | null; earliestCreatedAt: string }>();
  for (const row of pushRows || []) {
    const key = row.user_id ? `u:${row.user_id}` : `c:${normalizePhone(row.phone)}|${normalizeEmail(row.email)}`;
    const existing = contactsByKey.get(key);
    if (!existing || new Date(row.created_at) < new Date(existing.earliestCreatedAt)) {
      contactsByKey.set(key, { userId: row.user_id, phone: row.phone, email: row.email, earliestCreatedAt: row.created_at });
    }
  }

  for (const [contactKey, contact] of contactsByKey) {
    const isFullAccess = await hasFullAccessContact(contact.phone, contact.email).catch(() => false);
    if (isFullAccess) continue; // כבר מנוי/ה או אדמין/ית - לא שייך/ת לרצף הטיפוח

    const { data: existing } = await supabaseAdmin.from('sequence_progress').select('id').eq('sequence_key', 'nurture-push-no-sub').eq('contact_key', contactKey).maybeSingle();
    if (existing) continue;

    try {
      await insertBackfillRow('nurture-push-no-sub', contactKey, contact.userId, contact.phone, contact.email, contact.earliestCreatedAt, leadSteps);
      leadsAdded++;
    } catch (e) {
      errors.push(`ליד ${contactKey}: ${e instanceof Error ? e.message : 'שגיאה'}`);
    }
  }

  return NextResponse.json({ ok: true, subscribersAdded, leadsAdded, errors });
}
