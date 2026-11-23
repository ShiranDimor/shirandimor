// נתוני חשיפה אורגניים מאינסטגרם ישירות מ-Meta (בלי Windsor): לכל פוסט/ריל אחרון - חשיפה,
// צפיות, שמירות, שיתופים, לייקים ותגובות, ועוד מספר העוקבים של החשבון. נשמר ב-social_insights
// כדי שהדוח היומי וההשוואה החודשית יוכלו לדעת איזה תוכן באמת עובד.
import { supabaseAdmin } from '@/lib/instantLogin';

const GRAPH = 'https://graph.facebook.com/v21.0';
const MEDIA_METRICS = ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions'];

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

// מדדים לפוסט אחד. אם הבקשה המשולבת נכשלת (מדד שלא קיים לסוג המדיה הזה), מנסים אחד-אחד
async function mediaInsights(mediaId: string, token: string): Promise<{ metrics: Record<string, number>; errors: string[] }> {
  const metrics: Record<string, number> = {};
  const errors: string[] = [];
  const read = (data: { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }) => {
    for (const m of data.data || []) metrics[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
  };
  try {
    read(await graph(`${mediaId}/insights?metric=${MEDIA_METRICS.join(',')}`, token));
  } catch {
    for (const m of MEDIA_METRICS) {
      try { read(await graph(`${mediaId}/insights?metric=${m}`, token)); } catch (e) { errors.push(`${m}: ${(e as Error).message}`); }
    }
  }
  return { metrics, errors };
}

export async function syncInstagramInsights(limit = 25) {
  const token = await pageToken();
  let igUser = process.env.META_IG_USER_ID;
  if (!igUser) {
    const page = await graph(`${process.env.META_PAGE_ID}?fields=instagram_business_account`, token);
    igUser = page?.instagram_business_account?.id;
    if (!igUser) throw new Error('לא נמצא חשבון אינסטגרם מקושר לעמוד');
  }

  const profile = await graph(`${igUser}?fields=followers_count,media_count`, token);
  const media = await graph(`${igUser}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp&limit=${limit}`, token);

  const rows = [];
  const errors: Record<string, string[]> = {};
  for (const m of media.data || []) {
    const { metrics, errors: errs } = await mediaInsights(m.id, token);
    if (errs.length) errors[m.id] = errs;
    rows.push({
      platform: 'instagram',
      media_id: m.id,
      media_type: m.media_product_type || m.media_type,
      permalink: m.permalink,
      caption: (m.caption || '').slice(0, 300),
      published_at: m.timestamp,
      metrics,
      fetched_at: new Date().toISOString(),
    });
  }
  if (rows.length) {
    const { error } = await supabaseAdmin.from('social_insights').upsert(rows, { onConflict: 'platform,media_id' });
    if (error) throw new Error(`שמירה נכשלה: ${error.message}`);
  }
  await supabaseAdmin.from('social_account_snapshots').insert({
    platform: 'instagram',
    followers: profile.followers_count ?? null,
    media_count: profile.media_count ?? null,
  });
  return { followers: profile.followers_count, synced: rows.length, errors };
}
