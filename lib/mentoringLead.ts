// לוגיקה משותפת לשאלון שיחת ההתאמה בעמוד הליווי האישי (shirandimor.com/mentoring) ולקביעת השיחה ביומן.
// משתמש באותו חיבור למאנדיי ולמייל של העמוד לארגונים (lib/businessLead), רק עם קבוצה, מקור וטקסטים משלו.
import { clean } from './businessLead';
import { EXPERIENCE_OPTIONS, TRACK_OPTIONS } from './mentoringOptions';

export const MENTORING_PAGE_URL = 'https://www.shirandimor.com/mentoring';
export const MENTORING_SOURCE_LABEL = 'הגיע מהאתר - ליווי אישי';
// אם קיימת בלוח הלידים קבוצה בשם הזה - הליד נכנס אליה. אחרת - לקבוצת "לידים חדשים" הרגילה
export const MENTORING_GROUP_NAME = 'לידים לליווי אישי';
// אורך שיחת ההתאמה והאפיון (בדקות) - ארוכה יותר משיחת ההיכרות לארגונים
export const MENTORING_CALL_MINUTES = 20;


export type MentoringLead = {
  name: string;
  phone: string;
  email: string;
  experience: string;
  goal: string;
  track: string;
  readDetails: boolean;
};

export function readMentoringLead(body: Record<string, unknown>): MentoringLead {
  const experience = clean(body.experience, 60);
  const track = clean(body.track, 60);
  return {
    name: clean(body.name, 80),
    phone: clean(body.phone, 20),
    email: clean(body.email, 120),
    // רק ערכים מתוך הרשימות הקבועות - לא טקסט חופשי
    experience: (EXPERIENCE_OPTIONS as readonly string[]).includes(experience) ? experience : '',
    goal: clean(body.goal, 600),
    track: (TRACK_OPTIONS as readonly string[]).includes(track) ? track : '',
    readDetails: body.readDetails === true || body.readDetails === 'true' || body.readDetails === 'on',
  };
}

export function isMentoringLeadValid(lead: MentoringLead) {
  // הכול חובה: פרטי קשר, כל שאלות השאלון, ואישור שעברו על הפרטים והמחירים
  return Boolean(
    lead.name &&
      lead.email.includes('@') &&
      lead.phone.replace(/\D/g, '').length >= 9 &&
      lead.experience &&
      lead.goal &&
      lead.track &&
      lead.readDetails
  );
}

export function mentoringLeadDetails(lead: MentoringLead, extraLines: string[] = []) {
  return [
    ...extraLines,
    `שם: ${lead.name}`,
    `נייד: ${lead.phone}`,
    `אימייל: ${lead.email}`,
    `רמת ניסיון: ${lead.experience || 'לא צוין'}`,
    `מסלול שמרגיש מתאים: ${lead.track || 'לא צוין'}`,
    lead.goal && `מה היה רוצה לדעת לעשות טוב יותר בעוד כמה חודשים: ${lead.goal}`,
    `עבר/ה על פרטי הליווי והמחירים: ${lead.readDetails ? 'כן' : 'לא סומן'}`,
    `מקור: ${MENTORING_SOURCE_LABEL}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// הטקסט שהפונה רואה בזימון ליומן
export function mentoringInviteDescription(name: string, phone: string, manageLink?: string) {
  return [
    `היי ${name}, תודה שקבעת!`,
    '',
    `זו שיחת התאמה ואפיון (כ-${MENTORING_CALL_MINUTES} דקות) עם שירן דימור לגבי הליווי האישי 1:1.`,
    `שירן תתקשר אלייך למספר ${phone}.`,
    '',
    'בשיחה נבין איפה את/ה נמצא/ת היום, מה היית רוצה ללמוד, ואיזה מסלול מתאים - אם בכלל. השיחה אינה התחייבות להצטרף.',
    '',
    'רוצה לעבור שוב על הפרטים, הסילבוס והמחירים לפני השיחה?',
    MENTORING_PAGE_URL,
    '',
    ...(manageLink ? ['צריך להזיז את השיחה או לבטל? אפשר כאן, בלחיצה:', manageLink, ''] : []),
    'או לכתוב לשירן בוואטסאפ: 054-716-7419',
    '',
    'שירן דימור | מסחר אחראי במניות',
  ].join('\n');
}
