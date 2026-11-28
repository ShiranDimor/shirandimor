import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/instantLogin';

// מענה אוטומטי "בא לי": מי שכותב "בא לי" בהודעה פרטית (כולל תגובה לסטורי) או בתגובה לפוסט/ריל,
// באינסטגרם או בפייסבוק, מקבל/ת מאיתנו הודעה פרטית עם לינק לחודש ב-₪1. הסיבה: אי אפשר לשים
// לינק לחיץ בסטורי שעולה אוטומטית, ורוב האנשים לא הולכים לביו.
// עונים רק למי שפנה אלינו קודם (ככה מטא מתירה), פעם אחת ל-24 שעות לאותו אדם, ותגובה פומבית
// קצרה מתחת לתגובה. שום קשר לוואטסאפ או לנייד של שירן.
// ההפעלה בפועל רק כש-META_AUTO_REPLY_ENABLED=true (אחרי ששירן אישרה את הנוסח).

const GRAPH = 'https://graph.facebook.com/v21.0';
const LINK_IG = 'https://shirandimor.com/subscribe?src=ig_dm';
const LINK_FB = 'https://shirandimor.com/subscribe?src=fb_dm';

export const DM_TEXT = (link: string) =>
  `היי, איזה כיף שכתבת 💛\n\n` +
  `הנה הלינק לחודש ראשון ב-₪1 בקהילה שלי (ההטבה בתוקף עד 31.12):\n${link}\n\n` +
  `מה יש שם: עסקאות בזמן אמת עם כניסה, סטופ והסבר למה, לייבים שבועיים וספריית שיעורים.\n` +
  `אחרי החודש הראשון ₪400 לחודש, ואפשר לבטל מתי שרוצים בהודעה אחת.\n\n` +
  `יש שאלה? פשוט תכתבו לי כאן 🙂\nשירן`;

const PUBLIC_REPLIES = ['שלחתי לך בפרטי 💌', 'מחכה לך בהודעות 💛', 'שלחתי לך הודעה 🙂', 'בדקו את ההודעות 💌'];

