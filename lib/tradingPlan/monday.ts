import { classifyProfile } from './profile';
import { getProfileContent } from './profileContent';
import { findOptions } from './questions';

const LEAD_GROUP_NAME = 'לידים חדשים';
const SUBSCRIBER_GROUP_NAME = 'קבוצת סוחרים';
const UPDATES_GROUP_NAME = 'קבוצת עדכונים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
const FOLLOWUP_COLUMN_TITLE = 'תאריך פולואפ';
// שם העמודה חייב להתאים בדיוק לזה שב-lib/grow.ts (REGISTRATION_DATE_COLUMN_TITLE) - זו אותה
// עמודה ("תאריך הרשמה") ולא עמודת "תאריך תשלום" נפרדת
const JOIN_DATE_COLUMN_TITLE = 'תאריך הרשמה';
// שם העמודה חייב להתאים בדיוק לזה שב-lib/grow.ts (MONTHLY_COST_COLUMN_TITLE)
const MONTHLY_COST_COLUMN_TITLE = 'עלות חודשית ששילם';
const TRADING_PLAN_STATUS_LABEL = 'בנה תוכנית מסחר';
export const TRADING_PLAN_ABANDONED_STATUS_LABEL = 'יצא באמצע התוכנית מסחר';
const CAMPAIGN_VALUE = 'תוכנית מסחר 30 יום';
const FOLLOWUP_DAYS_AHEAD = 7;

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-9);
}

