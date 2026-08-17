// מבנה נתונים אחד לכל השאלון - קל לערוך/להוסיף שאלה בלי לחפש בתוך קוד ה-UI
//
// מבנה השאלון (מאושר): שלב 1 שואל איפה נמצאים מול מסחר - התשובה קובעת אם שלבים
// 4-6 (המותנים, על ניהול סיכון והתנהגות בזמן אמת) מוצגים בכלל. מי שעדיין לא התחיל
// לא נשאל שאלות שמתאימות למי שכבר מבצע עסקאות בפועל.
//
// הערת ניסוח: כל השאלות/אפשרויות מנוסחות בלי "את/ה" או "נכנס/ת" - שימוש בשם פועל,
// ניסוח סתמי-רבים, או ניסוח שמני. כך הטקסט עובד באופן טבעי לכל מגדר בלי לוכסנים.

export type QuestionType = 'single' | 'multi' | 'text';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string; // תואם לשם העמודה ב-Supabase
  type: QuestionType;
  title: string;
  helper?: string;
  options?: QuestionOption[];
  maxSelect?: number;
  placeholder?: string;
  optional?: boolean;
  suggestions?: string[];
  showIf?: (answers: Record<string, unknown>) => boolean;
}

export interface StepDef {
  id: string;
  title: string;
  intro?: string;
  questions: Question[];
  showIf?: (answers: Record<string, unknown>) => boolean; // הצגה מותנית של השלב כולו
}

// מי שכבר יש לו ניסיון כלשהו במסחר (לא "עוד לא התחלתי בכלל")
const hasSomeExperience = (answers: Record<string, unknown>) => answers.trading_experience !== 'not_started';

