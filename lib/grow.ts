const LEAD_GROUP_NAME = 'לידים חדשים';
const SUBSCRIBER_GROUP_NAME = 'קבוצת סוחרים';
const MONTHLY_COST_COLUMN_TITLE = 'עלות חודשית ששילם';
const REGISTRATION_DATE_COLUMN_TITLE = 'תאריך הרשמה';
const BENEFIT_COLUMN_TITLE = 'נרשם בזכות הטבה';
const BENEFIT_LABEL = 'חודש ראשון 50%';
const FIRST_MONTH_DISCOUNT_AMOUNT = 200;

export type GrowPayment = {
  phone: string | null;
  email: string | null;
  fullName: string | null;
  amount: number | null;
  transactionId: string | null;
  webhookKey: string | null;
};

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-9);
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

// Grow לא חושף תיעוד ציבורי מלא לשדות ה-webhook - השמות למטה מבוססים על התיעוד החלקי שכן נמצא
// (webhookKey, paymentSum, fullName, payerPhone/payerEmail וכו') ולכן בודקים כמה חלופות סבירות
// לכל שדה. כדאי לבדוק בלוגים של הקריאה האמיתית הראשונה מ-Grow שהשדות אכן נתפסים נכון, ולעדכן כאן
// אם צריך.
export function parseGrowPayload(raw: Record<string, unknown>): GrowPayment {
  const phone = firstString(raw, ['phone', 'payerPhone', 'cellphone', 'tel', 'client_phone']);
  const email = firstString(raw, ['email', 'payerEmail', 'mail', 'client_email']);
  const fullName = firstString(raw, ['fullName', 'full_name', 'name', 'payerName', 'client_name']);
  const amountRaw = firstString(raw, ['paymentSum', 'sum', 'amount', 'price', 'total', 'payment_sum']);
  const transactionId = firstString(raw, ['transactionCode', 'transactionId', 'asmachta', 'paymentCode', 'transaction_id']);
  const webhookKey = firstString(raw, ['webhookKey', 'webhook_key', 'secret', 'key']);

  return {
    phone,
    email,
    fullName,
    amount: amountRaw ? Number(amountRaw) : null,
    transactionId,
    webhookKey,
  };
}

async function mondayRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function getGrowBoardSchema(token: string, boardId: string) {
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
    leadGroupId: groups.find((g) => g.title === LEAD_GROUP_NAME)?.id,
    subscriberGroupId: groups.find((g) => g.title === SUBSCRIBER_GROUP_NAME)?.id,
    phoneColumnId: columns.find((c) => c.type === 'phone')?.id,
    emailColumnId: columns.find((c) => c.type === 'email')?.id,
    monthlyCostColumnId: columns.find((c) => c.title === MONTHLY_COST_COLUMN_TITLE)?.id,
    regDateColumnId: columns.find((c) => c.title === REGISTRATION_DATE_COLUMN_TITLE && c.type === 'date')?.id,
    benefitColumnId: columns.find((c) => c.title === BENEFIT_COLUMN_TITLE)?.id,
  };
}

