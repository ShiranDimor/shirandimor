import { findOption, findOptions } from './questions';
import { classifyProfile } from './profile';
import { getProfileContent } from './profileContent';

const SITE_URL = 'https://www.shirandimor.com';

interface PlanRow {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  trading_experience?: string | null;
  markets?: string[] | null;
  trading_style?: string | null;
  trading_motivation?: string[] | null;
  self_talk?: string[] | null;
  money_fear?: string[] | null;
  available_time?: string | null;
  strategy_clarity?: string | null;
  entry_tools?: string[] | null;
  stop_discipline?: string | null;
  risk_per_trade?: string | null;
  risk_per_trade_amount?: string | null;
  daily_max_loss?: string | null;
  losing_trade_behavior?: string[] | null;
  winning_trade_behavior?: string[] | null;
  stop_me_from?: string[] | null;
  environment_influence?: string | null;
  progress_markers?: string[] | null;
  week_one_win?: string[] | null;
  personal_rule?: string | null;
}

interface FollowupRow extends PlanRow {
  id: string;
  completed_at?: string | null;
}

interface AbandonedRow {
  id: string;
  name?: string | null;
}

interface ProgressReminderRow {
  id: string;
  name?: string | null;
  trading_motivation?: string[] | null;
  money_fear?: string[] | null;
  self_talk?: string[] | null;
}

