// לוגיקה משותפת לפניות מארגונים (טופס פרטים ותיאום שיחה): יצירת ליד במאנדיי ומייל התראה לשירן.

const BUSINESS_GROUP_NAME = 'לידים להרצאות לעסקים';
const FALLBACK_GROUP_NAME = 'לידים חדשים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';
export const SOURCE_LABEL = 'הגיע מהאתר - ארגונים';

export const MAX = { name: 80, org: 120, role: 80, phone: 20, email: 120, groupSize: 40, track: 60, message: 1500 };

export function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function mondayRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Monday API error (${res.status}): ${JSON.stringify(json.errors || json)}`);
  }
  return json;
}

// opts מאפשר לעמודים אחרים (למשל הליווי האישי) להשתמש באותו חיבור למאנדיי עם קבוצה, מקור ושם פריט משלהם.
// מחזיר את מזהה הפריט שנוצר (מחרוזת), או false אם לא נוצר
export type MondayLeadOptions = { groupNames?: string[]; sourceLabel?: string; itemName?: string };

export async function sendToMonday(lead: Record<string, string>, details: string, opts: MondayLeadOptions = {}): Promise<string | false> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) {
    console.error('Monday.com לא מוגדר (חסר MONDAY_API_TOKEN או MONDAY_BOARD_ID בסביבה)');
    return false;
  }

  const schema = await mondayRequest(
    token,
    `query ($boardId: ID!) { boards (ids: [$boardId]) { columns { id title type } groups { id title } } }`,
    { boardId }
  );
  const board = schema?.data?.boards?.[0];
  const columns: { id: string; title: string; type: string }[] = board?.columns || [];
  const groups: { id: string; title: string }[] = board?.groups || [];

  const groupNames = [...(opts.groupNames || [BUSINESS_GROUP_NAME]), FALLBACK_GROUP_NAME];
  const groupId = groupNames.map((name) => groups.find((g) => g.title === name)?.id).find(Boolean) || null;
  const phoneColumnId = columns.find((c) => c.type === 'phone')?.id;
  const emailColumnId = columns.find((c) => c.type === 'email')?.id;
  const campaignColumnId = columns.find((c) => c.title === CAMPAIGN_COLUMN_TITLE)?.id;

  const columnValues: Record<string, unknown> = {};
  if (phoneColumnId) {
    const digits = lead.phone.replace(/\D/g, '');
    columnValues[phoneColumnId] = { phone: digits.startsWith('0') ? `972${digits.slice(1)}` : digits, countryShortName: 'IL' };
  }
  if (emailColumnId && lead.email) columnValues[emailColumnId] = { email: lead.email, text: lead.email };
  if (campaignColumnId) columnValues[campaignColumnId] = opts.sourceLabel || SOURCE_LABEL;

  const created = await mondayRequest(
    token,
    `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
      create_item (board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
    }`,
    { boardId, groupId, itemName: opts.itemName || `${lead.name} - ${lead.org}`, columnValues: JSON.stringify(columnValues) }
  );
  const itemId = created?.data?.create_item?.id;
  if (!itemId) {
    console.error('Monday.com לא החזיר מזהה פריט', created);
    return false;
  }

  await addMondayUpdate(itemId, details);

  return String(itemId);
}

// מוסיף עדכון (הערה) לפריט קיים במאנדיי - למשל כשליד שכבר מילא שאלון קובע אחר כך שיחה ביומן
export async function addMondayUpdate(itemId: string, body: string) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) return false;
  return mondayRequest(
    token,
    `mutation ($itemId: ID!, $body: String!) { create_update (item_id: $itemId, body: $body) { id } }`,
    { itemId, body }
  )
    .then(() => true)
    .catch((e) => {
      console.error('Monday.com: נכשלה הוספת עדכון לפריט', e);
      return false;
    });
}

export async function notifyShiran(lead: Record<string, string>, details: string, subjectOverride?: string, intro?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא נשלח מייל התראה על פנייה מארגון');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'התראות האתר <noreply@shirandimor.com>',
      to: 'shiran@shirandimor.com',
      ...(lead.email ? { reply_to: lead.email } : {}),
      subject: subjectOverride || `פנייה חדשה מארגון: ${lead.org}`,
      text: `${intro || 'התקבלה פנייה חדשה מהעמוד לארגונים.'}\n\n${details}`,
    }),
  });
  if (!res.ok) {
    console.error('שגיאה בשליחת מייל התראה על פנייה מארגון', await res.text());
    return false;
  }
  return true;
}


export type BusinessLead = {
  name: string; org: string; role: string; phone: string; email: string; groupSize: string; track: string; message: string;
};

export function readLead(body: Record<string, unknown>): BusinessLead {
  return {
    name: clean(body.name, MAX.name),
    org: clean(body.org, MAX.org),
    role: clean(body.role, MAX.role),
    phone: clean(body.phone, MAX.phone),
    email: clean(body.email, MAX.email),
    groupSize: clean(body.groupSize, MAX.groupSize),
    track: clean(body.track, MAX.track),
    message: clean(body.message, MAX.message),
  };
}

export function isLeadValid(lead: BusinessLead) {
  return Boolean(lead.name && lead.org && lead.phone.replace(/\D/g, '').length >= 9);
}

export function leadDetails(lead: BusinessLead, extraLines: string[] = []) {
  return [
    ...extraLines,
    `שם: ${lead.name}`,
    `ארגון: ${lead.org}`,
    lead.role && `תפקיד: ${lead.role}`,
    `נייד: ${lead.phone}`,
    lead.email && `אימייל: ${lead.email}`,
    lead.groupSize && `כמות עובדים משוערת: ${lead.groupSize}`,
    lead.track && `מסלול מבוקש: ${lead.track}`,
    lead.message && `הודעה: ${lead.message}`,
    `מקור: ${SOURCE_LABEL}`,
  ]
    .filter(Boolean)
    .join('\n');
}
