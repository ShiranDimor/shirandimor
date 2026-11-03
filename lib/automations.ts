import { supabaseAdmin } from '@/lib/instantLogin';
import { draftAutomatedAnnouncement } from '@/lib/automationDraft';

function israelDateLabel(d: Date): string {
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
}

function israelTimeLabel(d: Date): string {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
}

// --- 1. הודעה על שיעור חדש - יום אחרי שהוא עלה, לא מיד (ר' /admin/lessons לשליחה מיידית
// נפרדת) --------------------------------------------------------------------------------
export async function runNewLessonAnnouncement() {
  const dayAgoStart = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const dayAgoEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: lessons } = await supabaseAdmin
    .from('lessons')
    .select('title, description, category')
    .eq('published', true)
    .gte('created_at', dayAgoStart.toISOString())
    .lt('created_at', dayAgoEnd.toISOString());

  if (!lessons || lessons.length === 0) return { drafted: false, reason: 'no_new_lessons' };

  const names = lessons.map((l) => `*${l.title}*`).join(', ');
  const title = lessons.length === 1 ? `שיעור חדש בספרייה: ${lessons[0].title}` : `${lessons.length} שיעורים חדשים בספרייה`;
  const content = `היי 😊

עלה ${lessons.length === 1 ? 'שיעור חדש' : 'שיעורים חדשים'} לספריית השיעורים שלנו: ${names}.

כנסו לצפות כשנוח לכם, הקצב שלכם:
https://www.shirandimor.com/lessons`;

  return draftAutomatedAnnouncement('new-lesson-announcement', title, content);
}

// --- 2. תזכורת שבועית לספריית השיעורים - כל יום שני ----------------------------------
export async function runWeeklyLessonsReminder() {
  const title = 'תזכורת: יש לכם ספריית שיעורים שלמה באתר';
  const content = `היי 😊

תזכורת קצרה - יש לכם ספריית שיעורים מלאה באתר, שווה להיכנס אליה:

*איך מתחילים* - לבסיס לפני שצוללים פנימה
*מסחר תוך-יומי*
*מסחר סווינג*
*אסטרטגיות שונות*

ועוד הרבה. כנסו בזמן שנוח לכם:
https://www.shirandimor.com/lessons`;

  return draftAutomatedAnnouncement('weekly-lessons-reminder', title, content);
}

// --- 3. תזכורת שבועית - הלייבים השבוע - כל יום ראשון -----------------------------------
export async function runWeeklyLivesReminder() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: lives } = await supabaseAdmin
    .from('lives')
    .select('title, scheduled_at')
    .eq('published', true)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', weekFromNow.toISOString())
    .order('scheduled_at', { ascending: true });

  if (!lives || lives.length === 0) return { drafted: false, reason: 'no_lives_this_week' };

  const linesList = lives.map((l) => `*${israelDateLabel(new Date(l.scheduled_at))}, ${israelTimeLabel(new Date(l.scheduled_at))}* - ${l.title}`).join('\n');

  const title = 'הלייבים שלנו השבוע';
  const content = `בוקר טוב 😊

אלו הלייבים שמחכים לנו השבוע:

${linesList}

כדאי להכניס ליומן מראש כדי שלא תפספסו:
https://www.shirandimor.com/lives`;

  return draftAutomatedAnnouncement('weekly-lives-reminder', title, content);
}

// --- 4. הסבר על עסקאות פתוחות - ימי שני ורביעי -----------------------------------------
// שחזור מדויק של ההודעה האמיתית ששירן כבר שלחה (לא מנוסח מחדש כל פעם - זה תוכן ערכי קבוע,
// לא משהו שצריך "לחדש" בכל ריצה)
export async function runTradesExplanation() {
  const title = 'עסקאות פתוחות בתיק המסחר שלי - עדיין רלוונטיות?';
  const content = `היי חברים 👋

רציתי להזכיר: עסקאות פתוחות בתיק המסחר שלי יכולות להיות *עדיין רלוונטיות*, כל עוד הן לא הגיעו לסטופ לוס ולא עברו את המחיר המקסימלי.

אז כנסו לתיק המסחר שלי, תבדקו מה מתאים לכם, ותחליטו בעצמכם על מה אתם רוצים לעבוד. 📂

*ולא לשכוח את הכלל החשוב:*
חייבים לקבוע סיכון כספי לעסקה, ולחשב כמה מניות אפשר להיכנס לפי הסיכון הכספי שלכם.

הנוסחה פשוטה:
*סיכון כספי לעסקה ÷ גודל הסטופ לוס = כמות המניות שאפשר לקנות בעסקה* 🧮

קודם הסיכון, ורק אחריו הכניסה.

שירן`;

  return draftAutomatedAnnouncement('trades-explanation', title, content);
}

