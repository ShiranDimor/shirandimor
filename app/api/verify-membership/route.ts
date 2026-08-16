import { NextResponse } from 'next/server';
import { supabaseAdmin, sendLoginEmail } from '@/lib/instantLogin';

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
// שומר גם את הטלפון והשם המלא על הפרופיל, כדי שאפשר יהיה בעתיד לבדוק שוב מול מאנדיי אם המנוי עדיין בקבוצה
async function ensureActiveSubscriber(email: string, phone: string, fullName: string) {
  const { data: existing } = await supabaseAdmin.from('profiles').select('id, role').eq('email', email).maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = { phone, full_name: fullName };
    if (existing.role !== 'admin' && existing.role !== 'subscriber') {
      updates.role = 'subscriber';
      updates.subscription_status = 'active';
      updates.subscription_started_at = new Date().toISOString();
    }
    await supabaseAdmin.from('profiles').update(updates).eq('id', existing.id);
    return;
  }

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { phone, full_name: fullName },
  });

  let userId = created.user?.id;

  if (error || !userId) {
    // חשבון התחברות כבר קיים באימייל הזה בלי פרופיל (למשל מחיקת מנוי שנעצרה באמצע) - נשלים את הפרופיל החסר על אותו חשבון קיים במקום להיכשל
    if (error?.code === 'email_exists' || /already.*registered/i.test(error?.message || '')) {
      const { data: existingUserId } = await supabaseAdmin.rpc('find_auth_user_id_by_email', { p_email: email });
      if (!existingUserId) throw new Error(error?.message || 'שגיאה ביצירת חשבון');
      userId = existingUserId;
    } else {
      throw new Error(error?.message || 'שגיאה ביצירת חשבון');
    }
  }

  await supabaseAdmin
    .from('profiles')
    .upsert({ id: userId, email, full_name: fullName, role: 'subscriber', subscription_status: 'active', subscription_started_at: new Date().toISOString(), phone });
}

export async function POST(request: Request) {
  const { phone, email, firstName, lastName } = await request.json();

  if (!phone || !email || !firstName || !lastName) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const fullName = `${firstName} ${lastName}`.trim();

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
    const phoneColumns = board?.columns?.filter((c: { type: string }) => c.type === 'phone') || [];
    const groups = board?.groups?.filter((g: { title: string }) => g.title === SUBSCRIBER_GROUP_NAME) || [];

    if (phoneColumns.length === 0 || groups.length === 0) {
      console.error('Monday.com: לא נמצאה עמודת טלפון או קבוצת "קבוצת סוחרים"', { hasPhoneColumn: phoneColumns.length > 0, hasGroup: groups.length > 0 });
      return NextResponse.json({ verified: false, configured: false });
    }

    const phoneColumnIds = phoneColumns.map((c: { id: string }) => c.id);

    let found = false;

    for (const g of groups) {
      if (found) break;
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
                    column_values (ids: $columnIds) { text }
                  }
                }
              }
            }
          }`,
          { boardId, groupId: [g.id], cursor, columnIds: phoneColumnIds }
        );

        const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
        const items = page?.items || [];

        found = items.some((item: { column_values: { text: string | null }[] }) => {
          return item.column_values?.some((cv) => cv.text && normalizePhone(cv.text) === target);
        });

        cursor = found ? null : page?.cursor || null;
      } while (cursor);
    }

    if (!found) {
      return NextResponse.json({ verified: false, configured: true });
    }

    await ensureActiveSubscriber(email, phone, fullName);
    await sendLoginEmail(email);

    return NextResponse.json({ verified: true, configured: true });
  } catch (e) {
    console.error('שגיאה באימות מול Monday.com', e);
    return NextResponse.json({ verified: false, configured: false });
  }
}
