// לוגיקת זכאות טהורה, בלי תלות ב-supabaseAdmin/instantLogin - כדי שגם קוד בצד הלקוח
// ('use client') יוכל לייבא אותה בלי לגרור קוד שרת (מפתח service role) לחבילת הדפדפן

export type EntitlementProfile = {
  role: string | null;
  subscription_status: string | null;
  subscription_paid_until?: string | null;
};

// הזכאות האמיתית לתוכן מנויים - לא "ההרשמה/ההתחברות הצליחה", אלא יש בפועל מנוי פעיל
// (admin, או subscriber עם status='active'), או שהמנוי ביקש לבטל חידוש אבל התקופה
// ששולמה כבר (subscription_paid_until, status='cancelling') עדיין לא נגמרה - כדי שביטול
// לא יקצר תקופה ששולמה. זו נקודת האמת היחידה לבדיקת זכאות - כל מקום שבודק האם מישהו
// "מנוי פעיל" אמור לעבור דרך הפונקציה הזו ולא לשכפל את הביטוי הזה בעצמו
export function hasActiveEntitlement(profile: EntitlementProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (profile.role !== 'subscriber') return false;
  if (profile.subscription_status === 'active') return true;
  if (profile.subscription_status === 'cancelling' && profile.subscription_paid_until) {
    return new Date(profile.subscription_paid_until).getTime() > Date.now();
  }
  return false;
}

// תאריך החיוב הקרוב ביותר (באותו יום-בחודש שבו המנוי הצטרף, בדיוק כמו שמוסבר ב-FAQ של
// האתר) שחל ביום from או אחריו. אם היום-בחודש לא קיים בחודש היעד (למשל הצטרפות ב-31
// וחודש עם 30 ימים), מהודק ליום האחרון של אותו חודש במקום לגלוש לחודש שאחריו באקראי
// מחרוזת פילטר ל-PostgREST .or(...) שתואמת ל-hasActiveEntitlement, בשביל מקומות שצריכים
// לסנן ברמת השאילתה (לא על פרופיל שכבר נטען) מי נחשב "מנוי עם גישה" - כולל מי שביטל
// חידוש אבל עדיין בתוך התקופה ששילם עליה. בלי זה, מי שבתקופת החסד היה ממשיך לקבל גרסת
// התראות "לא-מנוי" מטושטשת, בניגוד לגישה המלאה שיש לו בפועל באתר
export function entitlementOrFilter(): string {
  const nowIso = new Date().toISOString();
  return `role.eq.admin,and(role.eq.subscriber,subscription_status.eq.active),and(role.eq.subscriber,subscription_status.eq.cancelling,subscription_paid_until.gt.${nowIso})`;
}

export function nextBillingDateOnOrAfter(startedAt: Date, from: Date = new Date()): Date {
  const day = startedAt.getDate();
  function dateInMonth(year: number, month: number) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  }
  let candidate = dateInMonth(from.getFullYear(), from.getMonth());
  if (candidate.getTime() <= from.getTime()) {
    const nextMonthIdx = from.getMonth() + 1;
    candidate = dateInMonth(from.getFullYear() + Math.floor(nextMonthIdx / 12), ((nextMonthIdx % 12) + 12) % 12);
  }
  return candidate;
}
