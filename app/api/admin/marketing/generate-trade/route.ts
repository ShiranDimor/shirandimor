import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { generateFromTrade } from '@/lib/marketingStudio';
import { renderTradeCard } from '@/lib/marketingCardImage';

export const maxDuration = 60;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

function pct(entry: number, exit: number, direction: string) {
  const dirFactor = direction === 'short' ? -1 : 1;
  return ((exit - entry) / entry) * 100 * dirFactor;
}

function durationLabel(openedAt: string, closedAt: string) {
  const days = Math.max(1, Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / (1000 * 60 * 60 * 24)));
  return days === 1 ? 'יום מסחר אחד' : `${days} ימי מסחר`;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { tradeId } = body as Record<string, unknown>;
  if (typeof tradeId !== 'string' || !tradeId) {
    return NextResponse.json({ error: 'חסר מזהה עסקה' }, { status: 400 });
  }

  const { data: trade, error: tradeError } = await supabaseAdmin.from('trades').select('*').eq('id', tradeId).single();
  if (tradeError || !trade) return NextResponse.json({ error: 'העסקה לא נמצאה' }, { status: 404 });
  if (trade.status !== 'closed' || trade.exit_price === null) {
    return NextResponse.json({ error: 'העסקה עדיין לא סגורה' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from('marketing_posts').select('id').eq('source_type', 'trade').eq('source_id', tradeId).maybeSingle();
  if (existing) return NextResponse.json({ error: 'כבר נוצר פוסט לעסקה הזו' }, { status: 409 });

  const { data: brandVoiceRow, error: brandVoiceError } = await supabaseAdmin.from('marketing_brand_voice').select('*').eq('id', 1).single();
  if (brandVoiceError) return NextResponse.json({ error: 'שגיאה בטעינת פרופיל הקול' }, { status: 500 });

  const tradePct = pct(trade.entry_price, trade.exit_price, trade.direction);
  const risk = trade.stop_loss ? Math.abs(trade.entry_price - trade.stop_loss) : null;
  const reward = Math.abs(trade.exit_price - trade.entry_price);
  const riskRewardLabel = risk && risk > 0 ? `1:${(reward / risk).toFixed(1)}` : null;
  const directionLabel = trade.direction === 'short' ? 'שורט' : 'לונג';
  const duration = durationLabel(trade.opened_at, trade.closed_at);

  try {
    const generated = await generateFromTrade({
      symbol: trade.symbol,
      directionLabel,
      durationLabel: duration,
      pct: tradePct,
      riskRewardLabel,
      brandVoice: {
        tone_notes: brandVoiceRow.tone_notes || '',
        sample_posts: brandVoiceRow.sample_posts || '',
        avoid_notes: brandVoiceRow.avoid_notes || '',
      },
    });

    const imageBase64 = await renderTradeCard({
      symbol: trade.symbol,
      directionLabel,
      durationLabel: duration,
      pct: tradePct,
      riskRewardLabel,
      hook: generated.hook,
    });

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .insert([{
        platform: 'both',
        content_type: 'feed_post',
        topic: `עסקה: ${trade.symbol} · ${tradePct >= 0 ? '+' : ''}${tradePct.toFixed(1)}%`,
        hook: generated.hook,
        caption: generated.caption,
        hashtags: generated.hashtags,
        video_script: '',
        visual_idea: 'כרטיס גרפי אוטומטי (מצורף)',
        status: 'draft',
        source_type: 'trade',
        source_id: tradeId,
        image_base64: imageBase64,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת הפוסט' }, { status: 500 });

    return NextResponse.json({ post: data });
  } catch (e) {
    console.error('שגיאה ביצירת תוכן מעסקה', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת התוכן' }, { status: 500 });
  }
}
