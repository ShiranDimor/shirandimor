import { supabaseAdmin } from '@/lib/instantLogin';
import { getEffectiveTemplate } from '@/lib/automations';
import { SEQUENCES, SequenceKey } from '@/lib/sequences';
import { sendPushToContact, sendPushToUsers, normalizePhone, normalizeEmail } from '@/lib/webPush';
import { hasFullAccessContact } from '@/lib/subscriberStatus';

// הצעד הראשון (day_offset=0) לא יוצא מיד עם ההצטרפות - שירן ביקשה מפורשות לחכות קצת כדי
// שיהיה לאיש הקשר זמן להפעיל התראות באתר קודם (אחרת ההודעה הראשונה פשוט לא מגיעה לאף
// מכשיר ונעצרת ל"ת, ר' מקרים אמיתיים - פאבל/ראובן/אסף, כולם הצטרפו בלי התראות פעילות עדיין)
const FIRST_STEP_MIN_DELAY_MS = 30 * 60 * 1000;

// מתריע לשירן כשרצף נעצר כי אין שום מכשיר תקף לשלוח אליו/ה - בלי זה מנוי/ה אמיתי/ת יכול/ה
// לפספס לגמרי את כל תוכן הקליטה/טיפוח בשקט, בלי שום סימן לבעיה - ר' בקשה מפורשת של שירן
async function alertPushInvalid(sequenceKey: SequenceKey, row: ProgressRow) {
  try {
    let name = row.phone || row.email || 'איש קשר';
    if (row.user_id) {
      const { data } = await supabaseAdmin.from('profiles').select('full_name').eq('id', row.user_id).maybeSingle();
      name = data?.full_name || name;
    } else if (row.phone || row.email) {
      const { data } = await supabaseAdmin.from('push_subscriptions').select('name').or([row.phone ? `phone.eq.${row.phone}` : '', row.email ? `email.eq.${row.email}` : ''].filter(Boolean).join(',')).limit(1).maybeSingle();
      name = data?.name || name;
    }
    const seqName = SEQUENCES[sequenceKey]?.name || sequenceKey;
    const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
    await sendPushToUsers((admins || []).map((a) => a.id), {
      title: '⚠️ רצף נעצר - אין התראות פעילות',
      body: `${name} - "${seqName}" נעצר כי אין מכשיר תקף לשלוח אליו/ה`,
      url: '/admin/sequences',
    });
  } catch (e) {
    console.error('שגיאה בשליחת התראה על רצף שנעצר (push_invalid)', e);
  }
}

type Contact = { userId?: string | null; phone?: string | null; email?: string | null };

type StepRule = { key: string; step_index: number; day_offset: number; enabled: boolean };

type ProgressRow = {
  id: string;
  sequence_key: string;
  contact_key: string;
  user_id: string | null;
  phone: string | null;
  email: string | null;
  started_at: string;
  last_step_sent: number;
};

// אותו רעיון בדיוק כמו recipientKey ב-lib/webPush.ts - מזהה איש קשר אחד (לא מכשיר אחד), כדי
// שאותו אדם לא יתחיל את אותו רצף פעמיים (למשל אם ההתראה הופעלה פעמיים משתי מכשירים שונים)
function contactKey(contact: Contact): string {
  if (contact.userId) return `u:${contact.userId}`;
  return `c:${normalizePhone(contact.phone)}|${normalizeEmail(contact.email)}`;
}

async function sendStep(stepKey: string, contact: Contact) {
  const tpl = await getEffectiveTemplate(stepKey);
  if (!tpl) throw new Error(`צעד רצף לא מוכר: ${stepKey}`);
  return sendPushToContact(contact, { title: tpl.title, body: tpl.content, url: '/' });
}

async function getStepsForSequence(sequenceKey: SequenceKey): Promise<StepRule[]> {
  const { data } = await supabaseAdmin
    .from('automation_rules')
    .select('key, step_index, day_offset, enabled')
    .eq('sequence_key', sequenceKey)
    .order('step_index', { ascending: true });
  return (data || []) as StepRule[];
}

function daysElapsedSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

async function stop(progressId: string, reason: string) {
  await supabaseAdmin.from('sequence_progress').update({ stopped_at: new Date().toISOString(), stopped_reason: reason }).eq('id', progressId);
}

