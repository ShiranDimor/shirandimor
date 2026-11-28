import { NextResponse } from 'next/server';
import { hasFullAccessContact } from '@/lib/subscriberStatus';
import { classifyContactMonday } from '@/lib/tradingPlan/monday';
import { isPhoneBlocked } from '@/lib/blockedContacts';
import { supabaseAdmin } from '@/lib/instantLogin';
import { sendPushToUsers } from '@/lib/webPush';
import { recordSignupSource } from '@/lib/joinSource';

// אם כל ניסיון היצירה במאנדיי נכשל (לא רק סימון כפילות/עדכון, אלא כל הבלוק) - הליד לא נשמר
// בשום מקום אחר (אין טבלה מקומית ל"לידים טהורים", רק במאנדיי). בלי ההתראה הזו הוא היה נעלם
// לגמרי בלי שום עקבה - עם ההתראה, לפחות השם/נייד/מייל מגיעים לשירן והיא יכולה לפנות ידנית
async function alertLeadLost(name: string, phone: string, email: string) {
  try {
    const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('role', 'admin');
    await sendPushToUsers((admins || []).map((a) => a.id), {
      title: '⚠️ ליד לא נשמר במאנדיי',
      body: `${name} · ${phone}${email ? ` · ${email}` : ''} - נכשל סנכרון מאנדיי, אין לו תיעוד בשום מקום אחר`,
    });
  } catch (e) {
    console.error('שגיאה בשליחת התראה על ליד שאבד', e);
  }
}

const LEAD_GROUP_NAME = 'לידים חדשים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const DEFAULT_SOURCE_LABEL = 'הגיע מהאתר - עדכונים';

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-9);
}

// זורק על שגיאת GraphQL (json.errors) ולא רק שגיאת HTTP - מאנדיי לרוב מחזיר 200 גם כששאילתה
// נכשלה (rate limit/מכסת מורכבות), ובלי הבדיקה הזו pagination שנכשל באמצע נראה כמו "אין עוד תוצאות"
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
    phoneColumnId: columns.find((c) => c.type === 'phone')?.id,
    emailColumnId: columns.find((c) => c.type === 'email')?.id,
    campaignColumnId: columns.find((c) => c.title === CAMPAIGN_COLUMN_TITLE)?.id,
  };
}

