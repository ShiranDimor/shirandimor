import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { summarizeConversation } from '@/lib/supportBot';

const USER_TYPE_LABELS: Record<string, string> = {
  admin_test: 'בדיקה פנימית (אדמין)',
  member_active: 'מנוי/ה פעיל/ה',
  updates_group: 'קבוצת עדכונים',
  lead_new: 'ליד חדש',
  unknown: 'לא ידוע',
};

// שיחה נחשבת "הסתיימה" אם עברו 10 דקות בלי הודעה חדשה - זה לא מדע מדויק, רק היוריסטיקה סבירה
const QUIET_MINUTES = 10;

async function sendSummaryEmail(conversation: {
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  user_type: string | null;
}, summary: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY לא מוגדר - לא ניתן לשלוח סיכום שיחה');
    return;
  }

  const contactLine = conversation.contact_phone || conversation.contact_email || 'אין פרטי קשר עדיין';
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;">
    <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
        <div style="background:#111318;padding:20px 24px;">
          <div style="color:#fff;font-size:16px;font-weight:700;">שיחה חדשה עם דור</div>
        </div>
        <div style="padding:24px;">
          <p style="font-size:13.5px;color:#555;margin:0 0 4px;"><b>${conversation.contact_name || 'ללא שם'}</b> · ${contactLine}</p>
          <p style="font-size:12.5px;color:#888;margin:0 0 16px;">${USER_TYPE_LABELS[conversation.user_type || 'unknown']}</p>
          <p style="font-size:14px;color:#222;line-height:1.7;white-space:pre-wrap;margin:0 0 20px;">${summary}</p>
          <a href="https://www.shirandimor.com/admin/support-bot/conversations" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:12px;border-radius:10px;">לצפייה בשיחה המלאה ←</a>
        </div>
      </div>
    </div>
  </body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'דור - העוזרת הדיגיטלית <noreply@shirandimor.com>',
      to: 'shiran@shirandimor.com',
      subject: `שיחה עם דור - ${conversation.contact_name || contactLine}`,
      text: summary,
      html,
    }),
  }).catch((e) => console.error('שגיאה בשליחת סיכום שיחה במייל', e));
}

// קרון - עובר על שיחות עם בוט התמיכה שנרגעו (בלי הודעה חדשה כ-10 דקות) ועדיין לא נשלח עליהן
// סיכום, ושולח לשירן מייל עם תמצית השיחה ופרטי הקשר - כדי שהיא תדע על כל שיחה בלי לבדוק ידנית
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - QUIET_MINUTES * 60 * 1000).toISOString();

  const { data: allQuiet, error } = await supabaseAdmin
    .from('support_bot_conversations')
    .select('id, contact_name, contact_phone, contact_email, user_type, last_message_at, notified_at')
    .lte('last_message_at', cutoff);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // השוואת עמודה מול עמודה (notified_at מול last_message_at) לא נתמכת בפילטור של PostgREST -
  // לכן שולפים הכל עד ה-cutoff ומסננים כאן: רק מי שעדיין לא קיבל התראה על ההודעה האחרונה שלו
  const conversations = (allQuiet || []).filter(
    (c) => !c.notified_at || new Date(c.notified_at) < new Date(c.last_message_at)
  );

  let notified = 0;
  for (const conversation of conversations) {
    const { data: messages } = await supabaseAdmin
      .from('support_bot_messages')
      .select('role, content')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) continue;

    const summary = await summarizeConversation(messages as { role: 'user' | 'assistant'; content: string }[]);
    await sendSummaryEmail(conversation, summary);
    await supabaseAdmin.from('support_bot_conversations').update({ notified_at: new Date().toISOString(), summary }).eq('id', conversation.id);
    notified++;
  }

  return NextResponse.json({ ok: true, notified });
}
