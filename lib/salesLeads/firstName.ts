// חילוץ שם פרטי אמין מתוך שם מלא, לשימוש בהודעת WhatsApp אישית. אין במאנדיי עמודת "שם פרטי"
// נפרדת בלוח הזה - רק שדה name אחד לכל פריט - אז זו הדרך היחידה לקבל שם פרטי.
//
// עקרון מנחה: בספק - null. עדיף הודעה בלי שם מהודעה עם שם שגוי. אין כאן שום "תיקון חכם"
// אגרסיבי של איות או מבנה - רק ניקוי רווחים וסימני פיסוק שוליים שלא שייכים לשם עצמו.

// אות בעברית או בלטינית - כדי לוודא שהטוקן שחולץ הוא בכלל "שם" ולא מספר טלפון/אימייל/רעש
const HAS_LETTER = /[a-zA-Zא-ת]/;
// גזירת סימני פיסוק/רווחים משני הקצוות של הטוקן (לא מהאמצע - כדי לא לשבור שמות עם מקף פנימי
// כמו "בת-אל"), בלי לגעת באיות עצמו
const EDGE_JUNK = /^[^\p{L}]+|[^\p{L}]+$/gu;

export function extractFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;

  const collapsed = fullName.trim().replace(/\s+/g, ' ');
  if (!collapsed) return null;

  const firstToken = collapsed.split(' ')[0];
  const cleaned = firstToken.replace(EDGE_JUNK, '');

  if (!cleaned || !HAS_LETTER.test(cleaned)) return null;

  return cleaned;
}

// שם פרטי בפועל לתצוגה/הודעה: מעדיף את מה ששמור כבר על הליד (first_name) - ורק אם אין,
// מחשב "on the fly" מתוך name. ה-fallback הזה מגן על נתונים ישנים שנוצרו לפני הוספת העמודה
export function getLeadFirstName(lead: { first_name?: string | null; name: string }): string | null {
  return lead.first_name || extractFirstName(lead.name);
}
