// קטלוג הסטטוסים, העדיפויות וסוגי הפעילות של מערכת המכירות הטלפוניות. כל הרשימה נשמרת כאן
// (ולא כ-enum בבסיס הנתונים) בדיוק כדי שיהיה אפשר להוסיף סטטוס חדש בעתיד רק ע"י הוספת שורה כאן,
// בלי מיגרציה. כל סטטוס משויך ל"שלב" (stage) - 3 האזורים המרכזיים של המערכת.

export type SalesLeadStage = 'in_progress' | 'registered' | 'not_relevant';

export type SalesStatus = {
  value: string;
  label: string;
  stage: SalesLeadStage;
};

export const SALES_STATUSES: SalesStatus[] = [
  { value: 'not_handled', label: 'לא טופל', stage: 'in_progress' },
  // מוגדר אוטומטית כשנפתחת הודעת WhatsApp ראשונית לליד שעדיין לא טופל בכלל (ר' lib/salesLeads/activities.ts) -
  // כדי שלא יעורבב עם "לא טופל" ברשימה, גם לפני שהתקבלה תשובה בפועל
  { value: 'whatsapp_sent', label: 'נשלחה פנייה ב-WhatsApp', stage: 'in_progress' },
  { value: 'no_answer', label: 'לא ענה/תה', stage: 'in_progress' },
  { value: 'spoke', label: 'דיברנו', stage: 'in_progress' },
  { value: 'asked_callback', label: 'ביקש/ה שאחזור אליו/ה', stage: 'in_progress' },
  { value: 'interested', label: 'מתעניין/ת', stage: 'in_progress' },
  { value: 'undecided', label: 'מתלבט/ת', stage: 'in_progress' },
  { value: 'thinking', label: 'רוצה לחשוב', stage: 'in_progress' },
  { value: 'registered', label: 'נרשם/ה', stage: 'registered' },
  { value: 'not_relevant', label: 'לא רלוונטי', stage: 'not_relevant' },
];

const STATUS_BY_VALUE = new Map(SALES_STATUSES.map((s) => [s.value, s]));

export function getStatusMeta(value: string | null | undefined): SalesStatus {
  if (value && STATUS_BY_VALUE.has(value)) return STATUS_BY_VALUE.get(value)!;
  // סטטוס לא מוכר (למשל נוסף ידנית בעבר) - לא קורס, רק לא משויך ל"חם" מיוחד
  return { value: value || 'not_handled', label: value || 'לא טופל', stage: 'in_progress' };
}

export function statusToStage(value: string | null | undefined): SalesLeadStage {
  return getStatusMeta(value).stage;
}

export type LeadPriority = 'normal' | 'hot' | 'very_hot';

export const PRIORITIES: { value: LeadPriority; label: string }[] = [
  { value: 'normal', label: 'רגיל' },
  { value: 'hot', label: 'חם' },
  { value: 'very_hot', label: 'חם מאוד' },
];

export function priorityLabel(value: string | null | undefined): string {
  return PRIORITIES.find((p) => p.value === value)?.label || 'רגיל';
}

export const STAGE_LABELS: Record<SalesLeadStage, string> = {
  in_progress: 'בטיפול',
  registered: 'טופל ונרשם',
  not_relevant: 'טופל ולא רלוונטי',
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LEAD_CREATED: 'נכנס/ה לקבוצת העדכונים',
  CALL_ATTEMPT: 'ניסיון התקשרות',
  NO_ANSWER: 'לא ענה/תה',
  CALL_COMPLETED: 'דיברנו בטלפון',
  NOTE: 'הערה',
  FOLLOW_UP_CREATED: 'נקבע Follow-up',
  FOLLOW_UP_CHANGED: 'השתנה מועד ה-Follow-up',
  FOLLOW_UP_COMPLETED: 'ה-Follow-up טופל',
  REGISTERED: 'נרשם/ה כמנוי/ה',
  NOT_RELEVANT: 'סומן/ה כלא רלוונטי',
  STATUS_CHANGED: 'שינוי סטטוס',
  PRIORITY_CHANGED: 'שינוי עדיפות',
  WHATSAPP_OPENED: 'נפתחה הודעת WhatsApp',
};
