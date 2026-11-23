import { classifyProfile } from './profile';
import { getProfileContent } from './profileContent';
import { findOptions } from './questions';
import { hasFullAccessContact } from '@/lib/subscriberStatus';

const LEAD_GROUP_NAME = 'לידים חדשים';
const SUBSCRIBER_GROUP_NAME = 'קבוצת סוחרים';
const UPDATES_GROUP_NAME = 'קבוצת עדכונים';
// קבוצת "נרשם וביטל" - מי שמגיע/ה לכאן מהקבוצה הזו (לשעבר הייתה לו/ה מנוי) מסומן/ת בשם הפריט
// עצמו (לא רק בסטטוס) כדי שיהיה ברור בבירור בתצוגה הראשית שזה לא ליד "טרי" לגמרי
const CANCELLED_SUBSCRIBER_GROUP_NAME = 'נרשם וביטל';
const CANCELLED_SUBSCRIBER_NAME_SUFFIX = '(מנוי וביטל)';
// מי שנמצא/ת בקבוצה הזו (ימי ניסיון) מקבל/ת יחס של מנוי/ה מלא/ה לכל דבר - כל עוד היא/הוא
// עדיין בקבוצה הזו במאנדיי. בלי זה, מי שבתקופת ניסיון נתקל/ת בשערים שפתוחים רק למנויים
// (למשל הרשמה ללייב) כאילו היא/הוא ליד חדש
const TRIAL_GROUP_NAME = 'בעדכונים ובימי ניסיון';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
// עמודת סטטוס ייעודית ונפרדת (לא "סטטוס טיפול") למעקב אחרי הפעלת התראות פוש - כדי לא לדרוס
// את הסטטוסים החשובים שכבר קיימים בעמודת הטיפול הרגילה
const PUSH_ACTIVATED_COLUMN_TITLE = 'הוריד את האתר';
const FOLLOWUP_COLUMN_TITLE = 'תאריך פולואפ';
// שם העמודה חייב להתאים בדיוק לזה שב-lib/grow.ts (REGISTRATION_DATE_COLUMN_TITLE) - זו אותה
// עמודה ("תאריך הרשמה") ולא עמודת "תאריך תשלום" נפרדת
const JOIN_DATE_COLUMN_TITLE = 'תאריך הרשמה';
// שם העמודה חייב להתאים בדיוק לזה שב-lib/grow.ts (MONTHLY_COST_COLUMN_TITLE)
const MONTHLY_COST_COLUMN_TITLE = 'עלות חודשית ששילם';
// תווית שהוגדרה ידנית על ידי שירן בעמודת "סטטוס טיפול" עצמה במאנדיי - לא רק בעמודה הייעודית
// "הוריד את האתר" - כדי שזה יהיה גלוי בתצוגה הראשית שהיא כבר משתמשת בה לטיפול בלידים, לא רק
// בעמודה נפרדת שפחות נבדקת. נכתבת על הכרטיס בלי להזיז אותו לקבוצה כלשהי (ר' בקשה מפורשת של
// שירן, 18.11) - ר' markAppDownloadOnMonday/Bulk
const PUSH_ACTIVATED_NO_SUB_STATUS_LABEL = 'הפעיל התראות ללא מנוי';
// תווית סטטוס למי שכיבה/תה בפועל את ההתראות באתר (לא רק שהן נשברו ברקע) - ר' markPushDisabledOnMonday
const PUSH_DISABLED_STATUS_LABEL = 'כיבה את ההתראות באתר';
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
    allGroups: groups,
    groupId: groups.find((g) => g.title === LEAD_GROUP_NAME)?.id,
    subscriberGroupId: groups.find((g) => g.title === SUBSCRIBER_GROUP_NAME)?.id,
    updatesGroupId: groups.find((g) => g.title === UPDATES_GROUP_NAME)?.id,
    trialGroupId: groups.find((g) => g.title === TRIAL_GROUP_NAME)?.id,
    cancelledSubscriberGroupId: groups.find((g) => g.title === CANCELLED_SUBSCRIBER_GROUP_NAME)?.id,
    phoneColumnId: columns.find((c) => c.type === 'phone')?.id,
    emailColumnId: columns.find((c) => c.type === 'email')?.id,
    campaignColumnId: columns.find((c) => c.title === CAMPAIGN_COLUMN_TITLE)?.id,
    statusColumnId: columns.find((c) => c.title === STATUS_COLUMN_TITLE)?.id,
    pushActivatedColumnId: columns.find((c) => c.title === PUSH_ACTIVATED_COLUMN_TITLE)?.id,
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
    const { subscriberGroupId, trialGroupId, phoneColumnId, emailColumnId } = await getBoardSchema(token, boardId);
    const groupIds = [subscriberGroupId, trialGroupId].filter(Boolean) as string[];
    if (groupIds.length === 0 || (!phoneColumnId && !emailColumnId)) return false;

    const targetPhone = phone && phoneColumnId ? normalizePhone(phone) : null;
    const targetEmail = email && emailColumnId ? email.trim().toLowerCase() : null;
    if (!targetPhone && !targetEmail) return false;

    const columnIds = [phoneColumnId, emailColumnId].filter(Boolean) as string[];

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
    }

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
  if (!phone && !email) return 'unknown';

  // קודם בודקים מול טבלת המנויים שלנו, לא רק מול מאנדיי - אחרת מי שהוענקה לו/ה גישת מנוי/ה
  // ידנית מחוץ למאנדיי (כמו סיוון דימור וטל דיצי - ר' MANUAL_EXEMPT_EMAILS למטה) תמיד תיחשב
  // "ליד חדש" כשהיא משוחחת עם הבוט, כי היא בכוונה לא נמצאת באף קבוצה במאנדיי. זה בדיוק מה
  // שגרם ליצירת ליד כפול בטעות למישהי שכבר מנויה בפועל ולא "שלחה פרטים" בשום מקום
  if (await hasFullAccessContact(phone, email).catch(() => false)) return 'member_active';

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return 'unknown';

  try {
    const { subscriberGroupId, updatesGroupId, trialGroupId, phoneColumnId, emailColumnId, pushActivatedColumnId } = await getBoardSchema(token, boardId);
    if ((!subscriberGroupId && !updatesGroupId && !trialGroupId) || (!phoneColumnId && !emailColumnId)) return 'unknown';

    const targetPhone = phone && phoneColumnId ? normalizePhone(phone) : null;
    const targetEmail = email && emailColumnId ? email.trim().toLowerCase() : null;
    if (!targetPhone && !targetEmail) return 'unknown';

    const columnIds = [phoneColumnId, emailColumnId].filter(Boolean) as string[];
    const groupIds = [subscriberGroupId, trialGroupId, updatesGroupId].filter(Boolean) as string[];

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
          return groupId === subscriberGroupId || groupId === trialGroupId ? 'member_active' : 'updates_group';
        }

        cursor = page?.cursor || null;
      } while (cursor);
    }

    // מי שהפעיל/ה התראות פוש בעבר (בכל קבוצה שהוא/היא נמצא/ת בה עכשיו - לא קבוצה ייעודית
    // יותר, ר' עמודת pushActivatedColumnId) - בלי הבדיקה הזו מישהו כזה נראה/ית "ליד חדש"
    // לגמרי כשהוא/היא ממלא/ת טופס אחר, וזה פתח כרטיס "לידים חדשים" כפול במקום להכיר בקיים -
    // בדיוק המקרה שקרה בפועל עם ראובן בכר
    if (pushActivatedColumnId) {
      const match = await findItemByContactAnywhere(token, boardId, phoneColumnId, emailColumnId, targetPhone, targetEmail, [pushActivatedColumnId]);
      if (match && match.columnValues[pushActivatedColumnId] === APP_DOWNLOAD_SOURCE_VALUE) return 'updates_group';
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
//
// גרסה שזורקת שגיאה במקום לבלוע אותה (בניגוד ל-getMondaySubscriberDetails למטה) - לשימוש
// במקומות שבהם "0 תוצאות" חייב להיות מובחן מ"השליפה נכשלה" (כמו חישוב ההכנסה החודשית),
// כי בלעדיה תקלה זמנית במאנדיי נראית בטעות כאילו כל המנויים עזבו
export async function getMondaySubscriberDetailsOrThrow(): Promise<MondaySubscriberDetail[]> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) throw new Error('חסרים MONDAY_API_TOKEN/MONDAY_BOARD_ID בהגדרות הסביבה');

  const { subscriberGroupId, phoneColumnId, emailColumnId, joinDateColumnId, monthlyCostColumnId } = await getBoardSchema(token, boardId);
  if (!subscriberGroupId) throw new Error('לא נמצאה קבוצת "קבוצת סוחרים" בלוח במאנדיי');

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
}

