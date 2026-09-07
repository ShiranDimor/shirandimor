// הודעת הפתיחה האישית שנפתחת מוכנה (לא נשלחת אוטומטית!) בלחיצה על כפתור WhatsApp בכרטיס ליד.
// כשאין שם פרטי אמין - נופלים ל"היי 😊" בלי שם, לעולם לא מציגים placeholder/undefined/null.
export function buildInitialOutreachMessage(firstName: string | null): string {
  const greeting = firstName ? `היי ${firstName} 😊` : 'היי 😊';

  return `${greeting}
זאת שירן מקבוצת הוואטסאפ "מדברים עסקאות"

אני עושה בימים האלה כמה שיחות קצרות עם אנשים שנמצאים איתי בקבוצה, ורציתי גם לדבר איתך כמה דקות.

יש לך כמה דקות עכשיו? ואם לא, נתאם לזמן שנוח לך 🙏🏾`;
}