// מחפש ליד/מנוי קיים בלוח (בכל קבוצה, לא רק "לידים חדשים") עם אותו מספר נייד - מחזיר את
// מזהה הפריט הקיים (לא רק true/false) כי המטרה היא להוסיף הערה על הכרטיס הקיים, לא לפתוח
// כרטיס נוסף: בעבר הבדיקה הזו רק *סימנה* את הכרטיס החדש כ"ליד כפול" אבל עדיין יצרה אותו -
// כך שאיש קשר שכבר יש לו כרטיס בקבוצה אחרת (למשל "לידים חדשים - בידרנט") קיבל כרטיס שני
// מכופל בכל פעם שנרשם להתראות, במקום שהכרטיס הקיים שלו יתעדכן
async function findExistingItemByPhone(token: string, boardId: string, phoneColumnId: string, targetNormalized: string): Promise<string | null> {
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

export async function POST(request: Request) {
  const { name, phone, email, source, joinSrc } = await request.json();

  if (!phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  // מקור ההצטרפות מדף ה-₪1 - נשמר לפני כל שאר הבדיקות, כדי שיהיה זמין כשהתשלום מגיע מ-Grow
  if (typeof joinSrc === 'string') {
    await recordSignupSource(phone, email, joinSrc).catch((e) => console.error('lead: נכשלה שמירת מקור הצטרפות', e));
  }

  // איש קשר חסום - מגיב כמו הרשמה רגילה (בלי לחשוף שהוא חסום) אבל לא יוצר שום ליד/רשומה בפועל
  if (await isPhoneBlocked(phone)) {
    const response = NextResponse.json({ ok: true, monday: false });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }

  // מזהה מאיזה טופס/עמוד ספציפי הגיע הליד (למשל דף בית מול ספריית שיעורים) - כדי שיהיה אפשר
  // להבדיל בין המקורות במאנדיי במקום שכולם ייראו זהים
  const sourceLabel = typeof source === 'string' && source.trim() ? source.trim() : DEFAULT_SOURCE_LABEL;

  // מי שכבר מנוי פעיל (באתר, או בקבוצת הסוחרים ב-Monday) או כבר בקבוצת העדכונים ב-Monday -
  // לא צריך ליד חדש, רק לפתוח לו גישה. בלי הבדיקה הזו כל כניסה כזו יוצרת ליד מיותר ב-Monday
  // שצריך לזהות ולמחוק ידנית. classifyContactMonday בודק את שתי הקבוצות במעבר יחיד על הלוח
  const [isSiteSubscriber, mondayClass] = await Promise.all([
    hasFullAccessContact(phone, email),
    classifyContactMonday(phone, email).catch(() => 'unknown' as const),
  ]);
  const isSubscriber = isSiteSubscriber || mondayClass === 'member_active';
  const isMondayUpdates = mondayClass === 'updates_group';

  if (isSubscriber || isMondayUpdates) {
    const response = NextResponse.json({
      ok: true,
      alreadySubscriber: isSubscriber,
      matched: isSubscriber ? 'subscriber' : 'updates',
    });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }

  // הגענו לכאן רק אחרי שהתברר שהאדם לא כבר מנוי/בקבוצת העדכונים - עכשיו באמת יוצרים ליד חדש
  // ב-Monday, ולזה כן צריך שם. עד עכשיו הבדיקה הסתמכה רק על נייד, כדי שלא נבקש שם ממי שכבר
  // מזוהה אצלנו סתם כדי "לוודא מי זה" - זה מבוזבז ומרגיש כמו איסוף פרטים מיותר
  if (!name) {
    return NextResponse.json({ ok: true, needsName: true });
  }

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    console.error('Monday.com לא מוגדר (חסר MONDAY_API_TOKEN או MONDAY_BOARD_ID בסביבה)');
    const response = NextResponse.json({ ok: true, monday: false });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId } = await getBoardSchema(token, boardId);
    if (!groupId) {
      console.error(`Monday.com: לא נמצאה קבוצה בשם "${LEAD_GROUP_NAME}" בלוח ${boardId}`);
    }

    const existingItemId = phoneColumnId
      ? await findExistingItemByPhone(token, boardId, phoneColumnId, normalizePhone(phone)).catch(() => null)
      : null;

    let itemId: string | undefined;

    if (existingItemId) {
      // כבר קיים כרטיס עם הנייד הזה במקום כלשהו בלוח - לא פותחים כרטיס שני ("ליד כפול"), רק
      // מוסיפים הערה על הכרטיס הקיים. בעבר התווית "ליד כפול" נוספה אבל כרטיס חדש נוצר בכל זאת,
      // כך שכל הרשמה חוזרת (למשל להתראות פוש) של מי שכבר יש לו ליד/כרטיס במקום אחר בלוח
      // (כמו קבוצת "לידים חדשים - בידרנט") פתחה עוד ועוד כרטיסים מכופלים
      itemId = existingItemId;
      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) {
          create_update (item_id: $itemId, body: $body) { id }
        }`,
        {
          itemId,
          body: `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: ${sourceLabel}\n⚠ כבר קיים כרטיס אחר עם אותו נייד בלוח - לא נפתח כרטיס נוסף, זו הערה על הכרטיס הקיים`,
        }
      ).catch((e) => console.error('Monday.com: נכשל להוסיף הערה לכרטיס קיים (ליד כפול)', e));
    } else {
      const columnValues: Record<string, unknown> = {};
      if (phoneColumnId) columnValues[phoneColumnId] = { phone: phone.startsWith('0') ? `972${phone.slice(1)}` : phone, countryShortName: 'IL' };
      if (emailColumnId && email) columnValues[emailColumnId] = { email, text: email };
      if (campaignColumnId) columnValues[campaignColumnId] = sourceLabel;

      const createItemData = await mondayRequest(
        token,
        `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
          create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
        }`,
        { boardId, groupId: groupId || null, itemName: name, columnValues: JSON.stringify(columnValues) }
      );

      itemId = createItemData?.data?.create_item?.id;

      if (itemId) {
        await mondayRequest(
          token,
          `mutation ($itemId: ID!, $body: String!) {
            create_update (item_id: $itemId, body: $body) { id }
          }`,
          {
            itemId,
            body: `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: ${sourceLabel}`,
          }
        );
      } else {
        console.error('Monday.com לא החזיר מזהה פריט', createItemData);
      }
    }

    const response = NextResponse.json({ ok: true, monday: Boolean(itemId) });
    // מסמן את הדפדפן כמי שכבר נרשם/השאיר פרטים - פותח גישה לספריית השיעורים בלי לבקש שוב
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  } catch (e) {
    console.error('שגיאה בשליחת הליד ל-Monday.com', e);
    await alertLeadLost(name, phone, email || '');
    const response = NextResponse.json({ ok: true, monday: false });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }
}
