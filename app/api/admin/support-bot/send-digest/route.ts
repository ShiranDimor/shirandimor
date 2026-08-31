import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/instantLogin';
import { summarizeConversation } from '@/lib/supportBot';

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;

  const { data: adminProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') return null;

  return user;
}

const USER_TYPE_LABELS: Record<string, string> = {
  admin_test: 'בדיקה פנימית (אדמין)',
  member_active: 'מנוי/ה פעיל/ה',
  updates_group: 'קבוצת עדכונים',
  lead_new: 'ליד חדש',
  unknown: 'לא ידוע',
};

// POST - שולח לשירן מייל אחד מרוכז עם כל השיחות עם דור (חוץ מבדיקות פנימיות שלה), כולל
// סיכום וקישור ישיר לכל שיחה - למקרה שרוצים לראות תמונה מלאה עכשיו, לא לחכות להתראה
// האוטומטית שנשלחת רק לשיחות חדשות שנרגעו
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'אין הרשאת ניהול' }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY לא מוגדר' }, { status: 500 });

  const { data: conversations, error } = await supabaseAdmin
    .from('support_bot_conversations')
    .select('id, contact_name, contact_phone, contact_email, user_type, summary')
    .neq('user_type', 'admin_test')
    .order('last_message_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'שגיאה בטעינת השיחות' }, { status: 500 });
  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ error: 'אין עדיין שיחות לשליחה' }, { status: 400 });
  }

  // משלימים סיכום לשיחות שעדיין אין להן אחד (למשל שיחות קצרות שהקרון עוד לא הספיק לעבד)
  const withSummary = await Promise.all(
    conversations.map(async (c) => {
      if (c.summary) return c;
      const { data: messages } = await supabaseAdmin
        .from('support_bot_messages')
        .select('role, content')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: true });

      if (!messages || messages.length < 2) return { ...c, summary: 'שיחה קצרה מדי לסיכום - נפתחה בלי הודעה ממשית.' };

      const summary = await summarizeConversation(messages as { role: 'user' | 'assistant'; content: string }[]).catch(() => 'שגיאה ביצירת סיכום.');
      await supabaseAdmin.from('support_bot_conversations').update({ summary }).eq('id', c.id);
      return { ...c, summary };
    })
  );

  const rows = withSummary
    .map((c) => {
      const contactLine = c.contact_phone || c.contact_email || 'אין פרטי קשר';
      const link = `https://www.shirandimor.com/admin/support-bot/conversations?open=${c.id}`;
      return `
        <div style="border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:14px;">
          <p style="font-size:13.5px;color:#555;margin:0 0 4px;"><b>${c.contact_name || 'ללא שם'}</b> · ${contactLine}</p>
          <p style="font-size:12.5px;color:#888;margin:0 0 12px;">${USER_TYPE_LABELS[c.user_type || 'unknown']}</p>
          <p style="font-size:14px;color:#222;line-height:1.7;white-space:pre-wrap;margin:0 0 14px;">${c.summary}</p>
          <a href="${link}" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:10px;border-radius:8px;font-size:13px;">לצפייה בשיחה ←</a>
        </div>`;
    })
    .join('');

  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;">
    <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
        <div style="background:#111318;padding:20px 24px;">
          <div style="color:#fff;font-size:16px;font-weight:700;">סיכום כל השיחות עם דור (${withSummary.length})</div>
        </div>
        <div style="padding:24px;">${rows}</div>
      </div>
    </div>
  </body></html>`;

  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'דור - העוזרת הדיגיטלית <noreply@shirandimor.com>',
      to: 'shiran@shirandimor.com',
      subject: `סיכום כל השיחות עם דור (${withSummary.length})`,
      html,
    }),
  });

  if (!sendRes.ok) {
    const text = await sendRes.text().catch(() => '');
    return NextResponse.json({ error: `שגיאה בשליחת המייל: ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: withSummary.length });
}
