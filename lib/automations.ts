import { supabaseAdmin } from '@/lib/instantLogin';
import { draftAutomatedAnnouncement } from '@/lib/automationDraft';

function israelDateLabel(d: Date): string {
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
}

function israelTimeLabel(d: Date): string {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
}

// "תאריך מוזז" לשעון ישראל - כדי ש-getDay()/getHours() יחזירו את היום/השעה הנכונים בישראל, לא
// בשרת (ר' גם lib/automationDraft.ts)
function israelNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
}

// פתיחה לפי השעה - תמיד עם "חברים", לפי בקשת שירן. מתבססת על השעה הקבועה שבה האוטומציה הזו
// באמת רצה (ר' scheduledHour בכל תבנית, תואם ל-vercel.json), ולא על השעה הנוכחית בפועל - כדי
// שתצוגה מקדימה/בדיקה לעצמי שמופעלת ידנית בשעה אחרת עדיין תראה בדיוק את מה שבאמת ייצא בזמן האמיתי
function greetingForHour(hour: number): string {
  if (hour < 12) return 'בוקר טוב חברים 😊';
  if (hour < 17) return 'צהריים טובים חברים 😊';
  if (hour < 21) return 'ערב טוב חברים 😊';
  return 'לילה טוב חברים 😊';
}

// תוכנית סיום לכל אוטומציה: 'friday'/'sunday' - אוטומציה שתמיד רצה באותו יום קבוע; 'daily' -
// אוטומציה שרצה כל יום ויכולה להתרחש גם בשישי/ראשון בפועל (כמו תזכורות לייב), אז בודקים את היום
// האמיתי; 'generic' - אוטומציה שרצה בימים קבועים שלעולם אינם שישי/ראשון
type ClosingPlan = 'friday' | 'sunday' | 'daily' | 'generic';

function closingFor(plan: ClosingPlan, scheduledHour: number): string {
  const day = plan === 'daily' ? israelNow().getDay() : plan === 'friday' ? 5 : plan === 'sunday' ? 0 : -1;
  if (day === 5) return 'סופ"ש שקט 🙏🏾';
  if (day === 0) return 'שבוע ירוק ושקט לכולנו 🙏🏾';
  return scheduledHour < 18 ? 'יום שקט לכולנו 🙏🏾' : 'לילה שקט לכולנו 🙏🏾';
}

const GREETING_CLOSING_PLACEHOLDERS = { greeting: 'פתיחה לפי שעת היום (ממולא אוטומטית)', closing: 'סיום לפי יום/שעה (ממולא אוטומטית)' };

// כל אוטומציה (חוץ מסיכום השוק היומי שנכתב ע"י AI) מוגדרת כתבנית: כותרת+תוכן ברירת מחדל עם
// משתנים בסוגריים מסולסלים ({live_title} וכו'), שממולאים בזמן ריצה מהנתונים האמיתיים. בעמוד
// /admin/automations אפשר לערוך את התבנית (נשמר ב-automation_rules.title_template /
// content_template), לראות תצוגה מקדימה, ולשלוח בדיקה לעצמי - בדיוק כמו בלוח המודעות
type Vars = Record<string, string>;
type VarsResult = { vars: Vars } | { reason: string };

type AutomationTemplate = {
  title: string;
  content: string;
  placeholders: Record<string, string>; // שם משתנה -> הסבר בעברית לעמוד הניהול
  sample: Vars; // ערכים לדוגמה לתצוגה מקדימה, כשאין כרגע נתונים אמיתיים (למשל אין לייב מחר)
  getVars: () => Promise<VarsResult>;
  scheduledHour: number; // השעה (שעון ישראל) שבה ה-cron של האוטומציה הזו באמת רץ, לפי vercel.json
  closingPlan: ClosingPlan;
};

export function renderTemplate(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
}

// --- 1. הודעה על שיעור חדש - יום אחרי שהוא עלה, לא מיד ------------------------------------
async function newLessonVars(): Promise<VarsResult> {
  const dayAgoStart = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const dayAgoEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: lessons } = await supabaseAdmin
    .from('lessons')
    .select('title')
    .eq('published', true)
    .gte('created_at', dayAgoStart.toISOString())
    .lt('created_at', dayAgoEnd.toISOString());

  if (!lessons || lessons.length === 0) return { reason: 'no_new_lessons' };

  return {
    vars: {
      headline: lessons.length === 1 ? 'שיעור חדש' : `${lessons.length} שיעורים חדשים`,
      lessons: lessons.map((l) => `*${l.title}*`).join(', '),
      lessons_plain: lessons.map((l) => l.title).join(', '),
    },
  };
}

