// שמירת מקור הכניסה הראשוני (מפרמטר ?source= או ?utm_source= בקישור) לכל אורך הביקור באתר -
// כדי שאפשר יהיה לדעת מאיזה קמפיין הגיע כל אירוע במשפך ההמרה, ולחשב עלות-לתוצאה אמיתית
const SOURCE_KEY = 'sd_source_attribution';
const LAST_SOURCE_KEY = 'sd_last_source';

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
    // src - הקיצור שמופיע בלינקים מהאוטומציות של "בא לי" ובמיילים/התראות (?src=dm וכו')
    const source = params.get('source') || params.get('utm_source') || params.get('src');
    if (source) {
      // "מקור הצטרפות" - המקור האחרון שהביא את האדם לאתר, נשמר גם בין ביקורים (30 יום) - ר' lib/joinSource.ts
      try { localStorage.setItem(LAST_SOURCE_KEY, JSON.stringify({ s: source, t: Date.now() })); } catch {}
    }
    if (source && !sessionStorage.getItem(SOURCE_KEY)) {
      sessionStorage.setItem(SOURCE_KEY, source);
      // תנועה מהסושיאל (ביו באינסטגרם, קישור בפוסט בפייסבוק) - נספרת פעם אחת לביקור, כדי
      // שבמשפך יופיע כמה אנשים כל פוסט/ערוץ הביא לאתר, ולא רק כמה מהם לחצו על תשלום
      if (/^(ig|fb)_/.test(source)) {
        fetch('/api/track-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'social_landing_view', source }),
        }).catch(() => {});
      }
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

// מקור ההצטרפות לתשלום: המקור של הביקור הנוכחי, ואם אין - המקור האחרון מ-30 הימים האחרונים
export function getJoinSource(): string | null {
  if (typeof window === 'undefined') return null;
  const current = getStoredSource();
  if (current) return current;
  try {
    const raw = localStorage.getItem(LAST_SOURCE_KEY);
    if (!raw) return null;
    const { s, t } = JSON.parse(raw);
    return typeof s === 'string' && Date.now() - Number(t) < 30 * 24 * 3600 * 1000 ? s : null;
  } catch {
    return null;
  }
}