function firstLabel(values: string[] | null | undefined, questionId: string): string | null {
  if (!values || !values.length) return null;
  return findOptions(questionId, values)[0]?.label || null;
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

// עוטף כל מייל במסמך HTML מלא עם color-scheme "light only" - בלי זה חלק מלקוחות המייל (בעיקר Gmail)
// מפעילים בעצמם מצב כהה אוטומטי על HTML גולמי, והופכים רקעים בהירים לכהים בלי לגעת בטקסט הכהה
// שנועד לרקע הבהיר המקורי - וכך נוצר טקסט כהה על רקע כהה שאי אפשר לקרוא
function wrapEmail(bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" /></head><body style="margin:0;padding:0;">${bodyHtml}</body></html>`;
}

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

  return wrapEmail(`
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
        ${r.week_one_win && r.week_one_win.length ? section('בעוד שבוע בדיוק, ככה אפשר לדעת שההתחלה הייתה נכונה', listHtml(findOptions('week_one_win', r.week_one_win).map((o) => o.label), '★', '#4fc9c4')) : ''}
        ${section('השבוע הראשון שלך: 3 דברים להתחיל איתם', content.threeThings.map((t, i) => `<div style="font-size:13.5px;color:#444;line-height:1.6;margin-bottom:6px;"><b>${i + 1}.</b> ${t}</div>`).join(''))}

        <div style="background:#f0fbfa;border:1px solid #cdeeeb;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
          <div style="font-size:10.5px;color:#888;text-transform:uppercase;margin-bottom:4px;">המשימה שלך ל-30 יום</div>
          <div style="font-size:14px;color:#0f172a;font-weight:600;">${content.mission}</div>
        </div>
        <div style="background:#f6f3fc;border:1px solid #e2dcf5;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
          <div style="font-size:10.5px;color:#888;text-transform:uppercase;margin-bottom:4px;">החוק שלך לחודש הקרוב</div>
          <div style="font-size:14px;color:#0f172a;font-weight:600;">${rule}</div>
        </div>

        ${r.id ? `<a href="${SITE_URL}/my-plan/${r.id}" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-bottom:20px;">למעקב היומי שלי - האם עמדתי בכלל שלי ←</a>` : ''}

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
  </div>`);
}

// המייל שנשלח לשירן - התראה על התעניינות חדשה עם הפרופיל והתשובות המרכזיות
export function buildAdminNotifyEmailHtml(r: PlanRow): string {
  const profileId = classifyProfile(r as Record<string, unknown>);
  const content = getProfileContent(profileId);

  const row = (label: string, value: string) => {
    if (!value || value === '—') return '';
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;"><div style="color:#888;font-size:11px;">${label}</div><div style="color:#1a1a1a;font-size:14px;font-weight:500;">${value}</div></td></tr>`;
  };

  return wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:20px 24px;">
        <div style="color:#fff;font-size:16px;font-weight:700;">התעניינות חדשה - תוכנית מסחר 30 יום</div>
        <div style="color:#4fc9c4;font-size:13px;margin-top:4px;">פרופיל: ${content.title}</div>
      </div>
      <div style="padding:20px 24px;">
        <div style="background:#fff7ed;border:1px solid #fde3b8;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:11px;color:#92620c;text-transform:uppercase;margin-bottom:6px;font-weight:700;">לתזכורת - בעוד שבוע, לשאול על:</div>
          ${r.week_one_win && r.week_one_win.length ? listHtml(findOptions('week_one_win', r.week_one_win).map((o) => o.label), '★', '#b8860b') : '<div style="font-size:13px;color:#999;">לא נבחר</div>'}
          <div style="font-size:11px;color:#92620c;text-transform:uppercase;margin:12px 0 6px;font-weight:700;">3 ההתחייבויות לשבוע הראשון:</div>
          ${content.threeThings.map((t, i) => `<div style="font-size:13px;color:#444;line-height:1.6;margin-bottom:4px;"><b>${i + 1}.</b> ${t}</div>`).join('')}
        </div>
        <table width="100%" style="border-collapse:collapse;">
          ${row('שם', r.name || '—')}
          ${row('נייד', r.phone || '—')}
          ${row('אימייל', r.email || '—')}
          ${row('מקור', r.source || 'ישיר')}
          ${row('איפה עומדים מול מסחר', labelSingle(r.trading_experience, 'trading_experience'))}
          ${row('שווקים', labelsJoined(r.markets, 'markets'))}
          ${row('מה רוצה מהמסחר', labelsJoined(r.trading_motivation, 'trading_motivation'))}
          ${row('משפט מוכר לעצמו', labelsJoined(r.self_talk, 'self_talk'))}
          ${row('מה מטריד בקשר לכסף', labelsJoined(r.money_fear, 'money_fear'))}
          ${row('מה קורה בהפסד', labelsJoined(r.losing_trade_behavior, 'losing_trade_behavior'))}
          ${row('מה קורה ברווח', labelsJoined(r.winning_trade_behavior, 'winning_trade_behavior'))}
          ${row('הסביבה', labelSingle(r.environment_influence, 'environment_influence'))}
          ${row('מה ירגיש כהתקדמות', labelsJoined(r.progress_markers, 'progress_markers'))}
          ${row('הכלל האישי', r.personal_rule || '—')}
        </table>
      </div>
    </div>
  </div>`);
}

// המייל האוטומטי שנשלח ישירות למי שמילא את השאלון, בדיוק שבוע אחרי - פנייה אישית בשם שירן
export function buildFollowupUserEmailHtml(r: FollowupRow): string {
  const content = getProfileContent(classifyProfile(r as unknown as Record<string, unknown>));
  const weekOneWin = labelsJoined(r.week_one_win, 'week_one_win');
  const rule = r.personal_rule?.trim() ? r.personal_rule : content.defaultRule;
  const firstName = (r.name || '').trim().split(' ')[0] || '';

  return wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">עבר בדיוק שבוע... אז איך הולך?</div>
      </div>

      <div style="padding:24px;">
        <p style="font-size:14px;color:#222;line-height:1.7;">היי${firstName ? ` ${firstName}` : ''},</p>
        <p style="font-size:14px;color:#222;line-height:1.7;">לפני שבוע נבנתה כאן תוכנית מסחר אישית. רציתי לבדוק מה קורה מאז.</p>

        ${weekOneWin !== '—' ? `
        <div style="background:#f0fbfa;border:1px solid #cdeeeb;border-radius:10px;padding:14px 16px;margin:16px 0;">
          <div style="font-size:10.5px;color:#888;text-transform:uppercase;margin-bottom:4px;">זה מה שנרשם כאן כסימן שההתחלה הייתה נכונה</div>
          <div style="font-size:14px;color:#0f172a;font-weight:600;">${weekOneWin}</div>
        </div>` : ''}

        <div style="background:#f6f3fc;border:1px solid #e2dcf5;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:10.5px;color:#888;text-transform:uppercase;margin-bottom:4px;">והכלל שנקבע</div>
          <div style="font-size:14px;color:#0f172a;font-weight:600;">${rule}</div>
        </div>

        <p style="font-size:14px;color:#222;line-height:1.7;">אז - איך הלך? הכלל נשמר? היה קשה? השתנה משהו בדרך?</p>
        <p style="font-size:14px;color:#222;line-height:1.7;">אשמח לשמוע - פשוט תשיבו למייל הזה, או תכתבו לי בוואטסאפ.</p>

        <a href="https://wa.me/972547167419" style="display:block;text-align:center;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-top:20px;">
          זמינה בשבילך בוואטסאפ ←
        </a>
      </div>
    </div>
  </div>`);
}

