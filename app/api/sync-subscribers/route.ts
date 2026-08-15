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

// עובר על כל המנויים המאושרים עם טלפון בכרטיס, ובודק שהם עדיין נמצאים בקבוצת "קבוצת סוחרים" במאנדיי -
// מי שכבר לא שם מורד מ"מנוי" ל"ליד", ומאבד את הכניסה המיידית
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

  const mondayToken = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!mondayToken || !boardId) {
    return NextResponse.json({ error: 'Monday.com לא מוגדר' }, { status: 500 });
  }

  const { data: subscribers, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, phone')
    .eq('role', 'subscriber');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withPhone = (subscribers || []).filter((s) => s.phone);
  const skippedNoPhone = (subscribers || []).length - withPhone.length;

  if (withPhone.length === 0) {
    return NextResponse.json({ checked: 0, removed: 0, removedNames: [], skippedNoPhone });
  }

  const boardData = await mondayRequest(
    mondayToken,
    `query ($boardId: ID!) {
      boards (ids: [$boardId]) { columns { id title type } groups { id title } }
    }`,
    { boardId }
  );

  const board = boardData?.data?.boards?.[0];
  const phoneColumn = board?.columns?.find((c: { type: string }) => c.type === 'phone');
  const group = board?.groups?.find((g: { title: string }) => g.title === SUBSCRIBER_GROUP_NAME);

  if (!phoneColumn || !group) {
    return NextResponse.json({ error: 'לא נמצאה עמודת טלפון או קבוצת "קבוצת סוחרים" במאנדיי' }, { status: 500 });
  }

  const activePhones = new Set<string>();
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      mondayToken,
      `query ($boardId: ID!, $groupId: [String], $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          groups (ids: $groupId) {
            items_page (limit: 100, cursor: $cursor) {
              cursor
              items { column_values (ids: $columnIds) { text } }
            }
          }
        }
      }`,
      { boardId, groupId: [group.id], cursor, columnIds: [phoneColumn.id] }
    );

    const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
    const items = page?.items || [];

    for (const item of items) {
      const text = item.column_values?.[0]?.text;
      if (text) activePhones.add(normalizePhone(text));
    }

    cursor = page?.cursor || null;
  } while (cursor);

  const toRemove = withPhone.filter((s) => !activePhones.has(normalizePhone(s.phone as string)));

  if (toRemove.length > 0) {
    await supabaseAdmin
      .from('profiles')
      .update({ role: 'lead' })
      .in('id', toRemove.map((s) => s.id));
  }

  return NextResponse.json({
    checked: withPhone.length,
    removed: toRemove.length,
    removedNames: toRemove.map((s) => s.full_name || s.email),
    skippedNoPhone,
  });
}