// --- 5/6/7. תזכורות לייב - יום לפני ב-20:30, יום הלייב ב-13:00, ושוב סמוך לתחילתו ------
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

export async function runLiveTomorrowReminder() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const live = await getLiveOnDate(tomorrow);
  if (!live) return { drafted: false, reason: 'no_live_tomorrow' };

  const scheduledAt = new Date(live.scheduled_at);
  const title = `מחר יש לייב - ${live.title}`;
  const content = `היי 😊

תזכורת - *מחר*, ${israelDateLabel(scheduledAt)}, ב-*${israelTimeLabel(scheduledAt)}* יש לנו לייב: ${live.title}.

כבר עכשיו תיכנסו לעמוד הלייבים ותוסיפו את המפגש ליומן, כדי שלא תפספסו:
https://www.shirandimor.com/lives

נתראה מחר 🤩`;

  return draftAutomatedAnnouncement('live-tomorrow-reminder', title, content);
}

export async function runLiveTodayReminder() {
  const live = await getLiveOnDate(new Date());
  if (!live) return { drafted: false, reason: 'no_live_today' };

  const scheduledAt = new Date(live.scheduled_at);
  const title = `היום יש לייב - ${live.title}`;
  const content = `היי 😊

תזכורת - *היום ב-${israelTimeLabel(scheduledAt)}* יש לנו לייב: ${live.title}.

הכניסה דרך האתר:
https://www.shirandimor.com/lives

נתראה בלייב 🤩`;

  return draftAutomatedAnnouncement('live-today-reminder', title, content);
}

// רץ ב-16:00 שעון ישראל - בודק אם יש לייב שמתחיל בשעה הקרובה (עוגן קבוע, לא "חצי שעה לפני"
// מדויק לכל שעה - ר' הסבר לשירן על מגבלת ה-cron היומי בחבילה החינמית של Vercel)
export async function runLiveStartingSoonReminder() {
  const live = await getLiveOnDate(new Date());
  if (!live) return { drafted: false, reason: 'no_live_today' };

  const scheduledAt = new Date(live.scheduled_at);
  const now = new Date();
  const minutesUntil = (scheduledAt.getTime() - now.getTime()) / (60 * 1000);
  if (minutesUntil < 0 || minutesUntil > 75) return { drafted: false, reason: 'not_starting_soon' };

  const title = `עוד מעט מתחיל הלייב - ${live.title}`;
  const content = `היי 😊

עוד מעט, *ב-${israelTimeLabel(scheduledAt)}*, מתחיל הלייב: ${live.title}.

הכניסה דרך האתר:
https://www.shirandimor.com/lives

מתראים עוד רגע 🤩`;

  return draftAutomatedAnnouncement('live-starting-soon-reminder', title, content);
}

// --- 8. תזכורת שבועית - בניית תוכנית מסחר - כל יום שישי --------------------------------
export async function runWeeklyTradingPlanReminder() {
  const title = 'כבר בניתם לעצמכם תוכנית מסחר?';
  const content = `היי 😊

תזכורת לסוף השבוע - יש באתר כלי לבניית תוכנית מסחר אישית: לאיזה טווח אתם פונים, איפה הכניסה, איפה העסקה מפסיקה להיות רלוונטית, וכמה מוכנים לסכן.

תוכנית ברורה היא מה שמבדיל בין מסחר מתוכנן למסחר אימפולסיבי. אם עוד לא בניתם לעצמכם אחת, או שרוצים לרענן - זה הזמן:
https://www.shirandimor.com/trading-plan

שבת שלום 🤍`;

  return draftAutomatedAnnouncement('weekly-trading-plan-reminder', title, content);
}
