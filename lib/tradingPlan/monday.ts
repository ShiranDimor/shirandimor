import { classifyProfile } from './profile';
import { getProfileContent } from './profileContent';
import { findOptions } from './questions';

const LEAD_GROUP_NAME = 'לידים חדשים';
const SUBSCRIBER_GROUP_NAME = 'קבוצת סוחרים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
const FOLLOWUP_COLUMN_TITLE = 'תאריך פולואפ';
const TRADING_PLAN_STATUS_LABEL = 'בנה תוכנית מסחר';
export const TRADING_PLAN_ABANDONED_STATUS_LABEL = 'יצא באמצע התוכנית מסחר';
const CAMPAIGN_VALUE = 'תוכנית מסחר 30 יום';
const FOLLOWUP_DAYS_AHEAD = 7;

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-9);
}

async function mondayRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function getBoardSchema(token: string, boardId: string) {
  const data = await mondayRequest(
    token,
    `query ($boardId: ID!) {
      boards (ids: [$boardId]) { columns { id title type } groups { id title } }
    }`,
    { boardId }
  );
  const board = data?.data?.boards?.[0];
  const columns: { id: string; title: string; type: string }[] = board?.columns || [];
  const groups: { id: string; title: string }[] = board?.groups || [];

  return {
    groupId: groups.find((g) => g.title === LEAD_GROUP_NAME)?.id,
    subscriberGroupId: groups.find((g) => g.title === SUBSCRIBER_GROUP_NAME)?.id,
    phoneColumnId: columns.find((c) => c.type === 'phone')?.id,
    emailColumnId: columns.find((c) => c.type === 'email')?.id,
    campaignColumnId: columns.find((c) => c.title === CAMPAIGN_COLUMN_TITLE)?.id,
    statusColumnId: columns.find((c) => c.title === STATUS_COLUMN_TITLE)?.id,
    followupColumnId: columns.find((c) => c.title === FOLLOWUP_COLUMN_TITLE && c.type === 'date')?.id,
  };
}

