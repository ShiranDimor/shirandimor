import { supabaseAdmin } from './instantLogin';
import { normalizePhone, normalizeEmail, isActiveSubscriber } from './subscriberStatus';
import { classifyProfile } from './tradingPlan/profile';
import { getProfileContent } from './tradingPlan/profileContent';
import { findOptions } from './tradingPlan/questions';

// CRM פנימי (Supabase) שמחליף את מאנדיי כמקור אמת לניהול לידים/מנויים: מעקב סטטוס, תאריכי
// פולואפ, ותקציר תובנות (notes) לכל איש קשר. כל התאמה בין רשומות נעשית לפי טלפון או מייל
// מנורמלים - אותו דפוס matching שהיה קיים מול הלוח במאנדיי (ר' lib/subscriberStatus.ts).

export type CrmStage = 'lead_new' | 'updates_group' | 'subscriber' | 'churned';

export type CrmContact = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  stage: CrmStage;
  status_label: string | null;
  source: string | null;
  follow_up_at: string | null;
  monthly_cost_paid: number | null;
  first_month_discount: boolean;
  joined_at: string | null;
  profile_id: string | null;
  tags: string[];
  lead_intent: string | null;
  lead_intent_note: string | null;
  lead_intent_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

function defaultFollowUpDate(daysAhead = 3): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const STAGE_LABEL_HE: Record<CrmStage, string> = {
  lead_new: 'ליד חדש',
  updates_group: 'קבוצת עדכונים',
  subscriber: 'מנוי',
  churned: 'נטש',
};

export async function findContact(phone: string | null | undefined, email: string | null | undefined): Promise<CrmContact | null> {
  const p = normalizePhone(phone);
  const e = normalizeEmail(email);
  if (!p && !e) return null;

  if (p) {
    const { data } = await supabaseAdmin.from('crm_contacts').select('*').eq('phone', p).limit(1).maybeSingle();
    if (data) return data as CrmContact;
  }
  if (e) {
    const { data } = await supabaseAdmin.from('crm_contacts').select('*').eq('email', e).limit(1).maybeSingle();
    if (data) return data as CrmContact;
  }
  return null;
}

export type UpsertContactInput = {
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
  stage?: CrmStage;
  statusLabel?: string | null;
  source?: string | null;
  followUpAt?: string | null;
  monthlyCost?: number | null;
  firstMonthDiscount?: boolean;
  joinedAt?: string | null;
  profileId?: string | null;
  tags?: string[];
  /** להוסיף תגיות לרשימה הקיימת בלי למחוק מה שכבר יש (במקום להחליף את המערך כולו) */
  addTags?: string[];
};

