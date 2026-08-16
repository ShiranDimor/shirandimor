import { NextResponse } from 'next/server';

const LEAD_GROUP_NAME = 'לידים חדשים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
const DUPLICATE_STATUS_LABEL = 'ליד כפול';

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
  const { name, phone, email } = await request.json();

  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    console.error('Monday.com לא מוגדר (חסר MONDAY_API_TOKEN או MONDAY_BOARD_ID בסביבה)');
    return NextResponse.json({ ok: true, monday: false });
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
    if (campaignColumnId) columnValues[campaignColumnId] = 'הגיע מהאתר - עדכונים';

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
          body: `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: טופס הצטרפות לקבוצת העדכונים באתר${isDuplicate ? '\n⚠ כבר קיים ליד/מנוי אחר עם אותו נייד - סומן כ"ליד כפול"' : ''}`,
        }
      );
    } else {
      console.error('Monday.com לא החזיר מזהה פריט', createItemData);
    }

    return NextResponse.json({ ok: true, monday: Boolean(itemId) });
  } catch (e) {
    console.error('שגיאה בשליחת הליד ל-Monday.com', e);
    return NextResponse.json({ ok: true, monday: false });
  }
}
