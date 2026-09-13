import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { generateFromWhatsapp } from '@/lib/marketingStudio';
import { renderInsightCard } from '@/lib/marketingCardImage';

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

const GROUP_LABEL: Record<string, string> = {
  סוחרים: 'קבוצת הסוחרים (מדברים עסקאות)',
  עדכונים: 'קבוצת העדכונים החינמית',
};

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: latest, error: latestError } = await supabaseAdmin
    .from('whatsapp_analyses')
    .select('id, group_type, raw_text, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) return NextResponse.json({ error: 'שגיאה בשליפת ההעלאה האחרונה' }, { status: 500 });
  if (!latest || !latest.raw_text) {
    return NextResponse.json({ error: 'עדיין אין העלאת וואטסאפ לשלוף ממנה - צריך להעלות ייצוא צ׳אט קודם בעמוד "ניתוח קבוצות ווטסאפ"' }, { status: 400 });
  }

  const { data: brandVoiceRow, error: brandVoiceError } = await supabaseAdmin.from('marketing_brand_voice').select('*').eq('id', 1).single();
  if (brandVoiceError) return NextResponse.json({ error: 'שגיאה בטעינת פרופיל הקול' }, { status: 500 });

  const { data: previousPosts } = await supabaseAdmin
    .from('marketing_posts')
    .select('hook')
    .eq('source_type', 'whatsapp')
    .eq('source_id', latest.id)
    .limit(20);

  const avoidHooks = (previousPosts || []).map((p) => p.hook).filter(Boolean);
  const groupLabel = GROUP_LABEL[latest.group_type] || latest.group_type;

  try {
    const generated = await generateFromWhatsapp({
      rawText: latest.raw_text,
      groupLabel,
      brandVoice: {
        tone_notes: brandVoiceRow.tone_notes || '',
        sample_posts: brandVoiceRow.sample_posts || '',
        avoid_notes: brandVoiceRow.avoid_notes || '',
      },
      avoidHooks,
    });

    if (!generated.hook.trim() || !generated.caption.trim()) {
      return NextResponse.json({ error: `לא נמצא תוכן מתאים לשימוש: ${generated.topicSummary || 'לא זוהו הודעות ברורות של שירן בהעלאה הזו'}` }, { status: 422 });
    }

    const imageBase64 = await renderInsightCard(generated.hook);

    const { data, error } = await supabaseAdmin
      .from('marketing_posts')
      .insert([{
        platform: 'both',
        content_type: 'feed_post',
        topic: `תוכן מקצועי מ${groupLabel} · ${generated.topicSummary}`,
        hook: generated.hook,
        caption: generated.caption,
        hashtags: generated.hashtags,
        video_script: '',
        visual_idea: 'כרטיס גרפי אוטומטי (מצורף)',
        status: 'draft',
        source_type: 'whatsapp',
        source_id: latest.id,
        image_base64: imageBase64,
      }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'שגיאה בשמירת הפוסט' }, { status: 500 });

    return NextResponse.json({ post: data });
  } catch (e) {
    console.error('שגיאה ביצירת תוכן מוואטסאפ', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת התוכן' }, { status: 500 });
  }
}