export const STEPS: StepDef[] = [
  {
    id: 'step-1',
    title: 'איפה אני היום?',
    questions: [
      {
        id: 'trading_experience',
        type: 'single',
        title: 'איפה אתם נמצאים היום מול מסחר?',
        options: [
          { value: 'not_started', label: 'עוד לא התחלתי, אבל התחום מאוד מסקרן' },
          { value: 'tried_stopped', label: 'למדתי / ניסיתי בעבר אבל עצרתי' },
          { value: 'trading_inconsistent', label: 'כבר סוחר/ת היום אבל עדיין לא עקבי/ת' },
          { value: 'trading_improve', label: 'כבר סוחר/ת, ומחפש/ת לשפר את הדרך' },
        ],
      },
      {
        id: 'markets',
        type: 'multi',
        title: 'באילו שווקים אתם סוחרים, או שוקלים לסחור?',
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
        title: 'איזה סוג מסחר הכי מדבר אליכם?',
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
    title: 'מה אני רוצה מזה',
    questions: [
      {
        id: 'trading_motivation',
        type: 'multi',
        title: 'אם המסחר היה משתלב בחיים שלכם בדיוק כמו שמתאים לכם, מה הכי היה חשוב שהוא ייתן לכם?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'extra_income', label: 'הכנסה נוספת לצד מה שכבר יש' },
          { value: 'future_full_income', label: 'אפשרות שבעתיד להתפרנס ממסחר' },
          { value: 'independence', label: 'יותר עצמאות ושליטה על ההכנסה' },
          { value: 'flexible_hours', label: 'משהו שאפשר לעשות בשעות שמתאימות לחיים' },
          { value: 'money_management', label: 'להרגיש שיודעים לנהל כסף טוב יותר' },
          { value: 'prove_to_myself', label: 'להוכיח לעצמי שאני מסוגל/ת' },
          { value: 'future_freedom', label: 'ליצור בעתיד יותר חופש - לי ולמשפחה' },
          { value: 'just_checking', label: 'עדיין לא יודע/ת, פשוט רוצה לבדוק אם זה מתאים' },
        ],
      },
      {
        id: 'self_talk',
        type: 'multi',
        title: 'איזה משפט הכי דומה למה שאתם אומרים לעצמכם היום לגבי מסחר?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'want_but_not_ready', label: 'רוצה להתחיל אבל מרגיש/ה שעדיין לא יודע/ת מספיק' },
          { value: 'tried_didnt_work', label: 'כבר ניסיתי בעבר וזה לא באמת עבד לי' },
          { value: 'know_but_dont_execute', label: 'יודע/ת לא מעט, אבל בזמן אמת לא עושה מה שתכננתי' },
          { value: 'afraid_lose_money', label: 'מפחד/ת להפסיד כסף' },
          { value: 'keep_searching_method', label: 'כל הזמן מחפש/ת עוד שיטה כי לא בטוח/ה במה שעושה' },
          { value: 'not_for_me', label: 'לפעמים חושב/ת שמסחר פשוט לא בשבילי' },
          { value: 'hard_to_believe', label: 'רואה אחרים מצליחים אבל קשה להאמין שגם אני יכול/ה' },
          { value: 'no_time', label: 'אין מספיק זמן להתעסק עם זה' },
          { value: 'rush_to_succeed', label: 'רוצה כל כך להצליח שלפעמים עושה דברים שלא הייתי צריך/ה' },
        ],
      },
    ],
  },
  {
    id: 'step-3',
    title: 'כסף ורגש',
    questions: [
      {
        id: 'money_fear',
        type: 'multi',
        title: 'כשאתם חושבים על מסחר עם כסף אמיתי, מה הכי מטריד אתכם?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'lose_money', label: 'להפסיד כסף' },
          { value: 'mistake_no_exit', label: 'לעשות טעות ולא לדעת איך לצאת ממנה' },
          { value: 'not_enough_capital', label: 'שאין מספיק כסף כדי שזה בכלל יהיה רלוונטי' },
          { value: 'give_back_profit', label: 'להרוויח ואז להחזיר את הרווח לשוק' },
          { value: 'emotions_take_over', label: 'שהרגש ישתלט בזמן אמת' },
          { value: 'dont_understand_enough', label: 'שפשוט לא מבינים מספיק' },
          { value: 'tried_before_hard_to_believe', label: 'כבר ניסיתי פעם ולא הצלחתי, קשה להאמין שזה יעבוד' },
          { value: 'not_about_money', label: 'לא מפחד/ת במיוחד מהכסף - האתגר במקום אחר' },
        ],
      },
    ],
  },
  {
    id: 'step-4',
    title: 'הזמן והדרך שלי',
    showIf: hasSomeExperience,
    questions: [
      {
        id: 'available_time',
        type: 'single',
        title: 'כמה זמן ריאלי אתם יכולים להקדיש למסחר בשבוע?',
        options: [
          { value: 'under_1h', label: 'פחות משעה בשבוע' },
          { value: '1_3h', label: '1-3 שעות בשבוע' },
          { value: '3_6h', label: '3-6 שעות בשבוע' },
          { value: 'over_6h', label: 'יותר מ-6 שעות בשבוע' },
          { value: 'varies', label: 'משתנה מאוד משבוע לשבוע' },
        ],
      },
      {
        id: 'strategy_clarity',
        type: 'single',
        title: 'עד כמה ברור לכם ה-Setup או האסטרטגיה שאתם מחפשים?',
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
        title: 'מה בדרך כלל גורם לכם להיכנס לעסקה?',
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
    id: 'step-5',
    title: 'ניהול סיכון',
    showIf: hasSomeExperience,
    questions: [
      {
        id: 'stop_discipline',
        type: 'single',
        title: 'לפני שאתם נכנסים לעסקה - האם אתם כבר יודעים איפה הסטופ?',
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
        title: 'יש לכם סכום או אחוז קבוע שאתם מוכנים לסכן בכל עסקה?',
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
        title: 'יש לכם הפסד מקסימלי יומי שאחריו אתם עוצרים?',
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
    id: 'step-6',
    title: 'בזמן אמת',
    showIf: hasSomeExperience,
    questions: [
      {
        id: 'losing_trade_behavior',
        type: 'multi',
        title: 'כשעסקה לא מתנהגת כמו שציפיתם, מה בדרך כלל קורה אצלכם?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'follow_plan', label: 'עובדים לפי התוכנית ומקבלים את התוצאה' },
          { value: 'doubt_analysis', label: 'מתחילים לפקפק בניתוח' },
          { value: 'hard_to_close', label: 'קשה לסגור בהפסד' },
          { value: 'give_more_room', label: 'נותנים לעסקה "עוד קצת מקום"' },
          { value: 'want_revenge', label: 'רוצים להחזיר את ההפסד בעסקה הבאה' },
          { value: 'more_afraid_next', label: 'נהיים הרבה יותר מפוחדים בעסקה הבאה' },
          { value: 'search_other_method', label: 'מתחילים לחפש שיטה אחרת' },
          { value: 'angry_at_self', label: 'כועסים על עצמנו' },
          { value: 'not_enough_experience', label: 'עוד לא סחרתי מספיק כדי לדעת' },
        ],
      },
      {
        id: 'winning_trade_behavior',
        type: 'multi',
        title: 'ומה בדרך כלל קורה כשהעסקה שלכם דווקא ברווח?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'take_profit_early_fear', label: 'לוקחים רווח מוקדם כי מפחדים שהוא ייעלם' },
          { value: 'want_more', label: 'מתחילים לרצות עוד ועוד' },
          { value: 'dont_know_when_move_stop', label: 'לא יודעים מתי לקדם סטופ' },
          { value: 'change_target', label: 'משנים את היעד תוך כדי' },
          { value: 'follow_plan', label: 'מנהלים את העסקה לפי התוכנית' },
          { value: 'turns_to_loss', label: 'לפעמים עסקה טובה הופכת בחזרה למפסידה' },
          { value: 'not_enough_experience', label: 'עדיין אין מספיק ניסיון כדי לדעת' },
        ],
      },
      {
        id: 'stop_me_from',
        type: 'multi',
        title: 'אם היינו יושבים ביחד בזמן המסחר שלכם, מה הכי הייתי רוצה לעצור אתכם מלעשות?',
        helper: 'אפשר לבחור עד 2',
        maxSelect: 2,
        options: [
          { value: 'chase_runaway', label: 'לרדוף אחרי מניה שכבר ברחה' },
          { value: 'enter_no_stop', label: 'להיכנס בלי סטופ' },
          { value: 'move_stop', label: 'להזיז את הסטופ' },
          { value: 'exit_early', label: 'לצאת מוקדם מדי' },
          { value: 'add_to_loser', label: 'להוסיף לעסקה מפסידה' },
          { value: 'revenge_trade_immediately', label: 'לקחת עוד עסקה מיד אחרי הפסד רק כדי להחזיר' },
          { value: 'fomo_entry', label: 'להיכנס כי "נראה שזה עולה"' },
          { value: 'too_many_positions', label: 'לפתוח יותר מדי עסקאות' },
          { value: 'freeze_fear', label: 'לא לעשות כלום כי מפחדים לטעות' },
          { value: 'trade_while_upset', label: 'להמשיך לסחור כשכבר עצבניים או לא מרוכזים' },
        ],
      },
    ],
  },
  {
    id: 'step-7',
    title: 'היעד שלי',
    questions: [
      {
        id: 'environment_influence',
        type: 'single',
        title: 'עד כמה הסביבה שלכם משפיעה על הדרך שלכם במסחר?',
        options: [
          { value: 'supportive', label: 'יש סביבה שתומכת' },
          { value: 'skeptical', label: 'הסביבה די סקפטית לגבי התחום' },
          { value: 'dont_talk_about_it', label: 'כמעט לא מדברים עם אף אחד על זה' },
          { value: 'others_doubt_me', label: 'לפעמים דעות של אחרים גורמות לפקפק בעצמי' },
          { value: 'want_more_support', label: 'הייתי רוצה שיהיה עם מי לדבר על זה' },
          { value: 'doesnt_affect', label: 'זה כמעט לא משפיע' },
        ],
      },
      {
        id: 'progress_markers',
        type: 'multi',
        title: 'אם בעוד 30 יום לא היינו מודדים אתכם לפי כמה כסף הרווחתם - מה כן היה גורם לכם להרגיש שהתקדמתם?',
        helper: 'אפשר לבחור עד 3',
        maxSelect: 3,
        options: [
          { value: 'clear_method', label: 'יש סוף סוף שיטה ברורה' },
          { value: 'know_when_enter', label: 'יודעים מתי להיכנס ומתי לא' },
          { value: 'know_risk_per_trade', label: 'יודעים כמה מסתכנים בכל עסקה' },
          { value: 'respect_stop', label: 'מכבדים את הסטופ' },
          { value: 'give_time_to_work', label: 'מצליחים לתת לעסקאות זמן לעבוד' },
          { value: 'lock_profit', label: 'יודעים לנעול רווח' },
          { value: 'less_fear_fomo', label: 'פועלים פחות מתוך פחד או FOMO' },
          { value: 'fewer_better_trades', label: 'לוקחים פחות עסקאות אבל טובות יותר' },
          { value: 'stop_method_hopping', label: 'פחות מחפשים כל הזמן שיטה חדשה' },
          { value: 'have_support', label: 'מרגישים שיש עם מי להתייעץ' },
          { value: 'less_complicated', label: 'מבינים שמסחר הרבה פחות מסובך ממה שחשבו' },
          { value: 'first_step', label: 'פשוט עשו סוף סוף את הצעד הראשון' },
        ],
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
        title: 'איזה כלל אחד אתם מתחייבים אליו, ולא מפרים בחודש הקרוב?',
        helper: 'אפשר להקליד כלל אישי, או ללחוץ על אחת ההצעות למטה כנקודת התחלה ולערוך אותה',
        placeholder: 'התשובה...',
        optional: true,
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

export function visibleSteps(answers: Record<string, unknown>): StepDef[] {
  return STEPS.filter((s) => !s.showIf || s.showIf(answers));
}

export function visibleQuestions(step: StepDef, answers: Record<string, unknown>): Question[] {
  return step.questions.filter((q) => !q.showIf || q.showIf(answers));
}

export const ALL_QUESTIONS: Question[] = STEPS.flatMap((s) => s.questions);

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
