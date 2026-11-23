// משלים במאנדיי את מה שהחיבור המובנה של מאנדיי למטא לא יודע להעביר: האוטומציה של מאנדיי יוצרת
// כרטיס עם שם/נייד/מייל בלבד, בלי התשובות לשאלות בטופס, בלי שם המודעה ובלי הפלטפורמה. כאן מושכים
// את הלידים ישירות מ-Meta (Graph API, עם טוקן העמוד) ומשלימים את העמודות האלה בכרטיס הקיים לפי נייד.
// לא יוצרים כרטיסים ולא דורסים ערך שכבר מולא ידנית (חוץ מ-campaign_name, שהאוטומציה ממלאת בערך כללי)

const GRAPH = 'https://graph.facebook.com/v21.0';
const BOARD_ID = process.env.MONDAY_BOARD_ID;
// טופס הקמפיין "מדברים עסקאות ₪1 - כוונה גבוהה 12.2026". אפשר להוסיף טפסים נוספים ב-META_LEAD_FORM_IDS (מופרד בפסיקים)
const FORM_IDS = (process.env.META_LEAD_FORM_IDS || '1138706495712728').split(',').map((s) => s.trim()).filter(Boolean);
const GENERIC_CAMPAIGN_VALUE = 'סרטונים 12.2026';

type Lead = {
  id: string;
  created_time: string;
  ad_name?: string;
  campaign_name?: string;
  platform?: string;
  field_data: { name: string; values: string[] }[];
};

async function graph(path: string, token: string) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

async function pageToken(): Promise<string> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) throw new Error('META_PAGE_ID / META_PAGE_ACCESS_TOKEN חסרים');
  const data = await graph(`${pageId}?fields=access_token`, token);
  return data.access_token || token;
}

async function monday(query: string, variables: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token || !BOARD_ID) throw new Error('MONDAY_API_TOKEN / MONDAY_BOARD_ID חסרים');
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`Monday API error (${res.status}): ${JSON.stringify(json.errors || json)}`);
  return json.data;
}

const norm = (raw: string | null | undefined) => (raw || '').replace(/\D/g, '').slice(-9);

const PLATFORM_LABEL: Record<string, string> = { fb: 'פייסבוק', ig: 'אינסטגרם', msg: 'מסנג׳ר', an: 'Audience Network' };

export async function syncMetaLeadsToMonday(dryRun = false) {
  const token = await pageToken();

  // שאלות הטופס: מפתח תשובה (למשל "some") -> הטקסט שהליד ראה בטופס, ושם הטופס
  const forms = new Map<string, { name: string; questions: { key: string; label: string; options: Map<string, string> }[] }>();
  const leads: (Lead & { formId: string })[] = [];
  for (const formId of FORM_IDS) {
    const f = await graph(`${formId}?fields=name,questions`, token);
    forms.set(formId, {
      name: f.name,
      questions: (f.questions || []).map((q: { key: string; label: string; options?: { key: string; value: string }[] }) => ({
        key: q.key,
        label: q.label,
        options: new Map((q.options || []).map((o) => [o.key, o.value])),
      })),
    });
    const data = await graph(`${formId}/leads?fields=id,created_time,ad_name,campaign_name,platform,field_data&limit=100`, token);
    for (const l of data.data || []) leads.push({ ...l, formId });
  }

  const board = await monday(
    `query ($b: ID!) { boards(ids: [$b]) { columns { id title type } } }`,
    { b: BOARD_ID }
  );
  const columns: { id: string; title: string; type: string }[] = board.boards[0].columns;
  const col = (pred: (t: string) => boolean) => columns.find((c) => pred(c.title.trim()))?.id;
  const phoneCol = columns.find((c) => c.type === 'phone')?.id;
  const knowledgeCol = col((t) => t.includes('ידע שלך'));
  const formNameCol = col((t) => t === 'form_name');
  const platformCol = col((t) => t === 'platform');
  const campaignCol = col((t) => t === 'campaign_name');
  const leadIdCol = col((t) => t === 'lead_id' || t === 'Lead ID');

  // כל הכרטיסים בלוח עם הערכים הנוכחיים של העמודות הרלוונטיות
  const wanted = [phoneCol, knowledgeCol, formNameCol, platformCol, campaignCol].filter(Boolean) as string[];
  const items: { id: string; values: Record<string, string> }[] = [];
  let cursor: string | null = null;
  do {
    const d: any = await monday(
      `query ($b: ID!, $c: String, $ids: [String!]) { boards(ids: [$b]) { items_page(limit: 200, cursor: $c) { cursor items { id column_values(ids: $ids) { id text } } } } }`,
      { b: BOARD_ID, c: cursor, ids: wanted }
    );
    const page = d.boards[0].items_page;
    for (const it of page.items) {
      items.push({ id: it.id, values: Object.fromEntries(it.column_values.map((v: { id: string; text: string | null }) => [v.id, v.text || ''])) });
    }
    cursor = page.cursor;
  } while (cursor);
  const byPhone = new Map(items.filter((i) => phoneCol && i.values[phoneCol]).map((i) => [norm(i.values[phoneCol!]), i]));

  const updates: { itemId: string; changes: Record<string, string> }[] = [];
  let notInMonday = 0;
  for (const lead of leads) {
    const fields = Object.fromEntries(lead.field_data.map((f) => [f.name, f.values?.[0] || '']));
    const item = byPhone.get(norm(fields.phone_number));
    if (!item) { notInMonday++; continue; }
    const form = forms.get(lead.formId)!;

    // תשובות לשאלות שאינן שם/נייד/מייל - בטקסט שהליד ראה
    const answers = form.questions
      .filter((q) => fields[q.key] && !['full_name', 'phone_number', 'email', 'first_name', 'last_name'].includes(q.key))
      .map((q) => q.options.get(fields[q.key]) || fields[q.key]);

    const changes: Record<string, string> = {};
    const setIfEmpty = (colId: string | undefined, value: string | undefined) => {
      if (colId && value && !item.values[colId]) changes[colId] = value;
    };
    setIfEmpty(knowledgeCol, answers.join(' · '));
    setIfEmpty(formNameCol, form.name);
    setIfEmpty(platformCol, PLATFORM_LABEL[lead.platform || ''] || lead.platform);
    // שם המודעה = איזה סרטון הביא את הליד. מחליפים רק את הערך הכללי שהאוטומציה של מאנדיי שמה
    if (campaignCol && lead.ad_name && (!item.values[campaignCol] || item.values[campaignCol] === GENERIC_CAMPAIGN_VALUE)) {
      changes[campaignCol] = `${GENERIC_CAMPAIGN_VALUE} · ${lead.ad_name}`;
    }
    if (Object.keys(changes).length) updates.push({ itemId: item.id, changes });
  }

  if (!dryRun) {
    for (const u of updates) {
      await monday(
        `mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }`,
        { b: BOARD_ID, i: u.itemId, v: JSON.stringify(u.changes) }
      );
    }
  }

  return {
    leads: leads.length,
    updated: updates.length,
    notInMonday,
    columns: { knowledgeCol: !!knowledgeCol, formNameCol: !!formNameCol, platformCol: !!platformCol, campaignCol: !!campaignCol, leadIdCol: !!leadIdCol },
    questions: [...forms.values()].map((f) => ({ form: f.name, questions: f.questions.map((q) => q.label) })),
    dryRun,
  };
}
