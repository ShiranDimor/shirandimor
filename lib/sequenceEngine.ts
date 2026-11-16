import { supabaseAdmin } from '@/lib/instantLogin';
import { getEffectiveTemplate } from '@/lib/automations';
import { SEQUENCES, SequenceKey } from '@/lib/sequences';
import { sendPushToContact, normalizePhone, normalizeEmail } from '@/lib/webPush';
import { hasFullAccessContact } from '@/lib/subscriberStatus';

type Contact = { userId?: string | null; phone?: string | null; email?: string | null };

// אותו רעיון בדיוק כמו recipientKey ב-lib/webPush.ts - מזהה איש קשר אחד (לא מכשיר אחד), כדי
// שאותו אדם לא יתחיל את אותו רצף פעמיים (למשל אם ההתראה הופעלה פעמיים משתי מכשירים שונים)
function contactKey(contact: Contact): string {
  if (contact.userId) return `u:${contact.userId}`;
  return `c:${normalizePhone(contact.phone)}|${normalizeEmail(contact.email)}`;
}

// מתחיל רצף לאיש קשר, ושולח מיד את הצעד הראשון (יום 0) - לא מחכים ל-cron היומי בשביל זה,
// כדי ש"ברוכים הבאים"/"תודה שהפעלת התראות" יגיע ממש ברגע האירוע, לא רק מחר. אם הרצף כבר
// התחיל בעבר לאיש הקשר הזה (אותו contactKey) - לא עושים כלום, בלי להתחיל אותו מחדש/לשלוח שוב
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
    .select('id')
    .single();

  if (error || !inserted) {
    console.error(`רצף ${sequenceKey}: נכשלה התחלת הרצף לאיש קשר`, key, error);
    return;
  }

  const firstStep = SEQUENCES[sequenceKey].steps[0];
  const sendResult = await sendStep(firstStep.key, contact).catch((e) => {
    console.error(`רצף ${sequenceKey}: נכשלה שליחת הצעד הראשון`, key, e);
    return null;
  });

  // אם אין בכלל מכשיר תקף לשלוח אליו (למשל ההתראה כבר נשברה בין הרגע שהתקבלה הבקשה לרגע הזה) -
  // לא מסמנים שהצעד נשלח, אבל כן עוצרים את הרצף כאן כדי שלא ינסה שוב ושוב כל יום בלי תוחלת
  if (sendResult && sendResult.attempted === 0) {
    await supabaseAdmin.from('sequence_progress').update({ stopped_at: new Date().toISOString(), stopped_reason: 'push_invalid' }).eq('id', inserted.id);
    return;
  }

  await supabaseAdmin.from('sequence_progress').update({ last_step_sent: 1, last_sent_at: new Date().toISOString() }).eq('id', inserted.id);
}

async function sendStep(stepKey: string, contact: Contact) {
  const tpl = await getEffectiveTemplate(stepKey);
  if (!tpl) throw new Error(`צעד רצף לא מוכר: ${stepKey}`);
  return sendPushToContact(contact, { title: tpl.title, body: tpl.content, url: '/' });
}

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

// נקרא פעם ביום (cron) - עובר על כל איש קשר בכל רצף שעוד לא הסתיים/נעצר, ובודק אם הגיע הזמן
// לצעד הבא שלו/ה. בלי זה הרצף היה חייב לרוץ ברקע כל הזמן - פעם ביום מספיק כי ימי ה-offset
// הם תמיד הפרש של כמה ימים שלמים, לא שעות מדויקות
export async function runSequenceStepsForToday(): Promise<{ sent: number; stopped: number; skippedDisabled: number }> {
  let sent = 0;
  let stopped = 0;
  let skippedDisabled = 0;

  for (const sequenceKey of Object.keys(SEQUENCES) as SequenceKey[]) {
    const seqDef = SEQUENCES[sequenceKey];

    const { data: stepRules } = await supabaseAdmin
      .from('automation_rules')
      .select('key, step_index, day_offset, enabled')
      .eq('sequence_key', sequenceKey)
      .order('step_index', { ascending: true });
    const steps = (stepRules || []) as { key: string; step_index: number; day_offset: number; enabled: boolean }[];
    if (steps.length === 0) continue;

    const { data: rows } = await supabaseAdmin
      .from('sequence_progress')
      .select('id, sequence_key, contact_key, user_id, phone, email, started_at, last_step_sent')
      .eq('sequence_key', sequenceKey)
      .is('stopped_at', null)
      .lt('last_step_sent', seqDef.steps.length);

    for (const row of (rows || []) as ProgressRow[]) {
      const reason = await stopReasonFor(sequenceKey, row).catch(() => null);
      if (reason) {
        await stop(row.id, reason);
        stopped++;
        continue;
      }

      const elapsed = daysElapsedSince(row.started_at);
      let nextIndex = row.last_step_sent + 1;
      let currentLastSent = row.last_step_sent;

      // מדלג קדימה על צעדים שכבויים (כבר הגיע הזמן שלהם, אבל מופעל/ת כיבתה אותם) - בלי זה
      // כל מי שעבר על צעד כבוי היה תקוע שם לנצח, גם אם הוא הופעל מחדש אחר כך
      while (true) {
        const step = steps.find((s) => s.step_index === nextIndex);
        if (!step) break;
        if (elapsed < step.day_offset) break; // הצעד הבא עוד לא הגיע הזמן שלו

        if (!step.enabled) {
          currentLastSent = nextIndex;
          nextIndex++;
          skippedDisabled++;
          continue;
        }

        const contact: Contact = { userId: row.user_id, phone: row.phone, email: row.email };
        const result = await sendStep(step.key, contact).catch((e) => {
          console.error(`רצף ${sequenceKey}: נכשלה שליחת צעד ${step.key}`, row.contact_key, e);
          return null;
        });

        if (!result || result.attempted === 0) {
          await stop(row.id, 'push_invalid');
          stopped++;
          currentLastSent = -1; // כבר נעצר, לא לעדכן last_step_sent בהמשך
          break;
        }

        currentLastSent = nextIndex;
        sent++;
        nextIndex++;
        break; // צעד אחד בפועל ביום - גם אם כמה הפכו "זמינים" באותו יום, לא מציפים בכמה הודעות יחד
      }

      if (currentLastSent === -1) continue;
      if (currentLastSent !== row.last_step_sent) {
        const update: Record<string, unknown> = { last_step_sent: currentLastSent };
        if (currentLastSent > row.last_step_sent) update.last_sent_at = new Date().toISOString();
        if (currentLastSent >= seqDef.steps.length) {
          update.stopped_at = new Date().toISOString();
          update.stopped_reason = 'completed';
        }
        await supabaseAdmin.from('sequence_progress').update(update).eq('id', row.id);
      }
    }
  }

  return { sent, stopped, skippedDisabled };
}
