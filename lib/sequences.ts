// רצפי הודעות אוטומטיים לאיש קשר אחד (לא broadcast) - ר' lib/sequenceEngine.ts להרצה בפועל.
// כל צעד הוא גם ערך ברירת מחדל כאן בקוד, וגם רשום כ-automation_rules רגיל (ר' המיגרציה
// add_onboarding_sequences ו-lib/automations.ts) - כדי שאפשר יהיה לערוך את הנוסח בעמוד הניהול
// בדיוק כמו כל אוטומציה אחרת, בלי מנגנון נפרד
export type SequenceKey = 'welcome-subscriber' | 'nurture-push-no-sub';

export type SequenceStepDef = {
  key: string;
  dayOffset: number;
  title: string;
  content: string;
};

export const SEQUENCES: Record<SequenceKey, { name: string; steps: SequenceStepDef[] }> = {
  'welcome-subscriber': {
    name: 'קליטה - מנוי/ה חדש/ה',
    steps: [
      {
        key: 'welcome-subscriber-1',
        dayOffset: 0,
        title: 'ברוכים הבאים למדברים עסקאות! 🎉',
        content: `היי, איזה כיף שהצטרפת! 🎉

הנה הדברים המרכזיים שיש לך עכשיו באתר:

📂 *תיק המסחר שלי* - כל העסקאות הפתוחות שלי, עם כניסה, סטופ ויעד, מתעדכן בזמן אמת:
https://www.shirandimor.com/portfolio

📚 *ספריית השיעורים* - הכל, בקצב שלך:
https://www.shirandimor.com/lessons

🎥 *הלייבים* - לוח הזמנים המלא:
https://www.shirandimor.com/lives

📝 *תוכנית מסחר אישית* - כלי לבנות תוכנית לפי הסיכון שמתאים לך:
https://www.shirandimor.com/trading-plan

תתחיל/י מאיפה שבא לך, אין סדר מחייב 🤍`,
      },
      {
        key: 'welcome-subscriber-2',
        dayOffset: 3,
        title: 'איך קוראים עסקה בתיק המסחר שלי',
        content: `היי, רציתי להראות לך משהו שחשוב להכיר בתיק המסחר שלי.

לכל עסקה פתוחה יש *מחיר כניסה*, *סטופ לוס* ו*יעד* - וגם עמודה שמראה *עד איזה מחיר עדיין אפשר להיכנס* לעסקה (אחרי זה היא פחות רלוונטית).

כנסו לבדוק מה פתוח עכשיו:
https://www.shirandimor.com/portfolio

ואם משהו לא ברור - אני כאן 🤍`,
      },
      {
        key: 'welcome-subscriber-3',
        dayOffset: 7,
        title: 'הכל בסדר? אני כאן',
        content: `היי, רק רוצה לוודא שהכל ברור ונוח לך באתר.

אם יש שאלה, או שאת/ה תקוע/ה במשהו - אני זמינה באופן אישי, ואפשר גם לפנות בכל שעה לדור, העוזרת החכמה שלנו שעונה על שאלות באתר.

פשוט תכתוב/י 🤍`,
      },
      {
        key: 'welcome-subscriber-4',
        dayOffset: 12,
        title: 'כבר בנית לעצמך תוכנית מסחר?',
        content: `היי, אם עוד לא הספקת - יש לך באתר כלי לבניית תוכנית מסחר אישית: לאיזה טווח את/ה פונה, איפה הכניסה, איפה העסקה מפסיקה להיות רלוונטית, וכמה מוכנ/ה לסכן.

תוכנית ברורה היא מה שנותן רוגע ושליטה גם כשהשוק זז מהר:
https://www.shirandimor.com/trading-plan`,
      },
      {
        key: 'welcome-subscriber-5',
        dayOffset: 25,
        title: 'יש לייבים מחכים לך',
        content: `היי, אם עוד לא הגעת ללייב - זו ההזדמנות. אנחנו עוברים שם יחד על השוק והמניות שמעניינות אותנו, בזמן אמת.

לוח הזמנים המלא:
https://www.shirandimor.com/lives

נשמח לראות אותך שם 🤍`,
      },
    ],
  },

  'nurture-push-no-sub': {
    name: 'טיפוח - הפעיל/ה התראות בלי מנוי',
    steps: [
      {
        key: 'nurture-push-no-sub-1',
        dayOffset: 0,
        title: 'תודה שהפעלת התראות! 🔔',
        content: `היי, תודה שהפעלת התראות מאיתנו! 🔔

בינתיים, אם בא לך להעמיק - יש לנו ספריית שיעורים שלמה ופתוחה באתר, בלי שום התחייבות:
https://www.shirandimor.com/lessons`,
      },
      {
        key: 'nurture-push-no-sub-2',
        dayOffset: 4,
        title: 'מאיפה כדאי להתחיל בספרייה',
        content: `היי, אם עוד לא נכנסת לספריית השיעורים - *איך מתחילים* הוא מקום טוב להתחיל ממנו, לפני שצוללים פנימה:
https://www.shirandimor.com/lessons

הכל פתוח, בקצב שלך.`,
      },
      {
        key: 'nurture-push-no-sub-3',
        dayOffset: 9,
        title: 'יש שאלה? אני כאן',
        content: `היי, רק רוצה שתדע/י - גם בלי קשר להחלטה על מנוי, אפשר תמיד לשאול.

אני זמינה באופן אישי, ואפשר גם לפנות לדור, העוזרת החכמה שלנו באתר, שעונה על שאלות בכל שעה 🤍`,
      },
      {
        key: 'nurture-push-no-sub-4',
        dayOffset: 14,
        title: 'כלי בניית תוכנית מסחר - פתוח גם בלי מנוי',
        content: `היי, יש לנו באתר כלי לבניית תוכנית מסחר אישית - פתוח לכולם, גם בלי מנוי:
https://www.shirandimor.com/trading-plan

לאיזה טווח את/ה פונה, איפה הכניסה, ואיפה העסקה מפסיקה להיות רלוונטית.`,
      },
      {
        key: 'nurture-push-no-sub-5',
        dayOffset: 20,
        title: 'מה יש במנוי',
        content: `היי, אחרי כמה שבועות שאת/ה איתנו - רציתי לספר בקצרה מה יש במנוי, בלי שום לחץ:

📂 גישה לתיק המסחר שלי בזמן אמת - כל עסקה, עם כניסה/סטופ/יעד מעודכנים
🎥 לייבים שבועיים - עוברים יחד על השוק
📝 מעקב אישי אחרי תוכנית המסחר שלך

אם זה מעניין אותך, אפשר לקרוא עוד כאן:
https://www.shirandimor.com/subscribe`,
      },
    ],
  },
};
