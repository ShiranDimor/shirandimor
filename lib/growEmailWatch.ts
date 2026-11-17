import { getAccessToken } from '@/lib/googleCalendar';

// בודק מיילים אמיתיים מ-Grow על תשלום (לא ה-webhook שלהם) - כדי שלא נהיה תלויים אך ורק
// באוטומציה של Grow להודיע לשרת שלנו. Grow שולחת מייל כזה בכל תשלום (ר' app/api/webhooks/grow
// להסבר המלא על התקלה שגילתה את זה - תשלום אמיתי שה-webhook מעולם לא הגיע עליו). המייל עצמו
// בפורמט קבוע וידוע: שורות "שם:"/"טלפון:"/"מייל:"/"אסמכתא:" ו"בוצע תשלום של X ש״ח"
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GROW_SENDER = 'support@grow.security';
const GROW_SUBJECT = 'בוצע תשלום עבור בעל העסק';

export type GrowEmailPayment = {
  messageId: string;
  name: string;
  phone: string;
  email: string | null;
  amount: number | null;
  transactionId: string | null;
};

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };

function findPartByMimeType(payload: GmailPart, mimeType: string): string {
  if (payload.mimeType === mimeType && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts || []) {
    const found = findPartByMimeType(part, mimeType);
    if (found) return found;
  }
  return '';
}

// המייל של Grow הוא HTML בלבד (אין חלק text/plain כלל) - אם לא נמצא טקסט רגיל, נופלים ל-HTML
// ומסירים תגיות בצורה גסה. לא צריך המרה מושלמת, רק מספיק כדי שהביטויים הרגילים למטה ("שם:",
// "טלפון:" וכו') עדיין יתפסו את הטקסט - בדיוק כמו שכלי ה-Gmail עצמו ממיר HTML לטקסט כשאין חלופה
function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|tr|p|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function extractPlainTextBody(payload: GmailPart): string {
  const plain = findPartByMimeType(payload, 'text/plain');
  if (plain) return plain;
  const html = findPartByMimeType(payload, 'text/html');
  return html ? htmlToPlainText(html) : '';
}

// מפענח את גוף המייל - ר' דוגמה אמיתית שנבדקה (תשלום של מוקי הראל):
// "| שם: מוקי הראל |" / "| טלפון: 0542227522 |" / "| מייל: mharel@argopro.com |" /
// "| אסמכתא: 534177134 |" / "בוצע תשלום של 1 ש״ח"
function parseGrowEmailBody(messageId: string, body: string): GrowEmailPayment | null {
  const nameMatch = body.match(/שם:\s*([^\n|]+)/);
  const phoneMatch = body.match(/טלפון:\s*([0-9\-+ ]+)/);
  const emailMatch = body.match(/מייל:\s*([^\s|]+)/);
  const amountMatch = body.match(/תשלום של\s*([\d.]+)\s*ש/);
  const txMatch = body.match(/אסמכתא:\s*([^\n|]+)/);

  const name = nameMatch?.[1]?.trim();
  const phone = phoneMatch?.[1]?.trim();
  if (!name || !phone) return null;

  return {
    messageId,
    name,
    phone,
    email: emailMatch?.[1]?.trim() || null,
    amount: amountMatch ? Number(amountMatch[1]) : null,
    transactionId: txMatch?.[1]?.trim() || null,
  };
}

function israelDateYMD(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).replace(/-/g, '/');
}

// שולף תשלומים מהימים האחרונים (לא רק "מאז הבדיקה הקודמת") - בכוונה, כדי שגם אם הרצה אחת
// נכשלת/מדולגת, ההרצה הבאה עדיין תראה את אותו תשלום. בטוח לגמרי כי הצעד הבא (הענקת מנוי)
// בודק בעצמו אם כבר יש חשבון - תשלום שכבר טופל פשוט ידולג, לא ייווצר לו כלום פעמיים
export async function listRecentGrowPayments(daysBack = 3): Promise<GrowEmailPayment[] | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const query = `from:${GROW_SENDER} subject:"${GROW_SUBJECT}" after:${israelDateYMD(since)}`;

  const listRes = await fetch(`${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!listRes.ok) {
    console.error('growEmailWatch: נכשלה חיפוש מיילים', await listRes.text().catch(() => ''));
    return null;
  }
  const listData = await listRes.json();
  const ids: string[] = (listData.messages || []).map((m: { id: string }) => m.id);

  const payments: GrowEmailPayment[] = [];
  for (const id of ids) {
    const msgRes = await fetch(`${GMAIL_API}/messages/${id}?format=FULL`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (!msgRes.ok) {
      console.error(`growEmailWatch: נכשלה קריאת מייל ${id}`, await msgRes.text().catch(() => ''));
      continue;
    }
    const msg = await msgRes.json();
    const body = extractPlainTextBody(msg.payload);
    const parsed = parseGrowEmailBody(id, body);
    if (parsed) payments.push(parsed);
    else console.error(`growEmailWatch: לא הצלחנו לפענח מייל ${id} - פורמט לא מוכר`);
  }
  return payments;
}
