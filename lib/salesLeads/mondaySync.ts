import { supabaseAdmin } from '@/lib/instantLogin';
import { normalizePhoneToE164 } from './phone';
import { extractFirstName } from './firstName';

// אך ורק קבוצת "קבוצת עדכונים" בלוח - לא לקוחות/לידים מקבוצות אחרות. אותו שם קבוצה בדיוק
// כמו UPDATES_GROUP_NAME ב-lib/tradingPlan/monday.ts
const UPDATES_GROUP_NAME = 'קבוצת עדכונים';
const CAMPAIGN_COLUMN_TITLE = 'campaign_name';

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
    updatesGroupId: groups.find((g) => g.title === UPDATES_GROUP_NAME)?.id,
    phoneColumnId: columns.find((c) => c.type === 'phone')?.id,
    campaignColumnId: columns.find((c) => c.title === CAMPAIGN_COLUMN_TITLE)?.id,
  };
}

export type MondayUpdatesGroupLead = {
  mondayItemId: string;
  name: string;
  phoneRaw: string | null;
  createdAt: string | null;
  sourceInfo: string | null;
};

// שולף את כל האנשים שנמצאים כרגע בקבוצת "קבוצת עדכונים" ב-Monday.com - ורק אותם
export async function getUpdatesGroupLeadsFromMonday(): Promise<MondayUpdatesGroupLead[]> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) return [];

  const { updatesGroupId, phoneColumnId, campaignColumnId } = await getBoardSchema(token, boardId);
  if (!updatesGroupId) return [];

  const columnIds = [phoneColumnId, campaignColumnId].filter(Boolean) as string[];
  const result: MondayUpdatesGroupLead[] = [];
  let cursor: string | null = null;

  do {
    const itemsData: any = await mondayRequest(
      token,
      `query ($boardId: ID!, $groupId: [String!], $cursor: String, $columnIds: [String!]) {
        boards (ids: [$boardId]) {
          groups (ids: $groupId) {
            items_page (limit: 100, cursor: $cursor) {
              cursor
              items { id name created_at column_values (ids: $columnIds) { id text } }
            }
          }
        }
      }`,
      { boardId, groupId: [updatesGroupId], cursor, columnIds }
    );

    const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
    // התאמה לפי id של העמודה, לא לפי מיקום במערך - מאנדיי לא בהכרח מחזיר בסדר המבוקש
    const items: { id: string; name: string; created_at: string | null; column_values: { id: string; text: string | null }[] }[] = page?.items || [];

    for (const item of items) {
      const byId = (colId: string | undefined) => (colId ? item.column_values?.find((cv) => cv.id === colId)?.text || null : null);
      result.push({
        mondayItemId: item.id,
        name: item.name || 'ליד ללא שם',
        phoneRaw: byId(phoneColumnId),
        createdAt: item.created_at || null,
        sourceInfo: byId(campaignColumnId),
      });
    }

    cursor = page?.cursor || null;
  } while (cursor);

  return result;
}

export type SalesLeadsSyncResult = {
  totalInMondayGroup: number;
  created: number;
  updated: number;
  skippedNoPhone: string[];
  failed: { name: string | null; error: string }[];
};

// מסנכרן את קבוצת העדכונים ממאנדיי לתוך sales_leads. אף פעם לא נוגע בסטטוס/עדיפות/היסטוריה/
// Follow-up של ליד קיים - רק מוודא שהוא קיים ומעדכן שם/טלפון/מקור אם השתנו במאנדיי. אף פעם
// לא מוחק שורות (מי שיצא מהקבוצה במאנדיי נשאר במערכת עם כל הטיפול שכבר נעשה בו)
export async function syncSalesLeadsFromMonday(): Promise<SalesLeadsSyncResult> {
  const mondayLeads = await getUpdatesGroupLeadsFromMonday();

  let created = 0;
  let updated = 0;
  const skippedNoPhone: string[] = [];
  const failed: { name: string | null; error: string }[] = [];

  for (const lead of mondayLeads) {
    const phoneNormalized = normalizePhoneToE164(lead.phoneRaw);
    if (!phoneNormalized) {
      skippedNoPhone.push(lead.name);
      continue;
    }

    try {
      let existing = await supabaseAdmin
        .from('sales_leads')
        .select('id, monday_item_id, name, first_name')
        .eq('monday_item_id', lead.mondayItemId)
        .maybeSingle();

      if (!existing.data) {
        existing = await supabaseAdmin.from('sales_leads').select('id, monday_item_id, name, first_name').eq('phone_normalized', phoneNormalized).maybeSingle();
      }

      if (existing.data) {
        const patch: Record<string, unknown> = { phone_normalized: phoneNormalized };
        if (existing.data.monday_item_id !== lead.mondayItemId) patch.monday_item_id = lead.mondayItemId;
        if (lead.name && lead.name !== existing.data.name) patch.name = lead.name;
        if (lead.phoneRaw) patch.phone_original = lead.phoneRaw;
        if (lead.sourceInfo) patch.source_info = lead.sourceInfo;
        // אף פעם לא דורסים first_name קיים - גם אם השם המלא השתנה במאנדיי. עדיף שם פרטי ישן
        // שכבר עובד מאשר לקחת סיכון על ערך חדש שאולי פחות טוב
        if (!existing.data.first_name) {
          const computed = extractFirstName(lead.name);
          if (computed) patch.first_name = computed;
        }

        const { error } = await supabaseAdmin.from('sales_leads').update(patch).eq('id', existing.data.id);
        if (error) throw error;
        updated++;
      } else {
        const { data: inserted, error } = await supabaseAdmin
          .from('sales_leads')
          .insert({
            monday_item_id: lead.mondayItemId,
            name: lead.name,
            first_name: extractFirstName(lead.name),
            phone_original: lead.phoneRaw,
            phone_normalized: phoneNormalized,
            lead_date: lead.createdAt || new Date().toISOString(),
            source_info: lead.sourceInfo,
          })
          .select('id')
          .single();

        if (error) throw error;

        if (inserted) {
          await supabaseAdmin.from('sales_lead_activities').insert({ lead_id: inserted.id, activity_type: 'LEAD_CREATED', note: null, metadata: null });
        }
        created++;
      }
    } catch (e) {
      failed.push({ name: lead.name, error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
    }
  }

  return { totalInMondayGroup: mondayLeads.length, created, updated, skippedNoPhone, failed };
}
