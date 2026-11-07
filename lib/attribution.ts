// שמירת מקור הכניסה הראשוני (מפרמטר ?source= או ?utm_source= בקישור) לכל אורך הביקור באתר -
// כדי שאפשר יהיה לדעת מאיזה קמפיין הגיע כל אירוע במשפך ההמרה, ולחשב עלות-לתוצאה אמיתית
const SOURCE_KEY = 'sd_source_attribution';

// פרמטרים נוספים ממודעות פייסבוק/אינסטגרם - נשמרים בנפרד מ-source הכללי כדי לא לשבור קוד
// קיים שכבר משתמש ב-getStoredSource. fbclid בפרט חשוב לשמר (גם אם עדיין לא בשימוש בפועל) -
// זה הבסיס ל-fbc שנדרש בהמשך להתאמת אירועים ב-Meta Conversions API, וקל לאבד אותו אם לא
// תופסים אותו כבר בביקור הראשון (אם המשתמש עובר עמוד בלי ה-querystring המקורי)
const EXTRA_KEYS = ['fbclid', 'utm_campaign', 'utm_content', 'utm_medium'] as const;
const EXTRA_PREFIX = 'sd_attr_';

// קוראים לזה בכל עמוד כניסה אפשרי (דף הבית, תוכנית מסחר, הצטרפות) - שומר רק את הפעם
// הראשונה בביקור, כדי לא לאבד את המקור המקורי אם המשתמש עובר בין עמודים
export function captureSourceFromUrl() {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source') || params.get('utm_source');
    if (source && !sessionStorage.getItem(SOURCE_KEY)) {
      sessionStorage.setItem(SOURCE_KEY, source);
    }
    for (const key of EXTRA_KEYS) {
      const value = params.get(key);
      const storageKey = EXTRA_PREFIX + key;
      if (value && !sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, value);
      }
    }
  } catch {}
}

export function getStoredSource(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SOURCE_KEY);
  } catch {
    return null;
  }
}

// שאר פרמטרי הייחוס שנתפסו (fbclid/utm_campaign/utm_content/utm_medium) - לשימוש עתידי
// (Conversions API וכו') בלי לגעת בקוד הקיים שכבר תלוי ב-getStoredSource
export function getStoredAttributionExtras(): Partial<Record<(typeof EXTRA_KEYS)[number], string>> {
  if (typeof window === 'undefined') return {};
  try {
    const result: Partial<Record<(typeof EXTRA_KEYS)[number], string>> = {};
    for (const key of EXTRA_KEYS) {
      const value = sessionStorage.getItem(EXTRA_PREFIX + key);
      if (value) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}
