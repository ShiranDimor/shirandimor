import { NextResponse } from 'next/server';

export const maxDuration = 60;

// pg_cron / הפעלה ידנית (PG_CRON_SECRET): נתונים ציבוריים על חשבונות עסקיים/יוצרים באינסטגרם
// (business_discovery) - לבחירת שותפים לשיתופי פעולה. ?u=user1,user2
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const users = (new URL(request.url).searchParams.get('u') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
  const G = 'https://graph.facebook.com/v21.0';
  const tok = process.env.META_PAGE_ACCESS_TOKEN!;
  const page = await fetch(`${G}/${process.env.META_PAGE_ID}?fields=access_token,instagram_business_account&access_token=${encodeURIComponent(tok)}`).then((r) => r.json());
  const token = page.access_token || tok;
  const ig = page.instagram_business_account?.id;
  const out: Record<string, unknown> = {};
  for (const u of users) {
    const f = `business_discovery.username(${u}){username,name,followers_count,media_count,biography,media.limit(6){like_count,comments_count,media_product_type,timestamp}}`;
    const d = await fetch(`${G}/${ig}?fields=${encodeURIComponent(f)}&access_token=${encodeURIComponent(token)}`).then((r) => r.json());
    if (d.error) { out[u] = { error: d.error.message }; continue; }
    const b = d.business_discovery;
    const m = b.media?.data || [];
    out[u] = { name: b.name, followers: b.followers_count, posts: b.media_count, bio: (b.biography || '').slice(0, 160), avgLikes: m.length ? Math.round(m.reduce((s: number, x: { like_count?: number }) => s + (x.like_count || 0), 0) / m.length) : null, lastPost: m[0]?.timestamp };
  }
  return NextResponse.json(out);
}
