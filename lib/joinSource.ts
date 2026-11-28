import { supabaseAdmin } from '@/lib/instantLogin';

// "מקור הצטרפות" - מאיפה מישהו/י הגיע/ה לאתר ברגע שבאמת לחץ/ה על תשלום ה-₪1 (לא מקור הליד
// המקורי, שנשאר בעמודת הקמפיין במאנדיי). נשמר בטבלת signup_sources כשממלאים שם+נייד בדף
// /subscribe, ונכתב לעמודה "מקור הצטרפות" במאנדיי כשהתשלום מגיע מ-Grow. בלי מקור מסומן = "ישיר".
// ביקשה שירן 28.11 כדי לדעת איזה ערוץ/קמפיין באמת מביא מנויים משלמים.

export const JOIN_SOURCE_COLUMN_TITLE = 'מקור הצטרפות';
export const DIRECT_LABEL = 'ישיר (בלי לינק מסומן)';

function digits9(raw: string | null | undefined) {
  return (raw || '').replace(/\D/g, '').slice(-9);
}

export function joinSourceLabel(src: string | null | undefined): string {
  const s = (src || '').trim();
  if (!s || s === 'direct') return DIRECT_LABEL;
  if (s === 'dm' || s === 'dm_btn') return 'כתב/ה "בא לי" בהודעה ← לינק אוטומטי';
  if (s === 'comment_dm') return 'תגובת "בא לי" בפוסט ← לינק בפרטי';
  if (s === 'ig_dm' || s === 'fb_dm') return `"בא לי" בהודעה (${s.startsWith('ig') ? 'אינסטגרם' : 'פייסבוק'})`;
  let m = s.match(/^deadline_email_(d\d)$/);
  if (m) return `מייל תזכורת ₪1 עד 31.12 (${m[1]})`;
  m = s.match(/^deadline_push_(d\d)$/);
  if (m) return `התראת פוש ₪1 עד 31.12 (${m[1]})`;
  if (s.startsWith('ig_')) return `אינסטגרם - ${s.slice(3)}`;
  if (s.startsWith('fb_')) return `פייסבוק - ${s.slice(3)}`;
  if (/^(facebook|fb|meta|instagram|ig)$/i.test(s)) return 'קמפיין ממומן במטא';
  if (s === 'lead_msg') return 'ליד שקיבל/ה לינק בהודעה ממך';
  return s;
}

export async function recordSignupSource(phone: string | null | undefined, email: string | null | undefined, src: string | null | undefined) {
  const p = digits9(phone);
  if (!p && !email) return;
  await supabaseAdmin.from('signup_sources').insert({
    phone_normalized: p || null,
    email: email ? email.trim().toLowerCase() : null,
    source: (src || '').trim().slice(0, 100) || 'direct',
  });
}

// המקור האחרון שנרשם לנייד/מייל הזה ב-30 הימים האחרונים
export async function lookupJoinSource(phone: string | null | undefined, email: string | null | undefined): Promise<string> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const p = digits9(phone);
  try {
    if (p) {
      const { data } = await supabaseAdmin.from('signup_sources').select('source').eq('phone_normalized', p).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
      if (data?.[0]) return joinSourceLabel(data[0].source);
    }
    if (email) {
      const { data } = await supabaseAdmin.from('signup_sources').select('source').eq('email', email.trim().toLowerCase()).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
      if (data?.[0]) return joinSourceLabel(data[0].source);
    }
  } catch { /* לא חוסמים סנכרון תשלום בגלל זה */ }
  return DIRECT_LABEL;
}
