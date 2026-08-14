import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { name, contact } = await request.json();

  if (!name || !contact) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    console.error('Monday.com לא מוגדר (חסר MONDAY_API_TOKEN או MONDAY_BOARD_ID בסביבה)');
    return NextResponse.json({ ok: true, monday: false });
  }

  try {
    const createItemRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        query: `mutation ($boardId: ID!, $itemName: String!) {
          create_item (board_id: $boardId, item_name: $itemName) { id }
        }`,
        variables: { boardId, itemName: name },
      }),
    });

    const createItemData = await createItemRes.json();
    const itemId = createItemData?.data?.create_item?.id;

    if (itemId) {
      await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          query: `mutation ($itemId: ID!, $body: String!) {
            create_update (item_id: $itemId, body: $body) { id }
          }`,
          variables: {
            itemId,
            body: `פרטי יצירת קשר: ${contact}\nמקור: טופס הצטרפות לקבוצת העדכונים באתר`,
          },
        }),
      });
    } else {
      console.error('Monday.com לא החזיר מזהה פריט', createItemData);
    }

    return NextResponse.json({ ok: true, monday: Boolean(itemId) });
  } catch (e) {
    console.error('שגיאה בשליחת הליד ל-Monday.com', e);
    return NextResponse.json({ ok: true, monday: false });
  }
}
