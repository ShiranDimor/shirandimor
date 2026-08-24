import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { isContactInSubscribersGroupMonday } from '@/lib/tradingPlan/monday';

const LEAD_GROUP_NAME = 'לידים חדשים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
const DUPLICATE_STATUS_LABEL = 'ליד כפול';
const CAMPAIGN_VALUE = 'הרשמה ללייב';

function normalizeMondayPhone(raw: string) {
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
      return text && normalizeMondayPhone(text) === targetNormalized;
    });
    if (found) return true;

    cursor = page?.cursor || null;
  } while (cursor);

  return false;
}

async function createMondayLiveLead(name: string, phone: string, email: string | null, liveTitle: string, liveScheduledAt: string) {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return;

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId, statusColumnId } = await getBoardSchema(token, boardId);

    const isDuplicate = phoneColumnId
      ? await hasExistingPhone(token, boardId, phoneColumnId, normalizeMondayPhone(phone)).catch(() => false)
      : false;

    // מוסיפים את תאריך ושעת הלייב לשם הקמפיין, כדי שאפשר יהיה להבדיל בין לידים מלייבים שונים בלוח
    const liveDate = new Date(liveScheduledAt);
    const liveDateLabel = `${liveDate.toLocaleDateString('he-IL')} ${liveDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    const campaignValue = `${CAMPAIGN_VALUE} - ${liveDateLabel}`;

    const columnValues: Record<string, unknown> = {};
    if (phoneColumnId) columnValues[phoneColumnId] = { phone: phone.startsWith('0') ? `972${phone.slice(1)}` : phone, countryShortName: 'IL' };
    if (emailColumnId && email) columnValues[emailColumnId] = { email, text: email };
    if (campaignColumnId) columnValues[campaignColumnId] = campaignValue;

    const createItemData = await mondayRequest(
      token,
      `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
        create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
      }`,
      { boardId, groupId: groupId || null, itemName: name, columnValues: JSON.stringify(columnValues) }
    );

    const itemId = createItemData?.data?.create_item?.id;
    if (!itemId) return;

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
      `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
      {
        itemId,
        body: `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: הרשמה ללייב "${liveTitle}" באתר${isDuplicate ? '\n⚠ כבר קיים ליד/מנוי אחר עם אותו נייד - סומן כ"ליד כפול"' : ''}`,
      }
    );
  } catch (e) {
    console.error('שגיאה בסנכרון הרשמה ללייב ל-Monday.com', e);
  }
}

// POST - הרשמה ללייב. מנוי פעיל (מזוהה לפי טוקן) נרשם ישירות ומקבל את פרטי ההצטרפות.
// מי שאינו מנוי משאיר פרטי קשר, נהפך לליד ב-Monday.com (בדיוק כמו טופס קבוצת העדכונים), ושירן
// יוצרת איתו קשר ידנית עם פרטי ההצטרפות
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { liveId, name, phone, email } = body as { liveId?: string; name?: string; phone?: string; email?: string };

  if (!liveId) {
    return NextResponse.json({ error: 'חסר מזהה לייב' }, { status: 400 });
  }

  const { data: live, error: liveError } = await supabaseAdmin.from('lives').select('id, title, join_info, scheduled_at').eq('id', liveId).eq('published', true).maybeSingle();
  if (liveError || !live) {
    return NextResponse.json({ error: 'הלייב לא נמצא' }, { status: 404 });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  let userId: string | null = null;

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status, full_name, phone, email').eq('id', user.id).maybeSingle();
      const isSubscriber = profile?.role === 'admin' || (profile?.role === 'subscriber' && profile?.subscription_status === 'active');
      if (isSubscriber) {
        userId = user.id;
        const { data: existing } = await supabaseAdmin.from('live_registrations').select('id').eq('live_id', liveId).eq('user_id', userId).maybeSingle();
        if (!existing) {
          await supabaseAdmin.from('live_registrations').insert({
            live_id: liveId,
            user_id: userId,
            name: profile?.full_name || null,
            phone: profile?.phone || null,
            email: profile?.email || user.email || null,
            is_subscriber: true,
          });
        }
        return NextResponse.json({ ok: true, isSubscriber: true, joinInfo: live.join_info });
      }
    }
  }

  // לא מנוי - צריך שם וטלפון כדי להיהפך לליד
  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const isSubscriberByContact = (await isActiveSubscriber(phone, email || null)) || (await isContactInSubscribersGroupMonday(phone, email || null));
  if (isSubscriberByContact) {
    // מנוי פעיל שממלא את הטופס בלי להיות מחובר - לא יוצרים לו ליד מיותר, רק שומרים שהוא נרשם
    // (כדי שיופיע ברשימת הנרשמים לשירן) ומציגים לו את הפרטים
    const { data: existing } = await supabaseAdmin.from('live_registrations').select('id').eq('live_id', liveId).eq('phone', phone).maybeSingle();
    if (!existing) {
      await supabaseAdmin.from('live_registrations').insert({ live_id: liveId, name, phone, email: email || null, is_subscriber: true });
    }
    return NextResponse.json({ ok: true, isSubscriber: true, joinInfo: live.join_info });
  }

  await supabaseAdmin.from('live_registrations').insert({
    live_id: liveId,
    name,
    phone,
    email: email || null,
    is_subscriber: false,
  });

  await createMondayLiveLead(name, phone, email || null, live.title, live.scheduled_at).catch(() => {});

  return NextResponse.json({ ok: true, isSubscriber: false });
}

// DELETE - ביטול הרשמה למי שמתחרט. רק למנוי מחובר (שנרשם עם חשבון) - למי שהשאיר פרטים כליד
// אין חשבון לאמת מולו, אז ביטול עבורו נעשה ידנית מול שירן (יש לה קישור וואטסאפ ישיר בפאנל הניהול)
export async function DELETE(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'צריך להיות מחוברים כדי לבטל הרשמה' }, { status: 401 });
  }

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'צריך להיות מחוברים כדי לבטל הרשמה' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const liveId = searchParams.get('liveId');
  if (!liveId) {
    return NextResponse.json({ error: 'חסר מזהה לייב' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('live_registrations').delete().eq('live_id', liveId).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'שגיאה בביטול ההרשמה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