// בודק אם ערך מנורמל (טלפון או מייל) קיים בעמודה נתונה בתוך קבוצה ב-Monday.com - כדי לתפוס גם
// מנוי ששירן ניהלה/אישרה ידנית שם, בלי שאי פעם נוצר לו חשבון באתר עצמו (ולכן לא ניתן
// לזהות אותו דרך טבלת המנויים באתר). normalize מקבל את פונקציית הנרמול המתאימה (טלפון/מייל).
async function isTextInGroup(
  token: string,
  boardId: string,
  groupId: string,
  columnId: string,
  target: string,
  normalize: (raw: string) => string
): Promise<boolean> {
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $groupId: [String!], $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          groups (ids: $groupId) {
            items_page (limit: 100, cursor: $cursor) {
              cursor
              items { column_values (ids: $columnIds) { text } }
            }
          }
        }
      }`,
      { boardId, groupId: [groupId], cursor, columnIds: [columnId] }
    );

    const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
    const items: { column_values: { text: string | null }[] }[] = page?.items || [];

    const found = items.some((item) => {
      const text = item.column_values?.[0]?.text;
      return text && normalize(text) === target;
    });
    if (found) return true;

    cursor = page?.cursor || null;
  } while (cursor);

  return false;
}

// בדיקה ציבורית: האם הטלפון או המייל הזה נמצאים בקבוצת "קבוצת סוחרים" ב-Monday.com - להשלמת
// הבדיקה isActiveSubscriber (שבודקת רק מול טבלת profiles באתר) עבור מנויים שמנוהלים רק ב-Monday.
// בודקים גם מייל ולא רק טלפון - לרוב המנויים בפועל אין טלפון שמור, רק מייל.
export async function isContactInSubscribersGroupMonday(
  phone: string | null | undefined,
  email: string | null | undefined
): Promise<boolean> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId || (!phone && !email)) return false;

  try {
    const { subscriberGroupId, phoneColumnId, emailColumnId } = await getBoardSchema(token, boardId);
    if (!subscriberGroupId || (!phoneColumnId && !emailColumnId)) return false;

    if (phone && phoneColumnId) {
      const found = await isTextInGroup(token, boardId, subscriberGroupId, phoneColumnId, normalizePhone(phone), normalizePhone);
      if (found) return true;
    }
    if (email && emailColumnId) {
      const target = email.trim().toLowerCase();
      const found = await isTextInGroup(token, boardId, subscriberGroupId, emailColumnId, target, (raw) => raw.trim().toLowerCase());
      if (found) return true;
    }
    return false;
  } catch (e) {
    console.error('שגיאה בבדיקת קבוצת הסוחרים ב-Monday.com', e);
    return false;
  }
}

// תאימות לאחור
export async function isPhoneInSubscribersGroupMonday(phone: string | null | undefined): Promise<boolean> {
  return isContactInSubscribersGroupMonday(phone, null);
}

// כל הטלפונים והמיילים המנורמלים בקבוצת "קבוצת סוחרים" ב-Monday.com בקריאה אחת (לא לכל שורה
// בנפרד) - לשימוש ברשימות שמסננות כמות גדולה של לידים/מנויים בבת אחת. חשוב לבדוק גם מייל
// ולא רק טלפון - לרוב המנויים בפועל אין טלפון שמור, רק מייל.
export async function getMondaySubscriberContacts(): Promise<{ phones: Set<string>; emails: Set<string> }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return { phones: new Set(), emails: new Set() };

  try {
    const { subscriberGroupId, phoneColumnId, emailColumnId } = await getBoardSchema(token, boardId);
    if (!subscriberGroupId || (!phoneColumnId && !emailColumnId)) return { phones: new Set(), emails: new Set() };

    const columnIds = [phoneColumnId, emailColumnId].filter(Boolean) as string[];
    const phoneIndex = columnIds.indexOf(phoneColumnId || '');
    const emailIndex = columnIds.indexOf(emailColumnId || '');

    const phones = new Set<string>();
    const emails = new Set<string>();
    let cursor: string | null = null;

    do {
      const itemsData: any = await mondayRequest(
        token,
        `query ($boardId: ID!, $groupId: [String!], $cursor: String, $columnIds: [String!]) {
          boards (ids: [$boardId]) {
            groups (ids: $groupId) {
              items_page (limit: 100, cursor: $cursor) {
                cursor
                items { column_values (ids: $columnIds) { text } }
              }
            }
          }
        }`,
        { boardId, groupId: [subscriberGroupId], cursor, columnIds }
      );

      const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
      const items: { column_values: { text: string | null }[] }[] = page?.items || [];
      for (const item of items) {
        if (phoneIndex >= 0) {
          const text = item.column_values?.[phoneIndex]?.text;
          if (text) phones.add(normalizePhone(text));
        }
        if (emailIndex >= 0) {
          const text = item.column_values?.[emailIndex]?.text;
          if (text) emails.add(text.trim().toLowerCase());
        }
      }

      cursor = page?.cursor || null;
    } while (cursor);

    return { phones, emails };
  } catch (e) {
    console.error('שגיאה בשליפת קבוצת הסוחרים ב-Monday.com', e);
    return { phones: new Set(), emails: new Set() };
  }
}

// תאימות לאחור - רק הטלפונים, לקוד ישן שעדיין משתמש בזה
export async function getMondaySubscriberPhones(): Promise<Set<string>> {
  const { phones } = await getMondaySubscriberContacts();
  return phones;
}

// יוצר את עמודת "תאריך פולואפ" בלוח אם היא עדיין לא קיימת - כדי שלא תצטרכי להוסיף אותה ידנית
async function ensureFollowupColumn(token: string, boardId: string): Promise<string | null> {
  const data: any = await mondayRequest(
    token,
    `mutation ($boardId: ID!, $title: String!) {
      create_column (board_id: $boardId, title: $title, column_type: date) { id }
    }`,
    { boardId, title: FOLLOWUP_COLUMN_TITLE }
  );
  return data?.data?.create_column?.id || null;
}

function followupDateValue(): string {
  const d = new Date(Date.now() + FOLLOWUP_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// מחפש פריט קיים בכל הלוח (לא רק בקבוצת "לידים חדשים") לפי מספר נייד מנורמל - כדי לא ליצור כפילות למי שכבר קיים
async function findItemIdByPhone(token: string, boardId: string, phoneColumnId: string, targetNormalized: string): Promise<string | null> {
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          items_page (limit: 100, cursor: $cursor) {
            cursor
            items { id column_values (ids: $columnIds) { text } }
          }
        }
      }`,
      { boardId, cursor, columnIds: [phoneColumnId] }
    );

    const page = itemsData?.data?.boards?.[0]?.items_page;
    const items: { id: string; column_values: { text: string | null }[] }[] = page?.items || [];

    const found = items.find((item) => {
      const text = item.column_values?.[0]?.text;
      return text && normalizePhone(text) === targetNormalized;
    });
    if (found) return found.id;

    cursor = page?.cursor || null;
  } while (cursor);

  return null;
}

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