// בודק אם יש סיבה לעצור רצף *לפני* ששולחים את הצעד הבא - ר' בקשה מפורשת של שירן: לוודא
// שההתראות עדיין מאושרות ושלא "נשבר" שום דבר, וגם עקרון כללי - אין טעם (ולפעמים גם לא נכון)
// להמשיך לשלוח למי שכבר לא רלוונטי לרצף הזה
async function stopReasonFor(sequenceKey: SequenceKey, row: ProgressRow): Promise<string | null> {
  if (sequenceKey === 'welcome-subscriber' && row.user_id) {
    const { data: profile } = await supabaseAdmin.from('profiles').select('subscription_status, role').eq('id', row.user_id).maybeSingle();
    if (profile && profile.role !== 'admin' && profile.subscription_status !== 'active') return 'unsubscribed';
  }

  if (sequenceKey === 'nurture-push-no-sub') {
    // הליד הפך למנוי/ת - זו בדיוק ה"המרה" שהרצף הזה נועד לקדם. מפסיקים לטפח מי שכבר הצטרף/ה,
    // כדי לא לשלוח "הנה מה יש במנוי" למי שכבר בפנים
    const isFullAccess = await hasFullAccessContact(row.phone, row.email).catch(() => false);
    if (isFullAccess) return 'converted';
  }

  return null;
}

// הלוגיקה המשותפת לצעד אחד של איש קשר אחד - משמשת גם מהקרון היומי וגם מה-start המיידי (יום 0),
// כדי שלא יהיו שני מקומות נפרדים שצריך לזכור לסנכרן ביניהם (ור' הבאג שבאמת קרה: ה-start
// המיידי התעלם לגמרי מ-enabled של הצעד, ושלח גם כששירן כיבתה את הרצף). מדלג קדימה על צעדים
// כבויים שכבר הגיע הזמן שלהם, שולח צעד אחד בפועל (אם מופעל ומגיע הזמן שלו), ועוצר אם אין
// אף מכשיר תקף לשלוח אליו - ר' בקשה מפורשת של שירן לבדוק את זה לפני כל שליחה
async function processDueStep(sequenceKey: SequenceKey, steps: StepRule[], totalSteps: number, row: ProgressRow): Promise<void> {
  const reason = await stopReasonFor(sequenceKey, row).catch(() => null);
  if (reason) {
    await stop(row.id, reason);
    return;
  }

  const elapsed = daysElapsedSince(row.started_at);
  let nextIndex = row.last_step_sent + 1;
  let newLastSent = row.last_step_sent;
  let sentNow = false;

  while (true) {
    const step = steps.find((s) => s.step_index === nextIndex);
    if (!step) break;
    if (elapsed < step.day_offset) break; // הצעד הבא עוד לא הגיע הזמן שלו
    // הצעד הראשון (day_offset=0) ממתין גם ל-FIRST_STEP_MIN_DELAY_MS בשעון קיר, לא רק לגרנולריות
    // של יום - ר' בקשה מפורשת של שירן
    if (step.day_offset === 0 && Date.now() - new Date(row.started_at).getTime() < FIRST_STEP_MIN_DELAY_MS) break;

    if (!step.enabled) {
      newLastSent = nextIndex;
      nextIndex++;
      continue;
    }

    const contact: Contact = { userId: row.user_id, phone: row.phone, email: row.email };
    const result = await sendStep(step.key, contact).catch((e) => {
      console.error(`רצף ${sequenceKey}: נכשלה שליחת צעד ${step.key}`, row.contact_key, e);
      return null;
    });

    if (!result || result.attempted === 0) {
      await stop(row.id, 'push_invalid');
      await alertPushInvalid(sequenceKey, row);
      return;
    }

    newLastSent = nextIndex;
    sentNow = true;
    break; // צעד אחד בפועל בכל הרצה - גם אם כמה הפכו "זמינים" יחד, לא מציפים בכמה הודעות ביחד
  }

  if (newLastSent === row.last_step_sent) return; // שום דבר לא התקדם (שום צעד לא הגיע הזמן שלו)

  const update: Record<string, unknown> = { last_step_sent: newLastSent };
  if (sentNow) update.last_sent_at = new Date().toISOString();
  if (newLastSent >= totalSteps) {
    update.stopped_at = new Date().toISOString();
    update.stopped_reason = 'completed';
  }
  await supabaseAdmin.from('sequence_progress').update(update).eq('id', row.id);
}

