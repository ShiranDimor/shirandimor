import { findOption, findOptions } from './questions';
import { classifyProfile } from './profile';
import { getProfileContent } from './profileContent';

const SITE_URL = 'https://www.shirandimor.com';

interface PlanRow {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  trading_experience?: string | null;
  markets?: string[] | null;
  trading_style?: string | null;
  trading_motivation?: string[] | null;
  self_talk?: string | null;
  money_fear?: string | null;
  available_time?: string | null;
  strategy_clarity?: string | null;
  entry_tools?: string[] | null;
  stop_discipline?: string | null;
  risk_per_trade?: string | null;
  risk_per_trade_amount?: string | null;
  daily_max_loss?: string | null;
  losing_trade_behavior?: string | null;
  winning_trade_behavior?: string | null;
  stop_me_from?: string[] | null;
  environment_influence?: string | null;
  progress_markers?: string[] | null;
  personal_rule?: string | null;
}

function labelsJoined(values: string[] | null | undefined, questionId: string): string {
  if (!values || !values.length) return '—';
  return findOptions(questionId, values).map((o) => o.label).join(', ');
}

function labelSingle(value: string | null | undefined, questionId: string): string {
  if (!value) return '—';
  return findOption(questionId, value)?.label || value;
}

const CHECKLIST = [
  'האם העסקה מתאימה לתוכנית?',
  'האם יש סיבה ברורה לכניסה?',
  'איפה הסטופ?',
  'כמה מסתכנים?',
  'האם יחס הסיכון מול הפוטנציאל הגיוני?',
  'איפה מתוכנן לקחת רווח?',
  'מה יגרום לא לקחת את העסקה?',
];

function section(label: string, html: string) {
  return `
    <div style="margin-bottom:20px;">
      <div style="font-size:14px;font-weight:700;color:#0f766e;margin-bottom:8px;">${label}</div>
      ${html}
    </div>`;
}

function listHtml(items: string[], bullet: string, color: string) {
  return items.map((i) => `<div style="font-size:13.5px;color:#444;line-height:1.6;padding-right:18px;position:relative;margin-bottom:6px;"><span style="position:absolute;right:0;color:${color};font-weight:700;">${bullet}</span>${i}</div>`).join('');
}

// המייל שנשלח למשתמש - האבחון האישי המלא, באותו פורמט כמו מסך התוצאה
export function buildUserPlanEmailHtml(r: PlanRow): string {
  const profileId = classifyProfile(r as Record<string, unknown>);
  const content = getProfileContent(profileId);
  const rule = r.personal_rule?.trim() ? r.personal_rule : content.defaultRule;

  return `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
        <div style="color:#9C8FD9;font-size:12px;margin-top:10px;">הפרופיל שלך</div>
        <div style="color:#fff;font-size:20px;font-weight:700;margin-top:4px;">${content.title}</div>
      </div>

      <div style="padding:24px;">
        ${section('מה אני מזהה אצלך', `<p style="font-size:14px;color:#222;line-height:1.7;margin:0;">${content.diagnosis(r as Record<string, unknown>)}</p>`)}
        ${section('מה כבר יש לך', listHtml(content.strengths(r as Record<string, unknown>), '✓', '#4FB876'))}
        ${section('מה כנראה מעכב אותך', listHtml(content.blockers, '•', '#9C8FD9'))}
        ${section('מה לא הייתי עושה בחודש הקרוב', listHtml(content.dontDo, '✗', '#C9635E'))}
        ${section('שלושת הדברים שהייתי עובד עליהם', content.threeThings.map((t, i) => `<div style="font-size:13.5px;color:#444;line-height:1.6;margin-bottom:6px;"><b>${i + 1}.</b> ${t}</div>`).join(''))}

        <div style="background:#f0fbfa;border:1px solid #cdeeeb;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
          <div style="font-size:10.5px;color:#888;text-transform:uppercase;margin-bottom:4px;">המשימה שלך ל-30 יום</div>
          <div style="font-size:14px;color:#0f172a;font-weight:600;">${content.mission}</div>
        </div>
        <div style="background:#f6f3fc;border:1px solid #e2dcf5;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
          <div style="font-size:10.5px;color:#888;text-transform:uppercase;margin-bottom:4px;">החוק שלך לחודש הקרוב</div>
          <div style="font-size:14px;color:#0f172a;font-weight:600;">${rule}</div>
        </div>

        <p style="font-size:13px;color:#666;line-height:1.7;text-align:center;font-style:italic;margin-bottom:20px;">${content.closingMessage}</p>

        <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="font-weight:700;font-size:15px;margin-bottom:12px;">לפני כל עסקה עוצרים ובודקים:</div>
          ${CHECKLIST.map((c) => `<div style="font-size:13.5px;color:#444;padding:6px 0;border-bottom:1px solid #eee;">☐ ${c}</div>`).join('')}
        </div>

        <a href="${SITE_URL}/subscribe" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;">
          רוצה לראות איך זה עובד בקבוצת הסוחרים? ←
        </a>
      </div>
    </div>
  </div>`;
}

// המייל שנשלח לשירן - התראה על מתעניין/ת חדש/ה עם הפרופיל והתשובות המרכזיות
export function buildAdminNotifyEmailHtml(r: PlanRow): string {
  const profileId = classifyProfile(r as Record<string, unknown>);
  const content = getProfileContent(profileId);

  const row = (label: string, value: string) => {
    if (!value || value === '—') return '';
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;"><div style="color:#888;font-size:11px;">${label}</div><div style="color:#1a1a1a;font-size:14px;font-weight:500;">${value}</div></td></tr>`;
  };

  return `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:20px 24px;">
        <div style="color:#fff;font-size:16px;font-weight:700;">מתעניין/ת חדש/ה - תוכנית מסחר 30 יום</div>
        <div style="color:#4fc9c4;font-size:13px;margin-top:4px;">פרופיל: ${content.title}</div>
      </div>
      <div style="padding:20px 24px;">
        <table width="100%" style="border-collapse:collapse;">
          ${row('שם', r.name || '—')}
          ${row('נייד', r.phone || '—')}
          ${row('אימייל', r.email || '—')}
          ${row('מקור', r.source || 'ישיר')}
          ${row('איפה נמצא/ת מול מסחר', labelSingle(r.trading_experience, 'trading_experience'))}
          ${row('שווקים', labelsJoined(r.markets, 'markets'))}
          ${row('מה רוצה מהמסחר', labelsJoined(r.trading_motivation, 'trading_motivation'))}
          ${row('משפט מוכר לעצמו', labelSingle(r.self_talk, 'self_talk'))}
          ${row('מה מטריד בקשר לכסף', labelSingle(r.money_fear, 'money_fear'))}
          ${row('מה קורה בהפסד', labelSingle(r.losing_trade_behavior, 'losing_trade_behavior'))}
          ${row('מה קורה ברווח', labelSingle(r.winning_trade_behavior, 'winning_trade_behavior'))}
          ${row('הסביבה', labelSingle(r.environment_influence, 'environment_influence'))}
          ${row('מה ירגיש כהתקדמות', labelsJoined(r.progress_markers, 'progress_markers'))}
          ${row('הכלל האישי', r.personal_rule || '—')}
        </table>
      </div>
    </div>
  </div>`;
}