// המייל היומי המרוכז לשירן - כל מי שמילא את השאלון לפני שבוע בדיוק, כדי לפנות בפולואפ
export function buildFollowupDigestEmailHtml(rows: FollowupRow[]): string {
  const cards = rows.map((r) => {
    const content = getProfileContent(classifyProfile(r as unknown as Record<string, unknown>));
    const weekOneWin = labelsJoined(r.week_one_win, 'week_one_win');
    const waLink = r.phone ? `https://wa.me/972${r.phone.replace(/\D/g, '').replace(/^0/, '')}` : null;

    return `
      <div style="border:1px solid #eee;border-radius:12px;padding:16px 18px;margin-bottom:14px;">
        <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px;">${r.name || 'ללא שם'}</div>
        <div style="font-size:12px;color:#888;margin-bottom:10px;">${r.phone || '—'} · ${r.email || '—'} · פרופיל: ${content.title}</div>
        ${weekOneWin !== '—' ? `<div style="font-size:13px;color:#0f766e;margin-bottom:8px;"><b>איך ידעו שהתחילו נכון:</b> ${weekOneWin}</div>` : ''}
        <div style="font-size:13px;color:#444;margin-bottom:8px;"><b>הכלל האישי:</b> ${r.personal_rule || content.defaultRule}</div>
        <div style="font-size:12.5px;color:#666;">
          <b>3 ההתחייבויות לשבוע הראשון:</b>
          ${content.threeThings.map((t) => `<div style="margin-top:2px;">• ${t}</div>`).join('')}
        </div>
        ${waLink ? `<a href="${waLink}" style="display:inline-block;margin-top:12px;background:#25D366;color:#fff;text-decoration:none;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:8px;">שליחת הודעה בוואטסאפ ←</a>` : ''}
      </div>`;
  }).join('');

  return wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:20px 24px;">
        <div style="color:#fff;font-size:16px;font-weight:700;">תזכורת פולואפ - ${rows.length} ${rows.length === 1 ? 'אדם שמילא' : 'אנשים שמילאו'} תוכנית מסחר לפני שבוע</div>
      </div>
      <div style="padding:20px 24px;">
        ${cards}
      </div>
    </div>
  </div>`);
}

// המייל האוטומטי שנשלח למי שהתחיל למלא את "תוכנית המסחר" ולא סיים - עם לינק להמשך בדיוק מהנקודה שנעצר בה
// reminderNumber 1 = תזכורת ראשונה (יום אחרי הנטישה), 2 = תזכורת אחרונה (יום אחרי התזכורת הראשונה, ואז מפסיקים)
export function buildAbandonedEmailHtml(r: AbandonedRow, reminderNumber: 1 | 2 = 1): string {
  const firstName = (r.name || '').trim().split(' ')[0] || '';
  const resumeLink = `${SITE_URL}/trading-plan?resume=${r.id}`;
  const isLast = reminderNumber === 2;

  return wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">${isLast ? 'תזכורת אחרונה - התוכנית שלך מחכה לך' : 'התוכנית שלך מחכה לך'}</div>
      </div>

      <div style="padding:24px;">
        <p style="font-size:14px;color:#222;line-height:1.7;">היי${firstName ? ` ${firstName}` : ''},</p>
        ${isLast ? `
        <p style="font-size:14px;color:#222;line-height:1.7;">זו התזכורת האחרונה שלי - עדיין לא השלמת את התוכנית האישית שלך למסחר. לא אמשיך להזכיר, אבל ממש חבל לוותר כשנשארו רק כמה דקות עד הסוף.</p>
        ` : `
        <p style="font-size:14px;color:#222;line-height:1.7;">שמנו לב שהתחלת לבנות את התוכנית האישית שלך למסחר, ולא הספקת לסיים. חבל - היא כבר כמעט מוכנה 😊</p>
        `}
        <p style="font-size:14px;color:#222;line-height:1.7;">${isLast ? 'התהליך כבר כמעט גמור - נשארו רק כמה דקות כדי לסיים אותו:' : 'אפשר לחזור בדיוק מהנקודה שבה עצרת, זה לוקח רק כמה דקות:'}</p>

        <a href="${resumeLink}" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-top:16px;">
          המשך בניית התוכנית שלי ←
        </a>

        ${isLast ? `
        <p style="font-size:13.5px;color:#444;line-height:1.7;margin-top:24px;">כבר הושקעו כמה דקות יקרות בהתחלת הדרך - ממש חבל שזה יישאר תקוע ככה, בלי סיום.</p>
        <p style="font-size:13.5px;color:#444;line-height:1.7;">ואם בכל זאת תרצו לדלג ישר לשלב הבא, ולא רק לעקוב מהצד - קבוצת הסוחרים תמיד פתוחה:</p>
        ` : `
        <p style="font-size:13.5px;color:#444;line-height:1.7;margin-top:24px;">להישאר רק בקבוצת העדכונים ולקרוא על שוק ההון זה נחמד להתחלה - אבל מתישהו כדאי לעבור לשלב הבא, ולבנות תוכנית אמיתית שעובדים לפיה.</p>
        <p style="font-size:13.5px;color:#444;line-height:1.7;">זה הרבה יותר פשוט ממה שזה נראה: כמה דקות כל כמה ימים, לא יותר. עם קצת עקביות, התיק יכול להיראות אחרי כמה חודשים לגמרי אחרת.</p>
        `}

        <a href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA" style="display:block;text-align:center;background:transparent;color:#0f766e;text-decoration:none;font-weight:700;padding:12px;border-radius:10px;border:2px solid #4fc9c4;margin-top:10px;">
          הצטרפות לקבוצת הסוחרים ←
        </a>

        <p style="font-size:12.5px;color:#888;line-height:1.7;margin-top:20px;margin-bottom:8px;text-align:center;">אם יש שאלה בדרך - אפשר תמיד לכתוב לי בוואטסאפ:</p>
        <a href="https://wa.me/972547167419" style="display:block;text-align:center;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:11px;border-radius:10px;">
          זמינה בשבילך בוואטסאפ ←
        </a>
      </div>
    </div>
  </div>`);
}