// מתחיל רצף לאיש קשר - אם הרצף כבר התחיל בעבר לאיש הקשר הזה (אותו contactKey) לא עושים
// כלום, בלי להתחיל אותו מחדש/לשלוח שוב. הצעד הראשון בפועל יוצא רק דרך הקרון (כל 15 דקות),
// אחרי שחולף FIRST_STEP_MIN_DELAY_MS - הקריאה כאן ל-processDueStep היא רק ליתר ביטחון
// (למשל אם day_offset>0 כבר מגיע הזמן שלו מסיבה כלשהי), לא בשביל יום-0
export async function startSequence(sequenceKey: SequenceKey, contact: Contact): Promise<void> {
  const key = contactKey(contact);

  const { data: existing } = await supabaseAdmin
    .from('sequence_progress')
    .select('id')
    .eq('sequence_key', sequenceKey)
    .eq('contact_key', key)
    .maybeSingle();
  if (existing) return;

  const { data: inserted, error } = await supabaseAdmin
    .from('sequence_progress')
    .insert({
      sequence_key: sequenceKey,
      contact_key: key,
      user_id: contact.userId || null,
      phone: contact.phone || null,
      email: contact.email || null,
    })
    .select('id, sequence_key, contact_key, user_id, phone, email, started_at, last_step_sent')
    .single();

  if (error || !inserted) {
    console.error(`רצף ${sequenceKey}: נכשלה התחלת הרצף לאיש קשר`, key, error);
    return;
  }

  const steps = await getStepsForSequence(sequenceKey);
  await processDueStep(sequenceKey, steps, SEQUENCES[sequenceKey].steps.length, inserted as ProgressRow);
}

// שליחה ידנית חוזרת של צעד ספציפי - לשימוש מעמוד הניהול (אם מישהו/י מדווח/ת שלא קיבל/ה הודעה,
// או שרוצים לשלוח לו/ה שוב). לא נוגע ב-last_step_sent/started_at - זו רק חזרה על תוכן, לא
// התקדמות ברצף
export async function resendStep(progressId: string, stepIndex: number): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await supabaseAdmin
    .from('sequence_progress')
    .select('id, sequence_key, user_id, phone, email')
    .eq('id', progressId)
    .maybeSingle();
  if (!row) return { ok: false, error: 'not_found' };

  const steps = await getStepsForSequence(row.sequence_key as SequenceKey);
  const step = steps.find((s) => s.step_index === stepIndex);
  if (!step) return { ok: false, error: 'invalid_step' };

  const contact: Contact = { userId: row.user_id, phone: row.phone, email: row.email };
  const result = await sendStep(step.key, contact).catch((e) => {
    console.error(`resendStep: נכשלה שליחה חוזרת`, progressId, e);
    return null;
  });

  if (!result || result.attempted === 0) return { ok: false, error: 'no_valid_device' };
  return { ok: true };
}

// נקרא פעם ביום (cron) - עובר על כל איש קשר בכל רצף שעוד לא הסתיים/נעצר, ובודק אם הגיע הזמן
// לצעד הבא שלו/ה. בלי זה הרצף היה חייב לרוץ ברקע כל הזמן - פעם ביום מספיק כי ימי ה-offset
// הם תמיד הפרש של כמה ימים שלמים, לא שעות מדויקות
export async function runSequenceStepsForToday(): Promise<{ processed: number }> {
  let processed = 0;

  for (const sequenceKey of Object.keys(SEQUENCES) as SequenceKey[]) {
    const seqDef = SEQUENCES[sequenceKey];
    const steps = await getStepsForSequence(sequenceKey);
    if (steps.length === 0) continue;

    const { data: rows } = await supabaseAdmin
      .from('sequence_progress')
      .select('id, sequence_key, contact_key, user_id, phone, email, started_at, last_step_sent')
      .eq('sequence_key', sequenceKey)
      .is('stopped_at', null)
      .lt('last_step_sent', seqDef.steps.length);

    for (const row of (rows || []) as ProgressRow[]) {
      await processDueStep(sequenceKey, steps, seqDef.steps.length, row);
      processed++;
    }
  }

  return { processed };
}
