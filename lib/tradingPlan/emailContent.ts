import { findOption, findOptions } from './questions';
import { personalizedNote } from './summary';

const SITE_URL = 'https://www.shirandimor.com';

interface PlanRow {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  trading_experience?: string | null;
  markets?: string[] | null;
  trading_style?: string | null;
  available_time?: string | null;
  trading_hours?: string | null;
  entry_tools?: string[] | null;
  stop_discipline?: string | null;
  risk_per_trade?: string | null;
  risk_per_trade_amount?: string | null;
  management_difficulty?: string[] | null;
  mental_difficulty?: string[] | null;
  main_fear?: string[] | null;
  main_goal?: string | null;
  trading_dream?: string | null;
  definition_of_success?: string | null;
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

function row(label: string, value: string) {
  if (!value || value === '—') return '';
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eee;">
        <div style="color:#888;font-size:11.5px;font-family:monospace;margin-bottom:3px;">${label}</div>
        <div style="color:#1a1a1a;font-size:14.5px;font-weight:500;line-height:1.6;">${value}</div>
      </td>
    </tr>`;
}

// המייל שנשלח למשתמש - מציג לו את התוכנית האישית שלו
export function buildUserPlanEmailHtml(r: PlanRow): string {
  const note = personalizedNote(r.main_goal);
  const riskLine = [
    labelSingle(r.stop_discipline, 'stop_discipline') !== '—' ? `מיקום סטופ ידוע: ${labelSingle(r.stop_discipline, 'stop_discipline')}` : '',
    labelSingle(r.risk_per_trade, 'risk_per_trade') !== '—' ? `סכום/אחוז סיכון קבוע: ${labelSingle(r.risk_per_trade, 'risk_per_trade')}${r.risk_per_trade_amount ? ` (${r.risk_per_trade_amount})` : ''}` : '',
  ].filter(Boolean).join(' · ');

  const challenge = labelsJoined(r.management_difficulty, 'management_difficulty') !== '—'
    ? labelsJoined(r.management_difficulty, 'management_difficulty')
    : labelsJoined(r.mental_difficulty, 'mental_difficulty');

  return `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">מסחר <span style="color:#4fc9c4;">אחראי</span> במניות</div>
        <div style="color:#fff;font-size:20px;font-weight:700;margin-top:14px;">התוכנית שלך ל-30 הימים הקרובים</div>
      </div>

      <div style="padding:24px;">
        <table width="100%" style="border-collapse:collapse;">
          ${row('אני מתמקד/ת ב', `${labelsJoined(r.markets, 'markets')} · ${labelSingle(r.trading_style, 'trading_style')}`)}
          ${row('זמן המסחר', `${labelSingle(r.available_time, 'available_time')} · ${labelSingle(r.trading_hours, 'trading_hours')}`)}
          ${row('ה-Setup / הכלים', labelsJoined(r.entry_tools, 'entry_tools'))}
          ${row('לפני כל כניסה בודקים', riskLine)}
          ${row('האתגר המרכזי', challenge)}
          ${row('המטרה לחודש הקרוב', labelSingle(r.main_goal, 'main_goal'))}
          ${row('סימן להצלחה', r.definition_of_success || '')}
          ${row('הכלל שמתחייבים לא להפר', r.personal_rule || '')}
        </table>

        ${note ? `<div style="background:#f6f3fc;border:1px solid #e2dcf5;border-radius:10px;padding:14px 16px;margin-top:16px;font-size:13.5px;color:#444;line-height:1.7;">${note}</div>` : ''}

        <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:18px;margin-top:20px;">
          <div style="font-weight:700;font-size:15px;margin-bottom:12px;">לפני כל עסקה עוצרים ובודקים:</div>
          ${CHECKLIST.map((c) => `<div style="font-size:13.5px;color:#444;padding:6px 0;border-bottom:1px solid #eee;">☐ ${c}</div>`).join('')}
        </div>

        <p style="font-size:13.5px;color:#555;line-height:1.7;margin-top:20px;text-align:center;">
          עכשיו יש תוכנית. החלק המאתגר באמת הוא לעבוד לפיה כשהשוק פתוח ויש כסף אמיתי על המסך :)
        </p>

        <a href="${SITE_URL}/subscribe" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-top:12px;">
          רוצה לראות איך זה עובד בקבוצת הסוחרים? ←
        </a>
      </div>
    </div>
  </div>`;
}

// המייל שנשלח לשירן - התראה על מתעניין/ת חדש/ה שהשלים/ה את השאלון
export function buildAdminNotifyEmailHtml(r: PlanRow): string {
  return `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:20px 24px;">
        <div style="color:#fff;font-size:16px;font-weight:700;">מתעניין/ת חדש/ה השלים/ה את "תוכנית המסחר ל-30 יום"</div>
      </div>
      <div style="padding:20px 24px;">
        <table width="100%" style="border-collapse:collapse;">
          ${row('שם', r.name || '—')}
          ${row('נייד', r.phone || '—')}
          ${row('אימייל', r.email || '—')}
          ${row('מקור', r.source || 'ישיר (בלי מקור מזוהה)')}
          ${row('ניסיון במסחר', labelSingle(r.trading_experience, 'trading_experience'))}
          ${row('שווקים', labelsJoined(r.markets, 'markets'))}
          ${row('המטרה המרכזית', labelSingle(r.main_goal, 'main_goal'))}
          ${row('הפחד המרכזי', labelsJoined(r.main_fear, 'main_fear'))}
          ${row('החלום ל-שנה קדימה', r.trading_dream || '')}
          ${row('סימן להצלחה', r.definition_of_success || '')}
          ${row('הכלל האישי', r.personal_rule || '')}
        </table>
      </div>
    </div>
  </div>`;
}