// --- 3. הלייבים השבוע ---------------------------------------------------------------------
async function weeklyLivesVars(): Promise<VarsResult> {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: lives } = await supabaseAdmin
    .from('lives')
    .select('title, scheduled_at')
    .eq('published', true)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', weekFromNow.toISOString())
    .order('scheduled_at', { ascending: true });

  if (!lives || lives.length === 0) return { reason: 'no_lives_this_week' };

  return {
    vars: {
      lives_list: lives.map((l) => `*${israelDateLabel(new Date(l.scheduled_at))}, ${israelTimeLabel(new Date(l.scheduled_at))}* - ${l.title}`).join('\n'),
    },
  };
}

// --- 5/6/7. תזכורות לייב --------------------------------------------------------------------
async function getLiveOnDate(targetDate: Date) {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const { data } = await supabaseAdmin
    .from('lives')
    .select('id, title, scheduled_at')
    .eq('published', true)
    .gte('scheduled_at', startOfDay.toISOString())
    .lte('scheduled_at', endOfDay.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data;
}

function liveVars(live: { title: string; scheduled_at: string }): Vars {
  const scheduledAt = new Date(live.scheduled_at);
  return { live_title: live.title, date: israelDateLabel(scheduledAt), time: israelTimeLabel(scheduledAt) };
}

const LIVE_PLACEHOLDERS = { live_title: 'שם הלייב', date: 'תאריך הלייב (יום ותאריך)', time: 'שעת הלייב' };
const LIVE_SAMPLE = { live_title: 'ניתוח שוק שבועי', date: 'יום רביעי, 4.11', time: '16:30' };
const NO_VARS = async (): Promise<VarsResult> => ({ vars: {} });

export const AUTOMATION_TEMPLATES: Record<string, AutomationTemplate> = {
  'new-lesson-announcement': {
    title: '{headline} בספרייה: {lessons_plain}',
    content: `{greeting}

עלה {headline} לספריית השיעורים שלנו: {lessons}.

כנסו לצפות כשנוח לכם, הקצב שלכם:
https://www.shirandimor.com/lessons

{closing}`,
    placeholders: { headline: '"שיעור חדש" או "3 שיעורים חדשים"', lessons: 'שמות השיעורים (מודגשים)', lessons_plain: 'שמות השיעורים (טקסט רגיל)', ...GREETING_CLOSING_PLACEHOLDERS },
    sample: { headline: 'שיעור חדש', lessons: '*איך לקבוע סטופ לוס*', lessons_plain: 'איך לקבוע סטופ לוס' },
    getVars: newLessonVars,
    scheduledHour: 9,
    closingPlan: 'daily',
  },

  'weekly-lessons-reminder': {
    title: 'תזכורת: יש לכם ספריית שיעורים שלמה באתר',
    content: `{greeting}

תזכורת קצרה - יש לכם ספריית שיעורים מלאה באתר, שווה להיכנס אליה:

*איך מתחילים* - לבסיס לפני שצוללים פנימה
*מסחר תוך-יומי*
*מסחר סווינג*
*אסטרטגיות שונות*

ועוד הרבה. כנסו בזמן שנוח לכם:
https://www.shirandimor.com/lessons

{closing}`,
    placeholders: GREETING_CLOSING_PLACEHOLDERS,
    sample: {},
    getVars: NO_VARS,
    scheduledHour: 10,
    closingPlan: 'generic',
  },

  'weekly-lives-reminder': {
    title: 'הלייבים שלנו השבוע',
    content: `{greeting}

אלו הלייבים שמחכים לנו השבוע:

{lives_list}

כדאי להכניס ליומן מראש כדי שלא תפספסו - כשתוסיפו את הזימון ליומן, תקבלו בתוכו גם את הלינק לכניסה ללייב עצמו:
https://www.shirandimor.com/lives

{closing}`,
    placeholders: { lives_list: 'רשימת הלייבים של השבוע (שורה לכל לייב)', ...GREETING_CLOSING_PLACEHOLDERS },
    sample: { lives_list: '*יום שני, 9.11, 16:30* - ניתוח שוק שבועי\n*יום רביעי, 11.11, 20:00* - שאלות ותשובות' },
    getVars: weeklyLivesVars,
    scheduledHour: 12,
    closingPlan: 'sunday',
  },

  // שחזור מדויק של ההודעה האמיתית ששירן כבר שלחה
  'trades-explanation': {
    title: 'עסקאות פתוחות בתיק המסחר שלי - עדיין רלוונטיות?',
    content: `{greeting}

רציתי להזכיר: עסקאות פתוחות בתיק המסחר שלי יכולות להיות *עדיין רלוונטיות*, כל עוד הן לא הגיעו לסטופ לוס ולא עברו את המחיר המקסימלי.

חשוב לדעת שהמחיר המקסימלי מתעדכן בכל עסקה פתוחה - בתיק המסחר שלי יש עמודה שמראה עד איזה מחיר עדיין אפשר להיכנס לעסקה.

אז כנסו לתיק המסחר שלי, תבדקו מה מתאים לכם, ותחליטו בעצמכם על מה אתם רוצים לעבוד. 📂

*ולא לשכוח את הכלל החשוב:*
חייבים לקבוע סיכון כספי לעסקה, ולחשב כמה מניות אפשר להיכנס לפי הסיכון הכספי שלכם.

הנוסחה פשוטה:
*סיכון כספי לעסקה ÷ גודל הסטופ לוס = כמות המניות שאפשר לקנות בעסקה* 🧮

קודם הסיכון, ורק אחריו הכניסה.

שירן

{closing}`,
    placeholders: GREETING_CLOSING_PLACEHOLDERS,
    sample: {},
    getVars: NO_VARS,
    scheduledHour: 13,
    closingPlan: 'generic',
  },

  'live-tomorrow-reminder': {
    title: 'מחר יש לייב - {live_title}',
    content: `{greeting}

תזכורת - *מחר*, {date}, ב-*{time}* יש לנו לייב: {live_title}.

כבר עכשיו תיכנסו לעמוד הלייבים ותוסיפו את המפגש ליומן, כדי שלא תפספסו - כשתוסיפו את הזימון ליומן, תקבלו בתוכו גם את הלינק לכניסה ללייב עצמו:
https://www.shirandimor.com/lives

נתראה מחר 🤩

{closing}`,
    placeholders: { ...LIVE_PLACEHOLDERS, ...GREETING_CLOSING_PLACEHOLDERS },
    sample: LIVE_SAMPLE,
    getVars: async () => {
      const live = await getLiveOnDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      return live ? { vars: liveVars(live) } : { reason: 'no_live_tomorrow' };
    },
    scheduledHour: 20,
    closingPlan: 'daily',
  },

  'live-today-reminder': {
    title: 'היום יש לייב - {live_title}',
    content: `{greeting}

תזכורת - *היום ב-{time}* יש לנו לייב: {live_title}.

הכניסה דרך האתר:
https://www.shirandimor.com/lives

נתראה בלייב 🤩

{closing}`,
    placeholders: { ...LIVE_PLACEHOLDERS, ...GREETING_CLOSING_PLACEHOLDERS },
    sample: LIVE_SAMPLE,
    getVars: async () => {
      const live = await getLiveOnDate(new Date());
      return live ? { vars: liveVars(live) } : { reason: 'no_live_today' };
    },
    scheduledHour: 13,
    closingPlan: 'daily',
  },

  // רץ ב-16:00 שעון ישראל - בודק אם יש לייב שמתחיל בשעה הקרובה (מגבלת cron יומי ב-Vercel)
  'live-starting-soon-reminder': {
    title: 'עוד מעט מתחיל הלייב - {live_title}',
    content: `{greeting}

עוד מעט, *ב-{time}*, מתחיל הלייב: {live_title}.

הכניסה דרך האתר:
https://www.shirandimor.com/lives

מתחילים בזמן ⏰`,
    placeholders: { ...LIVE_PLACEHOLDERS, greeting: GREETING_CLOSING_PLACEHOLDERS.greeting },
    sample: LIVE_SAMPLE,
    getVars: async () => {
      const live = await getLiveOnDate(new Date());
      if (!live) return { reason: 'no_live_today' };
      const minutesUntil = (new Date(live.scheduled_at).getTime() - Date.now()) / (60 * 1000);
      if (minutesUntil < 0 || minutesUntil > 75) return { reason: 'not_starting_soon' };
      return { vars: liveVars(live) };
    },
    scheduledHour: 16,
    closingPlan: 'daily',
  },

  'weekly-trading-plan-reminder': {
    title: 'כבר בניתם לעצמכם תוכנית מסחר?',
    content: `{greeting}

תזכורת לסוף השבוע - יש באתר כלי לבניית תוכנית מסחר אישית: לאיזה טווח אתם פונים, איפה הכניסה, איפה העסקה מפסיקה להיות רלוונטית, וכמה מוכנים לסכן.

תוכנית ברורה היא מה שמבדיל בין מסחר מתוכנן למסחר אימפולסיבי - והיא עוזרת לא רק *מקצועית* (כניסה ויציאה מוגדרות מראש, בלי החלטות ברגע), אלא בעיקר *מנטלית*: כשיש לכם תוכנית, אתם לא נסחפים אחרי הרגש של הרגע, לא נכנסים מתוך פחד לפספס ולא נשארים בעסקה מתוך תקווה. התוכנית היא מה שנותן לכם רוגע ושליטה גם כשהשוק זז מהר.

אם עוד לא בניתם לעצמכם אחת, או שרוצים לרענן - זה הזמן:
https://www.shirandimor.com/trading-plan

{closing}`,
    placeholders: GREETING_CLOSING_PLACEHOLDERS,
    sample: {},
    getVars: NO_VARS,
    scheduledHour: 11,
    closingPlan: 'friday',
  },
};

// התבנית בפועל - הגרסה הערוכה מהעמוד אם קיימת, אחרת ברירת המחדל מהקוד
export async function getEffectiveTemplate(key: string) {
  const def = AUTOMATION_TEMPLATES[key];
  if (!def) return null;
  const { data: rule } = await supabaseAdmin.from('automation_rules').select('title_template, content_template').eq('key', key).maybeSingle();
  return {
    title: rule?.title_template || def.title,
    content: rule?.content_template || def.content,
    customized: Boolean(rule?.title_template || rule?.content_template),
  };
}

// בונה את ההודעה המלאה. useSampleIfMissing - לתצוגה מקדימה/בדיקה לעצמי כשאין כרגע נתונים
// אמיתיים (למשל אין לייב מחר), כדי שעדיין אפשר יהיה לראות איך ההודעה תיראה
export async function buildAutomationMessage(key: string, useSampleIfMissing: boolean) {
  const def = AUTOMATION_TEMPLATES[key];
  const tpl = await getEffectiveTemplate(key);
  if (!def || !tpl) return { error: 'unknown_automation' as const };

  const result = await def.getVars();
  if ('reason' in result && !useSampleIfMissing) return { error: result.reason };

  // greeting/closing ממולאים תמיד אוטומטית, גם בתבנית ערוכה - לפי השעה הקבועה שבה האוטומציה
  // הזו באמת רצה (לא השעה הנוכחית בפועל), כדי שתצוגה מקדימה/בדיקה לעצמי בשעה אחרת עדיין תציג
  // בדיוק את מה שבאמת ייצא בזמן האמיתי
  const vars = { greeting: greetingForHour(def.scheduledHour), closing: closingFor(def.closingPlan, def.scheduledHour), ...('vars' in result ? result.vars : def.sample) };
  return {
    title: renderTemplate(tpl.title, vars),
    content: renderTemplate(tpl.content, vars),
    usedSample: 'reason' in result,
    reason: 'reason' in result ? result.reason : undefined,
  };
}

async function runTemplated(key: string) {
  const msg = await buildAutomationMessage(key, false);
  if ('error' in msg) return { drafted: false, reason: msg.error };
  return draftAutomatedAnnouncement(key, msg.title, msg.content);
}

export const runNewLessonAnnouncement = () => runTemplated('new-lesson-announcement');
export const runWeeklyLessonsReminder = () => runTemplated('weekly-lessons-reminder');
export const runWeeklyLivesReminder = () => runTemplated('weekly-lives-reminder');
export const runTradesExplanation = () => runTemplated('trades-explanation');
export const runLiveTomorrowReminder = () => runTemplated('live-tomorrow-reminder');
export const runLiveTodayReminder = () => runTemplated('live-today-reminder');
export const runLiveStartingSoonReminder = () => runTemplated('live-starting-soon-reminder');
export const runWeeklyTradingPlanReminder = () => runTemplated('weekly-trading-plan-reminder');
