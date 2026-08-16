import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

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

// כלי אבחון זמני - מציג בדיוק מה הקוד רואה במאנדיי (לוחות, קבוצות, עמודות טלפון, ורשימת כל האנשים בקבוצת "קבוצת סוחרים" עם הטלפון הגולמי והמנורמל שלהם), כדי לאתר למה מנוי מסוים לא מאומת
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'לא מחוברים' }, { status: 401 });
  }

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const testPhone = typeof body?.phone === 'string' ? body.phone : '';

  const mondayToken = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!mondayToken || !boardId) {
    return NextResponse.json({ error: 'Monday.com לא מוגדר (חסר MONDAY_API_TOKEN או MONDAY_BOARD_ID)' }, { status: 500 });
  }

  const boardData = await mondayRequest(
    mondayToken,
    `query ($boardId: ID!) {
      boards (ids: [$boardId]) { id name columns { id title type } groups { id title } }
    }`,
    { boardId }
  );

  const board = boardData?.data?.boards?.[0];
  if (!board) {
    return NextResponse.json({ error: 'הלוח לא נמצא', boardId, raw: boardData }, { status: 500 });
  }

  const phoneColumns = board.columns?.filter((c: { type: string }) => c.type === 'phone') || [];
  const matchingGroups = board.groups?.filter((g: { title: string }) => g.title === SUBSCRIBER_GROUP_NAME) || [];
  const phoneColumnIds = phoneColumns.map((c: { id: string }) => c.id);

  const target = testPhone ? normalizePhone(testPhone) : null;
  let matchFound = false;
  const groupsOut: any[] = [];

  for (const g of matchingGroups) {
    const people: any[] = [];
    let cursor: string | null = null;

    do {
      const itemsData: any = await mondayRequest(
        mondayToken,
        `query ($boardId: ID!, $groupId: [String], $cursor: String, $columnIds: [String!]) {
          boards (ids: [$boardId]) {
            groups (ids: $groupId) {
              items_page (limit: 100, cursor: $cursor) {
                cursor
                items { id name column_values (ids: $columnIds) { id text } }
              }
            }
          }
        }`,
        { boardId, groupId: [g.id], cursor, columnIds: phoneColumnIds }
      );

      const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
      const items = page?.items || [];

      for (const item of items) {
        const phones = (item.column_values || []).map((cv: { id: string; text: string | null }) => ({
          columnId: cv.id,
          raw: cv.text,
          normalized: cv.text ? normalizePhone(cv.text) : null,
        }));
        if (target && phones.some((p: any) => p.normalized === target)) matchFound = true;
        people.push({ id: item.id, name: item.name, phones });
      }

      cursor = page?.cursor || null;
    } while (cursor);

    groupsOut.push({ groupId: g.id, groupTitle: g.title, peopleCount: people.length, people });
  }

  return NextResponse.json({
    boardId: board.id,
    boardName: board.name,
    allColumns: board.columns,
    allGroups: board.groups,
    phoneColumnsFound: phoneColumns,
    matchingGroupsFound: matchingGroups.map((g: { id: string; title: string }) => ({ id: g.id, title: g.title })),
    testPhone: testPhone || null,
    testPhoneNormalized: target,
    matchFound: target ? matchFound : null,
    groups: groupsOut,
  });
}