// קריטי: חייבים לזרוק על שגיאת GraphQL (json.errors) ולא רק על שגיאת HTTP - מאנדיי לרוב מחזיר
// 200 גם כשהשאילתה נכשלה (למשל חריגה ממכסת המורכבות/rate limit באמצע pagination). בלי הבדיקה
// הזו, לולאת pagination הייתה מפרשת עמוד שנכשל כ"אין עוד תוצאות" ומחזירה רשימה חלקית בלי
// שום שגיאה - בדיוק מה שגרם ביום הזה להוריד בטעות מנויים אמיתיים שהיו קיימים בפועל במאנדיי
async function mondayRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Monday API error (${res.status}): ${JSON.stringify(json.errors || json)}`);
  }
  return json;
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
    updatesGroupId: groups.find((g) => g.title === UPDATES_GROUP_NAME)?.id,
    phoneColumnId: columns.find((c) => c.type === 'phone')?.id,
    emailColumnId: columns.find((c) => c.type === 'email')?.id,
    campaignColumnId: columns.find((c) => c.title === CAMPAIGN_COLUMN_TITLE)?.id,
    statusColumnId: columns.find((c) => c.title === STATUS_COLUMN_TITLE)?.id,
    monthlyCostColumnId: columns.find((c) => c.title === MONTHLY_COST_COLUMN_TITLE)?.id,
    followupColumnId: columns.find((c) => c.title === FOLLOWUP_COLUMN_TITLE && c.type === 'date')?.id,
    joinDateColumnId: columns.find((c) => c.type === 'date' && c.title === JOIN_DATE_COLUMN_TITLE)?.id,
  };
}

// בדיקה ציבורית: האם הטלפון או המייל הזה נמצאים בקבוצת "קבוצת סוחרים" ב-Monday.com - להשלמת
// הבדיקה isActiveSubscriber (שבודקת רק מול טבלת profiles באתר) עבור מנויים שמנוהלים רק ב-Monday.
// בודקים גם מייל ולא רק טלפון - לרוב המנויים בפועל אין טלפון שמור, רק מייל.
// עובר על הקבוצה במעבר יחיד (טלפון ומייל באותה קריאה, עם limit גבוה) במקום שני מעברים נפרדים -
// זה מה שגרם לבדיקה לקחת כמה שניות טובות בהרשמה ללייב
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

    const targetPhone = phone && phoneColumnId ? normalizePhone(phone) : null;
    const targetEmail = email && emailColumnId ? email.trim().toLowerCase() : null;
    if (!targetPhone && !targetEmail) return false;

    const columnIds = [phoneColumnId, emailColumnId].filter(Boolean) as string[];

    let cursor: string | null = null;
    do {
      const itemsData: any = await mondayRequest(
        token,
        `query ($boardId: ID!, $groupId: [String!], $cursor: String, $columnIds: [String!]) {
          boards (ids: [$boardId]) {
            groups (ids: $groupId) {
              items_page (limit: 500, cursor: $cursor) {
                cursor
                items { column_values (ids: $columnIds) { id text } }
              }
            }
          }
        }`,
        { boardId, groupId: [subscriberGroupId], cursor, columnIds }
      );

      const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
      // Monday.com לא בהכרח מחזיר את column_values בסדר של columnIds שביקשנו - אלא בסדר הפנימי
      // של הלוח - לכן חייבים להתאים לפי id ולא לפי מיקום במערך (זה מה שגרם לתקרית שבה
      // "המייל" בפועל היה תאריך הצטרפות, ו"תאריך ההצטרפות" היה עלות חודשית)
      const items: { column_values: { id: string; text: string | null }[] }[] = page?.items || [];

      const found = items.some((item) => {
        if (targetPhone && phoneColumnId) {
          const text = item.column_values?.find((cv) => cv.id === phoneColumnId)?.text;
          if (text && normalizePhone(text) === targetPhone) return true;
        }
        if (targetEmail && emailColumnId) {
          const text = item.column_values?.find((cv) => cv.id === emailColumnId)?.text;
          if (text && text.trim().toLowerCase() === targetEmail) return true;
        }
        return false;
      });
      if (found) return true;

      cursor = page?.cursor || null;
    } while (cursor);

    return false;
  } catch (e) {
    console.error('שגיאה בבדיקת קבוצת הסוחרים ב-Monday.com', e);
    return false;
  }
}

export type MondayContactUserType = 'member_active' | 'updates_group' | 'lead_new' | 'unknown';

// מסווג איש קשר (טלפון/מייל) לפי הקבוצה שהוא נמצא בה במאנדיי - לשימוש בבוט "דור" כדי לדעת אם
// מדובר במנוי פעיל, מישהו מקבוצת העדכונים החינמית, או ליד חדש שלא נמצא באף קבוצה. בודק את שתי
// הקבוצות במעבר יחיד על הלוח (ולא שתי בדיקות נפרדות), ומתאים לפי id של הקבוצה שהפריט נמצא בה
// (ולא לפי מיקום במערך - אותה תקלה שכבר תוקנה בפונקציות האחרות כאן).
export async function classifyContactMonday(
  phone: string | null | undefined,
  email: string | null | undefined
): Promise<MondayContactUserType> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId || (!phone && !email)) return 'unknown';

  try {
    const { subscriberGroupId, updatesGroupId, phoneColumnId, emailColumnId } = await getBoardSchema(token, boardId);
    if ((!subscriberGroupId && !updatesGroupId) || (!phoneColumnId && !emailColumnId)) return 'unknown';

    const targetPhone = phone && phoneColumnId ? normalizePhone(phone) : null;
    const targetEmail = email && emailColumnId ? email.trim().toLowerCase() : null;
    if (!targetPhone && !targetEmail) return 'unknown';

    const columnIds = [phoneColumnId, emailColumnId].filter(Boolean) as string[];
    const groupIds = [subscriberGroupId, updatesGroupId].filter(Boolean) as string[];

    const matchesContact = (item: { column_values: { id: string; text: string | null }[] }) => {
      if (targetPhone && phoneColumnId) {
        const text = item.column_values?.find((cv) => cv.id === phoneColumnId)?.text;
        if (text && normalizePhone(text) === targetPhone) return true;
      }
      if (targetEmail && emailColumnId) {
        const text = item.column_values?.find((cv) => cv.id === emailColumnId)?.text;
        if (text && text.trim().toLowerCase() === targetEmail) return true;
      }
      return false;
    };

    for (const groupId of groupIds) {
      let cursor: string | null = null;
      do {
        const itemsData: any = await mondayRequest(
          token,
          `query ($boardId: ID!, $groupId: [String!], $cursor: String, $columnIds: [String!]) {
            boards (ids: [$boardId]) {
              groups (ids: $groupId) {
                items_page (limit: 500, cursor: $cursor) {
                  cursor
                  items { column_values (ids: $columnIds) { id text } }
                }
              }
            }
          }`,
          { boardId, groupId: [groupId], cursor, columnIds }
        );

        const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
        const items: { column_values: { id: string; text: string | null }[] }[] = page?.items || [];

        if (items.some(matchesContact)) {
          return groupId === subscriberGroupId ? 'member_active' : 'updates_group';
        }

        cursor = page?.cursor || null;
      } while (cursor);
    }

    return 'lead_new';
  } catch (e) {
    console.error('שגיאה בסיווג איש קשר מול מאנדיי', e);
    return 'unknown';
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
                items { column_values (ids: $columnIds) { id text } }
              }
            }
          }
        }`,
        { boardId, groupId: [subscriberGroupId], cursor, columnIds }
      );

      const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
      // התאמה לפי id, לא לפי מיקום במערך - ר' הערה למעלה ב-isContactInSubscribersGroupMonday
      const items: { column_values: { id: string; text: string | null }[] }[] = page?.items || [];
      for (const item of items) {
        if (phoneColumnId) {
          const text = item.column_values?.find((cv) => cv.id === phoneColumnId)?.text;
          if (text) phones.add(normalizePhone(text));
        }
        if (emailColumnId) {
          const text = item.column_values?.find((cv) => cv.id === emailColumnId)?.text;
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

export type MondaySubscriberDetail = { name: string | null; phone: string | null; email: string | null; joinDate: string | null; monthlyCost: string | null };

// כל הפרטים (שם, טלפון, מייל, תאריך הצטרפות אם קיימת עמודה כזו) של כל מי שנמצא בקבוצת
// "קבוצת סוחרים" ב-Monday.com - לשימוש בסנכרון מנויים שקיימים רק במאנדיי לחשבון באתר,
// כדי שלא יהיה תלוי בכך שהם ייכנסו בעצמם פעם אחת כדי "להיספר" כמנויים באתר
export async function getMondaySubscriberDetails(): Promise<MondaySubscriberDetail[]> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return [];

  try {
    const { subscriberGroupId, phoneColumnId, emailColumnId, joinDateColumnId, monthlyCostColumnId } = await getBoardSchema(token, boardId);
    if (!subscriberGroupId) return [];

    const columnIds = [phoneColumnId, emailColumnId, joinDateColumnId, monthlyCostColumnId].filter(Boolean) as string[];

    const result: MondaySubscriberDetail[] = [];
    let cursor: string | null = null;

    do {
      const itemsData: any = await mondayRequest(
        token,
        `query ($boardId: ID!, $groupId: [String!], $cursor: String, $columnIds: [String!]) {
          boards (ids: [$boardId]) {
            groups (ids: $groupId) {
              items_page (limit: 100, cursor: $cursor) {
                cursor
                items { name column_values (ids: $columnIds) { id text } }
              }
            }
          }
        }`,
        { boardId, groupId: [subscriberGroupId], cursor, columnIds }
      );

      const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
      // התאמה לפי id, לא לפי מיקום במערך - ר' הערה למעלה ב-isContactInSubscribersGroupMonday
      const items: { name: string; column_values: { id: string; text: string | null }[] }[] = page?.items || [];
      for (const item of items) {
        const byId = (colId: string | undefined) =>
          colId ? item.column_values?.find((cv) => cv.id === colId)?.text || null : null;
        result.push({
          name: item.name || null,
          phone: byId(phoneColumnId),
          email: byId(emailColumnId),
          joinDate: byId(joinDateColumnId),
          monthlyCost: byId(monthlyCostColumnId),
        });
      }

      cursor = page?.cursor || null;
    } while (cursor);

    return result;
  } catch (e) {
    console.error('שגיאה בשליפת פרטי קבוצת הסוחרים ב-Monday.com', e);
    return [];
  }
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
    // מוסיפים את מקור התנועה האמיתי (מ-?source=/?utm_source=, אם נתפס) לתוך אותה עמודה - כדי
    // שיהיה אפשר להבדיל בין קמפיינים שונים שהובילו לתוכנית מסחר, ולא רק לדעת שזה "תוכנית מסחר"
    if (campaignColumnId) columnValues[campaignColumnId] = row.source ? `${CAMPAIGN_VALUE} (${row.source})` : CAMPAIGN_VALUE;
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

// סנכרון ליד גנרי למאנדיי - לשימוש בכל מקום שאדם משאיר טלפון/מייל בלי תבנית ייעודית משלו (כרגע:
// שיחה עם דור, וניסיון התחברות שלא נמצא במאנדיי). כמו syncTradingPlanLead - מזהה כרטיס קיים
// לפי טלפון ומעדכן אותו במקום ליצור כפילות, ותמיד כותב source לעמודת הקמפיין כדי שיהיה ברור
// מאיפה הליד הגיע.
export async function syncGenericLead(params: {
  phone: string | null | undefined;
  email?: string | null;
  name?: string | null;
  source: string;
  note?: string;
}): Promise<{ ok: boolean; reason?: string; itemId?: string; created?: boolean }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) return { ok: false, reason: 'not_configured' };
  if (!params.phone) return { ok: false, reason: 'no_phone' };

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId } = await getBoardSchema(token, boardId);
    const normalized = normalizePhone(params.phone);

    const existingItemId = phoneColumnId
      ? await findItemIdByPhone(token, boardId, phoneColumnId, normalized).catch(() => null)
      : null;

    if (existingItemId) {
      if (params.note) {
        await mondayRequest(
          token,
          `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
          { itemId: existingItemId, body: params.note }
        ).catch((e) => console.error('Monday.com: נכשל הוספת עדכון לליד קיים (ליד גנרי)', e));
      }
      return { ok: true, itemId: existingItemId, created: false };
    }

    const columnValues: Record<string, unknown> = {};
    if (phoneColumnId) columnValues[phoneColumnId] = { phone: params.phone.startsWith('0') ? `972${params.phone.slice(1)}` : params.phone, countryShortName: 'IL' };
    if (emailColumnId && params.email) columnValues[emailColumnId] = { email: params.email, text: params.email };
    if (campaignColumnId) columnValues[campaignColumnId] = params.source;

    const createData: any = await mondayRequest(
      token,
      `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
        create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
      }`,
      { boardId, groupId: groupId || null, itemName: params.name || 'ליד חדש', columnValues: JSON.stringify(columnValues) }
    );

    const newItemId = createData?.data?.create_item?.id;
    if (newItemId && params.note) {
      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: newItemId, body: params.note }
      ).catch((e) => console.error('Monday.com: נכשל הוספת עדכון לליד חדש (ליד גנרי)', e));
    }

    return { ok: true, itemId: newItemId, created: true };
  } catch (e) {
    console.error('שגיאה בסנכרון ליד גנרי ל-Monday.com', e);
    return { ok: false, reason: 'error' };
  }
}