// גרסה בולעת-שגיאות (כמו שהיה תמיד) - לסנכרון מנויים ולכל מקום אחר שכבר יודע להתמודד עם
// רשימה ריקה כ"אין מה לעשות הפעם", ושיש לו רשת ביטחון משלו (כמו REMOVAL_SAFETY_LIMIT)
export async function getMondaySubscriberDetails(): Promise<MondaySubscriberDetail[]> {
  try {
    return await getMondaySubscriberDetailsOrThrow();
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
  // forceNew: יוצר תמיד כרטיס חדש בקבוצת "לידים חדשים", גם אם הטלפון כבר קיים במקום אחר
  // בלוח (למשל בקבוצת העדכונים) - לשימוש בקמפיינים שבהם צריך פריט פעולה נפרד וברור לכל
  // הרשמה, ולא רק הערה שנטמעת בתוך כרטיס קיים ועלולה להתפספס
  forceNew?: boolean;
}): Promise<{ ok: boolean; reason?: string; itemId?: string; created?: boolean }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) return { ok: false, reason: 'not_configured' };
  if (!params.phone) return { ok: false, reason: 'no_phone' };

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId, statusColumnId } = await getBoardSchema(token, boardId);
    const normalized = normalizePhone(params.phone);

    // בודקים תמיד אם המספר כבר קיים בלוח (גם עם forceNew) - כדי לדעת אם צריך לסמן "ליד כפול".
    // forceNew קובע רק אם ניצור כרטיס חדש למרות זאת, לא אם נבדוק בכלל
    const existingItemId = phoneColumnId
      ? await findItemIdByPhone(token, boardId, phoneColumnId, normalized).catch(() => null)
      : null;

    if (existingItemId && !params.forceNew) {
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

    // forceNew יצר כרטיס חדש גם כשהמספר כבר קיים - מסמנים אותו "ליד כפול" כדי שלא ייראה כמו
    // ליד רגיל, בדיוק כמו שקורה בהרשמה ללייב
    if (newItemId && existingItemId && statusColumnId) {
      await mondayRequest(
        token,
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
        }`,
        { boardId, itemId: newItemId, columnId: statusColumnId, value: 'ליד כפול' }
      ).catch((e) => console.error('Monday.com: נכשל סימון "ליד כפול" (ליד גנרי)', e));
    }

    if (newItemId && params.note) {
      const noteBody = existingItemId
        ? `${params.note}\n⚠ כבר קיים ליד/מנוי אחר עם אותו נייד - סומן כ"ליד כפול"`
        : params.note;
      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: newItemId, body: noteBody }
      ).catch((e) => console.error('Monday.com: נכשל הוספת עדכון לליד חדש (ליד גנרי)', e));
    }

    return { ok: true, itemId: newItemId, created: true };
  } catch (e) {
    console.error('שגיאה בסנכרון ליד גנרי ל-Monday.com', e);
    return { ok: false, reason: 'error' };
  }
}

// גם ערך עמודת ה"מקור/קמפיין" וגם תווית בעמודת "סטטוס טיפול" (נוספה ידנית בלוח על ידי שירן) -
// מסמן שאיש הקשר הפעיל התראות פוש באתר, כדי שאפשר יהיה לסנן במאנדיי ולעקוב אחרי קצב המעבר
const APP_DOWNLOAD_SOURCE_VALUE = 'הוריד את האתר';

// מחפש איש קשר לפי טלפון/מייל בכל הלוח - לא מוגבל לקבוצה ספציפית, בניגוד ל-classifyContactMonday
// שבודק רק 3 קבוצות ידועות (סוחרים/ניסיון/עדכונים). משמש כדי לדעת אם איש קשר קיים בכלל באיזשהו
// מקום בלוח (כולל קבוצות כמו "לידים לא רלוונטיים"/"ביטלו" וכו') לפני שמחליטים אם לפתוח כרטיס חדש
type MondayContactMatch = { id: string; name: string; groupId: string | null; columnValues: Record<string, string | null> };

async function findItemByContactAnywhere(
  token: string,
  boardId: string,
  phoneColumnId: string | undefined,
  emailColumnId: string | undefined,
  targetPhone: string | null,
  targetEmail: string | null,
  extraColumnIds: string[] = []
): Promise<MondayContactMatch | null> {
  const columnIds = [phoneColumnId, emailColumnId, ...extraColumnIds].filter(Boolean) as string[];
  if (columnIds.length === 0 || (!targetPhone && !targetEmail)) return null;

  let cursor: string | null = null;
  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          items_page (limit: 100, cursor: $cursor) {
            cursor
            items { id name group { id } column_values (ids: $columnIds) { id text } }
          }
        }
      }`,
      { boardId, cursor, columnIds }
    );

    const page = itemsData?.data?.boards?.[0]?.items_page;
    const items: { id: string; name: string; group: { id: string } | null; column_values: { id: string; text: string | null }[] }[] = page?.items || [];

    const found = items.find((item) => {
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
    if (found) {
      const columnValues = Object.fromEntries((found.column_values || []).map((cv) => [cv.id, cv.text]));
      return { id: found.id, name: found.name, groupId: found.group?.id || null, columnValues };
    }

    cursor = page?.cursor || null;
  } while (cursor);

  return null;
}

// מנסה לשנות את שם הפריט (לא עמודה רגילה - "name" הוא column_id שמור במאנדיי) - משמש רק
// להוספת הסיומת "(מנוי וביטל)" למי שמגיע/ה מקבוצת "נרשם וביטל". עטוף ב-catch משלו בכתובת
// הקריאה כדי שכישלון כאן (אם מאנדיי ישנה את ההתנהגות) לא יפיל את ההעברה/עדכון הסטטוס שכבר הצליחו
async function renameMondayItem(token: string, boardId: string, itemId: string, newName: string) {
  await mondayRequest(
    token,
    `mutation ($boardId: ID!, $itemId: ID!, $value: String!) {
      change_simple_column_value (board_id: $boardId, item_id: $itemId, column_id: "name", value: $value) { id }
    }`,
    { boardId, itemId, value: newName }
  );
}

// מסמן שאיש קשר הפעיל התראות פוש באתר. מי שכבר יש לו/ה גישה מלאה בפועל (מנוי/ה פעיל/ה או
// אדמין/ית, לפי hasFullAccessContact - למשל שירן עצמה, סיוון וטל) לא נחשב/ת ליד לעולם, בלי
// קשר למה שקיים/לא קיים במאנדיי - לא נוגעים לו/ה בכלל. מי שאינו בעל/ת גישה מלאה תמיד מסומן/ת
// בעמודת הסטטוס (לא מועבר/ת לקבוצה ייעודית - ר' בקשה מפורשת של שירן, 18.11: יש כבר סטטוס
// "הפעיל התראות ללא מנוי" שמוצג בבירור על הכרטיס בקבוצה שבה הוא/היא כבר נמצא/ת, אין צורך
// להזיז קבוצה בכלל, וזה גם משאיר לה חופש לארגן את הלידים בקבוצות משלה בלי שהקוד "יגנוב" אותם)
export async function markAppDownloadOnMonday(params: { name?: string | null; phone?: string | null; email?: string | null }): Promise<{ ok: boolean; matched: boolean; skippedFullAccess?: boolean; error?: string }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return { ok: false, matched: false, error: 'missing_monday_config' };
  if (!params.phone && !params.email) return { ok: false, matched: false, error: 'missing_contact' };

  if (await hasFullAccessContact(params.phone, params.email).catch(() => false)) {
    return { ok: true, matched: false, skippedFullAccess: true };
  }

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId, statusColumnId, pushActivatedColumnId, cancelledSubscriberGroupId } = await getBoardSchema(token, boardId);

    const targetPhone = params.phone ? normalizePhone(params.phone) : null;
    const targetEmail = params.email ? params.email.trim().toLowerCase() : null;

    const existing = await findItemByContactAnywhere(token, boardId, phoneColumnId, emailColumnId, targetPhone, targetEmail);
    const matched = Boolean(existing);

    const columnValues: Record<string, unknown> = {};
    if (phoneColumnId && params.phone) columnValues[phoneColumnId] = { phone: params.phone.startsWith('0') ? `972${params.phone.slice(1)}` : params.phone, countryShortName: 'IL' };
    if (emailColumnId && params.email) columnValues[emailColumnId] = { email: params.email, text: params.email };
    if (campaignColumnId) columnValues[campaignColumnId] = APP_DOWNLOAD_SOURCE_VALUE;
    if (pushActivatedColumnId) columnValues[pushActivatedColumnId] = { label: APP_DOWNLOAD_SOURCE_VALUE };
    if (statusColumnId) columnValues[statusColumnId] = { label: PUSH_ACTIVATED_NO_SUB_STATUS_LABEL };

    let itemId: string | undefined;

    if (existing) {
      itemId = existing.id;

      await mondayRequest(
        token,
        `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $columnValues, create_labels_if_missing: true) { id }
        }`,
        { boardId, itemId, columnValues: JSON.stringify(columnValues) }
      );

      if (cancelledSubscriberGroupId && existing.groupId === cancelledSubscriberGroupId && !existing.name.includes(CANCELLED_SUBSCRIBER_NAME_SUFFIX)) {
        await renameMondayItem(token, boardId, itemId, `${existing.name} ${CANCELLED_SUBSCRIBER_NAME_SUFFIX}`)
          .catch((e) => console.error('Monday.com: נכשל שינוי שם לסיומת (מנוי וביטל)', e));
      }
    } else {
      const createData: any = await mondayRequest(
        token,
        `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
          create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues, create_labels_if_missing: true) { id }
        }`,
        { boardId, groupId, itemName: params.name || params.phone || params.email || 'ללא שם', columnValues: JSON.stringify(columnValues) }
      );
      itemId = createData?.data?.create_item?.id;
    }

    if (!itemId) return { ok: false, matched };

    await mondayRequest(
      token,
      `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
      {
        itemId,
        body: `${params.phone ? `נייד: ${params.phone}\n` : ''}${params.email ? `אימייל: ${params.email}\n` : ''}מקור: הפעלת התראות באתר${matched ? '\n(הכרטיס הקיים הועבר לכאן)' : ''}`,
      }
    ).catch((e) => console.error('Monday.com: נכשל הוספת הערה (הורדת האתר)', e));

    return { ok: true, matched };
  } catch (e) {
    console.error('שגיאה בסימון הורדת האתר ב-Monday.com', e);
    return { ok: false, matched: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

// נקרא כשאיש קשר שסומן בעבר כ"הפעיל התראות ללא מנוי" מכבה בפועל את ההתראות באתר (לא שהן
// נשברו ברקע - כיבוי מודע) ואין לו/ה שום מכשיר תקף נוסף. לא מזיז קבוצה בכלל (ר' בקשה מפורשת
// של שירן, 18.11) - רק מעדכן את הסטטוס, כדי שהכרטיס יישאר איפה שהוא/היא כבר נמצא/ת. הגילוי
// אם זה בכלל רלוונטי לאיש הקשר הזה נעשה דרך העמודה הייעודית "הוריד את האתר"
// (pushActivatedColumnId, לא "סטטוס טיפול" הרגילה שמשתנה ידנית כל הזמן) - לא לפי קבוצה
export async function markPushDisabledOnMonday(params: { phone?: string | null; email?: string | null }): Promise<{ ok: boolean; updated: boolean; error?: string }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return { ok: false, updated: false, error: 'missing_monday_config' };
  if (!params.phone && !params.email) return { ok: false, updated: false, error: 'missing_contact' };

  try {
    const { phoneColumnId, emailColumnId, statusColumnId, pushActivatedColumnId } = await getBoardSchema(token, boardId);

    const targetPhone = params.phone ? normalizePhone(params.phone) : null;
    const targetEmail = params.email ? params.email.trim().toLowerCase() : null;

    const existing = await findItemByContactAnywhere(
      token, boardId, phoneColumnId, emailColumnId, targetPhone, targetEmail,
      pushActivatedColumnId ? [pushActivatedColumnId] : []
    );
    const wasActivated = Boolean(existing && pushActivatedColumnId && existing.columnValues[pushActivatedColumnId] === APP_DOWNLOAD_SOURCE_VALUE);
    if (!existing || !wasActivated) return { ok: true, updated: false };

    if (statusColumnId) {
      await mondayRequest(
        token,
        // create_labels_if_missing - אם התווית הזו עדיין לא קיימת כאופציה בעמודת הסטטוס
        // במאנדיי, Monday ייצור אותה אוטומטית במקום לדחות את העדכון
        `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $columnValues, create_labels_if_missing: true) { id }
        }`,
        { boardId, itemId: existing.id, columnValues: JSON.stringify({ [statusColumnId]: { label: PUSH_DISABLED_STATUS_LABEL } }) }
      ).catch((e) => console.error('Monday.com: נכשל סימון סטטוס "כיבה את ההתראות"', e));
    }

    await mondayRequest(
      token,
      `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
      { itemId: existing.id, body: 'כיבה/תה את ההתראות באתר' }
    ).catch((e) => console.error('Monday.com: נכשל הוספת הערה (כיבוי התראות)', e));

    return { ok: true, updated: true };
  } catch (e) {
    console.error('שגיאה בסימון כיבוי התראות ב-Monday.com', e);
    return { ok: false, updated: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

// רשימת כל אנשי הקשר שמסומנים *עכשיו* כ"הפעיל התראות ללא מנוי" (לפי עמודת "הוריד את האתר"
// הייעודית, לא קבוצה) - לשימוש בניקוי חד-פעמי (ר' /api/admin/push-subscriptions/cleanup-stale-monday):
// סורק את כל הלוח (לא קבוצה אחת) כי איש הקשר יכול להיות בכל קבוצה עכשיו
export async function listPushActivatedNoSubContacts(): Promise<{ id: string; name: string; phone: string | null; email: string | null }[]> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return [];

  const { phoneColumnId, emailColumnId, pushActivatedColumnId } = await getBoardSchema(token, boardId);
  if (!pushActivatedColumnId) return [];

  const columnIds = [phoneColumnId, emailColumnId, pushActivatedColumnId].filter(Boolean) as string[];
  const results: { id: string; name: string; phone: string | null; email: string | null }[] = [];
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          items_page (limit: 100, cursor: $cursor) {
            cursor
            items { id name column_values (ids: $columnIds) { id text } }
          }
        }
      }`,
      { boardId, cursor, columnIds }
    );

    const page = itemsData?.data?.boards?.[0]?.items_page;
    const items: { id: string; name: string; column_values: { id: string; text: string | null }[] }[] = page?.items || [];

    for (const item of items) {
      const activated = item.column_values?.find((cv) => cv.id === pushActivatedColumnId)?.text;
      if (activated !== APP_DOWNLOAD_SOURCE_VALUE) continue;
      const phone = phoneColumnId ? item.column_values?.find((cv) => cv.id === phoneColumnId)?.text || null : null;
      const email = emailColumnId ? item.column_values?.find((cv) => cv.id === emailColumnId)?.text || null : null;
      results.push({ id: item.id, name: item.name, phone, email });
    }

    cursor = page?.cursor || null;
  } while (cursor);

  return results;
}

// גרסה לסנכרון מרובה אנשי קשר בבת אחת (ר' /api/admin/push-subscriptions/resync-monday) -
// markAppDownloadOnMonday הרגילה סורקת את כל הלוח (items_page, pagination) בכל קריאה
// בודדת; להריץ אותה בלולאה על עשרות אנשי קשר לקח כל כך הרבה זמן שזה תקע את הדפדפן ולא
// הגיע לסיום. כאן סורקים את הלוח פעם אחת בלבד ומתאימים מקומית בזיכרון לכל איש קשר
export async function markAppDownloadOnMondayBulk(
  contacts: { name?: string | null; phone?: string | null; email?: string | null }[]
): Promise<{ ok: boolean; matched: boolean; error?: string }[]> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return contacts.map(() => ({ ok: false, matched: false, error: 'missing_monday_config' }));

  const { groupId, phoneColumnId, emailColumnId, campaignColumnId, statusColumnId, pushActivatedColumnId, cancelledSubscriberGroupId } = await getBoardSchema(token, boardId);

  const columnIds = [phoneColumnId, emailColumnId].filter(Boolean) as string[];
  const allItems: { id: string; name: string; groupId: string | null; phone: string | null; email: string | null }[] = [];
  if (columnIds.length > 0) {
    let cursor: string | null = null;
    do {
      const itemsData: any = await mondayRequest(
        token,
        `query ($boardId: ID!, $cursor: String, $columnIds: [String!]) {
          boards (ids: [$boardId]) {
            items_page (limit: 100, cursor: $cursor) {
              cursor
              items { id name group { id } column_values (ids: $columnIds) { id text } }
            }
          }
        }`,
        { boardId, cursor, columnIds }
      );
      const page = itemsData?.data?.boards?.[0]?.items_page;
      const items: { id: string; name: string; group: { id: string } | null; column_values: { id: string; text: string | null }[] }[] = page?.items || [];
      for (const item of items) {
        const phoneText = phoneColumnId ? item.column_values?.find((cv) => cv.id === phoneColumnId)?.text ?? null : null;
        const emailText = emailColumnId ? item.column_values?.find((cv) => cv.id === emailColumnId)?.text ?? null : null;
        allItems.push({ id: item.id, name: item.name, groupId: item.group?.id || null, phone: phoneText ? normalizePhone(phoneText) : null, email: emailText ? emailText.trim().toLowerCase() : null });
      }
      cursor = page?.cursor || null;
    } while (cursor);
  }

  const results: { ok: boolean; matched: boolean; error?: string }[] = [];
  for (const params of contacts) {
    if (!params.phone && !params.email) { results.push({ ok: false, matched: false, error: 'missing_contact' }); continue; }

    // מי שיש לו/ה כבר גישה מלאה (מנוי/ה פעיל/ה או אדמין/ית) - לא ליד, בלי קשר למה שיש/אין
    // במאנדיי. בלי הבדיקה הזו, מי שאין לו/ה בפועל כרטיס תואם במאנדיי (למשל כי הוחרג/ה בכוונה,
    // כמו שירן עצמה/סיוון/טל) מקבל/ת כרטיס ליד חדש בכל ריצה
    if (await hasFullAccessContact(params.phone, params.email).catch(() => false)) {
      results.push({ ok: true, matched: false });
      continue;
    }

    const targetPhone = params.phone ? normalizePhone(params.phone) : null;
    const targetEmail = params.email ? params.email.trim().toLowerCase() : null;
    const found = allItems.find((it) => (targetPhone && it.phone === targetPhone) || (targetEmail && it.email === targetEmail));
    const matched = Boolean(found);

    try {
      const columnValues: Record<string, unknown> = {};
      if (phoneColumnId && params.phone) columnValues[phoneColumnId] = { phone: params.phone.startsWith('0') ? `972${params.phone.slice(1)}` : params.phone, countryShortName: 'IL' };
      if (emailColumnId && params.email) columnValues[emailColumnId] = { email: params.email, text: params.email };
      if (campaignColumnId) columnValues[campaignColumnId] = APP_DOWNLOAD_SOURCE_VALUE;
      if (pushActivatedColumnId) columnValues[pushActivatedColumnId] = { label: APP_DOWNLOAD_SOURCE_VALUE };
      if (statusColumnId) columnValues[statusColumnId] = { label: PUSH_ACTIVATED_NO_SUB_STATUS_LABEL };

      let itemId: string | undefined;

      if (found) {
        itemId = found.id;

        await mondayRequest(
          token,
          `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
            change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $columnValues, create_labels_if_missing: true) { id }
          }`,
          { boardId, itemId, columnValues: JSON.stringify(columnValues) }
        );

        if (cancelledSubscriberGroupId && found.groupId === cancelledSubscriberGroupId && !found.name.includes(CANCELLED_SUBSCRIBER_NAME_SUFFIX)) {
          await renameMondayItem(token, boardId, itemId, `${found.name} ${CANCELLED_SUBSCRIBER_NAME_SUFFIX}`)
            .catch((e) => console.error('markAppDownloadOnMondayBulk: נכשל שינוי שם לסיומת (מנוי וביטל)', e));
        }
      } else {
        const createData: any = await mondayRequest(
          token,
          `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
            create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues, create_labels_if_missing: true) { id }
          }`,
          { boardId, groupId, itemName: params.name || params.phone || params.email || 'ללא שם', columnValues: JSON.stringify(columnValues) }
        );
        itemId = createData?.data?.create_item?.id;
      }

      results.push(itemId ? { ok: true, matched } : { ok: false, matched, error: 'create_failed' });
    } catch (e) {
      console.error('markAppDownloadOnMondayBulk: שגיאה באיש קשר', e);
      results.push({ ok: false, matched, error: e instanceof Error ? e.message : 'unknown_error' });
    }
  }

  return results;
}

export type MondayEmailBackfillResult = {
  totalItems: number;
  missingEmail: number;
  filled: { name: string; email: string }[];
  noMatchOnSite: string[];
  failed: { name: string; error: string }[];
};

// משלים מייל לכל פריט בלוח (בכל הקבוצות) שאין לו מייל, לפי התאמת מספר נייד למיילים שידועים באתר.
// לא נוגע בפריטים שכבר יש להם מייל. dryRun = רק מחזיר מה היה מתעדכן, בלי לכתוב למאנדיי
export async function fillMissingEmailsInMonday(emailByPhone: Map<string, string>, dryRun: boolean): Promise<MondayEmailBackfillResult> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) throw new Error('MONDAY_API_TOKEN / MONDAY_BOARD_ID לא מוגדרים');

  const { phoneColumnId, emailColumnId } = await getBoardSchema(token, boardId);
  if (!phoneColumnId || !emailColumnId) throw new Error('לא נמצאו עמודות טלפון/מייל בלוח');

  const result: MondayEmailBackfillResult = { totalItems: 0, missingEmail: 0, filled: [], noMatchOnSite: [], failed: [] };
  const toFill: { id: string; name: string; email: string }[] = [];
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          items_page (limit: 100, cursor: $cursor) {
            cursor
            items { id name column_values (ids: $columnIds) { id text } }
          }
        }
      }`,
      { boardId, cursor, columnIds: [phoneColumnId, emailColumnId] }
    );

    const page = itemsData?.data?.boards?.[0]?.items_page;
    const items: { id: string; name: string; column_values: { id: string; text: string | null }[] }[] = page?.items || [];

    for (const item of items) {
      result.totalItems += 1;
      const emailText = item.column_values?.find((cv) => cv.id === emailColumnId)?.text;
      if (emailText && emailText.trim()) continue;
      result.missingEmail += 1;

      const phoneText = item.column_values?.find((cv) => cv.id === phoneColumnId)?.text;
      const email = phoneText ? emailByPhone.get(normalizePhone(phoneText)) : undefined;
      if (email) toFill.push({ id: item.id, name: item.name, email });
      else result.noMatchOnSite.push(item.name);
    }

    cursor = page?.cursor || null;
  } while (cursor);

  for (const f of toFill) {
    if (dryRun) {
      result.filled.push({ name: f.name, email: f.email });
      continue;
    }
    try {
      await mondayRequest(
        token,
        `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
        }`,
        { boardId, itemId: f.id, columnValues: JSON.stringify({ [emailColumnId]: { email: f.email, text: f.email } }) }
      );
      result.filled.push({ name: f.name, email: f.email });
    } catch (e) {
      result.failed.push({ name: f.name, error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
    }
  }

  return result;
}

// אישור ידני של מנוי/ה מעמוד ניהול ההתראות (כפתור "אישור כמנוי") - מעביר את הכרטיס הקיים
// במאנדיי (מכל קבוצה, למשל "הפעיל עדכונים באתר ללא מנוי") לקבוצת "קבוצת סוחרים", או יוצר
// כרטיס חדש שם אם אין. חובה: הסנכרון הדו-כיווני היומי (lib/mondaySubscriberSync.ts) מוריד
// גישה לכל מי שלא נמצא/ת ב"קבוצת סוחרים" - בלי ההעברה הזו האישור באתר היה מתבטל למחרת
// joinDate - תאריך ההרשמה בפועל (YYYY-MM-DD), monthlyCost - נכתב לעמודת "עלות חודשית ששילם"
export async function moveContactToSubscribersGroupOnMonday(params: { name?: string | null; phone?: string | null; email?: string | null; joinDate: string; monthlyCost: number }): Promise<{ ok: boolean; matched: boolean; error?: string }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return { ok: false, matched: false, error: 'missing_monday_config' };
  if (!params.phone && !params.email) return { ok: false, matched: false, error: 'missing_contact' };

  try {
    const { phoneColumnId, emailColumnId, subscriberGroupId, joinDateColumnId, monthlyCostColumnId } = await getBoardSchema(token, boardId);
    if (!subscriberGroupId) return { ok: false, matched: false, error: 'missing_subscriber_group' };

    const targetPhone = params.phone ? normalizePhone(params.phone) : null;
    const targetEmail = params.email ? params.email.trim().toLowerCase() : null;
    const existing = await findItemByContactAnywhere(token, boardId, phoneColumnId, emailColumnId, targetPhone, targetEmail);

    const columnValues: Record<string, unknown> = {};
    if (phoneColumnId && params.phone) columnValues[phoneColumnId] = { phone: params.phone.startsWith('0') ? `972${params.phone.slice(1)}` : params.phone, countryShortName: 'IL' };
    if (emailColumnId && params.email) columnValues[emailColumnId] = { email: params.email, text: params.email };
    if (joinDateColumnId) columnValues[joinDateColumnId] = { date: params.joinDate };
    if (monthlyCostColumnId) columnValues[monthlyCostColumnId] = String(params.monthlyCost);

    let itemId: string | undefined;
    if (existing) {
      itemId = existing.id;
      if (existing.groupId !== subscriberGroupId) {
        await mondayRequest(
          token,
          `mutation ($itemId: ID!, $groupId: String!) { move_item_to_group (item_id: $itemId, group_id: $groupId) { id } }`,
          { itemId, groupId: subscriberGroupId }
        );
      }
      await mondayRequest(
        token,
        `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
        }`,
        { boardId, itemId, columnValues: JSON.stringify(columnValues) }
      );
    } else {
      const createData: any = await mondayRequest(
        token,
        `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
          create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
        }`,
        { boardId, groupId: subscriberGroupId, itemName: params.name || params.phone || params.email || 'ללא שם', columnValues: JSON.stringify(columnValues) }
      );
      itemId = createData?.data?.create_item?.id;
    }

    if (!itemId) return { ok: false, matched: Boolean(existing), error: 'no_item_id' };

    await mondayRequest(
      token,
      `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
      { itemId, body: 'אושר/ה כמנוי/ה ידנית מעמוד ניהול ההתראות באתר' }
    ).catch((e) => console.error('Monday.com: נכשל הוספת הערה (אישור מנוי)', e));

    return { ok: true, matched: Boolean(existing) };
  } catch (e) {
    console.error('שגיאה בהעברה לקבוצת סוחרים ב-Monday.com', e);
    return { ok: false, matched: false, error: e instanceof Error ? e.message : 'unknown_error' };
  }
}

// ביקורת על קבוצת "בווטסאפ אבל לא מנוי": מי מהם הפעיל בפועל התראות באתר (מינוי פוש תקין, לא
// מסומן invalid). למי שכן - מסמנים "הפעיל התראות ללא מנוי" בסטטוס טיפול (ו"הוריד את האתר"),
// כמו שקורה אוטומטית למי שמפעיל התראות. לפי שירן: מי שבקבוצת הווטסאפ ולא הפעיל התראות לא
// מקבל את העדכונים בזמן אמת - אז חשוב לראות את הפער. dryRun = רק מחזיר את הספירה והרשימות
export async function auditWhatsappGroupPush(
  pushContacts: { phone: string | null; email: string | null }[],
  dryRun: boolean
) {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) throw new Error('MONDAY_API_TOKEN / MONDAY_BOARD_ID לא מוגדרים');
  const { allGroups, phoneColumnId, emailColumnId, statusColumnId, pushActivatedColumnId } = await getBoardSchema(token, boardId);
  const group = allGroups.find((g) => g.title.includes('אבל לא מנוי'));
  if (!group) throw new Error('לא נמצאה הקבוצה "בווטסאפ אבל לא מנוי"');

  const phones = new Set(pushContacts.map((c) => (c.phone ? normalizePhone(c.phone) : '')).filter((p) => p.length === 9));
  const emails = new Set(pushContacts.map((c) => (c.email || '').trim().toLowerCase()).filter((e) => e.includes('@')));

  const ids = [phoneColumnId, emailColumnId, statusColumnId].filter(Boolean) as string[];
  const items: { id: string; name: string; phone: string; email: string; status: string }[] = [];
  let cursor: string | null = null;
  do {
    const d: any = cursor
      ? await mondayRequest(token, `query ($c: String!, $ids: [String!]) { next_items_page(limit: 200, cursor: $c) { cursor items { id name column_values(ids: $ids) { id text } } } }`, { c: cursor, ids })
      : await mondayRequest(token, `query ($b: ID!, $g: String!, $ids: [String!]) { boards(ids: [$b]) { groups(ids: [$g]) { items_page(limit: 200) { cursor items { id name column_values(ids: $ids) { id text } } } } } }`, { b: boardId, g: group.id, ids });
    const page = cursor ? d.data.next_items_page : d.data.boards[0].groups[0].items_page;
    for (const it of page.items as { id: string; name: string; column_values: { id: string; text: string | null }[] }[]) {
      const v = (id?: string) => (id ? it.column_values.find((c) => c.id === id)?.text || '' : '');
      items.push({ id: it.id, name: it.name, phone: v(phoneColumnId) ? normalizePhone(v(phoneColumnId)) : '', email: v(emailColumnId).trim().toLowerCase(), status: v(statusColumnId) });
    }
    cursor = page.cursor;
  } while (cursor);

  const activated = items.filter((i) => (i.phone && phones.has(i.phone)) || (i.email && emails.has(i.email)));
  const notActivated = items.filter((i) => !activated.includes(i));
  const toUpdate = activated.filter((i) => i.status !== PUSH_ACTIVATED_NO_SUB_STATUS_LABEL);

  if (!dryRun) {
    for (const i of toUpdate) {
      const cv: Record<string, unknown> = {};
      if (statusColumnId) cv[statusColumnId] = { label: PUSH_ACTIVATED_NO_SUB_STATUS_LABEL };
      if (pushActivatedColumnId) cv[pushActivatedColumnId] = { label: APP_DOWNLOAD_SOURCE_VALUE };
      await mondayRequest(token, `mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v, create_labels_if_missing: true) { id } }`, { b: boardId, i: i.id, v: JSON.stringify(cv) });
    }
  }

  return {
    group: group.title,
    total: items.length,
    activated: activated.length,
    notActivated: notActivated.length,
    updated: dryRun ? 0 : toUpdate.length,
    wouldUpdate: toUpdate.length,
    notActivatedNoContact: notActivated.filter((i) => !i.phone && !i.email).length,
    activatedNames: activated.map((i) => i.name),
    notActivatedNames: notActivated.map((i) => i.name),
    dryRun,
  };
}
