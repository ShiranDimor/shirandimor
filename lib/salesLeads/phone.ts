// נרמול מספרי טלפון לפורמט בינלאומי מלא (+972...) - משמש מאחורי הקלעים לחיוג, WhatsApp,
// מניעת כפילויות והשוואה בין מספרים. התצוגה למשתמשת נשארת בפורמט ישראלי רגיל (050-1234567).

export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('972')) {
    digits = '972' + digits.slice(3).replace(/^0+/, '');
  } else if (digits.startsWith('0')) {
    digits = '972' + digits.slice(1);
  } else if (digits.length === 9) {
    // מספר בן 9 ספרות בלי אפס מוביל (למשל 501234567) - כמו שמגיע לפעמים ממאנדיי
    digits = '972' + digits;
  } else if (!digits.startsWith('972')) {
    digits = '972' + digits.replace(/^0+/, '');
  }

  if (digits.length < 11) return null;
  return '+' + digits;
}

// תצוגה ישראלית רגילה (050-1234567) מתוך מספר מנורמל - לא חובה לראות את ה-+972 מאחורי הקלעים
export function formatPhoneIL(e164: string | null | undefined): string {
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  const local = digits.startsWith('972') ? '0' + digits.slice(3) : digits;

  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3)}`;
  return local;
}

export function telHref(e164: string | null | undefined): string {
  return e164 ? `tel:${e164}` : '#';
}

// message מוכנס לשדה ההקלדה בוואטסאפ אבל לעולם לא נשלח אוטומטית - המשתמשת לוחצת Send בעצמה.
// encodeURIComponent (ולא encodeURI) כדי לשמר נכון עברית/ירידות שורה/רווחים/אימוג'ים/מרכאות
export function whatsappHref(e164: string | null | undefined, message?: string): string {
  if (!e164) return '#';
  const base = `https://wa.me/${e164.replace(/\D/g, '')}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