// מחפש פריט קיים בכל הלוח (לא רק בקבוצה אחת) לפי טלפון או מייל מנורמלים - כדי לעדכן מנוי/ליד
// קיים במקום ליצור כפילות
async function findItemIdByContact(
  token: string,
  boardId: string,
  phoneColumnId: string | undefined,
  emailColumnId: string | undefined,
  phone: string | null,
  email: string | null
): Promise<string | null> {
  const columnIds = [phoneColumnId, emailColumnId].filter(Boolean) as string[];
  if (columnIds.length === 0) return null;

  const targetPhone = phone ? normalizePhone(phone) : null;
  const targetEmail = email ? email.trim().toLowerCase() : null;
  const phoneIndex = columnIds.indexOf(phoneColumnId || '');
  const emailIndex = columnIds.indexOf(emailColumnId || '');

  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          items_page (limit: 100, cursor: $cursor) {
            cursor
            items { id column_values (ids: $columnIds) { text } }
          }
        }
      }`,
      { boardId, cursor, columnIds }
    );

    const page = itemsData?.data?.boards?.[0]?.items_page;
    const items: { id: string; column_values: { text: string | null }[] }[] = page?.items || [];

    const found = items.find((item) => {
      const phoneText = phoneIndex >= 0 ? item.column_values?.[phoneIndex]?.text : null;
      const emailText = emailIndex >= 0 ? item.column_values?.[emailIndex]?.text : null;
      return (
        (!!targetPhone && !!phoneText && normalizePhone(phoneText) === targetPhone) ||
        (!!targetEmail && !!emailText && emailText.trim().toLowerCase() === targetEmail)
      );
    });
    if (found) return found.id;

    cursor = page?.cursor || null;
  } while (cursor);

  return null;
}

function todayDateValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function syncGrowPaymentToMonday(
  payment: GrowPayment
): Promise<{ ok: boolean; reason?: string; itemId?: string; created?: boolean }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) return { ok: false, reason: 'not_configured' };
  if (!payment.phone && !payment.email) return { ok: false, reason: 'no_contact' };

  try {
    const { subscriberGroupId, phoneColumnId, emailColumnId, monthlyCostColumnId, regDateColumnId, benefitColumnId } =
      await getGrowBoardSchema(token, boardId);

    const isFirstMonthDiscount = payment.amount === FIRST_MONTH_DISCOUNT_AMOUNT;

    const columnValues: Record<string, unknown> = {};
    if (monthlyCostColumnId && payment.amount != null) columnValues[monthlyCostColumnId] = String(payment.amount);
    if (regDateColumnId) columnValues[regDateColumnId] = { date: todayDateValue() };
    if (benefitColumnId && isFirstMonthDiscount) columnValues[benefitColumnId] = { label: BENEFIT_LABEL };
    if (phoneColumnId && payment.phone) {
      columnValues[phoneColumnId] = { phone: payment.phone.startsWith('0') ? `972${payment.phone.slice(1)}` : payment.phone, countryShortName: 'IL' };
    }
    if (emailColumnId && payment.email) columnValues[emailColumnId] = { email: payment.email, text: payment.email };

    const noteLines = [
      'התקבל תשלום ב-Grow.',
      payment.amount != null ? `סכום: ${payment.amount} ש"ח${isFirstMonthDiscount ? ' (הנחת חודש ראשון - 50%)' : ''}` : null,
      payment.transactionId ? `מזהה עסקה: ${payment.transactionId}` : null,
    ].filter(Boolean);

    const existingItemId = await findItemIdByContact(token, boardId, phoneColumnId, emailColumnId, payment.phone, payment.email).catch(() => null);

    if (existingItemId) {
      if (Object.keys(columnValues).length > 0) {
        await mondayRequest(
          token,
          `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
            change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
          }`,
          { boardId, itemId: existingItemId, columnValues: JSON.stringify(columnValues) }
        ).catch((e) => console.error('Grow→Monday.com: נכשל עדכון עמודות למנוי קיים', e));
      }

      if (subscriberGroupId) {
        await mondayRequest(
          token,
          `mutation ($itemId: ID!, $groupId: String!) { move_item_to_group (item_id: $itemId, group_id: $groupId) { id } }`,
          { itemId: existingItemId, groupId: subscriberGroupId }
        ).catch((e) => console.error('Grow→Monday.com: נכשל מעבר קבוצה למנוי קיים', e));
      }

      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: existingItemId, body: noteLines.join('\n') }
      ).catch((e) => console.error('Grow→Monday.com: נכשל הוספת עדכון למנוי קיים', e));

      return { ok: true, itemId: existingItemId, created: false };
    }

    const createData: any = await mondayRequest(
      token,
      `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
        create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
      }`,
      {
        boardId,
        groupId: subscriberGroupId || null,
        itemName: payment.fullName || payment.email || payment.phone || 'מנוי חדש - Grow',
        columnValues: JSON.stringify(columnValues),
      }
    );

    const newItemId = createData?.data?.create_item?.id;
    if (newItemId) {
      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: newItemId, body: noteLines.join('\n') }
      ).catch((e) => console.error('Grow→Monday.com: נכשל הוספת עדכון למנוי חדש', e));
    }

    return { ok: true, itemId: newItemId, created: true };
  } catch (e) {
    console.error('שגיאה בסנכרון תשלום Grow ל-Monday.com', e);
    return { ok: false, reason: 'error' };
  }
}