// "בא לי" / "באלי" / "בא לי!!" וכו'. בתגובות דורשים טקסט קצר, כדי ש"בא לי לבכות מהשוק" לא יפעיל
export function isTrigger(text: string | undefined | null, channel: 'dm' | 'comment'): boolean {
  if (!text) return false;
  const clean = text.replace(/[^֐-׿a-zA-Z0-9₪ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  const hit = /(^|\s)(בא ?לי|באה ?לי)(\s|$)/.test(clean) || /^(לינק|קישור|את הלינק|הלינק)$/.test(clean);
  if (!hit) return false;
  return channel === 'dm' ? clean.length <= 60 : clean.length <= 25;
}

export function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // אם לא הוגדר סוד, לא חוסמים (מטא עדיין דורשת verify token בהגדרה)
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

let cachedPageToken: string | null = null;
async function pageToken(): Promise<string> {
  if (cachedPageToken) return cachedPageToken;
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) throw new Error('META_PAGE_ID / META_PAGE_ACCESS_TOKEN חסרים');
  const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  cachedPageToken = data?.access_token || token;
  return cachedPageToken!;
}

async function post(path: string, body: Record<string, unknown>) {
  const token = await pageToken();
  const res = await fetch(`${GRAPH}/${path}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

type Platform = 'instagram' | 'facebook';
type Event = { platform: Platform; channel: 'dm' | 'comment'; senderId: string; text: string; commentId?: string; isStoryReply?: boolean };

async function alreadyRepliedRecently(platform: Platform, senderId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('meta_auto_replies')
    .select('id')
    .eq('platform', platform)
    .eq('sender_id', senderId)
    .eq('replied', true)
    .gte('created_at', since)
    .limit(1);
  return !!data?.length;
}

async function handle(ev: Event) {
  const enabled = process.env.META_AUTO_REPLY_ENABLED === 'true';
  const row: Record<string, unknown> = {
    platform: ev.platform,
    channel: ev.channel,
    sender_id: ev.senderId,
    comment_id: ev.commentId || null,
    text: ev.text.slice(0, 500),
    is_story_reply: !!ev.isStoryReply,
    replied: false,
  };
  try {
    if (!enabled) {
      row.error = 'disabled';
    } else if (await alreadyRepliedRecently(ev.platform, ev.senderId)) {
      row.error = 'already replied in last 24h';
    } else {
      const link = ev.platform === 'instagram' ? LINK_IG : LINK_FB;
      const recipient = ev.channel === 'comment' ? { comment_id: ev.commentId } : { id: ev.senderId };
      const sender = ev.platform === 'instagram' ? process.env.META_IG_USER_ID : process.env.META_PAGE_ID;
      await post(`${sender}/messages`, {
        recipient,
        message: { text: DM_TEXT(link) },
        ...(ev.platform === 'facebook' ? { messaging_type: 'RESPONSE' } : {}),
      });
      row.replied = true;
      if (ev.channel === 'comment' && ev.commentId) {
        const pub = PUBLIC_REPLIES[Math.floor(Math.random() * PUBLIC_REPLIES.length)];
        try {
          await post(ev.platform === 'instagram' ? `${ev.commentId}/replies` : `${ev.commentId}/comments`, { message: pub });
        } catch (e) {
          row.error = `public reply failed: ${(e as Error).message}`.slice(0, 300);
        }
      }
    }
  } catch (e) {
    row.error = (e as Error).message.slice(0, 300);
  }
  await supabaseAdmin.from('meta_auto_replies').insert(row);
}

// מפרק את גוף ה-webhook של מטא (אובייקט instagram או page) לאירועים רלוונטיים
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processWebhook(body: any): Promise<number> {
  const igId = process.env.META_IG_USER_ID;
  const pageId = process.env.META_PAGE_ID;
  const platform: Platform | null = body?.object === 'instagram' ? 'instagram' : body?.object === 'page' ? 'facebook' : null;
  if (!platform) return 0;
  const own = platform === 'instagram' ? igId : pageId;
  const events: Event[] = [];
  for (const entry of body.entry || []) {
    for (const m of entry.messaging || []) {
      const text = m?.message?.text;
      const senderId = m?.sender?.id;
      if (!senderId || senderId === own || m?.message?.is_echo) continue;
      if (isTrigger(text, 'dm')) events.push({ platform, channel: 'dm', senderId, text, isStoryReply: !!m?.message?.reply_to?.story });
    }
    for (const c of entry.changes || []) {
      const v = c?.value || {};
      if (platform === 'instagram' && c.field === 'comments') {
        const from = v?.from?.id;
        if (from && from !== own && v.id && isTrigger(v.text, 'comment')) events.push({ platform, channel: 'comment', senderId: from, text: v.text, commentId: v.id });
      }
      if (platform === 'facebook' && c.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
        const from = v?.from?.id;
        if (from && from !== own && v.comment_id && isTrigger(v.message, 'comment')) events.push({ platform, channel: 'comment', senderId: from, text: v.message, commentId: v.comment_id });
      }
    }
  }
  for (const ev of events) await handle(ev);
  return events.length;
}

// רישום העמוד לקבלת אירועי הודעות/תגובות (דורש pages_manage_metadata). בדיקה בלבד אם subscribe=false
export async function setupStatus(subscribe: boolean) {
  const out: Record<string, unknown> = { enabled: process.env.META_AUTO_REPLY_ENABLED === 'true', hasAppSecret: !!process.env.META_APP_SECRET, hasVerifyToken: !!process.env.META_WEBHOOK_VERIFY_TOKEN };
  try {
    const raw = process.env.META_PAGE_ACCESS_TOKEN || '';
    const dbg = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(raw)}&access_token=${encodeURIComponent(raw)}`).then((r) => r.json());
    const scopes: string[] = dbg?.data?.scopes || [];
    const need = ['instagram_manage_messages', 'instagram_manage_comments', 'pages_messaging', 'pages_manage_metadata'];
    out.missingScopes = need.filter((s) => !scopes.includes(s));
    const token = await pageToken();
    if (subscribe) {
      const r = await fetch(`${GRAPH}/${process.env.META_PAGE_ID}/subscribed_apps?subscribed_fields=messages,feed&access_token=${encodeURIComponent(token)}`, { method: 'POST' }).then((x) => x.json());
      out.subscribeResult = r;
    }
    out.subscribedApps = await fetch(`${GRAPH}/${process.env.META_PAGE_ID}/subscribed_apps?access_token=${encodeURIComponent(token)}`).then((x) => x.json());
  } catch (e) {
    out.error = (e as Error).message;
  }
  return out;
}
