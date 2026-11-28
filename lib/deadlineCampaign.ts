import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/instantLogin';
import { entitlementOrFilter } from '@/lib/entitlement';
import { normalizePhone, normalizeEmail, sendPushToNonSubscribers } from '@/lib/webPush';

// רצף "חודש ראשון ב-₪1 עד 31.12" למי שנרשם/ה באתר (התראות / חשבון) ועדיין לא מנוי/ה.
// סיסטמטי אבל לא מציק: 6 התראות פוש בכל דצמבר (בערך פעם בשבוע ואז היומיים האחרונים),
// ומתוכן רק 3 גם במייל. נעצר מעצמו למי שהצטרף/ה (לא מנוי = לא מקבל/ת), לא נשלח למי שכבר
// מימש/ה את ה-₪1, לאנשי קשר חסומים (blocked_contacts) או למי שביקש/ה להסיר מהמייל.
// בלי וואטסאפ ובלי הנייד של שירן. נקרא כל שעה דרך pg_cron (/api/cron/deadline-campaign).

const SITE = 'https://www.shirandimor.com';

type Step = { id: string; at: string; title: string; body: string; email?: { subject: string; paragraphs: string[]; cta: string } };

export const DEADLINE_STEPS: Step[] = [
  {
    id: 'd1',
    at: '2026-12-02T19:30:00+02:00',
    title: 'רוצים להבין איך מתחילים?',
    body: 'לפני שמשלמים אלפי שקלים, אפשר לראות איך זה נראה באמת: עסקאות בזמן אמת, סטופ, וגם ההפסדים. חודש ראשון ב-₪1, עד 31.12.',
    email: {
      subject: 'לפני שמשלמים אלפי שקלים',
      paragraphs: [
        'רובנו לא צריכים עוד קורס של אלפי שקלים. אנחנו רק רוצים להבין איך זה נראה באמת, לפני שמחליטים.',
        'בקהילה "מדברים עסקאות" אני מראה את העסקאות שלי בזמן אמת: איפה נכנסתי, איפה הסטופ, ולמה. כולל ההפסדים.',
        'עד 31.12 החודש הראשון הוא ב-₪1. אחר כך ₪400 לחודש, ואפשר לבטל מתי שרוצים בהודעה אחת.',
      ],
      cta: 'להתחיל בחודש ב-₪1',
    },
  },
  {
    id: 'd2',
    at: '2026-12-10T19:30:00+02:00',
    title: 'ככה נראה מסחר בלי פילטרים',
    body: 'בקהילה רואים כל עסקה שלי: איפה נכנסתי, איפה הסטופ ולמה. גם כשזה לא עובד. חודש ראשון ב-₪1 עד 31.12.',
  },
  {
    id: 'd3',
    at: '2026-12-17T19:30:00+02:00',
    title: 'עוד שבועיים ההטבה נגמרת',
    body: 'החודש הראשון ב-₪1 בתוקף עד 31.12. מספיק זמן לראות כמה עסקאות אמיתיות ולהחליט בלי לחץ.',
    email: {
      subject: 'עוד שבועיים: חודש ראשון ב-₪1',
      paragraphs: [
        'רק תזכורת קצרה: ההטבה של חודש ראשון ב-₪1 בקהילה "מדברים עסקאות" נגמרת ב-31.12.',
        'מה יש שם: עסקאות בזמן אמת עם כניסה, סטופ והסבר, לייבים שבועיים וספריית שיעורים.',
        'בלי התחייבות. רואים איך זה נראה, ורק אז מחליטים.',
      ],
      cta: 'לפרטים ולהצטרפות',
    },
  },
  {
    id: 'd4',
    at: '2026-12-24T19:30:00+02:00',
    title: 'שבוע אחרון לחודש ב-₪1',
    body: 'עד 31.12 החודש הראשון בקהילה הוא ב-₪1. אחרי זה המחיר הרגיל.',
  },
  {
    id: 'd5',
    at: '2026-12-30T19:30:00+02:00',
    title: 'מחר ההטבה נגמרת',
    body: 'חודש ראשון ב-₪1 בתוקף עד מחר, 31.12. אם חשבת על זה, זה הזמן.',
    email: {
      subject: 'מחר זה נגמר: חודש ראשון ב-₪1',
      paragraphs: [
        'מחר, 31.12, ההטבה של חודש ראשון ב-₪1 נגמרת.',
        'אם רצית לראות איך נראה מסחר אחראי מבפנים, עם עסקאות אמיתיות ובלי הבטחות, זה הזמן.',
        'אחרי החודש הראשון ₪400 לחודש, ואפשר לבטל מתי שרוצים.',
      ],
      cta: 'להצטרף ב-₪1',
    },
  },
  {
    id: 'd6',
    at: '2026-12-31T12:00:00+02:00',
    title: 'היום יום אחרון ב-₪1',
    body: 'ההטבה של חודש ראשון ב-₪1 נגמרת הלילה.',
  },
];

