// מבנה נתונים אחד לכל השאלון - קל לערוך/להוסיף שאלה בלי לחפש בתוך קוד ה-UI
//
// הערת ניסוח: כל השאלות/אפשרויות מנוסחות בלי "את/ה" או "נכנס/ת" - במקום זה שימוש
// בשם פועל (״להיכנס״), בניסוח סתמי-רבים (״נכנסים לעסקה״) או בניסוח שמני (״שגרת מסחר קבועה״).
// כך הטקסט עובד באופן טבעי לכל מגדר בלי לוכסנים.

export type QuestionType = 'single' | 'multi' | 'text';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string; // תואם לשם העמודה ב-Supabase
  type: QuestionType;
  title: string;
  helper?: string; // טקסט עזר קטן מתחת לכותרת
  options?: QuestionOption[];
  maxSelect?: number; // ל-multi בלבד - מקסימום בחירות (למשל "עד 3")
  placeholder?: string; // ל-text בלבד
  optional?: boolean;
  suggestions?: string[]; // ל-text בלבד - הצעות מוכנות שלוחצים עליהן וממלאות/מוסיפות לשדה
  showIf?: (answers: Record<string, unknown>) => boolean; // הצגה מותנית (למשל שדה סכום שמופיע רק אם נענה "כן")
}

export interface StepDef {
  id: string;
  title: string; // כותרת השלב (מוצגת מעל השאלות)
  intro?: string; // טקסט קצר אופציונלי מעל השלב
  questions: Question[];
}

