import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { auditWhatsappGroupPush } from '@/lib/tradingPlan/monday';

export const maxDuration = 60;

// pg_cron / הפעלה ידנית (PG_CRON_SECRET): מי בקבוצת "בווטסאפ אבל לא מנוי" הפעיל התראות באתר. ?dry=1 = רק ספירה
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.PG_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1';
  try {
    const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('user_id, phone, email').is('invalid_at', null);
    const userIds = Array.from(new Set((subs || []).map((s) => s.user_id).filter(Boolean))) as string[];
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from('profiles').select('id, phone, email').in('id', userIds)
      : { data: [] as { id: string; phone: string | null; email: string | null }[] };
    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    const contacts = (subs || []).flatMap((s) => {
      const p = s.user_id ? byId.get(s.user_id) : null;
      return [{ phone: s.phone, email: s.email }, ...(p ? [{ phone: p.phone, email: p.email }] : [])];
    });
    return NextResponse.json({ ok: true, validPushSubscriptions: subs?.length || 0, ...(await auditWhatsappGroupPush(contacts, dry)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
