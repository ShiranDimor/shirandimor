import { NextResponse } from 'next/server';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { classifyContactMonday } from '@/lib/tradingPlan/monday';

const LEAD_GROUP_NAME = 'לידים חדשים';
// קישור ההצטרפות בפועל לקבוצת הוואטסאפ החינמית - נשמר כאן (קוד צד-שרת) ולא בעמוד עצמו,
// כדי שלא יהיה חשוף בקוד הציבורי שנשלח לדפדפן: מי שרק פותח את מקור הדף לא יכול "לגנוב" את
// הקישור ולהצטרף לקבוצה בלי להשאיר פרטים - הוא נחשף רק בתגובת ה-API אחרי שליחה אמיתית של הטופס
const WHATSAPP_FREE_GROUP_INVITE_URL = process.env.WHATSAPP_FREE_GROUP_INVITE_URL || 'https://chat.whatsapp.com/GEf9Y4vFRDSEWKixrETWcg';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
const DUPLICATE_STATUS_LABEL = 'ליד כפול';
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
    statusColumnId: columns.find((c) => c.title === STATUS_COLUMN_TITLE)?.id,
  };
}

// בודק אם כבר קיים ליד/מנוי אחר בלוח (בכל קבוצה, לא רק "לידים חדשים") עם אותו מספר נייד
async function hasExistingPhone(token: string, boardId: string, phoneColumnId: string, targetNormalized: string) {
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          items_page (limit: 100, cursor: $cursor) {
            cursor
            items { column_values (ids: $columnIds) { text } }
          }
        }
      }`,
      { boardId, cursor, columnIds: [phoneColumnId] }
    );

    const page = itemsData?.data?.boards?.[0]?.items_page;
    const items = page?.items || [];

    const found = items.some((item: { column_values: { text: string | null }[] }) => {
      const text = item.column_values?.[0]?.text;
      return text && normalizePhone(text) === targetNormalized;
    });
    if (found) return true;

    cursor = page?.cursor || null;
  } while (cursor);

  return false;
}

export async function POST(request: Request) {
  const { name, phone, email, source } = await request.json();

  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  // מזהה מאיזה טופס/עמוד ספציפי הגיע הליד (למשל דף בית מול ספריית שיעורים) - כדי שיהיה אפשר
  // להבדיל בין המקורות במאנדיי במקום שכולם ייראו זהים
  const sourceLabel = typeof source === 'string' && source.trim() ? source.trim() : DEFAULT_SOURCE_LABEL;

  // מי שכבר מנוי פעיל (באתר, או בקבוצת הסוחרים ב-Monday) או כבר בקבוצת העדכונים ב-Monday -
  // לא צריך ליד חדש, רק לפתוח לו גישה. בלי הבדיקה הזו כל כניסה כזו יוצרת ליד מיותר ב-Monday
  // שצריך לזהות ולמחוק ידנית. classifyContactMonday בודק את שתי הקבוצות במעבר יחיד על הלוח
  const [isSiteSubscriber, mondayClass] = await Promise.all([
    isActiveSubscriber(phone, email),
    classifyContactMonday(phone, email).catch(() => 'unknown' as const),
  ]);
  const isSubscriber = isSiteSubscriber || mondayClass === 'member_active';
  const isMondayUpdates = mondayClass === 'updates_group';

  if (isSubscriber || isMondayUpdates) {
    const response = NextResponse.json({
      ok: true,
      alreadySubscriber: isSubscriber,
      matched: isSubscriber ? 'subscriber' : 'updates',
      inviteUrl: WHATSAPP_FREE_GROUP_INVITE_URL,
    });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    console.error('Monday.com לא מוגדר (חסר MONDAY_API_TOKEN או MONDAY_BOARD_ID בסביבה)');
    const response = NextResponse.json({ ok: true, monday: false, inviteUrl: WHATSAPP_FREE_GROUP_INVITE_URL });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId, statusColumnId } = await getBoardSchema(token, boardId);
    if (!groupId) {
      console.error(`Monday.com: לא נמצאה קבוצה בשם "${LEAD_GROUP_NAME}" בלוח ${boardId}`);
    }

    const isDuplicate = phoneColumnId
      ? await hasExistingPhone(token, boardId, phoneColumnId, normalizePhone(phone)).catch(() => false)
      : false;

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

    const itemId = createItemData?.data?.create_item?.id;

    if (itemId) {
      // מסמנים בנפרד (לא באותה מוטציית יצירה) כדי שאם התווית "ליד כפול" לא קיימת בדיוק כך בעמודה,
      // זה לא יפיל את יצירת הליד עצמו - רק את סימון הכפילות
      if (isDuplicate && statusColumnId) {
        await mondayRequest(
          token,
          `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
            change_simple_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
          }`,
          { boardId, itemId, columnId: statusColumnId, value: DUPLICATE_STATUS_LABEL }
        ).catch((e) => console.error('Monday.com: נכשל סימון "ליד כפול"', e));
      }

      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) {
          create_update (item_id: $itemId, body: $body) { id }
        }`,
        {
          itemId,
          body: `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: ${sourceLabel}${isDuplicate ? '\n⚠ כבר קיים ליד/מנוי אחר עם אותו נייד - סומן כ"ליד כפול"' : ''}`,
        }
      );
    } else {
      console.error('Monday.com לא החזיר מזהה פריט', createItemData);
    }

    const response = NextResponse.json({ ok: true, monday: Boolean(itemId), inviteUrl: WHATSAPP_FREE_GROUP_INVITE_URL });
    // מסמן את הדפדפן כמי שהצטרף לקבוצת העדכונים - פותח גישה לספריית השיעורים
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  } catch (e) {
    console.error('שגיאה בשליחת הליד ל-Monday.com', e);
    const response = NextResponse.json({ ok: true, monday: false, inviteUrl: WHATSAPP_FREE_GROUP_INVITE_URL });
    response.cookies.set('sd_registered', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' });
    return response;
  }
}
