import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { SEQUENCES, SequenceKey } from '@/lib/sequences';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  return adminProfile?.role === 'admin' ? user : null;
}

const STOP_REASON_LABELS: Record<string, string> = {
  completed: 'הסתיים',
  push_invalid: 'נעצר - התראות נשברו',
  unsubscribed: 'נעצר - ביטל/ה מנוי',
  converted: 'נעצר - הפך/הפכה למנוי/ה (המרה)',
};

// GET - כל אנשי הקשר בכל הרצפים, עם באיזה שלב הם נמצאים, מתי נשלחה ההודעה האחרונה, ומה שמם/ה -
// כדי שאפשר יהיה לראות מי קיבל מה ומתי, בלי לחפש ידנית בטבלה
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const { data: rows } = await supabaseAdmin
    .from('sequence_progress')
    .select('id, sequence_key, contact_key, user_id, phone, email, started_at, last_step_sent, last_sent_at, stopped_at, stopped_reason, created_at')
    .order('created_at', { ascending: false });

  if (!rows || rows.length === 0) return NextResponse.json({ rows: [] });

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email, phone, trial_price_used').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null; trial_price_used: boolean | null }[] };
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  // לידים (בלי user_id) - שם נשמר רק על שורת המינוי שלהם עצמה, לא על sequence_progress
  const leadPhones = rows.filter((r) => !r.user_id && r.phone).map((r) => r.phone as string);
  const { data: leadSubs } = leadPhones.length
    ? await supabaseAdmin.from('push_subscriptions').select('phone, name').in('phone', leadPhones)
    : { data: [] as { phone: string | null; name: string | null }[] };
  const nameByPhone = new Map((leadSubs || []).filter((s) => s.name).map((s) => [s.phone, s.name]));

  const enriched = rows
    // רלוונטי כאן (לבקשת שירן) רק מי שהצטרף/ה בהטבת "חודש ראשון ב-1 ש״ח" - לא מנויים/ות
    // במחיר מלא. לא משפיע על הרצף עצמו (כולם עדיין מקבלים את ההודעות) - רק על מה שמוצג כאן
    .filter((row) => {
      if (row.sequence_key !== 'welcome-subscriber') return true;
      const profile = row.user_id ? profileById.get(row.user_id) : null;
      return Boolean(profile?.trial_price_used);
    })
    .map((row) => {
      const seqDef = SEQUENCES[row.sequence_key as SequenceKey];
      const totalSteps = seqDef?.steps.length || 0;
      const currentStep = seqDef?.steps[Math.min(row.last_step_sent, totalSteps - 1)];
      const profile = row.user_id ? profileById.get(row.user_id) : null;
      const name = profile?.full_name || (row.phone ? nameByPhone.get(row.phone) : null) || null;

      return {
        id: row.id,
        sequenceKey: row.sequence_key,
        sequenceName: seqDef?.name || row.sequence_key,
        name,
        phone: profile?.phone || row.phone,
        email: profile?.email || row.email,
        startedAt: row.started_at,
        lastStepSent: row.last_step_sent,
        totalSteps,
        currentStepTitle: row.last_step_sent > 0 ? currentStep?.title || null : null,
        lastSentAt: row.last_sent_at,
        stoppedAt: row.stopped_at,
        stoppedReason: row.stopped_reason ? (STOP_REASON_LABELS[row.stopped_reason] || row.stopped_reason) : null,
        active: !row.stopped_at,
      };
    });

  return NextResponse.json({ rows: enriched });
}