export const STEPS: StepDef[] = [
  {
    id: 'step-1',
    title: 'איפה אני היום?',
    questions: [
      {
        id: 'trading_experience',
        type: 'single',
        title: 'מה הכי מתאר את הניסיון במסחר כרגע?',
        options: [
          { value: 'not_started', label: 'עדיין לא התחלתי' },
          { value: 'beginner', label: 'בתחילת הדרך' },
          { value: 'inconsistent', label: 'כבר יש ניסיון, אבל בלי עקביות' },
          { value: 'regular', label: 'יש שגרת מסחר קבועה' },
          { value: 'experienced', label: 'יש ניסיון משמעותי' },
        ],
      },
      {
        id: 'markets',
        type: 'multi',
        title: 'באילו שווקים המסחר מתמקד (או צפוי להתמקד)?',
        helper: 'אפשר לבחור יותר מאחת',
        options: [
          { value: 'stocks', label: 'מניות' },
          { value: 'futures', label: 'חוזים' },
          { value: 'options', label: 'אופציות' },
          { value: 'crypto', label: 'קריפטו' },
          { value: 'undecided', label: 'עדיין לא הוחלט' },
        ],
      },
      {
        id: 'trading_style',
        type: 'single',
        title: 'איזה סוג מסחר הכי רלוונטי?',
        options: [
          { value: 'intraday', label: 'תוך יומי' },
          { value: 'swing', label: 'סווינג' },
          { value: 'both', label: 'גם וגם' },
          { value: 'undecided', label: 'עדיין לא ברור' },
        ],
      },
    ],
  },
  {
    id: 'step-2',
    title: 'הזמן שלי',
    questions: [
      {
        id: 'available_time',
        type: 'single',
        title: 'כמה זמן ריאלי אפשר להקדיש למסחר בשבוע?',
        options: [
          { value: 'under_1h', label: 'פחות משעה בשבוע' },
          { value: '1_3h', label: '1-3 שעות בשבוע' },
          { value: '3_6h', label: '3-6 שעות בשבוע' },
          { value: 'over_6h', label: 'יותר מ-6 שעות בשבוע' },
          { value: 'varies', label: 'משתנה מאוד משבוע לשבוע' },
        ],
      },
      {
        id: 'trading_hours',
        type: 'single',
        title: 'מתי בדרך כלל נוח לשבת מול השוק ולעקוב אחרי פוזיציות?',
        options: [
          { value: 'morning_israel', label: 'בבוקר, לפני פתיחת השוק (שעון ישראל)' },
          { value: 'us_open_evening', label: 'בערב, בזמן פתיחת המסחר בארה"ב' },
          { value: 'late_night', label: 'בלילה, אחרי הסגירה' },
          { value: 'weekends', label: 'בעיקר בסופי שבוע' },
          { value: 'no_fixed', label: 'אין שעה קבועה' },
        ],
      },
    ],
  },
  {
    id: 'step-3',
    title: 'איך אני בוחר עסקה?',
    questions: [
      {
        id: 'strategy_clarity',
        type: 'single',
        title: 'עד כמה ברור ה-Setup או האסטרטגיה שמחפשים?',
        options: [
          { value: 'very_clear', label: 'מאוד ברור מה מחפשים' },
          { value: 'mostly', label: 'פחות או יותר ברור' },
          { value: 'mixed', label: 'יש כמה כלים, אבל בלי משהו קבוע' },
          { value: 'not_really', label: 'לא ממש ברור' },
        ],
      },
      {
        id: 'entry_tools',
        type: 'multi',
        title: 'מה בדרך כלל מוביל לכניסה לעסקה?',
        helper: 'אפשר לבחור כמה תשובות',
        options: [
          { value: 'support_resistance', label: 'תמיכה והתנגדות' },
          { value: 'vwap', label: 'VWAP' },
          { value: 'rsi', label: 'RSI' },
          { value: 'pivot', label: 'Pivot' },
          { value: 'moving_averages', label: 'ממוצעים נעים' },
          { value: 'price_action', label: 'Price Action' },
          { value: 'news', label: 'חדשות' },
          { value: 'recommendation', label: 'המלצה / רעיון שראיתי' },
          { value: 'gut_feeling', label: 'תחושת בטן' },
          { value: 'not_sure', label: 'עדיין לא ממש ברור' },
        ],
      },
    ],
  },
  {
    id: 'step-4',
    title: 'ניהול סיכון',
    questions: [
      {
        id: 'stop_discipline',
        type: 'single',
        title: 'לפני כניסה לעסקה - האם מיקום הסטופ כבר ידוע?',
        options: [
          { value: 'always', label: 'תמיד' },
          { value: 'usually', label: 'בדרך כלל' },
          { value: 'sometimes', label: 'לפעמים' },
          { value: 'rarely', label: 'כמעט אף פעם' },
        ],
      },
      {
        id: 'risk_per_trade',
        type: 'single',
        title: 'האם קיים סכום או אחוז קבוע לסיכון בכל עסקה?',
        options: [
          { value: 'yes', label: 'כן' },
          { value: 'roughly', label: 'בערך' },
          { value: 'no', label: 'לא' },
        ],
      },
      {
        id: 'risk_per_trade_amount',
        type: 'text',
        title: 'כמה?',
        placeholder: 'לדוגמה: 1% מהתיק, או סכום קבוע',
        optional: true,
        showIf: (answers) => answers.risk_per_trade === 'yes' || answers.risk_per_trade === 'roughly',
      },
      {
        id: 'daily_max_loss',
        type: 'single',
        title: 'האם קיים הפסד מקסימלי יומי שמעבר לו עוצרים?',
        options: [
          { value: 'yes_follow', label: 'כן, ובדרך כלל עומדים בזה' },
          { value: 'yes_hard', label: 'יש כלל כזה, אבל קשה לעמוד בו בפועל' },
          { value: 'no', label: 'לא' },
          { value: 'never_thought', label: 'אף פעם לא עלה למחשבה' },
        ],
      },
    ],
  },
  {
    id: 'step-5',
    title: 'ניהול העסקה',
    questions: [
      {
        id: 'management_difficulty',
        type: 'multi',
        title: 'מה הכי מאתגר אחרי שכבר נכנסים לעסקה?',
        helper: 'אפשר לבחור כמה שרוצים',
        options: [
          { value: 'when_to_take_profit', label: 'לדעת מתי לממש רווח' },
          { value: 'when_to_move_stop', label: 'לדעת מתי לקדם סטופ' },
          { value: 'give_time', label: 'לתת לעסקה מספיק זמן לעבוד' },
          { value: 'not_exit_early', label: 'לא לצאת מוקדם מדי' },
          { value: 'not_move_stop', label: 'לא להזיז את הסטופ' },
          { value: 'losing_trade', label: 'להתמודד עם עסקה שנכנסת להפסד' },
          { value: 'winning_trade', label: 'להתמודד עם עסקה שכבר ברווח' },
          { value: 'change_plan', label: 'לשנות את התוכנית תוך כדי' },
          { value: 'no_real_plan', label: 'לא לנהל את העסקה לפי תוכנית מסודרת' },
        ],
      },
    ],
  },
  {
    id: 'step-6',
    title: 'המנטלי',
    intro: 'זה השלב שבו כולנו מגלים שאנחנו סוחרים מצוין עד שיש כסף אמיתי על המסך :)',
    questions: [
      {
        id: 'mental_difficulty',
        type: 'multi',
        title: 'אילו משפטים הכי מוכרים?',
        helper: 'אפשר לבחור כמה שרוצים',
        options: [
          { value: 'fomo', label: 'פחד לפספס עסקאות (FOMO)' },
          { value: 'revenge_trading', label: 'רצון להחזיר הפסד מהר, מיד אחרי שהוא קרה' },
          { value: 'exit_early', label: 'יציאה מוקדמת מדי מעסקאות טובות' },
          { value: 'hard_to_pull_trigger', label: 'קושי ללחוץ על הכפתור כשמגיעה עסקה טובה' },
          { value: 'too_many_trades', label: 'כניסה ליותר מדי עסקאות' },
          { value: 'move_stop_midway', label: 'שינוי סטופ באמצע העסקה' },
          { value: 'know_but_dont_do', label: 'לדעת מה נכון לעשות, אבל לא תמיד לבצע את זה' },
          { value: 'disciplined', label: 'משמעת יחסית גבוהה' },
        ],
      },
      {
        id: 'main_fear',
        type: 'multi',
        title: 'מה הכי מפחיד בקשר למסחר?',
        helper: 'אפשר לבחור כמה תשובות - זה נשאר בינינו',
        options: [
          { value: 'lose_money', label: 'לאבד כסף שחשוב' },
          { value: 'tried_before_failed', label: 'כבר ניסיתי בעבר ולא הצלחתי' },
          { value: 'lost_belief', label: 'כבר לא ממש מאמין/ה שזה יכול לעבוד בשבילי' },
          { value: 'not_good_enough', label: 'לגלות שזה פשוט לא בשבילי' },
          { value: 'miss_opportunity', label: 'לפספס הזדמנות טובה' },
          { value: 'embarrassment', label: 'לעשות טעות מביכה' },
          { value: 'no_idea_if_right', label: 'לא לדעת אם בכלל עושים את זה נכון' },
          { value: 'losing_control', label: 'לאבד שליטה על הרגש כשיש כסף על הכף' },
          { value: 'other', label: 'משהו אחר' },
        ],
      },
    ],
  },
  {
    id: 'step-7',
    title: 'היעד שלי',
    questions: [
      {
        id: 'main_goal',
        type: 'multi',
        title: 'מה הדבר האחד שהכי היה כדאי לשפר במסחר ב-30 הימים הקרובים?',
        helper: 'אפשר לבחור כמה שרוצים',
        options: [
          { value: 'better_setups', label: 'למצוא עסקאות איכותיות יותר' },
          { value: 'entry_timing', label: 'לדעת מתי להיכנס' },
          { value: 'risk_management', label: 'ניהול סיכון' },
          { value: 'trade_management', label: 'ניהול עסקה' },
          { value: 'discipline', label: 'משמעת' },
          { value: 'mentality', label: 'מנטליות' },
          { value: 'consistency', label: 'עקביות' },
          { value: 'chart_reading', label: 'להבין טוב יותר גרפים' },
          { value: 'build_strategy', label: 'לבנות אסטרטגיה ברורה' },
          { value: 'start_trading', label: 'להתחיל בכלל לסחור' },
        ],
      },
      {
        id: 'trading_motivation',
        type: 'multi',
        title: 'מה היית רוצה להשיג ממסחר?',
        helper: 'אפשר לבחור כמה שרוצים',
        options: [
          { value: 'extra_income', label: 'הכנסה נוספת, לצד מה שכבר יש' },
          { value: 'full_income', label: 'להתפרנס מהמסחר באופן מלא' },
          { value: 'financial_security', label: 'לבנות ביטחון כלכלי לעתיד' },
          { value: 'prove_to_myself', label: 'להוכיח לעצמי שאני מסוגל/ת' },
          { value: 'learn_understand', label: 'סתם ללמוד ולהבין את השוק' },
          { value: 'other', label: 'משהו אחר' },
        ],
      },
      {
        id: 'trading_dream',
        type: 'text',
        title: 'עוד שנה מהיום, אם המסחר יעבוד בדיוק כמו שרוצים - איך זה נראה?',
        helper: 'אין תשובה נכונה - זה יכול להיות משהו כספי, על ביטחון עצמי, על זמן חופשי, או משהו אחר לגמרי',
        placeholder: 'התשובה...',
        optional: true,
      },
      {
        id: 'definition_of_success',
        type: 'text',
        title: 'מה יהיה סימן לכך שהחודש הזה היה מוצלח?',
        helper: 'לא חייבים לענות ב"כמה כסף הרווחתי" - זה יכול להיות גם: עמדתי בסטופ שלי, לקחתי פחות עסקאות, פעלתי לפי תוכנית, הצלחתי לזהות Setup וכו\'',
        placeholder: 'התשובה...',
      },
    ],
  },
  {
    id: 'step-8',
    title: 'ההתחייבות',
    questions: [
      {
        id: 'personal_rule',
        type: 'text',
        title: 'איזה כלל אחד כדאי להתחייב אליו ולא להפר בחודש הקרוב?',
        helper: 'אפשר להקליד כלל אישי, או ללחוץ על אחת ההצעות למטה כנקודת התחלה ולערוך אותה',
        placeholder: 'התשובה...',
        suggestions: [
          'לא להזיז סטופ',
          'לא להיכנס לעסקה בלי תוכנית',
          'מקסימום 3 עסקאות ביום',
          'לא לרדוף אחרי מניה שכבר ברחה',
          'לא להוסיף לעסקה מפסידה',
          'לעצור אחרי ההפסד המקסימלי היומי, גם כשקשה',
        ],
      },
    ],
  },
];

export function visibleQuestions(step: StepDef, answers: Record<string, unknown>): Question[] {
  return step.questions.filter((q) => !q.showIf || q.showIf(answers));
}

export const ALL_QUESTIONS: Question[] = STEPS.flatMap((s) => s.questions);
export const TOTAL_STEPS = STEPS.length;

export function findOption(questionId: string, value: string): QuestionOption | undefined {
  const q = ALL_QUESTIONS.find((q) => q.id === questionId);
  return q?.options?.find((o) => o.value === value);
}

export function findOptions(questionId: string, values: string[] | null | undefined): QuestionOption[] {
  if (!values) return [];
  const q = ALL_QUESTIONS.find((q) => q.id === questionId);
  if (!q?.options) return [];
  return values.map((v) => q.options!.find((o) => o.value === v)).filter(Boolean) as QuestionOption[];
}