// מוצא-או-יוצר איש קשר לפי טלפון/מייל מנורמלים - מעדכן רק שדות שסופקו בפועל, לא דורס ערך קיים
// בערך ריק. מקביל להתנהגות "find or create item" שהייתה מול הלוח במאנדיי. כששלב איש קשר קיים
// משתנה, מתועד אוטומטית ציר הזמן (crm_notes) - כדי שכל שינוי stage, מכל מקור בקוד, יישאר גלוי.
export async function upsertContact(input: UpsertContactInput): Promise<CrmContact> {
  const phone = normalizePhone(input.phone) || null;
  const email = normalizeEmail(input.email) || null;
  if (!phone && !email) throw new Error('אין טלפון או מייל - לא ניתן ליצור איש קשר');

  const existing = await findContact(phone, email);

  const fields: Record<string, unknown> = {};
  if (phone) fields.phone = phone;
  if (email) fields.email = email;
  if (input.fullName) fields.full_name = input.fullName;
  if (input.stage) fields.stage = input.stage;
  if (input.statusLabel !== undefined) fields.status_label = input.statusLabel;
  if (input.source !== undefined) fields.source = input.source;
  if (input.followUpAt !== undefined) fields.follow_up_at = input.followUpAt;
  if (input.monthlyCost != null) fields.monthly_cost_paid = input.monthlyCost;
  if (input.firstMonthDiscount) fields.first_month_discount = true;
  if (input.joinedAt !== undefined) fields.joined_at = input.joinedAt;
  if (input.profileId !== undefined) fields.profile_id = input.profileId;
  if (input.tags !== undefined) fields.tags = input.tags;
  if (input.addTags?.length) {
    const base = new Set(existing?.tags || []);
    for (const t of input.addTags) base.add(t);
    fields.tags = Array.from(base);
  }

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('crm_contacts')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;

    if (input.stage && input.stage !== existing.stage) {
      await addNote(existing.id, `שלב שונה: ${STAGE_LABEL_HE[existing.stage]} ← ${STAGE_LABEL_HE[input.stage]}`, 'system');
    }

    return data as CrmContact;
  }

  // ליד חדש בלי תאריך פולואפ מפורש מקבל אוטומטית עוד 3 ימים - כדי שאף ליד לא "יישכח" בלי מעקב
  // (מנוי פעיל לא זקוק לתזכורת פולואפ)
  const resolvedStage = (fields.stage as CrmStage) || 'lead_new';
  if (fields.follow_up_at === undefined && resolvedStage !== 'subscriber') {
    fields.follow_up_at = defaultFollowUpDate();
  }

  const { data, error } = await supabaseAdmin
    .from('crm_contacts')
    .insert({ stage: 'lead_new', ...fields })
    .select('*')
    .single();
  if (error) throw error;
  return data as CrmContact;
}

export async function addNote(contactId: string, body: string, author?: string | null): Promise<void> {
  await supabaseAdmin.from('crm_notes').insert({ contact_id: contactId, body, author: author || 'system' });
}

export type ContactClassification = 'member_active' | 'updates_group' | 'lead_new' | 'unknown';

// מסווג איש קשר (טלפון/מייל) לזיהוי בבוט "דור" - מנוי פעיל, קבוצת עדכונים חינמית, או ליד חדש.
// מנוי פעיל תמיד נבדק קודם מול profiles (מקור האמת לגישה בפועל לאתר) ולא רק מול ה-CRM.
export async function classifyContact(phone: string | null | undefined, email: string | null | undefined): Promise<ContactClassification> {
  if (!phone && !email) return 'unknown';
  if (await isActiveSubscriber(phone, email)) return 'member_active';

  const contact = await findContact(phone, email);
  if (!contact) return 'lead_new';
  if (contact.stage === 'subscriber') return 'member_active';
  if (contact.stage === 'updates_group') return 'updates_group';
  return 'lead_new';
}

export type ContactFieldUpdate = {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  stage?: CrmStage;
  statusLabel?: string | null;
  followUpAt?: string | null;
  monthlyCost?: number | null;
  tags?: string[];
  profileId?: string | null;
  joinedAt?: string | null;
};

