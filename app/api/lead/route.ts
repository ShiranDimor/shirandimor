import { NextResponse } from 'next/server';

const LEAD_GROUP_NAME = 'לידים חדשים';

async function mondayRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function findLeadGroupId(token: string, boardId: string) {
  const data = await mondayRequest(
    token,
    `query ($boardId: ID!) {
      boards (ids: [$boardId]) { groups { id title } }
    }`,
    { boardId }
  );
  const groups = data?.data?.boards?.[0]?.groups || [];
  const match = groups.find((g: { id: string; title: string }) => g.title === LEAD_GROUP_NAME);
  return match?.id as string | undefined;
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
    const groupId = await findLeadGroupId(token, boardId);
    if (!groupId) {
      console.error(`Monday.com: לא נמצאה קבוצה בשם "${LEAD_GROUP_NAME}" בלוח ${boardId}`);
    }

    const createItemData = await mondayRequest(
      token,
      `mutation ($boardId: ID!, $groupId: String, $itemName: String!) {
        create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName) { id }
      }`,
      { boardId, groupId: groupId || null, itemName: name }
    );

    const itemId = createItemData?.data?.create_item?.id;

    if (itemId) {
      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) {
          create_update (item_id: $itemId, body: $body) { id }
        }`,
        {
          itemId,
          body: `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: טופס הצטרפות לקבוצת העדכונים באתר`,
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
