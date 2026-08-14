import { NextResponse } from 'next/server';

const SUBSCRIBER_GROUP_NAME = 'קבוצת סוחרים';

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

export async function GET(request: Request) {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  const { searchParams } = new URL(request.url);
  const phoneParam = searchParams.get('phone');

  if (!token || !boardId) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN או MONDAY_BOARD_ID לא מוגדרים' }, { status: 500 });
  }

  const boardData = await mondayRequest(
    token,
    `query ($boardId: ID!) {
      boards (ids: [$boardId]) {
        name
        columns { id title type }
        groups { id title }
      }
    }`,
    { boardId }
  );

  const board = boardData?.data?.boards?.[0];
  const columns: { id: string; title: string; type: string }[] = board?.columns ?? [];
  const groups: { id: string; title: string }[] = board?.groups ?? [];

  const baseInfo = {
    configuredBoardId: boardId,
    boardName: board?.name ?? null,
    groups,
    columns,
    rawErrors: boardData?.errors ?? null,
  };

  if (!phoneParam) {
    return NextResponse.json(baseInfo);
  }

  const phoneColumn = columns.find((c) => c.type === 'phone');
  const group = groups.find((g) => g.title === SUBSCRIBER_GROUP_NAME);

  if (!phoneColumn || !group) {
    return NextResponse.json({ ...baseInfo, error: 'לא נמצאה עמודת טלפון או קבוצת "קבוצת סוחרים"' });
  }

  const target = normalizePhone(phoneParam);
  const allItems: { name: string; rawPhone: string | null; normalizedPhone: string | null; matches: boolean }[] = [];
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $groupId: [String], $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          groups (ids: $groupId) {
            items_page (limit: 100, cursor: $cursor) {
              cursor
              items {
                name
                column_values (ids: $columnIds) { text }
              }
            }
          }
        }
      }`,
      { boardId, groupId: [group.id], cursor, columnIds: [phoneColumn.id] }
    );

    const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
    const items = page?.items || [];

    for (const item of items) {
      const rawPhone = item.column_values?.[0]?.text ?? null;
      const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : null;
      allItems.push({
        name: item.name,
        rawPhone,
        normalizedPhone,
        matches: normalizedPhone === target,
      });
    }

    cursor = page?.cursor || null;
  } while (cursor);

  return NextResponse.json({
    ...baseInfo,
    groupChecked: group,
    phoneColumnChecked: phoneColumn,
    searchedPhone: phoneParam,
    normalizedSearchedPhone: target,
    itemsInGroup: allItems,
    verified: allItems.some((i) => i.matches),
  });
}
