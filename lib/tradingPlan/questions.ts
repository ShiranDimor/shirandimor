// מבנה נתונים אחד לכל השאלון - קל לערוך/להוסיף שאלה בלי לחפש בתוך קוד ה-UI

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
  maxSelect?: number; // ל-multi בלבד - מקסימום בחירות (למשל "עד 2")
  placeholder?: string; // ל-text בלבד
  optional?: boolean;
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
        title: 'איך היית מגדיר/ה את עצמך כרגע?',
        options: [
          { value: 'not_started', label: 'עדיין לא התחלתי לסחור' },
          { value: 'beginner', label: 'מתחיל/ה' },
          { value: 'inconsistent', label: 'כבר סוחר/ת אבל עדיין לא עקבי/ת' },
          { value: 'regular', label: 'סוחר/ת באופן קבוע' },
          { value: 'experienced', label: 'מנוסה יחסית' },
        ],
      },
      {
        id: 'markets',
        type: 'multi',
        title: 'במה את/ה סוחר/ת או רוצה לסחור?',
        helper: 'אפשר לבחור יותר מאחת',
        options: [
          { value: 'stocks', label: 'מניות' },
          { value: 'futures', label: 'חוזים' },
          { value: 'options', label: 'אופציות' },
          { value: 'crypto', label: 'קריפטו' },
          { value: 'undecided', label: 'עדיין לא החלטתי' },
        ],
      },
      {
        id: 'trading_style',
        type: 'single',
        title: 'איזה סוג מסחר הכי רלוונטי עבורך?',
        options: [
          { value: 'intraday', label: 'תוך יומי' },
          { value: 'swing', label: 'סווינג' },
          { value: 'both', label: 'גם וגם' },
          { value: 'undecided', label: 'עדיין לא יודע/ת' },
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
        title: 'כמה זמן ריאלי יש לך למסחר ביום?',
        options: [
          { value: 'under_30', label: 'פחות מחצי שעה' },
          { value: '30_60', label: '30-60 דקות' },
          { value: '60_120', label: 'שעה עד שעתיים' },
          { value: 'over_120', label: 'יותר משעתיים' },
          { value: 'varies', label: 'משתנה מאוד מיום ליום' },
        ],
      },
      {
        id: 'trading_hours',
        type: 'single',
        title: 'באיזה חלק של היום בדרך כלל יש לך זמן?',
        options: [
          { value: 'pre_market', label: 'לפני פתיחת השוק' },
          { value: 'open', label: 'בפתיחת השוק' },
          { value: 'during', label: 'במהלך יום המסחר' },
          { value: 'evening', label: 'בשעות הערב' },
          { value: 'no_fixed', label: 'אין לי שעות קבועות' },
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
        title: 'האם יש לך היום Setup או אסטרטגיה ברורים שאת/ה יודע/ת לזהות?',
        options: [
          { value: 'very_clear', label: 'כן, מאוד ברור לי מה אני מחפש/ת' },
          { value: 'mostly', label: 'בערך' },
          { value: 'mixed', label: 'אני משתמש/ת בכמה דברים אבל אין לי משהו קבוע' },
          { value: 'not_really', label: 'לא באמת' },
        ],
      },
      {
        id: 'entry_tools',
        type: 'multi',
        title: 'מה בדרך כלל גורם לך להיכנס לעסקה?',
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
          { value: 'not_sure', label: 'אני עדיין לא יודע/ת בדיוק' },
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
        title: 'לפני שאת/ה נכנס/ת לעסקה, האם את/ה כבר יודע/ת איפה הסטופ?',
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
        title: 'האם יש לך סכום או אחוז קבוע שאת/ה מוכן/ה לסכן בכל עסקה?',
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
        title: 'האם יש לך הפסד מקסימלי יומי שאחריו את/ה מפסיק/ה לסחור?',
        options: [
          { value: 'yes', label: 'כן' },
          { value: 'no', label: 'לא' },
          { value: 'never_thought', label: 'אף פעם לא חשבתי על זה' },
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
        title: 'מה הכי קשה לך אחרי שכבר נכנסת לעסקה?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'when_to_take_profit', label: 'לדעת מתי לממש רווח' },
          { value: 'when_to_move_stop', label: 'לדעת מתי לקדם סטופ' },
          { value: 'give_time', label: 'לתת לעסקה מספיק זמן לעבוד' },
          { value: 'not_exit_early', label: 'לא לצאת מוקדם מדי' },
          { value: 'not_move_stop', label: 'לא להזיז את הסטופ' },
          { value: 'losing_trade', label: 'להתמודד עם עסקה שנכנסת להפסד' },
          { value: 'winning_trade', label: 'להתמודד עם עסקה שכבר ברווח' },
          { value: 'change_plan', label: 'אני משנה את התוכנית תוך כדי' },
          { value: 'no_real_plan', label: 'אני לא באמת מנהל/ת את העסקה לפי תוכנית' },
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
        title: 'איזה מהמשפטים הכי מוכר לך?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'fomo', label: 'אני מפחד/ת לפספס עסקאות' },
          { value: 'revenge_trading', label: 'אחרי הפסד אני רוצה להחזיר את הכסף מהר' },
          { value: 'exit_early', label: 'אני יוצא/ת מוקדם מדי מעסקאות טובות' },
          { value: 'hard_to_pull_trigger', label: 'קשה לי ללחוץ על הכפתור כשמגיעה עסקה טובה' },
          { value: 'too_many_trades', label: 'אני נכנס/ת ליותר מדי עסקאות' },
          { value: 'move_stop_midway', label: 'אני משנה סטופ באמצע' },
          { value: 'know_but_dont_do', label: 'אני יודע/ת מה צריך לעשות אבל לא תמיד עושה את זה' },
          { value: 'disciplined', label: 'אני יחסית ממושמע/ת' },
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
        type: 'single',
        title: 'מה הדבר האחד שהכי היית רוצה לשפר במסחר שלך ב-30 הימים הקרובים?',
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
        id: 'definition_of_success',
        type: 'text',
        title: 'מה יהיה מבחינתך סימן לכך שהחודש הזה היה מוצלח?',
        helper: 'לא חייבים לענות ב"כמה כסף הרווחתי" - זה יכול להיות גם: עמדתי בסטופ שלי, לקחתי פחות עסקאות, פעלתי לפי תוכנית, הצלחתי לזהות Setup וכו\'',
        placeholder: 'התשובה שלך...',
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
        title: 'איזה כלל אחד את/ה מתחייב/ת לעצמך לא להפר בחודש הקרוב?',
        helper: 'לדוגמה: לא מזיז/ה סטופ, לא נכנס/ת בלי תוכנית, מקסימום 3 עסקאות ביום',
        placeholder: 'התשובה שלך...',
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