function optoutToken(email: string) {
  return crypto.createHmac('sha256', process.env.PG_CRON_SECRET || 'x').update(normalizeEmail(email)).digest('hex').slice(0, 24);
}
export function verifyOptout(email: string, token: string) {
  return !!email && token === optoutToken(email);
}

function emailHtml(step: Step, email: string, firstName: string) {
  const e = step.email!;
  const link = `${SITE}/subscribe?src=deadline_email_${step.id}`;
  const unsub = `${SITE}/api/email-optout?e=${encodeURIComponent(email)}&t=${optoutToken(email)}`;
  const paras = e.paragraphs.map((p) => `<p style="font-size:15px;color:#F2EFF1;line-height:1.75;margin:0 0 14px;">${p}</p>`).join('');
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:0;">
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#121013; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#211F23;border-radius:14px;overflow:hidden;border:1px solid #332E35;">
      <div style="background:#17151A;padding:22px;text-align:center;">
        <img src="${SITE}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #FF2D78;margin-bottom:10px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#FF2D78;">אחראי</span> במניות</div>
      </div>
      <div style="padding:24px;">
        <p style="font-size:15px;color:#F2EFF1;line-height:1.75;margin:0 0 14px;">היי${firstName ? ` ${firstName}` : ''},</p>
        ${paras}
        <a href="${link}" style="display:block;text-align:center;background:linear-gradient(90deg,#FF2D78,#FFB648);color:#1A181C;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin:20px 0 14px;">${e.cta} ←</a>
        <p style="font-size:15px;color:#F2EFF1;line-height:1.75;margin:0;">שירן</p>
        <p style="font-size:12px;color:#8A8389;line-height:1.6;margin:22px 0 0;">זו לא המלצה להשקעה. קיבלת את המייל כי נרשמת באתר shirandimor.com. <a href="${unsub}" style="color:#8A8389;">להסרה מרשימת התפוצה</a></p>
      </div>
    </div>
  </div></body></html>`;
}

async function exclusions() {
  const { data: blocked } = await supabaseAdmin.from('blocked_contacts').select('phone_normalized');
  const blockedPhones = new Set((blocked || []).map((b) => normalizePhone(b.phone_normalized)).filter(Boolean));
  const { data: usedTrial } = await supabaseAdmin.from('profiles').select('id, phone, email').eq('trial_price_used', true);
  const usedIds = new Set((usedTrial || []).map((p) => p.id));
  const usedPhones = new Set((usedTrial || []).map((p) => normalizePhone(p.phone)).filter(Boolean));
  const { data: optouts } = await supabaseAdmin.from('email_optouts').select('email');
  const optedOut = new Set((optouts || []).map((o) => normalizeEmail(o.email)));
  return { blockedPhones, usedIds, usedPhones, optedOut };
}

async function recipientsForEmail(ex: Awaited<ReturnType<typeof exclusions>>) {
  const { data: subs } = await supabaseAdmin.from('profiles').select('id').or(entitlementOrFilter());
  const subIds = new Set((subs || []).map((s) => s.id));
  const { data: profs } = await supabaseAdmin.from('profiles').select('id, email, phone, full_name');
  const { data: push } = await supabaseAdmin.from('push_subscriptions').select('user_id, email, phone, name').is('invalid_at', null);
  const out = new Map<string, string>(); // email -> first name
  const add = (email: string | null, phone: string | null, name: string | null, userId: string | null) => {
    const e = normalizeEmail(email);
    if (!e || !e.includes('@')) return;
    if (userId && (subIds.has(userId) || ex.usedIds.has(userId))) return;
    const ph = normalizePhone(phone);
    if (ph && (ex.blockedPhones.has(ph) || ex.usedPhones.has(ph))) return;
    if (ex.optedOut.has(e)) return;
    if (!out.has(e)) out.set(e, (name || '').trim().split(' ')[0] || '');
  };
  for (const p of profs || []) add(p.email, p.phone, p.full_name, p.id);
  for (const p of push || []) add(p.email, p.phone, p.name, p.user_id);
  // מייל של מנוי/ה שנרשם/ה גם כליד בלי חשבון - להוריד
  const { data: subEmails } = await supabaseAdmin.from('profiles').select('email').or(entitlementOrFilter());
  for (const s of subEmails || []) out.delete(normalizeEmail(s.email));
  return out;
}

export async function runDeadlineCampaign(opts: { now?: Date; dryRun?: boolean } = {}) {
  const now = opts.now || new Date();
  const due = DEADLINE_STEPS.filter((s) => {
    const t = new Date(s.at).getTime();
    return now.getTime() >= t && now.getTime() < t + 3 * 3600 * 1000;
  });
  const results: Record<string, unknown>[] = [];
  if (!due.length) return { due: 0, results };
  const ex = await exclusions();
  for (const step of due) {
    const { data: prev } = await supabaseAdmin.from('notification_log').select('id').eq('title', step.title).gte('created_at', new Date(new Date(step.at).getTime() - 3600 * 1000).toISOString()).limit(1);
    if (prev?.length) { results.push({ step: step.id, skipped: 'already sent' }); continue; }
    const emails = step.email ? await recipientsForEmail(ex) : new Map<string, string>();
    if (opts.dryRun) { results.push({ step: step.id, emails: emails.size }); continue; }
    const push = await sendPushToNonSubscribers(
      { title: step.title, body: step.body, url: `/subscribe?src=deadline_push_${step.id}` },
      'announcement',
      undefined,
      (r) => (!!r.user_id && ex.usedIds.has(r.user_id)) || ex.blockedPhones.has(normalizePhone(r.phone)) || ex.usedPhones.has(normalizePhone(r.phone))
    );
    let sentEmails = 0;
    const apiKey = process.env.RESEND_API_KEY;
    if (step.email && apiKey) {
      for (const [email, first] of emails) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              from: 'שירן דימור - מסחר אחראי במניות <noreply@shirandimor.com>',
              to: email,
              subject: step.email.subject,
              html: emailHtml(step, email, first),
              text: `${first ? `היי ${first},\n\n` : ''}${step.email.paragraphs.join('\n\n')}\n\n${SITE}/subscribe?src=deadline_email_${step.id}\n\nשירן`,
              headers: { 'List-Unsubscribe': `<${SITE}/api/email-optout?e=${encodeURIComponent(email)}&t=${optoutToken(email)}>` },
            }),
          });
          if (res.ok) sentEmails++;
        } catch { /* ממשיכים לבא בתור */ }
      }
    }
    results.push({ step: step.id, push, emails: sentEmails });
  }
  return { due: due.length, results };
}
