import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { upsertContact, addNote } from '@/lib/crm';
import type { CrmStage } from '@/lib/crm';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';

// כלי ייבוא חד-פעמי: מעביר את כל התוכן הקיים בלוח מאנדיי (3 הקבוצות) ל-CRM הפנימי (crm_contacts),
// כדי שהמעבר מ-Monday.com ל-CRM המקומי לא יאבד אנשי קשר שמנוהלים כרגע רק שם (למשל הוספו ידנית,
// או הצטרפו לפני שהיה חשבון באתר). מיועד להרצה פעם אחת אחרי הפריסה, ואז אפשר למחוק את הקובץ הזה
// ולבטל את המנוי ל-Monday.com. לא נוגע בנתונים הקיימים ב-Monday - קריאה בלבד משם.

const GROUP_STAGE: Record<string, CrmStage> = {
  'לידים חדשים': 'lead_new',
  'קבוצת עדכונים': 'updates_group',
  'קבוצת סוחרים': 'subscriber',
};
const STATUS_COLUMN_TITLE = 'סטטוס טיפול';
const FOLLOWUP_COLUMN_TITLE = 'תאריך פולואפ';
const JOIN_DATE_COLUMN_TITLE = 'תאריך הרשמה';
const MONTHLY_COST_COLUMN_TITLE = 'עלות חודשית ששילם';
const BENEFIT_COLUMN_TITLE = 'נרשם בזכות הטבה';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;
  return user;
}

async function mondayRequest(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;
  if (!token || !boardId) {
    return NextResponse.json({ error: 'Monday.com לא מוגדר (חסר MONDAY_API_TOKEN או MONDAY_BOARD_ID)' }, { status: 500 });
  }

  const boardData: any = await mondayRequest(
    token,
    `query ($boardId: ID!) { boards (ids: [$boardId]) { columns { id title type } groups { id title } } }`,
    { boardId }
  );
  const board = boardData?.data?.boards?.[0];
  if (!board) return NextResponse.json({ error: 'הלוח לא נמצא' }, { status: 500 });

  const columns: { id: string; title: string; type: string }[] = board.columns || [];
  const groups: { id: string; title: string }[] = board.groups || [];

  const phoneColumnId = columns.find((c) => c.type === 'phone')?.id;
  const emailColumnId = columns.find((c) => c.type === 'email')?.id;
  const statusColumnId = columns.find((c) => c.title === STATUS_COLUMN_TITLE)?.id;
  const followupColumnId = columns.find((c) => c.title === FOLLOWUP_COLUMN_TITLE && c.type === 'date')?.id;
  const joinDateColumnId = columns.find((c) => c.title === JOIN_DATE_COLUMN_TITLE && c.type === 'date')?.id;
  const monthlyCostColumnId = columns.find((c) => c.title === MONTHLY_COST_COLUMN_TITLE)?.id;
  const benefitColumnId = columns.find((c) => c.title === BENEFIT_COLUMN_TITLE)?.id;

  const columnIds = [phoneColumnId, emailColumnId, statusColumnId, followupColumnId, joinDateColumnId, monthlyCostColumnId, benefitColumnId].filter(Boolean) as string[];

  let imported = 0;
  let accountsEnsured = 0;
  let skippedNoContact = 0;
  const errors: string[] = [];

  for (const group of groups) {
    const stage = GROUP_STAGE[group.title];
    if (!stage) continue;

    let cursor: string | null = null;
    do {
      const itemsData: any = await mondayRequest(
        token,
        `query ($boardId: ID!, $groupId: [String!], $cursor: String, $columnIds: [String!]) {
          boards (ids: [$boardId]) {
            groups (ids: $groupId) {
              items_page (limit: 100, cursor: $cursor) {
                cursor
                items { name column_values (ids: $columnIds) { id text } }
              }
            }
          }
        }`,
        { boardId, groupId: [group.id], cursor, columnIds }
      );

      const page = itemsData?.data?.boards?.[0]?.groups?.[0]?.items_page;
      const items: { name: string; column_values: { id: string; text: string | null }[] }[] = page?.items || [];

      for (const item of items) {
        const byId = (colId: string | undefined) => (colId ? item.column_values?.find((cv) => cv.id === colId)?.text || null : null);
        const phone = byId(phoneColumnId);
        const email = byId(emailColumnId);

        if (!phone && !email) {
          skippedNoContact++;
          continue;
        }

        try {
          const contact = await upsertContact({
            phone,
            email,
            fullName: item.name,
            stage,
            statusLabel: byId(statusColumnId),
            followUpAt: byId(followupColumnId),
            joinedAt: stage === 'subscriber' ? byId(joinDateColumnId) : undefined,
            monthlyCost: stage === 'subscriber' ? Number(byId(monthlyCostColumnId)) || undefined : undefined,
            firstMonthDiscount: !!byId(benefitColumnId),
          });
          await addNote(contact.id, `יובא ממאנדיי (ייבוא חד-פעמי) מקבוצה "${group.title}"`, 'import');
          imported++;

          if (stage === 'subscriber' && email) {
            await ensureActiveSubscriberAccount(email, phone || '', item.name || email, byId(joinDateColumnId) || undefined);
            accountsEnsured++;
          }
        } catch (e) {
          errors.push(`${item.name}: ${e instanceof Error ? e.message : 'שגיאה לא ידועה'}`);
        }
      }

      cursor = page?.cursor || null;
    } while (cursor);
  }

  return NextResponse.json({ imported, accountsEnsured, skippedNoContact, errors });
}