// כל שורה כאן היא זווית שיווקית מלאה: מוכרים חלום, נוגעים בפחד הספציפי שהאדם עצמו כתב, ומזמינים
// לפעולה מיידית ואימפולסיבית - לא רק "עוד מייל תזכורת". מתחלף בין שליחות כדי שלא ירגיש כמו תבנית קבועה.
function buildGroupPitch(dream: string | null, fear: string | null): string {
  const pitches: string[] = [];

  if (dream) {
    pitches.push(`לדמיין לרגע שזה כבר קרה: ${dream}. זה בדיוק הכיוון שנקבע כאן באופן אישי - והקבוצה קיימת בשביל לקצר את הדרך לשם, לא ללכת אותה לבד.`);
  }
  if (fear) {
    pitches.push(`זה בדיוק מה שסומן כאן כהכי מטריד: "${fear}". זה בדיוק למה שווה להיות בסביבה שבה אפשר לשאול בזמן אמת, במקום להישאר עם זה לבד.`);
  }
  pitches.push('מי שכבר בקבוצה חוזרים על דבר אחד בעקביות: הרגע שהכי מתחרטים עליו הוא לא ההצטרפות - הוא כל החודש שחיכו לפני.');
  pitches.push('אין כאן הבטחות גדולות - יש תהליך, ואנשים שכבר עברו בדיוק את השלב הזה עכשיו. שווה להציץ, גם רק כדי לראות.');

  return pitches[Math.floor(Math.random() * pitches.length)];
}

