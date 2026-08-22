// שמירת מקור הכניסה הראשוני (מפרמטר ?source= או ?utm_source= בקישור) לכל אורך הביקור באתר -
// כדי שאפשר יהיה לדעת מאיזה קמפיין הגיע כל אירוע במשפך ההמרה, ולחשב עלות-לתוצאה אמיתית
const SOURCE_KEY = 'sd_source_attribution';

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
