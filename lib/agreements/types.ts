// מערכת ההסכמים הדיגיטליים: כל הסכם = תבנית אחת (נוסח + גרסה + אילו תנאים משתנים בין אנשים).
// להוספת הסכם חדש: קובץ חדש בתיקייה הזו + רישום שלו ב-lib/agreements/index.ts. זהו.

// תוכן ההסכם כבלוקים פשוטים - מוצגים בעמוד החתימה ובמייל העותק החתום
export type AgreementBlock = { h: string; p?: string[]; ul?: string[]; ol?: string[]; table?: [string, string][] };

// שדה תנאי שנקבע ע"י שירן לכל אדם (מחיר, תאריכים, תשלומים...) - נחתם בתוך הקישור האישי
export type TermField = {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number';
  placeholder?: string;
  remember?: boolean; // נשמר בדפדפן של שירן (פרטים שחוזרים בכל הסכם, כמו ע.מ)
};

export type Terms = Record<string, string>;

// שדה בחירה שהחותם/ת ממלא/ת בעצמו/ה בטופס (למשל מספר תשלומים) - נכנס להסכם החתום
export type SignerChoice = { key: string; label: string; options: string[] };

export type AgreementTemplate = {
  id: string; // מופיע בכתובת: /agreement/<id>
  title: string;
  // מעלים גרסה בכל שינוי נוסח - כל חתימה נשמרת עם הגרסה שנחתמה
  version: string;
  // false = טיוטה: העמוד לא נפתח לחתימה (לא מופיע לאנשים) עד שהנוסח מוכן
  active: boolean;
  intro: string; // משפט פתיחה מעל ההסכם בעמוד החתימה
  // יש תנאים אישיים? אז חתימה רק דרך קישור אישי שנוצר בעמוד הניהול. אין? קישור אחד קבוע לכולם
  termFields: TermField[];
  // בחירות שהחותם/ת ממלא/ת בעצמו/ה בטופס - חוסך משירן למלא תנאים לכל אחד
  signerChoices?: SignerChoice[];
  blocks: (terms: Terms) => AgreementBlock[];
};

export const fmtDate = (iso?: string) => {
  if (!iso) return '____________';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};
export const blank = (v?: string) => (v && v.trim() ? v.trim() : '____________');