// המייל שמזכיר לחזור לעמוד "המעקב האישי" ולסמן אם עמדו בכלל היום - נשלח פעמיים בשבוע (שני וחמישי, לא כל יום),
// רק ב-30 הימים שאחרי ההשלמה. הפנייה משתמשת בחלום ובפחד שהאדם עצמו כתב בשאלון - לא מסר גנרי -
// כי בסוף אנשים קונים חלום, מתוך רגש ואינטואיציה, לא מתוך טבלת השוואה.
export function buildDailyProgressReminderEmailHtml(r: ProgressReminderRow, isSubscriber = false): string {
  const firstName = (r.name || '').trim().split(' ')[0] || '';
  const link = `${SITE_URL}/my-plan/${r.id}`;
  const dream = firstLabel(r.trading_motivation, 'trading_motivation');
  const fear = firstLabel(r.money_fear, 'money_fear') || firstLabel(r.self_talk, 'self_talk');
  const pitch = buildGroupPitch(dream, fear);

  return wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:24px;text-align:center;">
        <img src="${SITE_URL}/shiran-photo.jpg" width="56" height="56" alt="שירן דימור" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #4fc9c4;margin-bottom:12px;" />
        <div style="color:#fff;font-size:18px;font-weight:700;">בוקר טוב${firstName ? `, ${firstName}` : ''} ☀️</div>
      </div>

      <div style="padding:24px;">
        <p style="font-size:14px;color:#222;line-height:1.7;">שאלה קצרה: הכלל האישי נשמר היום?</p>
        <p style="font-size:14px;color:#222;line-height:1.7;">לחיצה אחת ואפשר לסמן, ולראות את הרצף שלך.</p>

        <a href="${link}" style="display:block;text-align:center;background:#4fc9c4;color:#08131a;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-top:16px;margin-bottom:20px;">
          למעקב האישי שלי ←
        </a>

        ${isSubscriber ? '' : `
        <div style="background:#fff7ed;border:1px solid #fde3b8;border-radius:10px;padding:14px 16px;">
          <p style="font-size:13px;color:#7a4e0a;line-height:1.65;margin:0;">${pitch}</p>
        </div>
        `}

        <p style="font-size:11px;color:#aaa;line-height:1.6;text-align:center;margin-top:18px;margin-bottom:6px;">
          זו תזכורת חינמית, פעמיים בשבוע (שני וחמישי), לאורך 30 הימים שלך - בלי שום עלות.
        </p>
        <p style="font-size:11px;color:#aaa;line-height:1.6;text-align:center;">
          <a href="${SITE_URL}/api/trading-plan/unsubscribe-progress?id=${r.id}" style="color:#aaa;text-decoration:underline;">להפסיק לקבל תזכורות אלה</a>
        </p>
      </div>
    </div>
  </div>`);
}

// המייל שנשלח לשירן כשמישהו מבטל תזכורות מעקב - כדי שתוכל ליזום פנייה אישית ולקבל פידבק
export function buildProgressUnsubscribeAdminEmailHtml(r: { id: string; name?: string | null; phone?: string | null; email?: string | null }): string {
  const waLink = r.phone ? `https://wa.me/972${r.phone.replace(/\D/g, '').replace(/^0/, '')}` : null;

  return wrapEmail(`
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f5; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111318;padding:20px 24px;">
        <div style="color:#fff;font-size:16px;font-weight:700;">ביטול תזכורות מעקב יומי</div>
        <div style="color:#E8A33D;font-size:13px;margin-top:4px;">כדאי אולי לפנות ולשמוע למה - לפעמים זה בדיוק ההזדמנות לשיחה</div>
      </div>
      <div style="padding:20px 24px;">
        <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px;">${r.name || 'ללא שם'}</div>
        <div style="font-size:12.5px;color:#888;margin-bottom:14px;">${r.phone || '—'} · ${r.email || '—'}</div>
        <a href="${SITE_URL}/my-plan/${r.id}" style="display:inline-block;margin-left:8px;background:#4fc9c4;color:#08131a;text-decoration:none;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:8px;">לעמוד המעקב ←</a>
        ${waLink ? `<a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:8px;">שליחת הודעה בוואטסאפ ←</a>` : ''}
      </div>
    </div>
  </div>`);
}
