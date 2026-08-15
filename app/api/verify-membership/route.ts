import { NextResponse } from 'next/server';
import { supabaseAdmin, generateInstantLoginToken } from '@/lib/instantLogin';

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

// מוודא שיש פרופיל מנוי פעיל לאימייל הזה - יוצר חשבון אם אין, או משדרג ל"מנוי" אם היה "ליד" בלבד
// שומר גם את הטלפון על הפרופיל, כדי שאפשר יהיה בעתיד לבדוק שוב מול מאנדיי אם המנוי עדיין בקבוצה
async function ensureActiveSubscriber(email: string, phone: string) {
  const { data: existing } = await supabaseAdmin.from('profiles').select('id, role').eq('email', email).maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = { phone };
    if (existing.role !== 'admin' && existing.role !== 'subscriber') {
      updates.role = 'subscriber';
      updates.subscription_status = 'active';
      updates.subscription_started_at = new Date().toISOString();
    }
    await supabaseAdmin.from('profiles').update(updates).eq('id', existing.id);
    return;
  }

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) {
    throw new Error(error?.message || 'שגיאה ביצירת חשבון');
  }

  await supabaseAdmin
    .from('profiles')
    .update({ role: 'subscriber', subscription_status: 'active', subscription_started_at: new Date().toISOString(), phone })
    .eq('id', created.user.id);
}

export async function POST(request: Request) {
  const { phone, email } = await request.json();

  if (!phone || !email) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    console.error('Monday.com לא מוגדר - לא ניתן לאמת מנוי');
    return NextResponse.json({ verified: false, configured: false });
  }

  try {
    const target = normalizePhone(phone);

    const boardData = await mondayRequest(
      token,
      `query ($boardId: ID!) {
        boards (ids: [$boardId]) {
          columns { id title type }
          groups { id title }
        }
      }`,
      { boardId }
    );

    const board = boardData?.data?.boards?.[0];
    const phoneColumn = board?.columns?.find((c: { type: string }) => c.type === 'phone');
    const group = board?.groups?.find((g: { title: string }) => g.title === SUBSCRIBER_GROUP_NAME);

    if (!phoneColumn || !group) {
      console.error('Monday.com: לא נמצאה עמודת טלפון או קבוצת "קבוצת סוחרים"', { hasPhoneColumn: Boolean(phoneColumn), hasGroup: Boolean(group) });
      return NextResponse.json({ verified: false, configured: false });
    }

    let cursor: string | null = null;
    let found = false;

    do {
      const itemsData: any = await mondayRequest(
        token,
        `query ($boardId: ID!, $groupId: [String], $cursor: String, $columnIds: [String!]) {
          boards (ids: [$boardId]) {
            groups (ids: $groupId) {
              items_page (limit: 100, cursor: $cursor) {
                cursor
                items {
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

      found = items.some((item: { column_values: { text: string | null }[] }) => {
        const text = item.column_values?.[0]?.text;
        return text && normalizePhone(text) === target;
      });

      cursor = found ? null : page?.cursor || null;
    } while (cursor);

    if (!found) {
      return NextResponse.json({ verified: false, configured: true });
    }

    await ensureActiveSubscriber(email, phone);
    const loginToken = await generateInstantLoginToken(email);

    return NextResponse.json({ verified: true, configured: true, token: loginToken });
  } catch (e) {
    console.error('שגיאה באימות מול Monday.com', e);
    return NextResponse.json({ verified: false, configured: false });
  }
}
