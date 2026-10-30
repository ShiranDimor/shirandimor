import { supabaseAdmin } from '@/lib/instantLogin';

const SITE_URL = 'https://www.shirandimor.com';

function wrapEmail(bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /></head><body style="margin:0;padding:0;">${bodyHtml}</body></html>`;
}

function buildReminderEmail(firstName: string) {
  const subject = 'התראות במקום וואטסאפ - 2 דקות הגדרה';
  const text = `היי${firstName ? ` ${firstName}` : ''},\n\nעכשיו אפשר לקבל התראות ישירות מהאתר במקום להמתין להודעות בוואטסאפ - עסקה חדשה, סטופ לוס, עסקה שנסגרה.\n\nבאנדרואיד: נכנסים ל-${SITE_URL}/portfolio ולוחצים "הפעלת התראות פוש".\nבאייפון: קודם צריך להוסיף את האתר למסך הבית (כפתור השיתוף בספארי ← הוספה למסך הבית), ואז לפתוח משם וללחוץ על אותו כפתור.\n\nלתיק: ${SITE_URL}/portfolio`;

  const html = wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
        <div style="color:#9C8FD9;font-size:14px;margin-top:10px;">🔔 התראות במקום וואטסאפ</div>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#222;line-height:1.7;">היי${firstName ? ` ${firstName}` : ''},</p>
        <p style="font-size:14px;color:#222;line-height:1.7;">עכשיו אפשר לקבל התראות ישירות מהאתר במקום להמתין להודעות בוואטסאפ - עסקה חדשה, סטופ לוס שהופעל, עסקה שנסגרה. לוקח שתי דקות להפעיל:</p>
        <div style="background:#f0fbfa;border:1px solid #cdeeeb;border-radius:10px;padding:14px 16px;margin:16px 0;">
          <div style="font-size:13px;color:#0f172a;font-weight:700;margin-bottom:4px;">באנדרואיד</div>
          <div style="font-size:13.5px;color:#444;line-height:1.6;">נכנסים לתיק ולוחצים &quot;הפעלת התראות פוש&quot; - זהו.</div>
        </div>
        <div style="background:#f6f3fc;border:1px solid #e2dcf5;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
          <div style="font-size:13px;color:#0f172a;font-weight:700;margin-bottom:4px;">באייפון</div>
          <div style="font-size:13.5px;color:#444;line-height:1.6;">קודם מוסיפים את האתר למסך הבית (שיתוף ← הוספה למסך הבית בספארי), ואז פותחים משם ולוחצים על הכפתור.</div>
        </div>
        <a href="${SITE_URL}/portfolio" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;">לתיק והפעלת התראות ←</a>
      </div>
    </div>
  </div>`);

  return { subject, text, html };
}

// שולח תזכורת מייל להפעלת התראות פוש לכל מנוי פעיל שעדיין אין לו שום מכשיר רשום ב-
// push_subscriptions - כלומר מי שלא לחץ מעולם על "הפעלת התראות". לא שולח שוב למי שכבר יש לו
// מינוי אחד לפחות, גם אם בוטל אח"כ במכשיר מסוים (יש לו עדיין מכשיר אחר פעיל)
export async function sendPushEnableReminders(): Promise<{ sent: number; skipped: number }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY לא מוגדר');

  const { data: subscribers } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name')
    .or('role.eq.admin,and(role.eq.subscriber,subscription_status.eq.active)');

  if (!subscribers || subscribers.length === 0) return { sent: 0, skipped: 0 };

  const { data: existingSubs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id')
    .in('user_id', subscribers.map((s) => s.id));

  const alreadyEnabledIds = new Set((existingSubs || []).map((s) => s.user_id).filter(Boolean));
  const toRemind = subscribers.filter((s) => s.email && !alreadyEnabledIds.has(s.id));

  let sent = 0;
  await Promise.allSettled(
    toRemind.map(async (s) => {
      const firstName = (s.full_name || '').trim().split(' ')[0] || '';
      const { subject, text, html } = buildReminderEmail(firstName);
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from: 'שירן דימור - מסחר אחראי במניות <noreply@shirandimor.com>', to: s.email, subject, text, html }),
        });
        if (res.ok) sent++;
        else console.error(`שגיאה בשליחת תזכורת התראות ל-${s.email}`, await res.text());
      } catch (e) {
        console.error(`שגיאה בשליחת תזכורת התראות ל-${s.email}`, e);
      }
    })
  );

  return { sent, skipped: subscribers.length - toRemind.length };
}
