import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { isActiveSubscriber } from '@/lib/subscriberStatus';
import { findContact, upsertContact, addNote } from '@/lib/crm';

const CAMPAIGN_VALUE = 'הרשמה ללייב';
const DUPLICATE_STATUS_LABEL = 'ליד כפול';

async function createCrmLiveLead(name: string, phone: string, email: string | null, liveTitle: string, liveScheduledAt: string) {
  try {
    // מוסיפים את תאריך ושעת הלייב למקור, כדי שאפשר יהיה להבדיל בין לידים מלייבים שונים
    const liveDate = new Date(liveScheduledAt);
    const liveDateLabel = `${liveDate.toLocaleDateString('he-IL')} ${liveDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    const sourceValue = `${CAMPAIGN_VALUE} - ${liveDateLabel}`;

    const isDuplicate = !!(await findContact(phone, email));

    const contact = await upsertContact({
      phone,
      email,
      fullName: name,
      source: sourceValue,
      statusLabel: isDuplicate ? DUPLICATE_STATUS_LABEL : undefined,
    });

    await addNote(
      contact.id,
      `נייד: ${phone}${email ? `\nאימייל: ${email}` : ''}\nמקור: הרשמה ללייב "${liveTitle}" (${liveDateLabel}) באתר${isDuplicate ? '\n⚠ כבר קיים ליד/מנוי אחר עם אותו נייד - סומן כ"ליד כפול"' : ''}`
    );
  } catch (e) {
    console.error('שגיאה בסנכרון הרשמה ללייב ל-CRM', e);
  }
}

// POST - הרשמה ללייב. מנוי פעיל (מזוהה לפי טוקן) נרשם ישירות ומקבל את פרטי ההצטרפות.
// מי שאינו מנוי משאיר פרטי קשר, נהפך לליד ב-CRM (בדיוק כמו טופס קבוצת העדכונים), ושירן
// יוצרת איתו קשר ידנית עם פרטי ההצטרפות
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { liveId, name, phone, email } = body as { liveId?: string; name?: string; phone?: string; email?: string };

  if (!liveId) {
    return NextResponse.json({ error: 'חסר מזהה לייב' }, { status: 400 });
  }

  const { data: live, error: liveError } = await supabaseAdmin.from('lives').select('id, title, join_info, scheduled_at, open_to_all').eq('id', liveId).eq('published', true).maybeSingle();
  if (liveError || !live) {
    return NextResponse.json({ error: 'הלייב לא נמצא' }, { status: 404 });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  let userId: string | null = null;

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role, subscription_status, full_name, phone, email').eq('id', user.id).maybeSingle();
      const isSubscriber = profile?.role === 'admin' || (profile?.role === 'subscriber' && profile?.subscription_status === 'active');
      if (isSubscriber) {
        userId = user.id;
        const { data: existing } = await supabaseAdmin.from('live_registrations').select('id').eq('live_id', liveId).eq('user_id', userId).maybeSingle();
        if (!existing) {
          await supabaseAdmin.from('live_registrations').insert({
            live_id: liveId,
            user_id: userId,
            name: profile?.full_name || null,
            phone: profile?.phone || null,
            email: profile?.email || user.email || null,
            is_subscriber: true,
          });
        }
        return NextResponse.json({ ok: true, isSubscriber: true, joinInfo: live.join_info });
      }
    }
  }

  // לא מנוי - צריך שם וטלפון כדי להיהפך לליד
  if (!name || !phone) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }

  const isSubscriberByContact = await isActiveSubscriber(phone, email || null);
  if (isSubscriberByContact) {
    // מנוי פעיל שממלא את הטופס בלי להיות מחובר - לא יוצרים לו ליד מיותר, רק שומרים שהוא נרשם
    // (כדי שיופיע ברשימת הנרשמים לשירן) ומציגים לו את הפרטים
    const { data: existing } = await supabaseAdmin.from('live_registrations').select('id').eq('live_id', liveId).eq('phone', phone).maybeSingle();
    if (!existing) {
      await supabaseAdmin.from('live_registrations').insert({ live_id: liveId, name, phone, email: email || null, is_subscriber: true });
    }
    return NextResponse.json({ ok: true, isSubscriber: true, joinInfo: live.join_info });
  }

  await supabaseAdmin.from('live_registrations').insert({
    live_id: liveId,
    name,
    phone,
    email: email || null,
    is_subscriber: false,
  });

  // ללייב שמסומן כפתוח לכולם, מי שאינו מנוי מקבל את פרטי ההצטרפות ישירות ולא הופך לליד
  // מכירתי ב-CRM - אין למה "לפנות" אליו, הוא כבר קיבל גישה לוובינר הפתוח
  if (live.open_to_all) {
    return NextResponse.json({ ok: true, isSubscriber: false, openToAll: true, joinInfo: live.join_info });
  }

  await createCrmLiveLead(name, phone, email || null, live.title, live.scheduled_at).catch(() => {});

  return NextResponse.json({ ok: true, isSubscriber: false });
}

// DELETE - ביטול הרשמה למי שמתחרט. רק למנוי מחובר (שנרשם עם חשבון) - למי שהשאיר פרטים כליד
// אין חשבון לאמת מולו, אז ביטול עבורו נעשה ידנית מול שירן (יש לה קישור וואטסאפ ישיר בפאנל הניהול)
export async function DELETE(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'צריך להיות מחוברים כדי לבטל הרשמה' }, { status: 401 });
  }

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: 'צריך להיות מחוברים כדי לבטל הרשמה' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const liveId = searchParams.get('liveId');
  if (!liveId) {
    return NextResponse.json({ error: 'חסר מזהה לייב' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('live_registrations').delete().eq('live_id', liveId).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'שגיאה בביטול ההרשמה' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
