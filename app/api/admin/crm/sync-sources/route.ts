import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { syncLiveRegistrationsToCrm, syncReferralsToCrm, refreshLeadIntentForAll } from '@/lib/crm';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;
  return user;
}

// POST - מסנכרן לתוך ה-CRM שלושה מקורות שכבר קיימים באתר אבל לא זורמים לשם היום: הרשמות ללייבים,
// הפניות (חבר מביא חבר), וסיווג/סיכום שיחה מבוט התמיכה "דור" (lead_intent) - "AI lead score"
// שכבר קיים בפועל בעסק, פשוט לא הוצג עד היום ב-CRM
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  try {
    const [live, referrals, intent] = await Promise.all([
      syncLiveRegistrationsToCrm(),
      syncReferralsToCrm(),
      refreshLeadIntentForAll(),
    ]);
    return NextResponse.json({ ok: true, liveSynced: live.synced, referralsSynced: referrals.synced, intentUpdated: intent.updated });
  } catch (e) {
    console.error('שגיאה בסנכרון מקורות ל-CRM', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה בסנכרון' }, { status: 500 });
  }
}
