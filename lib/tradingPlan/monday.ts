const LEAD_GROUP_NAME = 'לידים חדשים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
const TRADING_PLAN_STATUS_LABEL = 'בנה תוכנית מסחר';
const CAMPAIGN_VALUE = 'תוכנית מסחר 30 יום';

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

// מחפש פריט קיים בכל הלוח (לא רק בקבוצת "לידים חדשים") לפי מספר נייד מנורמל - כדי לא ליצור כפילות למי שכבר קיים
async function findItemIdByPhone(token: string, boardId: string, phoneColumnId: string, targetNormalized: string): Promise<string | null> {
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
      { boardId, cursor, columnIds: [phoneColumnId] }
    );

    const page = itemsData?.data?.boards?.[0]?.items_page;
    const items: { id: string; column_values: { text: string | null }[] }[] = page?.items || [];

    const found = items.find((item) => {
      const text = item.column_values?.[0]?.text;
      return text && normalizePhone(text) === targetNormalized;
    });
    if (found) return found.id;

    cursor = page?.cursor || null;
  } while (cursor);

  return null;
}

function buildInsightsNote(row: Record<string, any>) {
  const lines = [
    'השלים/ה את "תוכנית המסחר ל-30 יום" באתר.',
    row.source ? `מקור: ${row.source}` : null,
    row.main_goal ? `מטרה מרכזית: ${row.main_goal}` : null,
    Array.isArray(row.main_fear) && row.main_fear.length ? `פחד מרכזי: ${row.main_fear.join(', ')}` : null,
    row.trading_dream ? `החלום לשנה קדימה: ${row.trading_dream}` : null,
    row.definition_of_success ? `סימן להצלחה: ${row.definition_of_success}` : null,
    row.personal_rule ? `הכלל האישי: ${row.personal_rule}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function syncTradingPlanLead(row: Record<string, any>): Promise<{ ok: boolean; reason?: string; itemId?: string; created?: boolean }> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    return { ok: false, reason: 'not_configured' };
  }
  if (!row.phone) {
    return { ok: false, reason: 'no_phone' };
  }

  try {
    const { groupId, phoneColumnId, emailColumnId, campaignColumnId, statusColumnId } = await getBoardSchema(token, boardId);
    const normalized = normalizePhone(row.phone);
    const note = buildInsightsNote(row);

    const existingItemId = phoneColumnId
      ? await findItemIdByPhone(token, boardId, phoneColumnId, normalized).catch(() => null)
      : null;

    if (existingItemId) {
      if (statusColumnId) {
        await mondayRequest(
          token,
          `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
            change_simple_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
          }`,
          { boardId, itemId: existingItemId, columnId: statusColumnId, value: TRADING_PLAN_STATUS_LABEL }
        ).catch((e) => console.error('Monday.com: נכשל עדכון סטטוס לליד קיים', e));
      }

      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: existingItemId, body: note }
      ).catch((e) => console.error('Monday.com: נכשל הוספת עדכון לליד קיים', e));

      return { ok: true, itemId: existingItemId, created: false };
    }

    const columnValues: Record<string, unknown> = {};
    if (phoneColumnId) columnValues[phoneColumnId] = { phone: row.phone.startsWith('0') ? `972${row.phone.slice(1)}` : row.phone, countryShortName: 'IL' };
    if (emailColumnId && row.email) columnValues[emailColumnId] = { email: row.email, text: row.email };
    if (campaignColumnId) columnValues[campaignColumnId] = CAMPAIGN_VALUE;
    if (statusColumnId) columnValues[statusColumnId] = { label: TRADING_PLAN_STATUS_LABEL };

    const createData: any = await mondayRequest(
      token,
      `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
        create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
      }`,
      { boardId, groupId: groupId || null, itemName: row.name || 'ליד - תוכנית מסחר', columnValues: JSON.stringify(columnValues) }
    );

    const newItemId = createData?.data?.create_item?.id;
    if (newItemId) {
      await mondayRequest(
        token,
        `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
        { itemId: newItemId, body: note }
      ).catch((e) => console.error('Monday.com: נכשל הוספת עדכון לליד חדש', e));
    }

    return { ok: true, itemId: newItemId, created: true };
  } catch (e) {
    console.error('שגיאה בסנכרון ליד תוכנית המסחר ל-Monday.com', e);
    return { ok: false, reason: 'error' };
  }
}