// מעדכן איש קשר קיים לפי מזהה (בניגוד ל-upsertContact, שמוצא/יוצר לפי טלפון/מייל) - משמש את מסך
// ה-CRM עצמו. כל שינוי בשלב/סטטוס טיפול/תאריך פולואפ מתועד אוטומטית כהערה בציר הזמן, כדי
// שהיסטוריית הטיפול באיש הקשר תישאר גלויה גם כשהעריכה נעשית ידנית ולא דרך סנכרון אוטומטי
export async function updateContactById(id: string, update: ContactFieldUpdate, actor?: string | null): Promise<CrmContact> {
  const { data: existing, error: fetchError } = await supabaseAdmin.from('crm_contacts').select('*').eq('id', id).single();
  if (fetchError || !existing) throw new Error('איש קשר לא נמצא');

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.fullName !== undefined) fields.full_name = update.fullName || null;
  if (update.phone !== undefined) fields.phone = normalizePhone(update.phone) || null;
  if (update.email !== undefined) fields.email = normalizeEmail(update.email) || null;
  if (update.stage !== undefined) fields.stage = update.stage;
  if (update.statusLabel !== undefined) fields.status_label = update.statusLabel || null;
  if (update.followUpAt !== undefined) fields.follow_up_at = update.followUpAt || null;
  if (update.monthlyCost !== undefined) fields.monthly_cost_paid = update.monthlyCost;
  if (update.tags !== undefined) fields.tags = update.tags;
  if (update.profileId !== undefined) fields.profile_id = update.profileId;
  if (update.joinedAt !== undefined) fields.joined_at = update.joinedAt;

  const { data, error } = await supabaseAdmin.from('crm_contacts').update(fields).eq('id', id).select('*').single();
  if (error) throw error;

  const changeNotes: string[] = [];
  if (update.stage !== undefined && update.stage !== existing.stage) {
    changeNotes.push(`שלב שונה: ${STAGE_LABEL_HE[existing.stage as CrmStage]} ← ${STAGE_LABEL_HE[update.stage]}`);
  }
  if (update.statusLabel !== undefined && (update.statusLabel || null) !== existing.status_label) {
    changeNotes.push(`סטטוס טיפול עודכן ל: ${update.statusLabel || '—'}`);
  }
  if (update.followUpAt !== undefined && (update.followUpAt || null) !== existing.follow_up_at) {
    changeNotes.push(`תאריך פולואפ עודכן ל: ${update.followUpAt || '—'}`);
  }
  if (changeNotes.length) {
    await addNote(id, changeNotes.join('\n'), actor || 'admin');
  }

  return data as CrmContact;
}

