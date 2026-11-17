import { NextResponse } from 'next/server';
import { sendLoginEmail, supabaseAdmin } from '@/lib/instantLogin';
import { ensureActiveSubscriberAccount } from '@/lib/subscriberStatus';
import { syncGrowPaymentToMonday } from '@/lib/grow';
import { startSequence } from '@/lib/sequenceEngine';

export const maxDuration = 300;

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

type Contact = { name: string; phone: string; email: string };

// POST - שחזור קבוצתי: לכל מי ששילם דרך Grow (למשל הטבת "חודש ראשון ב-1 ש״ח") אבל ה-webhook
// לא הגיע/נכשל לטפל בו (ר' /api/admin/grant-subscriber - אותו עיקרון, כאן על רשימה שלמה
// בבת אחת). מי שכבר מנוי/ה פעיל/ה אצלנו פשוט מדולג - לא שולחים לו/ה שוב מייל כניסה ולא
// נוגעים במאנדיי, כדי לא "להציף" מישהו שכבר תקין
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const contacts = Array.isArray(body?.contacts) ? (body.contacts as Contact[]) : [];
  const isFirstMonthPrice = Boolean(body?.isFirstMonthPrice);
  const amount = typeof body?.amount === 'number' ? body.amount : null;

  if (contacts.length === 0) return NextResponse.json({ error: 'אין אנשי קשר לעבד' }, { status: 400 });

  const results: { name: string; phone: string; email: string; status: 'recovered' | 'already_active' | 'error'; mondaySynced?: boolean; error?: string }[] = [];

  for (const contact of contacts) {
    const name = (contact.name || '').trim();
    const phone = (contact.phone || '').trim();
    const email = (contact.email || '').trim();

    if (!name || !email) {
      results.push({ name, phone, email, status: 'error', error: 'חסר שם או מייל' });
      continue;
    }

    try {
      const { userId, newlyActivated } = await ensureActiveSubscriberAccount(email, phone, name, undefined, isFirstMonthPrice);

      if (!newlyActivated) {
        results.push({ name, phone, email, status: 'already_active' });
        continue;
      }

      await startSequence('welcome-subscriber', { userId }).catch((e) => console.error('grant-subscriber/bulk: נכשלה התחלת רצף הקליטה', e));
      await sendLoginEmail(email).catch((e) => console.error('grant-subscriber/bulk: נכשלה שליחת מייל כניסה', e));

      const mondayResult = await syncGrowPaymentToMonday({
        phone: phone || null,
        email,
        fullName: name,
        amount,
        transactionId: null,
        webhookKey: null,
      }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : 'threw' }));

      results.push({ name, phone, email, status: 'recovered', mondaySynced: mondayResult.ok });
    } catch (e) {
      results.push({ name, phone, email, status: 'error', error: e instanceof Error ? e.message : 'שגיאה לא ידועה' });
    }
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    recovered: results.filter((r) => r.status === 'recovered').length,
    alreadyActive: results.filter((r) => r.status === 'already_active').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  });
}