export async function syncTradingPlanLead(
  row: Record<string, any>,
  opts: { statusLabel?: string; completed?: boolean } = {}
): Promise<{ ok: boolean; reason?: string; itemId?: string; created?: boolean }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  const statusLabel = opts.statusLabel || TRADING_PLAN_STATUS_LABEL;
  const completed = opts.completed ?? true;

  if (!token || !boardId) {
    return { ok: false, reason: 'not_configured' };
  }
  if (!row.phone) {
    return { ok: false, reason: 'no_phone' };
  }

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId, statusColumnId, followupColumnId: existingFollowupColumnId } = await getBoardSchema(token, boardId);
    const normalized = normalizePhone(row.phone);
    const note = buildInsightsNote(row, completed);

    const followupColumnId = !completed ? null : existingFollowupColumnId || await ensureFollowupColumn(token, boardId).catch((e) => {
      console.error('Monday.com: נכשלה יצירת עמודת תאריך פולואפ', e);
      return null;
    });

    const existingItemId = phoneColumnId
      ? await findItemIdByPhone(token, boardId, phoneColumnId, normalized).catch(() => null)
      : null;

    if (existingItemId) {
      if (statusColumnId) {
        await mondayRequest(
          token,
          `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
            change_simple_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
          }`,
          { boardId, itemId: existingItemId, columnId: statusColumnId, value: statusLabel }
        ).catch((e) => console.error('Monday.com: נכשל עדכון סטטוס לליד קיים', e));
      }

      if (followupColumnId) {
        await mondayRequest(
          token,
          `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
            change_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
          }`,
          { boardId, itemId: existingItemId, columnId: followupColumnId, value: JSON.stringify({ date: followupDateValue() }) }
        ).catch((e) => console.error('Monday.com: נכשל עדכון תאריך פולואפ לליד קיים', e));
      }

      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: existingItemId, body: note }
      ).catch((e) => console.error('Monday.com: נכשל הוספת עדכון לליד קיים', e));

      return { ok: true, itemId: existingItemId, created: false };
    }

    const columnValues: Record<string, unknown> = {};
    if (phoneColumnId) columnValues[phoneColumnId] = { phone: row.phone.startsWith('0') ? `972${row.phone.slice(1)}` : row.phone, countryShortName: 'IL' };
    if (emailColumnId && row.email) columnValues[emailColumnId] = { email: row.email, text: row.email };
    if (campaignColumnId) columnValues[campaignColumnId] = CAMPAIGN_VALUE;
    if (statusColumnId) columnValues[statusColumnId] = { label: statusLabel };
    if (followupColumnId) columnValues[followupColumnId] = { date: followupDateValue() };

    const createData: any = await mondayRequest(
      token,
      `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
        create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
      }`,
      { boardId, groupId: groupId || null, itemName: row.name || 'ליד - תוכנית מסחר', columnValues: JSON.stringify(columnValues) }
    );

    const newItemId = createData?.data?.create_item?.id;
    if (newItemId) {
      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: newItemId, body: note }
      ).catch((e) => console.error('Monday.com: נכשל הוספת עדכון לליד חדש', e));
    }

    return { ok: true, itemId: newItemId, created: true };
  } catch (e) {
    console.error('שגיאה בסנכרון ליד תוכנית המסחר ל-Monday.com', e);
    return { ok: false, reason: 'error' };
  }
}