// יוצר איש קשר חדש ידנית ממסך ה-CRM, עם הערת פתיחה אוטומטית בציר הזמן ותאריך פולואפ ברירת מחדל
export async function createContact(input: { fullName: string; phone?: string | null; email?: string | null; stage?: CrmStage }, actor?: string | null): Promise<CrmContact> {
  const phone = normalizePhone(input.phone) || null;
  const email = normalizeEmail(input.email) || null;
  if (!phone && !email) throw new Error('צריך טלפון או מייל');

  const stage = input.stage || 'lead_new';
  const { data, error } = await supabaseAdmin
    .from('crm_contacts')
    .insert({ full_name: input.fullName, phone, email, stage, follow_up_at: stage !== 'subscriber' ? defaultFollowUpDate() : null })
    .select('*')
    .single();
  if (error) throw error;

  await addNote(data.id, `איש קשר נוצר ידנית${actor ? ` ע"י ${actor}` : ''}`, actor || 'admin');
  return data as CrmContact;
}

export type DuplicateGroup = { key: string; contacts: CrmContact[] };

// מאתר קבוצות של אנשי קשר עם אותו שם מלא (מנורמל) - חשוד לכפילות, למשל אחרי ייבוא ממאנדיי או
// סנכרון ממספר מקורות (לייבים/הפניות) שיצרו רשומה נפרדת לאותו אדם עם פרטי קשר שונים
export async function findPotentialDuplicates(): Promise<DuplicateGroup[]> {
  const { data } = await supabaseAdmin.from('crm_contacts').select('*');
  const groups = new Map<string, CrmContact[]>();
  for (const c of (data || []) as CrmContact[]) {
    const key = (c.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push(c);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .filter(([, contacts]) => contacts.length > 1)
    .map(([key, contacts]) => ({ key, contacts }));
}

// ממזג שני אנשי קשר: משלים שדות ריקים ב-keep מתוך merge, מאחד תגיות, מעביר את כל ההערות של
// merge אל keep (כדי לא לאבד היסטוריה), ומוחק את הרשומה הכפולה
export async function mergeContacts(keepId: string, mergeId: string): Promise<void> {
  if (keepId === mergeId) throw new Error('לא ניתן למזג איש קשר עם עצמו');

  const [{ data: keep }, { data: merge }] = await Promise.all([
    supabaseAdmin.from('crm_contacts').select('*').eq('id', keepId).single(),
    supabaseAdmin.from('crm_contacts').select('*').eq('id', mergeId).single(),
  ]);
  if (!keep || !merge) throw new Error('איש קשר לא נמצא');

  const fields: Record<string, unknown> = {};
  if (!keep.phone && merge.phone) fields.phone = merge.phone;
  if (!keep.email && merge.email) fields.email = merge.email;
  if (!keep.follow_up_at && merge.follow_up_at) fields.follow_up_at = merge.follow_up_at;
  if (!keep.status_label && merge.status_label) fields.status_label = merge.status_label;
  if (!keep.monthly_cost_paid && merge.monthly_cost_paid) fields.monthly_cost_paid = merge.monthly_cost_paid;
  if (!keep.joined_at && merge.joined_at) fields.joined_at = merge.joined_at;
  if (!keep.profile_id && merge.profile_id) fields.profile_id = merge.profile_id;
  const mergedTags = Array.from(new Set([...(keep.tags || []), ...(merge.tags || [])]));
  if (mergedTags.length) fields.tags = mergedTags;

  if (Object.keys(fields).length) {
    await supabaseAdmin.from('crm_contacts').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', keepId);
  }
  await supabaseAdmin.from('crm_notes').update({ contact_id: keepId }).eq('contact_id', mergeId);
  await addNote(keepId, `מוזג עם רשומה כפולה (${merge.full_name || merge.phone || merge.email || mergeId})`, 'system');
  await supabaseAdmin.from('crm_contacts').delete().eq('id', mergeId);
}

// מסנכרן הרשמות ללייבים (live_registrations) לתוך ה-CRM - אלה לא זורמות לשם היום בכלל
export async function syncLiveRegistrationsToCrm(): Promise<{ synced: number }> {
  const { data } = await supabaseAdmin.from('live_registrations').select('name, phone, email');
  let synced = 0;
  for (const r of data || []) {
    if (!r.phone && !r.email) continue;
    const existing = await findContact(r.phone, r.email);
    const contact = await upsertContact({ phone: r.phone, email: r.email, fullName: r.name, source: existing ? undefined : 'הרשמה ללייב', addTags: ['לייב'] });
    if (!existing) await addNote(contact.id, 'נרשם/ה ללייב באתר', 'system');
    synced++;
  }
  return { synced };
}

// מסנכרן הפניות (חבר מביא חבר - referrals) לתוך ה-CRM, לפי פרטי המומלץ/ת
export async function syncReferralsToCrm(): Promise<{ synced: number }> {
  const { data } = await supabaseAdmin.from('referrals').select('recommended_name, recommended_phone, recommended_email, referrer_name');
  let synced = 0;
  for (const r of data || []) {
    if (!r.recommended_phone && !r.recommended_email) continue;
    const existing = await findContact(r.recommended_phone, r.recommended_email);
    const contact = await upsertContact({
      phone: r.recommended_phone,
      email: r.recommended_email,
      fullName: r.recommended_name,
      source: existing ? undefined : `הפניה${r.referrer_name ? ` מ-${r.referrer_name}` : ''}`,
      addTags: ['הפניה'],
    });
    if (!existing) await addNote(contact.id, `הופנה/תה ע"י ${r.referrer_name || 'מנוי'} (חבר מביא חבר)`, 'system');
    synced++;
  }
  return { synced };
}

// מרענן lead_intent/סיכום מ"דור" (support_bot_conversations) לכל אנשי הקשר - זה בפועל ה-"AI lead
// score" שהעסק כבר מייצר בפועל (cold/curious/engaged/warm/hot/support), פשוט לא הוצג עד היום
// ב-CRM. הטבלאות קטנות (עשרות-מאות שורות) אז השוואה מלאה בזיכרון פשוטה ומספיק מהירה.
export async function refreshLeadIntentForAll(): Promise<{ updated: number }> {
  const [{ data: contacts }, { data: conversations }] = await Promise.all([
    supabaseAdmin.from('crm_contacts').select('id, phone, email'),
    supabaseAdmin
      .from('support_bot_conversations')
      .select('contact_phone, contact_email, lead_intent, summary, last_message_at')
      .not('lead_intent', 'is', null),
  ]);

  let updated = 0;
  for (const c of contacts || []) {
    const p = normalizePhone(c.phone);
    const e = normalizeEmail(c.email);
    if (!p && !e) continue;

    const matches = (conversations || []).filter(
      (conv) => (p && normalizePhone(conv.contact_phone) === p) || (e && normalizeEmail(conv.contact_email) === e)
    );
    if (matches.length === 0) continue;

    matches.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    const best = matches[0];

    await supabaseAdmin
      .from('crm_contacts')
      .update({ lead_intent: best.lead_intent, lead_intent_note: best.summary, lead_intent_updated_at: best.last_message_at })
      .eq('id', c.id);
    updated++;
  }
  return { updated };
}

// כל אנשי הקשר בשלב "מנוי" - לשימוש בחישוב צפי ההכנסה (מחליף את שליפת "קבוצת סוחרים" ממאנדיי)
export async function getSubscriberContacts(): Promise<{ name: string | null; phone: string | null; email: string | null; joinDate: string | null; monthlyCost: number | null }[]> {
  const { data } = await supabaseAdmin
    .from('crm_contacts')
    .select('full_name, phone, email, joined_at, monthly_cost_paid')
    .eq('stage', 'subscriber');

  return (data || []).map((r) => ({ name: r.full_name, phone: r.phone, email: r.email, joinDate: r.joined_at, monthlyCost: r.monthly_cost_paid }));
}

// כל הטלפונים/מיילים המנורמלים של מי שבשלב "מנוי" ב-CRM - לשימוש בבדיקת נשירה (מחליף getMondaySubscriberContacts)
export async function getSubscriberContactKeys(): Promise<{ phones: Set<string>; emails: Set<string> }> {
  const { data } = await supabaseAdmin.from('crm_contacts').select('phone, email').eq('stage', 'subscriber');
  return {
    phones: new Set((data || []).map((r) => r.phone).filter(Boolean) as string[]),
    emails: new Set((data || []).map((r) => r.email).filter(Boolean) as string[]),
  };
}

const TRADING_PLAN_STATUS_LABEL = 'בנה תוכנית מסחר';
export const TRADING_PLAN_ABANDONED_STATUS_LABEL = 'יצא באמצע התוכנית מסחר';
const TRADING_PLAN_SOURCE = 'תוכנית מסחר 30 יום';
const FOLLOWUP_DAYS_AHEAD = 7;

function followupDateValue(): string {
  return new Date(Date.now() + FOLLOWUP_DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// בונה את תקציר התובנות שמצטרף כהערה לכרטיס איש הקשר - זהה בתוכן לגרסה שהייתה נשלחת בעבר
// כ"עדכון" (update) בפריט במאנדיי
function buildInsightsNote(row: Record<string, any>, completed: boolean) {
  if (!completed) {
    const lines = [
      '"תוכנית המסחר ל-30 יום" נפתחה באתר, בלי השלמה.',
      row.source ? `מקור: ${row.source}` : null,
      `עצירה בשלב ${row.current_step ?? 0} בשאלון`,
      Array.isArray(row.trading_motivation) && row.trading_motivation.length ? `מה רוצה מהמסחר: ${row.trading_motivation.join(', ')}` : null,
      row.trading_experience ? `המצב מול מסחר: ${row.trading_experience}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }

  const content = getProfileContent(classifyProfile(row));
  const weekOneWinLabels = findOptions('week_one_win', row.week_one_win).map((o) => o.label);

  const lines = [
    '"תוכנית המסחר ל-30 יום" הושלמה באתר.',
    row.source ? `מקור: ${row.source}` : null,
    row.computed_profile ? `פרופיל: ${row.computed_profile}` : null,
    Array.isArray(row.trading_motivation) && row.trading_motivation.length ? `מה רוצה מהמסחר: ${row.trading_motivation.join(', ')}` : null,
    Array.isArray(row.self_talk) && row.self_talk.length ? `משפט מוכר: ${row.self_talk.join(', ')}` : null,
    Array.isArray(row.money_fear) && row.money_fear.length ? `מה מטריד בקשר לכסף: ${row.money_fear.join(', ')}` : null,
    row.environment_influence ? `הסביבה: ${row.environment_influence}` : null,
    Array.isArray(row.progress_markers) && row.progress_markers.length ? `מה ירגיש כהתקדמות: ${row.progress_markers.join(', ')}` : null,
    row.definition_of_success ? `סימן להצלחה: ${row.definition_of_success}` : null,
    row.personal_rule ? `הכלל האישי: ${row.personal_rule}` : null,
    weekOneWinLabels.length ? `לתזכורת בעוד שבוע - הסימן שההתחלה הייתה נכונה: ${weekOneWinLabels.join(', ')}` : null,
    `3 הדברים לשבוע הראשון: ${content.threeThings.join(' | ')}`,
  ].filter(Boolean);
  return lines.join('\n');
}

// יוצר/מעדכן ליד CRM ממילוי "תוכנית המסחר ל-30 יום" (הושלם או ננטש), עם הערת תובנות ותאריך
// פולואפ - מחליף את syncTradingPlanLead שהייתה כותבת ל-Monday.com
export async function syncTradingPlanLead(
  row: Record<string, any>,
  opts: { statusLabel?: string; completed?: boolean } = {}
): Promise<{ ok: boolean; reason?: string; contactId?: string; created?: boolean }> {
  const statusLabel = opts.statusLabel || TRADING_PLAN_STATUS_LABEL;
  const completed = opts.completed ?? true;

  if (!row.phone) return { ok: false, reason: 'no_phone' };

  try {
    const existing = await findContact(row.phone, row.email);
    const note = buildInsightsNote(row, completed);

    const contact = await upsertContact({
      phone: row.phone,
      email: row.email,
      fullName: row.name,
      stage: existing?.stage === 'subscriber' ? undefined : 'lead_new',
      statusLabel,
      source: existing ? undefined : TRADING_PLAN_SOURCE,
      followUpAt: completed ? followupDateValue() : undefined,
    });

    await addNote(contact.id, note);

    return { ok: true, contactId: contact.id, created: !existing };
  } catch (e) {
    console.error('שגיאה בסנכרון ליד תוכנית המסחר ל-CRM', e);
    return { ok: false, reason: 'error' };
  }
}

const FIRST_MONTH_DISCOUNT_AMOUNT = 200;

// מעדכן/יוצר איש קשר CRM בשלב "מנוי" מתשלום Grow - מחליף את syncGrowPaymentToMonday
export async function syncGrowPaymentToCrm(payment: {
  phone: string | null;
  email: string | null;
  fullName: string | null;
  amount: number | null;
  transactionId: string | null;
}): Promise<{ ok: boolean; reason?: string; contactId?: string }> {
  if (!payment.phone && !payment.email) return { ok: false, reason: 'no_contact' };

  try {
    const isFirstMonthDiscount = payment.amount === FIRST_MONTH_DISCOUNT_AMOUNT;
    const existing = await findContact(payment.phone, payment.email);

    const contact = await upsertContact({
      phone: payment.phone,
      email: payment.email,
      fullName: payment.fullName,
      stage: 'subscriber',
      monthlyCost: payment.amount,
      firstMonthDiscount: isFirstMonthDiscount,
      // רק בהצטרפות ראשונה - לא דורסים את תאריך ההצטרפות המקורי בכל חיוב חודשי חוזר
      joinedAt: existing?.joined_at ? undefined : new Date().toISOString(),
    });

    const noteLines = [
      'התקבל תשלום ב-Grow.',
      payment.amount != null ? `סכום: ${payment.amount} ש"ח${isFirstMonthDiscount ? ' (הנחת חודש ראשון - 50%)' : ''}` : null,
      payment.transactionId ? `מזהה עסקה: ${payment.transactionId}` : null,
    ].filter(Boolean);
    await addNote(contact.id, noteLines.join('\n'));

    return { ok: true, contactId: contact.id };
  } catch (e) {
    console.error('שגיאה בסנכרון תשלום Grow ל-CRM', e);
    return { ok: false, reason: 'error' };
  }
}
