import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';

// שדות שמותר למשתמש לעדכן ישירות (whitelist - מונע כתיבה לשדות פנימיים כמו id/status/cta_clicked)
const ALLOWED_FIELDS = [
  'current_step',
  'source',
  'name',
  'phone',
  'email',
  'trading_experience',
  'markets',
  'trading_style',
  'available_time',
  'trading_hours',
  'strategy_clarity',
  'entry_tools',
  'stop_discipline',
  'risk_per_trade',
  'risk_per_trade_amount',
  'daily_max_loss',
  'management_difficulty',
  'mental_difficulty',
  'main_fear',
  'main_goal',
  'trading_dream',
  'definition_of_success',
  'personal_rule',
] as const;

function pickAllowedFields(body: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) result[key] = body[key];
  }
  return result;
}

// POST - יצירה/עדכון (autosave) של תשובות השאלון
// body: { id?: string, ...answers }
// אם אין id - יוצר רשומה חדשה ומחזיר id. אם יש id - מעדכן את הרשומה הקיימת (upsert-style).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };

  const fields = pickAllowedFields(body);
  fields.updated_at = new Date().toISOString();

  try {
    if (id) {
      const { data, error } = await supabaseAdmin
        .from('trading_plan_responses')
        .update(fields)
        .eq('id', id)
        .eq('status', 'in_progress') // לא מאפשרים לשנות רשומה שכבר הושלמה
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: 'רשומה לא נמצאה' }, { status: 404 });
      }
      return NextResponse.json({ id: data.id });
    }

    const { data, error } = await supabaseAdmin
      .from('trading_plan_responses')
      .insert(fields)
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (e) {
    console.error('שגיאה בשמירת תשובות תוכנית המסחר', e);
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
  }
}

// PATCH - סימון אירועים: השלמת השאלון או לחיצה על ה-CTA
// body: { id: string, action: 'complete' | 'cta_click' }
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { id, action } = body as { id?: string; action?: string };

  if (!id || !action) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  try {
    if (action === 'complete') {
      // בודקים אם כבר קיימת רשומה שהושלמה בעבר עם אותו נייד או מייל - כדי לאפשר מילוי פעם אחת בלבד לכל אדם
      const { data: current } = await supabaseAdmin
        .from('trading_plan_responses')
        .select('phone, email')
        .eq('id', id)
        .maybeSingle();

      if (current?.phone || current?.email) {
        let dupQuery = supabaseAdmin
          .from('trading_plan_responses')
          .select('id')
          .eq('status', 'completed')
          .neq('id', id);

        const orParts: string[] = [];
        if (current.phone) orParts.push(`phone.eq.${current.phone}`);
        if (current.email) orParts.push(`email.eq.${current.email}`);
        dupQuery = dupQuery.or(orParts.join(','));

        const { data: existing } = await dupQuery.limit(1).maybeSingle();
        if (existing) {
          return NextResponse.json({ error: 'already_completed' }, { status: 409 });
        }
      }

      const { error } = await supabaseAdmin
        .from('trading_plan_responses')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'cta_click') {
      const { error } = await supabaseAdmin
        .from('trading_plan_responses')
        .update({ cta_clicked: true, cta_clicked_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (e) {
    console.error('שגיאה בעדכון תוכנית המסחר', e);
    return NextResponse.json({ error: 'שגיאה בעדכון' }, { status: 500 });
  }
}
