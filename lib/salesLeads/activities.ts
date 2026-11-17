import { supabaseAdmin } from '@/lib/instantLogin';
import { statusToStage, getStatusMeta } from './statuses';

export type LeadAction =
  | { type: 'no_answer' }
  | { type: 'call_completed'; note: string; status?: string }
  | { type: 'add_note'; note: string }
  | { type: 'set_status'; status: string; note?: string }
  | { type: 'set_priority'; priority: 'normal' | 'hot' | 'very_hot' }
  | { type: 'set_followup'; followupAt: string; note?: string }
  | { type: 'clear_followup' }
  | { type: 'whatsapp_opened' };

type LeadRow = {
  id: string;
  sales_status: string;
  stage: string;
  priority: string;
  next_followup_at: string | null;
  next_followup_note: string | null;
  call_attempts_count: number;
};

async function insertActivity(leadId: string, activityType: string, note: string | null, metadata: Record<string, unknown> | null) {
  await supabaseAdmin.from('sales_lead_activities').insert({
    lead_id: leadId,
    activity_type: activityType,
    note,
    metadata,
  });
}

// כל פעולה על ליד (התקשרות, הערה, שינוי סטטוס/עדיפות/Follow-up) עוברת דרך כאן - כך שכל
// שינוי תמיד נרשם גם בהיסטוריה (sales_lead_activities) וגם מעדכן את השדות המסוכמים על הליד
// עצמו (לתצוגה מהירה ברשימה בלי לטעון את כל ההיסטוריה)
export async function applyLeadAction(leadId: string, action: LeadAction): Promise<{ ok: boolean; error?: string }> {
  const { data: lead, error: fetchError } = await supabaseAdmin
    .from('sales_leads')
    .select('id, sales_status, stage, priority, next_followup_at, next_followup_note, call_attempts_count')
    .eq('id', leadId)
    .single();

  if (fetchError || !lead) return { ok: false, error: 'ליד לא נמצא' };
  const row = lead as LeadRow;
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {};

  switch (action.type) {
    case 'no_answer': {
      updates.call_attempts_count = row.call_attempts_count + 1;
      updates.last_contact_at = now;
      updates.last_call_outcome = 'no_answer';
      updates.sales_status = 'no_answer';
      updates.stage = statusToStage('no_answer');
      await supabaseAdmin.from('sales_leads').update(updates).eq('id', leadId);
      await insertActivity(leadId, 'NO_ANSWER', null, null);
      break;
    }

    case 'call_completed': {
      updates.call_attempts_count = row.call_attempts_count + 1;
      updates.last_contact_at = now;
      updates.last_call_outcome = 'spoke';
      updates.last_note = action.note;
      if (action.status) {
        updates.sales_status = action.status;
        updates.stage = statusToStage(action.status);
        if (statusToStage(action.status) !== 'in_progress') {
          updates.next_followup_at = null;
          updates.next_followup_note = null;
        }
      } else {
        updates.sales_status = 'spoke';
        updates.stage = statusToStage('spoke');
      }
      await supabaseAdmin.from('sales_leads').update(updates).eq('id', leadId);
      await insertActivity(leadId, 'CALL_COMPLETED', action.note, action.status ? { status: action.status } : null);
      if (action.status && row.next_followup_at && statusToStage(action.status) !== 'in_progress') {
        await insertActivity(leadId, 'FOLLOW_UP_COMPLETED', null, { previousFollowupAt: row.next_followup_at });
      }
      break;
    }

    case 'add_note': {
      updates.last_note = action.note;
      await supabaseAdmin.from('sales_leads').update(updates).eq('id', leadId);
      await insertActivity(leadId, 'NOTE', action.note, null);
      break;
    }

    case 'set_status': {
      const meta = getStatusMeta(action.status);
      updates.sales_status = action.status;
      updates.stage = meta.stage;
      updates.last_contact_at = now;
      if (action.note) updates.last_note = action.note;
      if (meta.stage !== 'in_progress') {
        updates.next_followup_at = null;
        updates.next_followup_note = null;
      }
      await supabaseAdmin.from('sales_leads').update(updates).eq('id', leadId);

      const activityType = action.status === 'registered' ? 'REGISTERED' : action.status === 'not_relevant' ? 'NOT_RELEVANT' : 'STATUS_CHANGED';
      await insertActivity(leadId, activityType, action.note || null, { from: row.sales_status, to: action.status });

      if (meta.stage !== 'in_progress' && row.next_followup_at) {
        await insertActivity(leadId, 'FOLLOW_UP_COMPLETED', null, { previousFollowupAt: row.next_followup_at });
      }
      break;
    }

    case 'set_priority': {
      await supabaseAdmin.from('sales_leads').update({ priority: action.priority }).eq('id', leadId);
      await insertActivity(leadId, 'PRIORITY_CHANGED', null, { from: row.priority, to: action.priority });
      break;
    }

    case 'set_followup': {
      await supabaseAdmin
        .from('sales_leads')
        .update({ next_followup_at: action.followupAt, next_followup_note: action.note || null })
        .eq('id', leadId);

      const activityType = row.next_followup_at ? 'FOLLOW_UP_CHANGED' : 'FOLLOW_UP_CREATED';
      await insertActivity(leadId, activityType, action.note || null, {
        previousFollowupAt: row.next_followup_at,
        newFollowupAt: action.followupAt,
      });
      break;
    }

    case 'clear_followup': {
      if (!row.next_followup_at) break;
      await supabaseAdmin.from('sales_leads').update({ next_followup_at: null, next_followup_note: null }).eq('id', leadId);
      await insertActivity(leadId, 'FOLLOW_UP_COMPLETED', null, { previousFollowupAt: row.next_followup_at });
      break;
    }

    // תיעוד שנפתח WhatsApp - לא אומר שההודעה נשלחה בפועל בוודאות (אין דרך לדעת אם נלחץ Send),
    // ולכן לא נוגעים בניסיונות התקשרות/תאריך טיפול אחרון. אבל אם הליד היה עדיין "לא טופל"
    // בכלל, זו בפועל הפנייה הראשונית אליו - מעבירים אותו לסטטוס ייעודי כדי שלא יישאר מעורבב
    // עם מי שעוד לא פנו אליו בכלל ברשימה
    case 'whatsapp_opened': {
      await insertActivity(leadId, 'WHATSAPP_OPENED', null, null);
      if (row.sales_status === 'not_handled') {
        await supabaseAdmin.from('sales_leads').update({ sales_status: 'whatsapp_sent', stage: statusToStage('whatsapp_sent') }).eq('id', leadId);
        await insertActivity(leadId, 'STATUS_CHANGED', null, { from: 'not_handled', to: 'whatsapp_sent', auto: true });
      }
      break;
    }
  }

  return { ok: true };
}
